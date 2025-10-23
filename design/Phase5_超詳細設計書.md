# Phase 5 超詳細設計書（Railway Cronによる自動化・全VIP一括処理版）

> 前提：Phase 1〜4 で **収集パイプラインの手動実行** が動作していること。  
> 目的：Phase 4 で完成した `runIngest()` を Railway の **Cron機能で自動実行**し、  
> すべてのVIPを一括で収集・保存・ログ記録する完全自動化フェーズ。

---

## 🧭 0. スコープ / 非スコープ

**含む（今回の成果）**
- Railway Cron設定による `scripts/ingest-once.ts` の自動起動  
- 全VIPを対象とした定期実行（毎時）  
- エラー・再試行戦略（Railway再実行含む）  
- ログ・運用手順

**含まない**
- グループ分割による並列実行（Phase5修正版では不要）  
- Slack通知や外部監視サービス  
- UI可視化（Phase6で実装）

---

## ⚙️ 1. Railway Cron設定

### Command
```bash
npx tsx scripts/ingest-once.ts
```

### Schedule
```
0 * * * *
```
→ 毎時0分にジョブ起動（例：00:00, 01:00, 02:00, ...）

### Variables
```env
DATABASE_URL=postgres://...
API_KEY=replace-with-admin-key
TZ=UTC
```

> ※ `GROUP_INDEX` や `GROUP_COUNT` は不要。  
> ※ Cronジョブは1本のみで全VIPを対象にする。

---

## 🧩 2. CLIスクリプト（`scripts/ingest-once.ts`）

### 概要
`scripts/ingest-once.ts` は `lib/ingest.ts` の `runIngest()` を呼び出して  
すべてのアクティブVIPのニュースを一括収集・保存する。

### 実装例
```ts
#!/usr/bin/env tsx
import "dotenv/config";
import { runIngest } from "@/lib/ingest";
import { prisma } from "@/lib/db";

async function main() {
  console.log("[Ingest] Starting full VIP ingest job...");

  // すべてのアクティブVIPを取得
  const vips = await prisma.vip.findMany({ where: { isActive: true } });
  console.log(`[Ingest] Found ${vips.length} active VIPs`);

  // 収集パイプライン実行
  const res = await runIngest({
    vipIds: vips.map(v => v.id),
    recentHours: 24,
    followHtmlCanonical: true,
  });

  console.log(JSON.stringify(res, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

---

## 🧱 3. runIngest() の動作概要（Phase4で実装済み）

| ステップ | 内容 | 関数 |
|----------|------|------|
| ① | 各VIPのGoogle News RSS URL生成 | `buildVipQueries()` |
| ② | RSSフィード取得 | `fetchGnewsRss()` |
| ③ | 元記事URL解決 | `resolveCanonical()` |
| ④ | URL正規化／重複排除 | `normalizeUrl()` |
| ⑤ | VIPマッチング | `matchVip()` |
| ⑥ | DB保存＋ログ記録 | Prisma（`article.create`, `ingestLog.create`） |

> すべてのVIPを順に処理し、1ジョブで完結する。

---

## 🔁 4. エラー・再試行戦略

### 4.1 通信エラー
- `fetch` はPhase3設計でリトライ2回（指数バックオフ付き）  
- RSS失敗は `error++` カウントして続行

### 4.2 DB競合（UNIQUE urlNorm）
- Prismaの `P2002` → skip扱い  
- 同一記事重複による停止を防ぐ

### 4.3 全体ジョブエラー
- `process.exit(1)` で異常終了 → Railwayが自動再試行（最大3回）

---

## 🧩 5. ログと監視

### IngestLog記録例
```json
{
  "jobId": "ingest-1730000000000",
  "startedAt": "2025-10-21T00:00:00.000Z",
  "endedAt": "2025-10-21T00:06:42.000Z",
  "totals": { "new": 35, "skip": 75, "error": 2, "seen": 112 }
}
```

### 監視方法
- Railwayの「Deploy Logs」で確認  
- またはDBで直近10件を確認：  
  ```sql
  SELECT jobId, startedAt, endedAt, (stats->'totals') as totals 
  FROM "IngestLog" ORDER BY createdAt DESC LIMIT 10;
  ```

### 手動再実行
```bash
npx tsx scripts/ingest-once.ts
```
→ Cronと同じ処理を即時実行できる。

---

## ⚙️ 6. 運用上の留意点

| リスク | 対策 |
|--------|------|
| **処理時間が長くなる** | `rateLimit()` 関数（Phase3で実装）により1req/sec程度に制御 |
| **Google News側負荷** | RSS取得なのでAPI制限は緩やか。必要なら `recentHours` を短縮 |
| **Railwayタイムアウト** | 通常は問題なし（15分以内完結を目標）。万一失敗しても自動再試行 |

---

## ✅ 7. DoD / AC（完了基準）

**DoD**
- Railway Cron が毎時実行される。
- すべてのVIPのニュースが収集・保存され、IngestLogが更新される。
- 失敗時は自動再試行で回復可能。

**AC**
- `/api/health` の `lastLog` が毎時更新される。
- CLI手動実行でもCronと同等の結果が得られる。
- 処理完了時間がRailwayの実行制限内（おおむね10〜15分）に収まる。

---

## 🔮 8. 今後のPhase6との接続

Phase6では、このCronで蓄積された `Article` と `IngestLog` をもとに、  
Next.js ダッシュボードでニュース一覧と収集履歴を可視化する。

- **Article一覧表示**：タイトル・媒体・日時・要人名・要約  
- **Log統計**：1時間ごとの新規／スキップ／エラー件数グラフ

---

## 📘 まとめ

| 項目 | 内容 |
|------|------|
| Cron実行対象 | 全VIP（分割なし） |
| 頻度 | 毎時0分 |
| 実行コマンド | `npx tsx scripts/ingest-once.ts` |
| 主な関数 | `runIngest()` |
| ログ記録 | `IngestLog` テーブル |
| 再試行 | Railway標準の再試行機能 |
| 想定実行時間 | 5〜10分（VIP数に依存） |

---

このフェーズ完了により、ニュース収集が完全に自動化され、
Phase 6 以降では **収集結果の可視化・要約表示** へ進める。
