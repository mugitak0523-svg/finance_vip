# 金融要人発言ニュース自動収集システム — 開発設計書（確定版／Google News RSS・要人別購読）
最終更新: 2025-10-19 11:12:35

本書は、**要約なし**・**Railway Cron**での定期実行・**Google News の要人別 RSS**を購読する方針に基づく**確定版**の開発設計書です。  
各要人（VIP）について **Google News 検索の RSS** を生成し、**日本語・英語の両言語**で購読します。

---

## 0. 前提・全体方針

- 技術構成：Next.js (App Router) + TypeScript、Prisma + PostgreSQL（Railway Managed）。
- 形態：**UI + API を同一サービス**（Railway 1サービス）。
- 時刻：**DB保存はUTC**、UI表示はJST変換。
- 収集：**毎時（0 * * * *）** に VIP ごとに Google News RSS を取得・重複排除・VIPマッチングを実施（**Railway Cron**起動）。
- セキュリティ：一般閲覧APIは認証なし、管理APIは `X-Admin-Key` ヘッダで保護。
- ロギング：新規/スキップ/エラーの集計を IngestLog に保存、Console も出力。

---

## 1. ディレクトリ構成

```txt
finance_vip/
├─ app/
│  ├─ (dashboard)/
│  ├─ articles/
│  │   ├─ [id]/
│  │   └─ components/
│  ├─ vips/
│  │   └─ components/
│  ├─ admin/
│  │   └─ components/
│  └─ api/
│      ├─ health/
│      ├─ articles/
│      │   └─ [id]/
│      ├─ vips/
│      └─ jobs/ingest:run/
├─ lib/
│  ├─ db.ts
│  ├─ rss.ts
│  ├─ url.ts
│  ├─ matchers.ts
│  ├─ gnews.ts            # ★ Google News RSS 用の生成/取得/正規化
│  ├─ ingest.ts
│  ├─ logger.ts
│  └─ utils.ts
├─ config/
│  └─ gnews.ts            # ★ 言語/地域/検索テンプレート、デフォルトパラメータ
├─ prisma/
│  ├─ schema.prisma
│  └─ migrations/
├─ scripts/
│  └─ ingest-once.ts
├─ tests/
│  ├─ unit/
│  │   ├─ url.test.ts
│  │   ├─ matchers.test.ts
│  │   ├─ gnews.test.ts   # ★ 生成URI/パース/リダイレクト解決
│  │   └─ rss.test.ts
│  └─ e2e/
│      ├─ ingest.test.ts
│      └─ article-api.test.ts
├─ public/
├─ .env.example
├─ package.json
├─ tsconfig.json
├─ next.config.mjs
├─ jest.config.js
├─ README.md
└─ Procfile
```

---

## 2. データモデル / Prisma スキーマ設計

### 2.1 エンティティと関係
- **Vip**：要人情報。`aliases[]`（日本語・英語別名、略称）。`gnewsQueryExtra`（任意の追加語）。
- **Article**：記事。`urlNorm` 一意、`personMatch` にヒットVIP・一致語を JSON 保存。`sourceName="GoogleNews"` を基本値とし、リンク解決後に媒体名を補う場合あり。
- **IngestLog**：ジョブ実行単位の集計ログ。

### 2.2 Prisma スキーマ（抜粋）
```prisma
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }
generator client { provider = "prisma-client-js" }

model Vip {
  id        String   @id @default(cuid())
  name      String
  org       String?
  title     String?
  aliases   String[]
  gnewsQueryExtra String? // 例: "speech OR remarks"
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
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
  lang         String?   // 'ja'|'en' など
  personMatch  Json?     // { vipIds: string[], terms: string[], feedVipId: string }
  hash         String?
  status       String    @default("NEW")
  createdAt    DateTime  @default(now())
  @@index([publishedAt])
  @@index([createdAt])
}

model IngestLog {
  id        String   @id @default(cuid())
  jobId     String?
  startedAt DateTime
  endedAt   DateTime
  stats     Json
  level     String  @default("INFO")
  message   String?
  createdAt DateTime @default(now())
}
```

---

## 3. Google News RSS 設計（要人別）

### 3.1 生成規則
- ベースURL：`https://news.google.com/rss/search`
- クエリ：`q={QUERY}&hl={HL}&gl={GL}&ceid={CEID}`
- 既定パラメータ：
  - 日本語フィード：`hl=ja&gl=JP&ceid=JP:ja`
  - 英語フィード：`hl=en-US&gl=US&ceid=US:en`
- `QUERY` は **VIPの aliases を OR で結合**し、必要に応じ `gnewsQueryExtra` を追加：  
  例）`("Christine Lagarde" OR ラガルド OR クリスティーヌ・ラガルド) (speech OR remarks OR 発言 OR 講演)`

### 3.2 URI 生成アルゴリズム（`lib/gnews.ts`）
- `buildVipQueries(vip: Vip): Array<{ url: string; lang: 'ja'|'en'; rawQuery: string }>`
  1) `aliases` を言語別に分割（簡易：全て同一クエリでも可）。
  2) キーワード（`config/gnews.ts`）と `vip.gnewsQueryExtra` を AND で追加。
  3) 言語別既定パラメータを付与して URL を生成（URLエンコード）。

### 3.3 取得と正規化
- **リンク解決**：Google News RSS の `<link>` は `news.google.com/articles/…` 形式が多いため、**HTTP 3xx を追跡**して元記事URLを取得。  
  - 取得ポリシー：まず HEAD、ダメなら GET（タイムアウト短め）。
- **正規化**：`lib/url.ts` のルールで `urlNorm` を生成し、UNIQUE 制約で重複排除。
- **媒体名**：redirect 先のドメインから `sourceName` を補完可能（例：`reuters.com` → `Reuters`）。

### 3.4 言語・重複と VIP 付与
- 同一記事が日英両方に出る可能性 → `urlNorm` により一意化。
- フィード上は「そのVIP向け」だが、本文/タイトルに **他VIP も含む**場合があるため、**最終的に `lib/matchers.ts` を走らせて追加ヒット VIP を付与**。  
  - `personMatch.feedVipId = vip.id` を明記し、追加ヒットは `vipIds` に複数入れる。

### 3.5 レート/リトライ/間引き
- 言語×VIP の組数が多い場合：毎時全件を取得すると負荷増。  
  - アプローチ：VIP を時分の輪番で分割、または `recentOnly=true` オプション（公開時刻がN時間以内のみ採用）。
- HTTP 失敗は指数バックオフ（最大2回）。

---

## 4. 環境変数・設定

### 4.1 .env.example
```env
DATABASE_URL=postgres://USER:PASSWORD@HOST:PORT/DB
API_KEY=replace-with-admin-key
NODE_ENV=development
TZ=UTC
```

### 4.2 config（`config/gnews.ts` 例）
```ts
export const GNEWS_DEFAULTS = {
  ja: { hl: "ja", gl: "JP", ceid: "JP:ja" },
  en: { hl: "en-US", gl: "US", ceid: "US:en" },
} as const;

export const VIP_KEYWORDS = [
  "speech",
  "remarks",
  "statement",
  "comment",
  "発言",
  "講演",
  "声明",
  "会見",
];
```

---

## 5. 共通ロジック（lib/）

### 5.1 `lib/gnews.ts`（新規）
- `buildVipQueries(vip)`：上記 3.2 のルールで URL を配列生成。
- `fetchGnewsRss(url)`：XML→JSON 変換（`RssItem[]`）。
- `resolveCanonical(item.link)`：news.google.com → 3xx 追跡で元記事URL取得。

### 5.2 既存モジュール
- `url.ts`：正規化・重複判定。
- `matchers.ts`：VIP マッチング（feed VIP + 追加ヒット）。
- `ingest.ts`：**VIP 列挙 → 言語ごとに `buildVipQueries` → 取得/正規化/保存** の流れに変更。

---

## 6. スケジューリング（Railway Cron）

- **HTTP トリガー（推奨）**：`POST /api/jobs/ingest:run`（Header: `X-Admin-Key`）。
- **Command**：`npx tsx scripts/ingest-once.ts`
- **Schedule**：`0 * * * *`（毎時 00 分）／輪番の必要があれば `*/30 * * * *` などで分割。

---

## 7. フェーズ別 開発手順（詳細・確定版）

### Phase 1：基盤構築（Day 1）
**目的**：DB と最小 API を確立。  
**タスク**
1. `schema.prisma`、`prisma migrate dev`。
2. `lib/db.ts`、`/api/health`。  
**実装ポイント**
- `TZ=UTC`、`DATABASE_URL` 設定。  
**動作確認**
- `GET /api/health` = 200。  
**DoD**：疎通OK。 **AC**：DB障害時 500 を返却。

### Phase 2：ユーティリティ（Day 2）
**目的**：URL 正規化・マッチャー・RSS 基礎。  
**タスク**
1. `url.ts` + Jest。
2. `matchers.ts` + Jest。
3. `rss.ts` + Jest。  
**DoD**：単体テスト90% 以上。 **AC**：主要ケース緑。

### Phase 3：Google News 連携（Day 3）
**目的**：要人別 Google News RSS 導入。  
**タスク**
1. `config/gnews.ts` 作成（既定・語彙）。
2. `lib/gnews.ts`（URL生成/取得/リダイレクト解決）。
3. `tests/unit/gnews.test.ts`。  
**実装ポイント**
- 検索クエリの URL エンコード／OR/AND の括弧。  
**動作確認**
- サンプル VIP で URL とパース結果が正しい。  
**DoD**：リンク解決含め緑。 **AC**：多言語生成が正しい。

### Phase 4：収集ジョブ統合（Day 4）
**目的**：VIP 列挙→Google News→保存→VIP 付与のパイプライン完成。  
**タスク**
1. `ingest.ts` を VIP 駆動に置換。
2. `/api/jobs/ingest:run`（Admin Key）。
3. `IngestLog` 記録。  
**実装ポイント**
- `urlNorm` UNIQUE で重複排除、`personMatch.feedVipId` 追加。  
**動作確認**
- 手動 POST → Article が増え、重複しない。  
**DoD**：1サイクル保存成功。 **AC**：重複ゼロ。

### Phase 5：Railway Cron 統合（Day 5）
**目的**：毎時自動実行。  
**タスク**
1. Cron（HTTP or Command）設定。
2. 必要に応じ輪番/間引き設定。  
**動作確認**
- 次スロットで IngestLog が更新。  
**DoD**：安定稼働。 **AC**：失敗時も次スロットで復旧。

### Phase 6：UI 統合（Day 6-7）
**目的**：一覧/詳細/管理画面。  
**タスク**
1. `/articles` フィルタ（VIP/期間/キーワード/媒体）。
2. `/articles/[id]` 詳細。
3. `/admin` 実行ボタン。
4. `StatCards`（new/skip/error）。  
**動作確認**
- フィルタ/検索/ページング正常。  
**DoD**：主要操作がエラーなく完了。 **AC**：表示崩れなし。

### Phase 7：E2E・デプロイ（Day 8）
**目的**：24/7 稼働。  
**タスク**
1. supertest（`/api/jobs/ingest:run → /api/articles`）。
2. Variables（`DATABASE_URL`,`API_KEY`）。
3. デプロイ。  
**動作確認**
- 本番 `/api/health`=200、Cron 実動。  
**DoD**：E2E 緑。 **AC**：ダッシュボード指標が更新。

### Phase 8：運用文書（Day 9）
**目的**：引き継ぎ可能な運用。  
**タスク**
1. README：Cron 変更、バックアップ、障害対応。
2. データ保持：記事365日、ログ90日。  
**DoD**：文書のみで再現可能。 **AC**：復旧手順が具体的。

---

## 8. API 設計（Route Handlers）

- `GET /api/health` → `{ ok, db, lastJobAt, totalArticles }`
- `GET /api/articles`（`vipId, source, q, from, to, page, perPage, sort`）
- `GET /api/articles/:id`
- `GET /api/vips`
- `POST /api/jobs/ingest:run`（`X-Admin-Key`）

DTO：
```ts
type ArticleDTO = {
  id: string;
  title: string;
  sourceName: string;
  url: string;
  publishedAtJst: string | null;
  vips: { id: string; name: string }[];
};
```

---

## 9. テスト計画

- 単体（Jest）：`url.ts`, `matchers.ts`, `gnews.ts`, `rss.ts`
- 結合（supertest）：手動実行→保存→検索、フィルタ/期間/ページング/ソート。
- 受け入れ（AC）：毎時自動実行でデータが増え、UI で正しく閲覧できる。

---

## 10. デプロイ・運用

1. Railway に Postgres を作成、`DATABASE_URL` 設定。
2. `API_KEY` を Variables に設定（HTTP Cron 方式用）。
3. `npx prisma migrate deploy`。
4. `/api/health` 疎通。
5. Cron 作成：`0 * * * *`（HTTP or Command）。
6. ダッシュボードで new/skip/error を監視。

---

