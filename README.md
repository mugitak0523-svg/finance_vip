# Finance VIP Dashboard

## 運用に必要な情報

### 環境変数

| Key | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | PostgreSQL 接続文字列。Railway Postgres の`DATABASE_PUBLIC_URL`の値をそのまま貼る。 |
| `API_KEY` | ✅ | `/api/jobs/ingest:run` を叩く際の管理者キー。`X-Admin-Key` ヘッダーで利用。 |
| `NODE_ENV` | ✅ | `production`/`development`。Prisma のログレベルに影響。 |
| `TZ` | 任意 | デフォルト `UTC`。コンテナ内のシステムタイムゾーン。 |


## デプロイ手順（Railway）

1. Railway で **Postgres** と **Web Service（GitHub 連携）** を作成し、同じプロジェクトにまとめる。
2. Web Service の `Variables` に `.env` の値（`DATABASE_URL`, `API_KEY`, `NODE_ENV` ほか必要な設定）を登録する。
3. リポジトリを Railway に接続してデプロイ。ビルド時には `npm install` → `npm run build` が自動実行される。
4. 初回デプロイ後に `railway run npm run prisma:migrate:deploy` を実行して本番 DB にマイグレーションを適用し、続けて `railway run npx tsx scripts/seed-vips.ts` で初期 VIP データを投入する。
5. `https://<app>.up.railway.app/api/health` が 200 を返せば稼働中。

## Cron / ジョブ頻度
1. 上記とは別に、新しい Web Service（例：ingest-job） を同じリポジトリから作成する。
2. アプリのSettings > Deploy > Custom Start Commandに```npx tsx scripts/ingest-once.ts```を設定し、Cron Scheduleに任意のスケジュールを設定する(例：*/5 * * * *)。
3. ジョブ頻度の変更はCron Scheduleを変更する。

## バックアップ
- Railway Postgres のバックアップシステムを使用する。

## API Memo


### 記事一覧 + VIP フィルタ

```
GET /api/articles?vipId=<VIP_ID>&q=<keyword>&from=2024-10-01&to=2024-10-25&page=1&limit=20
```

- `vipId`: 1 名分の VIP ID を指定すると `personMatch.vipIds` に含まれる記事だけ返す。
- `q`: タイトル・概要の部分一致キーワード。
- `from` / `to`: ISO 日付 (`yyyy-mm-dd`)。UTC で絞り込み（公開日時がない場合は取得日時）。
- `page` / `limit`: ページング（デフォルト 1 / 20、`limit` は最大 100）。

レスポンス例:
```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "id": "...",
        "title": "...",
        "vipMatches": [{ "id": "cmh...", "name": "Christine Lagarde", "isActive": true }],
        "personMatch": { ... }
      }
    ],
    "page": 1,
    "pageSize": 20,
    "total": 42,
    "hasMore": false
  }
}
```

### VIP 追加

```
POST /api/vips
Content-Type: application/json

{
  "name": "Christine Lagarde",
  "aliases": ["Christine Lagarde", "ラガルド"],
  "org": "ECB",
  "title": "President"
}
```

- `name` は必須。`aliases` は文字列配列（空可）。`org` / `title` は任意。
- 成功すると新しい `Vip` レコードが `isActive: true` で作成される。

### VIP 削除

```
DELETE /api/vips?id=<VIP_ID>
```

- `id` をクエリで渡す。存在しない ID の場合は 404 ではなく 500 (Prisma エラー) になるので注意。
- 無効化したい場合は下記の PATCH API を利用する。

### VIP 無効化 / 再有効化

```
PATCH /api/vips
Content-Type: application/json

{
  "id": "<VIP_ID>",
  "isActive": false
}
```

- `id` は対象 VIP の ID。
- `isActive` に `false` を渡すと無効化、`true` で再有効化。

### 収集ログ一覧

```
GET /api/logs?limit=20
```

- `limit` で最新から取得する件数を指定（1〜100）。省略時は 20。
- レスポンス例:
```json
[
  {
    "id": "cmh5rrv590000qlssvdbhdfik",
    "jobId": "ingest-1761365885947",
    "startedAt": "2024-10-25T04:18:05.947Z",
    "endedAt": "2024-10-25T04:18:10.412Z",
    "stats": {
      "perVip": { "...": { "new": 0, "skip": 0, "error": 0, "items": 100, "queries": 2 } },
      "totals": { "new": 0, "seen": 388, "skip": 0, "error": 0 }
    },
    "level": "INFO",
    "message": null,
    "createdAt": "2024-10-25T04:18:10.414Z"
  }
]
```
