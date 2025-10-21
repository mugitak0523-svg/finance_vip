# Phase 6 超詳細設計書（Webダッシュボード：記事一覧・ログ・VIP管理UI）

> 前提：Phase 1〜5 でバックエンド（DB・API・定期ジョブ）が完成済み。  
> 目的：Next.js + Tailwind により、記事一覧・収集ログ・VIP管理（追加／削除）を行える Web ダッシュボードを構築する。  
> 認証やAI要約は導入せず、**誰でも閲覧・編集可能なMVP版管理UI** とする。

---

## 0. スコープ / 非スコープ

**含む（今回の成果）**
- ダッシュボードUI構築（Next.js App Router + Tailwind）
- 記事一覧ページ `/dashboard/articles`
- ログ閲覧ページ `/dashboard/logs`
- VIP管理ページ `/dashboard/vips`（追加／削除）
- API：`/api/articles`, `/api/logs`, `/api/vips`
- ページネーション、並び替え、フォーム送信

**含まない**
- 認証（全ユーザーアクセス可）
- AI要約
- 編集履歴管理

---

## 1. ディレクトリ構成

```txt
finance_vip/
├─ app/
│  ├─ dashboard/
│  │  ├─ layout.tsx
│  │  ├─ page.tsx                 # ダッシュボードトップ
│  │  ├─ articles/page.tsx        # 記事一覧
│  │  ├─ logs/page.tsx            # ログ一覧
│  │  └─ vips/page.tsx            # VIP管理（追加／削除）
│  ├─ api/
│  │  ├─ articles/route.ts        # GET
│  │  ├─ logs/route.ts            # GET
│  │  └─ vips/route.ts            # GET/POST/DELETE
├─ components/
│  ├─ ArticleCard.tsx
│  ├─ LogCard.tsx
│  ├─ VipForm.tsx
│  ├─ VipList.tsx
│  └─ Filters.tsx
├─ lib/
│  └─ fetchers.ts
└─ styles/
   └─ globals.css
```

---

## 2. API設計

### `/api/articles` （閲覧専用）
- **Method**: GET  
- **Query**: `vipId`, `source`, `q`, `page`, `limit`  
- **戻り値**: 記事リスト（タイトル・媒体・公開日時・VIP情報）

### `/api/logs` （閲覧専用）
- **Method**: GET  
- **Query**: `limit`  
- **戻り値**: 収集ジョブログの最新N件

### `/api/vips` （追加・削除可能）

| Method | 機能 | Body / Query | 備考 |
|--------|------|---------------|------|
| GET | 全VIP取得 | なし | name, aliases, isActive |
| POST | VIP追加 | `{ name: string, aliases?: string[] }` | ID自動生成 |
| DELETE | VIP削除 | `?id=<vipId>` | 論理削除でなく物理削除 |

**例：POST**
```json
{
  "name": "Jerome Powell",
  "aliases": ["パウエル", "Powell"]
}
```

**例：DELETE**
```
DELETE /api/vips?id=clxy1234
```

---

## 3. API実装例

### `/app/api/vips/route.ts`
```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const vips = await prisma.vip.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json({ ok: true, data: vips });
}

export async function POST(req: Request) {
  const body = await req.json();
  if (!body.name) return NextResponse.json({ ok: false, error: "name_required" }, { status: 400 });

  const vip = await prisma.vip.create({
    data: { name: body.name, aliases: body.aliases ?? [], isActive: true }
  });
  return NextResponse.json({ ok: true, data: vip });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });

  await prisma.vip.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
```

---

## 4. UI構成

### `/dashboard/articles`
- 記事一覧（タイトル／媒体／日付）
- 検索フォーム：タイトル検索 + VIPフィルタ
- 並び替え：日付降順

### `/dashboard/logs`
- 最新IngestLog のリスト表示
- `new / skip / error` のカウントをカードで表示

### `/dashboard/vips`
- 登録済みVIP一覧をテーブル表示
- 新規追加フォーム（name, aliases）
- 削除ボタン付き

---

## 5. コンポーネント例

### VipForm.tsx
```tsx
"use client";
import { useState } from "react";

export default function VipForm({ onAdd }: { onAdd: () => void }) {
  const [name, setName] = useState("");
  const [aliases, setAliases] = useState("");

  const submit = async () => {
    await fetch("/api/vips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, aliases: aliases.split(",").map(s => s.trim()) })
    });
    setName(""); setAliases("");
    onAdd();
  };

  return (
    <div className="flex gap-2 p-3 bg-gray-50 rounded-xl">
      <input value={name} onChange={e => setName(e.target.value)} placeholder="名前" className="border p-2 rounded w-1/3"/>
      <input value={aliases} onChange={e => setAliases(e.target.value)} placeholder="別名（カンマ区切り）" className="border p-2 rounded w-1/2"/>
      <button onClick={submit} className="bg-blue-600 text-white px-4 py-2 rounded">追加</button>
    </div>
  );
}
```

### VipList.tsx
```tsx
"use client";
import { useEffect, useState } from "react";

export default function VipList() {
  const [vips, setVips] = useState<any[]>([]);

  const fetchVips = async () => {
    const res = await fetch("/api/vips");
    const json = await res.json();
    setVips(json.data);
  };

  const remove = async (id: string) => {
    await fetch(`/api/vips?id=${id}`, { method: "DELETE" });
    fetchVips();
  };

  useEffect(() => { fetchVips(); }, []);

  return (
    <div className="mt-4">
      {vips.map(v => (
        <div key={v.id} className="flex justify-between p-2 border-b">
          <div>
            <div className="font-semibold">{v.name}</div>
            <div className="text-sm text-gray-500">{v.aliases.join(", ")}</div>
          </div>
          <button onClick={() => remove(v.id)} className="text-red-600 hover:underline">削除</button>
        </div>
      ))}
    </div>
  );
}
```

---

## 6. ページ構成

### `/dashboard/page.tsx`
```tsx
import Link from "next/link";

export default function DashboardPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Dashboard</h1>
      <ul className="space-y-2">
        <li><Link href="/dashboard/articles" className="text-blue-600">記事一覧</Link></li>
        <li><Link href="/dashboard/logs" className="text-blue-600">収集ログ</Link></li>
        <li><Link href="/dashboard/vips" className="text-blue-600">VIP管理</Link></li>
      </ul>
    </div>
  );
}
```

---

## 7. UIデザイン仕様

- **フレームワーク**：Next.js App Router + Tailwind CSS
- **構成**：シンプルな1カラムビュー（スマホ対応）
- **主要クラス**：
  - `rounded-xl`, `shadow-sm`, `border`, `bg-gray-50`
  - テキスト色：`text-gray-800`
  - ボタン：`bg-blue-600 hover:bg-blue-700 text-white rounded`
- **レスポンシブ対応**：`flex-col md:flex-row` 構成

---

## 8. テスト計画

### 8.1 APIテスト
- POST `/api/vips` → 追加後、GETで件数増加を確認
- DELETE `/api/vips` → 削除後、GETで減少を確認
- `/api/articles`・`/api/logs` → JSON構造が正しいこと

### 8.2 UIテスト
- VIPを追加→画面に即反映される
- 削除ボタン→対象行が消える
- 記事・ログ一覧がDB内容と一致する

---

## 9. DoD / AC（完了基準）

**DoD**
- `/dashboard/articles`, `/dashboard/logs`, `/dashboard/vips` が動作
- `/api/vips` によりVIPの追加・削除が反映される
- 記事とログがDBと同期して表示される

**AC**
- フロントエンドのみでVIP管理可能
- APIレスポンスが1秒以内
- レスポンシブ対応でスマホからも閲覧可能

---

## 10. 今後の拡張（Phase 7以降）
- 簡易認証（APIキー認可）
- VIP編集（名前・別名更新）
- グラフ集計（VIP別記事数）
- ダークモード対応
