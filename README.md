# 金融要人発言ニュース自動収集システム — Phase 1 / 2

## Setup
- `cp .env.example .env` で `DATABASE_URL` を設定
- `npm install`
- `npm run prisma:migrate:dev`
- `npm run prisma:generate`
- `npm run dev` → `http://localhost:3000/api/health` が 200 を返すことを確認

## Phase 2 ガイド
- `lib/url.ts` の正規化ルールが唯一の重複判定キー。Google News 由来 URL もここを経由させる。
- `lib/matchers.ts` は `aliases[]` の運用が精度を左右する。誤検出しやすい短語はエイリアスから除外/更新する。
- `lib/rss.ts` は GNews 非依存の共通 RSS/Atom パーサ。壊れた XML は上位へ例外を投げる。
- `npm run test` でユニットテスト一式（URL 正規化／VIP マッチング／RSS パース）を実行。

## Deploy (Railway)
- Railway Postgres を作成し、`DATABASE_URL` を Variables に設定
- デプロイ後 `npm run prisma:migrate:deploy`
- `https://<your-app>.up.railway.app/api/health` が 200
