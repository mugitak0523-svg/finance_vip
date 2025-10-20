# Phase 1 超詳細設計書（基盤構築／DB疎通 & 最小API）

## 0. 概要
本フェーズでは、システム全体の基盤を構築し、  
Prisma + PostgreSQL + Next.js の最小構成で動作することを確認する。  
Railway 環境にデプロイ後、`/api/health` で疎通が確認できることを目標とする。  

---

## 1. 目的と範囲
### 目的
- PostgreSQL（Railway Managed）との接続を確立する。
- Prisma による DB モデル管理を導入し、最初のマイグレーションを作成する。
- `/api/health` エンドポイントで DB 疎通を確認できる。
- 以降フェーズ（特に Phase 2〜3）の実装基盤を提供する。

### 範囲
✅ 含まれる  
- Prisma スキーマ定義（`IngestLog` のみ）  
- DB 接続 (`lib/db.ts`)  
- `/api/health` ルート  
- Railway 環境設定（`.env`, Variables）  

❌ 含まれない  
- RSS / GNews ロジック  
- UI 部分  
- Cron ジョブ  
- 本格的なロギング  

---

## 2. ディレクトリ構成（Phase 1 完了時点）

```txt
finance_vip/
├─ app/
│  └─ api/
│     └─ health/
│        └─ route.ts          # ← API: GET /api/health
├─ lib/
│  └─ db.ts                   # ← Prisma Client シングルトン
├─ prisma/
│  ├─ schema.prisma           # ← 初期スキーマ
│  └─ migrations/             # ← migrate 実行で生成
├─ .env.example
├─ package.json
├─ tsconfig.json
├─ next.config.mjs
└─ README.md
```

---

## 3. 使用技術とバージョン
| 要素 | 使用技術 / バージョン | 備考 |
|------|----------------------|------|
| フレームワーク | Next.js (App Router) 14.x | APIルート用 |
| 言語 | TypeScript 5.4+ | `strict`モード |
| ORM | Prisma 5.18.x | DBスキーマ管理 |
| DB | PostgreSQL (Railway Managed) | UTC保存 |
| Node.js | v20 | Railway推奨バージョン |
| パッケージ管理 | npm | CI/CD互換性を考慮 |

---

## 4. 環境変数設計
`.env.example`
```env
DATABASE_URL=postgres://USER:PASSWORD@HOST:PORT/DB
NODE_ENV=development
TZ=UTC
```

> - `TZ=UTC`: DB保存の統一。UI表示時にJST変換（Phase3以降）  
> - 本番では `.env` は使用せず、Railway の Variables に設定。

---

## 5. Prisma スキーマ設計
`prisma/schema.prisma`
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model IngestLog {
  id        String   @id @default(cuid())
  jobId     String?
  startedAt DateTime @default(now())
  endedAt   DateTime?
  stats     Json?
  level     String   @default("INFO")
  message   String?
  createdAt DateTime @default(now())
}
```

---

## 6. Prisma Client（DB 接続）
`lib/db.ts`
```ts
import { PrismaClient } from "@prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
}

export const prisma =
  global.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development"
      ? ["query", "warn", "error"]
      : ["error"]
  });

if (process.env.NODE_ENV !== "production") global.prisma = prisma;
```

### 解説
- **開発時 HMR 対応**：Next.js のホットリロードで PrismaClient が多重生成されないよう global キャッシュ化。  
- **ログレベル**：開発時は `query`, `warn`, `error`。本番は `error` のみ。  

---

## 7. API 設計
`app/api/health/route.ts`
```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const totalLogs = await prisma.ingestLog.count();
    const lastLog = await prisma.ingestLog.findFirst({
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true, level: true }
    });

    return NextResponse.json({
      ok: true,
      db: "ok",
      totalLogs,
      lastLog
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, db: "ng", error: "db_unreachable" },
      { status: 500 }
    );
  }
}
```

### 機能概要
| 状況 | ステータス | 内容 |
|------|------------|------|
| DB接続成功 | 200 | `{ ok: true, db: "ok" }` |
| DB接続失敗 | 500 | `{ ok: false, db: "ng" }` |

---

## 8. package.json
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "prisma generate && next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "prisma:migrate:dev": "prisma migrate dev",
    "prisma:migrate:deploy": "prisma migrate deploy"
  },
  "dependencies": {
    "@prisma/client": "^5.18.0",
    "next": "14.x",
    "react": "18.x",
    "react-dom": "18.x"
  },
  "devDependencies": {
    "prisma": "^5.18.0",
    "typescript": "^5.4.0",
    "@types/node": "^20.0.0",
    "eslint": "^9.0.0"
  }
}
```

---

## 9. 動作確認手順
### ローカル
```bash
cp .env.example .env
npm i
npm run prisma:migrate:dev
npm run prisma:generate
npm run dev
```

アクセス確認：
```
GET http://localhost:3000/api/health
→ 200 OK, { ok: true, db: "ok" }
```

### Railway（本番）
```bash
# 1. Variables に DATABASE_URL を設定
# 2. デプロイ後:
npm run prisma:migrate:deploy
# 3. 疎通確認
curl https://your-app-name.up.railway.app/api/health
```

---

## 10. DoD / AC（完了条件）
| 区分 | 条件 |
|------|------|
| DoD | - Prisma migrate 成功<br>- `/api/health` が 200 を返す<br>- DB 障害時に 500 を返す |
| AC | - `.env.example` 最新<br>- README に手順明記<br>- 型エラーゼロ (`tsc --noEmit` 通過) |

---

## 11. リスクと対応策
| リスク | 対策 |
|--------|------|
| Prisma 多重生成 | シングルトンパターンで解決 |
| Railway SSL 接続失敗 | `sslmode=require` を確認 |
| DB 遅延・障害 | タイムアウト短めで `catch` により 500 応答 |

---

## 12. README（Phase1用テンプレ）
```md
## Setup
1. `cp .env.example .env` → DATABASE_URL 設定  
2. `npm install`  
3. `npm run prisma:migrate:dev && npm run prisma:generate`  
4. `npm run dev` → `/api/health` が 200 でOK  

## Deploy (Railway)
1. Railway で Postgres 作成 → Variables に DATABASE_URL  
2. `npm run prisma:migrate:deploy`  
3. `/api/health` が 200  
```
