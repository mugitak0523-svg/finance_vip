# Phase 4 超詳細設計書（収集ジョブ統合：DB保存／重複排除／管理API）

> 前提：Phase 1（DB疎通 & 最小API）、Phase 2（URL正規化・VIPマッチング・RSS基盤）、Phase 3（GNews 要人別 RSS & 元記事解決）が完了。  
> 目的：要人別 Google News フィードを定期取得し、**DBへ保存**（重複排除・VIP付与・ログ記録）する**収集パイプライン**を Next.js 同一サービス内に実装。手動実行用の**管理API**も提供。  
> Cron は Phase 5（Railway Cron）で設定するため、本フェーズでは**手動実行API**と **CLI スクリプト**までを対象とする。

---

## 0. スコープ / 非スコープ

**含む（今回の成果）**
- Prisma スキーマ拡張：`Vip`, `Article`, `IngestLog`（Phase1）
- `lib/ingest.ts`：収集パイプライン（VIP列挙→GNews取得→元記事解決→正規化→VIPマッチ→保存→ログ集計）
- 管理API：`POST /api/jobs/ingest:run`（`X-Admin-Key`）
- CLI：`scripts/ingest-once.ts`（Phase 5 で Cron コマンドに使用可）
- E2E テスト（supertest）：`tests/e2e/ingest.test.ts` / `tests/e2e/article-api.test.ts`

**含まない（次フェーズ以降）**
- Cron（Railway）設定（Phase 5）
- UI 実装（Phase 6）

---

## 1. データモデル（Prisma）

### 1.1 エンティティ
- **Vip**
  - `name`（正規名）, `aliases[]`（別名/和英/略称）, `gnewsQueryExtra?`（追加語）
  - `isActive`（収集対象か）
- **Article**
  - `url`（解決後の元記事URL）, `urlNorm`（**UNIQUE**／重複排除キー）
  - `sourceName`（媒体名：Reuters/Bloomberg/NHK/Nikkei/…）
  - `title`, `description?`, `content?`（本文はRSSにあれば）
  - `publishedAt?`（ISO→UTC）, `fetchedAt`（保存時UTC）
  - `lang?`（ja/en など推定値）
  - `personMatch`（JSON：`{ feedVipId, vipIds[], terms[] }`）
  - `hash?`（将来用途）, `status`（`NEW`/`SKIP`/`ERROR` など拡張余地）
- **IngestLog**
  - `jobId`, `startedAt`, `endedAt`
  - `stats`（`{ new, skip, error, perVip: { [vipId]: { queries, items, new, skip, error }}}`）
  - `level`/`message`

### 1.2 Prisma スキーマ（差分を含む確定版）
`prisma/schema.prisma`
```prisma
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }
generator client { provider = "prisma-client-js" }

model Vip {
  id        String   @id @default(cuid())
  name      String
  org       String?
  title     String?
  aliases   String[]
  gnewsQueryExtra String?
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([isActive])
  @@index([name])
}

model Article {
  id           String   @id @default(cuid())
  url          String
  urlNorm      String   @unique
  sourceName   String   @default("GoogleNews")
  title        String
  description  String?
  content      String?
  publishedAt  DateTime?
  fetchedAt    DateTime
  lang         String?
  personMatch  Json?
  hash         String?
  status       String   @default("NEW")
  createdAt    DateTime @default(now())

  @@index([publishedAt])
  @@index([createdAt])
  @@index([sourceName])
}

model IngestLog {
  id        String   @id @default(cuid())
  jobId     String?
  startedAt DateTime
  endedAt   DateTime
  stats     Json
  level     String   @default("INFO")
  message   String?
  createdAt DateTime @default(now())
}
```

> 既存 DB に対して **migrate** で追加。Phase 1 の `IngestLog` は再定義同等。

---

## 2. 環境変数

`.env.example` 追補：
```env
API_KEY=replace-with-admin-key
```
- 管理APIは `X-Admin-Key` ヘッダーでガード（簡易オーソリ）。
- 本番は Railway の Variables で管理。

---

## 3. 収集パイプライン `lib/ingest.ts`

### 3.1 公開 API
```ts
export type IngestOptions = {
  vipIds?: string[];           // 指定時は対象VIPを限定（デバッグ用）
  recentHours?: number;        // 直近N時間のアイテムのみ採用（負荷抑制に有効）
  followHtmlCanonical?: boolean; // 元記事解決で<canonical>を採用
  dryRun?: boolean;            // trueならDB書込みしない（統計のみ）
};

export type IngestResult = {
  jobId: string;
  startedAt: string;
  endedAt: string;
  totals: { new: number; skip: number; error: number; seen: number };
  perVip: Record<string, { queries: number; items: number; new: number; skip: number; error: number }>;
};

export async function runIngest(opts?: IngestOptions): Promise<IngestResult>;
```

### 3.2 処理フロー（擬似コード）
```ts
async function runIngest(opts) {
  const jobId = `ingest-${Date.now()}`;
  const startedAt = new Date();

  const stats = { new: 0, skip: 0, error: 0, seen: 0 };
  const perVip: Record<string, any> = {};

  const vips = await prisma.vip.findMany({ where: { isActive: true, ...(opts.vipIds && { id: { in: opts.vipIds } }) } });

  for (const vip of vips) {
    perVip[vip.id] = { queries: 0, items: 0, new: 0, skip: 0, error: 0 };
    const queries = buildVipQueries(vip); // Phase3
    perVip[vip.id].queries = queries.length;

    for (const q of queries) {
      await rateLimit(); // Phase3 簡易RPS制御
      const items = await fetchGnewsRss(q.url); // Phase3
      perVip[vip.id].items += items.length;

      for (const it of items) {
        stats.seen++;

        // recentOnly フィルタ（任意）
        if (opts?.recentHours && it.pubDate) {
          const dt = new Date(it.pubDate);
          if (Date.now() - dt.getTime() > opts.recentHours * 3600_000) continue;
        }

        try {
          await rateLimit();
          const rr = await resolveCanonical(it.link, { followHtmlCanonical: opts?.followHtmlCanonical ?? true }); // Phase3
          const urlNorm = rr.urlNorm;

          // 既存チェック
          const exists = await prisma.article.findUnique({ where: { urlNorm }, select: { id: true } });
          if (exists) { perVip[vip.id].skip++; stats.skip++; continue; }

          // VIP マッチング（feed VIP + 追加ヒット）
          const m = matchVip(vips, { title: it.title, description: it.description });
          const personMatch = { feedVipId: vip.id, vipIds: Array.from(new Set([vip.id, ...m.vipIds])), terms: m.terms };

          // 言語推定（簡易）
          const lang = guessLang(it.title ?? it.description ?? "");

          if (!opts?.dryRun) {
            await prisma.article.create({
              data: {
                url: rr.finalUrl,
                urlNorm,
                sourceName: it.source ?? "Google News",
                title: it.title ?? rr.finalUrl,
                description: it.description ?? null,
                content: null, // Phase 4では本文は未取得
                publishedAt: it.pubDate ? new Date(it.pubDate) : null,
                fetchedAt: new Date(),
                lang,
                personMatch,
                status: "NEW"
              }
            });
          }
          perVip[vip.id].new++; stats.new++;
        } catch (e) {
          perVip[vip.id].error++; stats.error++;
          // ログ行は IngestLog に集計で十分。詳細エラーは console に出す。
          console.error("[ingest] error", e);
        }
      }
    }
  }

  const endedAt = new Date();
  // ログ保存
  await prisma.ingestLog.create({
    data: {
      jobId,
      startedAt,
      endedAt,
      stats: { totals: stats, perVip }
    }
  });

  return {
    jobId,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    totals: { ...stats },
    perVip
  };
}
```

### 3.3 実装詳細
- **idempotency**：`urlNorm` の UNIQUE 制約で二重保存を回避。競合時は `skip` カウント。
- **トランザクション**：1記事単位で `create`。大量エラー時の巻戻しを避ける設計。
- **エラー**：記事単位で `try/catch`（全体停止を回避）。
- **言語推定**（簡易）：`/[ぁ-んァ-ン一-龯]/` → `ja`、`[A-Za-z]` → `en`。厳密でなくてOK。

---

## 4. 管理API `POST /api/jobs/ingest:run`

### 4.1 エンドポイント
- Path：`/api/jobs/ingest:run`（App Router の Route Handler）
- Method：`POST`
- Auth：Header `X-Admin-Key: <API_KEY>`（`.env` から）
- Body（任意）：`{ vipIds?: string[], recentHours?: number, dryRun?: boolean }`

### 4.2 例実装
`app/api/jobs/ingest:run/route.ts`
```ts
import { NextRequest, NextResponse } from "next/server";
import { runIngest } from "@/lib/ingest";

export async function POST(req: NextRequest) {
  const key = req.headers.get("x-admin-key");
  if (!process.env.API_KEY || key !== process.env.API_KEY) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const res = await runIngest({
    vipIds: body.vipIds,
    recentHours: body.recentHours ?? 24,
    dryRun: body.dryRun ?? false,
    followHtmlCanonical: true
  });

  return NextResponse.json({ ok: true, ...res });
}
```

---

## 5. CLI スクリプト（手動実行）

`scripts/ingest-once.ts`
```ts
#!/usr/bin/env tsx
import "dotenv/config";
import { runIngest } from "@/lib/ingest";

async function main() {
  const res = await runIngest({ recentHours: 24, followHtmlCanonical: true });
  console.log(JSON.stringify(res, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- ローカル検証や Railway の **Command Cron**（Phase 5）で利用可。

---

## 6. 付帯ユーティリティ

- **媒体名補完**：`sourceName` が `Google News` のままの場合、`new URL(finalUrl).hostname` でマッピング（任意）  
  例：`reuters.com` → `Reuters`、`bloomberg.com` → `Bloomberg`、`nhk.or.jp` → `NHK`、`nikkei.com` → `Nikkei`

- **lang 推定（guessLang）**：
```ts
function guessLang(s: string): string {
  if (/[ぁ-んァ-ン一-龯]/.test(s)) return "ja";
  if (/[A-Za-z]/.test(s)) return "en";
  return "und";
}
```

---

## 7. テスト計画

### 7.1 ユニット（最小）
- `lib/ingest.ts` の**純粋関数部**（`guessLang`、媒体名補完）
- `urlNorm` の UNIQUE 競合時の**skip** カウント（Prisma をモック or 低レベル DB をテスト環境で使用）

### 7.2 E2E（supertest）
- **前準備**：テストDBに `Vip` を5件ほど投入（fixtures）
- **ケース**：
  1. `POST /api/jobs/ingest:run`（Admin Key あり）→ 200 / `ok: true`
  2. レスポンスの `totals.seen/new/skip/error` が 0 以上
  3. 2回連続実行で `skip` が増える（UNIQUE による重複排除）
  4. `vipIds` 指定で対象 VIP を限定できる
  5. Admin Key 不一致で `401`

- **モック戦略**：`global.fetch` をモックし、Phase 3 の動作を**固定フィード**で再現  
  - `fetchGnewsRss` → 固定 `RssItem[]`  
  - `resolveCanonical` → 固定 `finalUrl` / `urlNorm`

`tests/e2e/ingest.test.ts`（骨子）
```ts
import request from "supertest";
import app from "@/app"; // Next test harness or custom server wrapper

test("ingest runs and writes articles", async () => {
  const res = await request(app)
    .post("/api/jobs/ingest:run")
    .set("X-Admin-Key", process.env.API_KEY!)
    .send({ recentHours: 48, dryRun: false });

  expect(res.status).toBe(200);
  expect(res.body.ok).toBe(true);
  expect(res.body.totals.seen).toBeGreaterThanOrEqual(0);
});
```

---

## 8. 監視・運用（Phase 4 範囲）

- **/api/health**（Phase 1）：`totalLogs` / `lastLog`（ログは Phase 4 以降も参照可能）
- **IngestLog ダッシュボード**（Phase 6 で UI 表示予定）：`new/skip/error` の推移
- **失敗時**：記事単位で `error` カウント、次回実行で自動再収集（リトライ方針は Phase 5/8 で調整）

---

## 9. セキュリティ・非機能

- **API Key の取り扱い**：`.env` はローカルのみ。Railway では Variables に保存。PR/ログへ露出させない。
- **スループット**：Phase 3 の `rateLimit` をそのまま利用。VIP 輪番運用は Phase 5 で Cron 設計に反映。
- **可用性**：記事単位エラーで全ジョブを中断しない。IngestLog に集計（後で UI 可視化）。

---

## 10. DoD / AC（完了基準）

**DoD**
- Prisma マイグレーションで `Vip` / `Article` が作成され、`urlNorm` に UNIQUE 制約
- `runIngest` が手動実行で **new/skip/error** を返却、2回目実行で **skip** が増える
- `POST /api/jobs/ingest:run` が Key 認証で実行可能、200 / JSON 返却

**AC**
- 代表 VIP で実行し、Reuters/Bloomberg/NHK/Nikkei 等の実 URL が保存される（`urlNorm` 一意）
- IngestLog に実行サマリが記録され、`/api/health` の `lastLog` で参照可能
- 1サイクルあたりの例外が致命的でない（記事単位で捕捉される）

---

## 11. README 追補（開発者向け）
```md
### Ingest 手動実行
- API: 
  curl -X POST https://<host>/api/jobs/ingest:run -H "X-Admin-Key: $API_KEY" -d '{"recentHours":24}'
- CLI:
  npx tsx scripts/ingest-once.ts

### よくある質問
- 重複排除は？ → `Article.urlNorm` の UNIQUE 制約で判定
- VIP ヒット判定は？ → feed VIP + `matchVip()` の複合（termsはpersonMatchへ）
- 失敗時？ → 記事単位で error カウント。次サイクルで再取得されることが多い
```
