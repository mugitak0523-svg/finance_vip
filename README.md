# 金融要人発言ニュース自動収集システム — Phase 1

## Setup
- `cp .env.example .env` で `DATABASE_URL` を設定
- `npm install`
- `npm run prisma:migrate:dev`
- `npm run prisma:generate`
- `npm run dev` → `http://localhost:3000/api/health` が 200 を返すことを確認

## Deploy (Railway)
- Railway Postgres を作成し、`DATABASE_URL` を Variables に設定
- デプロイ後 `npm run prisma:migrate:deploy`
- `https://<your-app>.up.railway.app/api/health` が 200
