# Phase 2 超詳細設計書（ユーティリティ：URL正規化／VIPマッチング／RSS基盤）

> 本書は Phase 1 完了（DB疎通＆最小API）を前提とし、Phase 3 以降（Google News 要人別RSS、収集統合）に**直結**するユーティリティ群の“超詳細”設計です。  
> 成果物は**単体テスト90%+**の品質で提供し、以降フェーズの変更に強い抽象化／API境界を定義します。

---

## 0. スコープ / 非スコープ
**含む（今回の成果）**
- `lib/url.ts`：URL正規化・重複排除の基盤
- `lib/matchers.ts`：VIPマッチング（エイリアス／和英／略称／AND/ORキーワード）
- `lib/rss.ts`：RSS/Atom 解析（汎用）
- 単体テスト（Jest）：`tests/unit/url.test.ts`, `tests/unit/matchers.test.ts`, `tests/unit/rss.test.ts`
- 開発者ドキュメント（README追補）

**含まない（次フェーズ以降）**
- `lib/gnews.ts` の URL 生成・リダイレクト解決（Phase 3）
- `lib/ingest.ts` によるDB書き込み（Phase 4）
- UI／Cron（Phase 5〜）

---

## 1. 依存関係・バージョン
- Node.js 20 / Next.js 14 / TypeScript 5.4+（Phase 1 と統一）
- ライブラリ（必要時）：
  - **xml2js**（RSS/Atom 解析） or **fast-xml-parser**（軽量で推奨）
  - **zod**（オプション：パース結果の型安全バリデーション）
  - **jest**（Phase 0から導入済み想定。未導入の場合は追加）

`package.json`（追補の一例）
```json
{
  "devDependencies": {
    "@types/jest": "^29.5.12",
    "jest": "^29.7.0",
    "ts-jest": "^29.2.5",
    "fast-xml-parser": "^4.4.0",
    "zod": "^3.23.8"
  },
  "jest": {
    "transform": { "^.+\.tsx?$": "ts-jest" },
    "testEnvironment": "node",
    "moduleNameMapper": { "^@/(.*)$": "<rootDir>/$1" }
  }
}
```
> 既存の Jest 構成がある場合はそれを優先。`fast-xml-parser` 採用を推奨（軽量・速い）。

---

## 2. 追加ディレクトリ／ファイル構成（Phase 2 完了時）

```txt
finance_vip/
├─ app/
│  └─ api/
│     └─ health/route.ts
├─ lib/
│  ├─ db.ts
│  ├─ url.ts            # ← ★ 新規
│  ├─ matchers.ts       # ← ★ 新規
│  └─ rss.ts            # ← ★ 新規（汎用RSS/Atomパーサ）
├─ tests/
│  └─ unit/
│     ├─ url.test.ts        # ← ★ 新規
│     ├─ matchers.test.ts   # ← ★ 新規
│     └─ rss.test.ts        # ← ★ 新規
├─ prisma/
│  ├─ schema.prisma
│  └─ migrations/
├─ .env.example
├─ package.json
├─ tsconfig.json
├─ next.config.mjs
└─ README.md
```

---

## 3. `lib/url.ts` 設計（URL正規化／重複判定）

### 3.1 目的
- 同一記事URLの**重複保存防止**（正規化キー `urlNorm` を生成）
- 後続フェーズの「Google News→元記事URL解決」の後処理としても利用可能

### 3.2 仕様（正規化ルール）
1. **スキーム・ホスト小文字化**：`HTTP://EXAMPLE.COM` → `http://example.com`
2. **デフォルトポート除去**：`:80`（http）, `:443`（https）
3. **末尾スラッシュ正規化**：`/path/` → `/path`（ただし ルート `/` はそのまま）
4. **フラグメント除去**：`#section` は削除
5. **クエリパラメータ**
   - **削除対象**（トラッキング由来）：`utm_*`, `gclid`, `fbclid`, `mc_cid`, `mc_eid`, `igshid`, `si`, `spm`, `sc_channel`, `yclid`
   - **ソート**：キーを昇順ソート、重複キーは昇順で安定化
   - **空値削除**：値のないキーは削除（`?a=&b=1` → `?b=1`）
6. **www の扱い**：`www.` は**保持**（媒体側で別ルーティングの可能性を尊重）
7. **国際化ドメイン**：Punycode 正規化（必要に応じ `url.domainToASCII`）
8. **パス正規化**：`/a/./b/../c` → `/a/c`

### 3.3 公開API
```ts
export function normalizeUrl(input: string): string;
export function isLikelyDuplicate(urlNorm: string, existing: Set<string> | string[]): boolean;
```
- `normalizeUrl`：入力 URL を**例外を飲み込まず**投げ、例外時はそのまま返す or `throw`（**採用**：`throw`。上位でエラーハンドリング。）
- `isLikelyDuplicate`：集合照合の便宜関数（テスト目的で用意）

### 3.4 実装メモ
- Node `URL` クラスをベースにしつつ、クエリの除外・ソートを手動処理
- `try/catch`で**パース不可URL**を `throw`（呼び出し側でスキップ）
- テストは**多種多様な実URL**で網羅（表参照）

### 3.5 テストケース（要点）
| Case | 入力 | 期待 |
|------|------|------|
| 既知トラッキング削除 | `...?utm_source=x&utm_medium=y&b=1` | `...?b=1` |
| 末尾スラッシュ | `/path/` | `/path` |
| フラグメント | `/a#top` | `/a` |
| クエリ順序差 | `?b=1&a=2` vs `?a=2&b=1` | 同一 |
| 空クエリ | `?a=&b=` | （なし） |
| デフォルトポート | `http://a.com:80/x` | `http://a.com/x` |
| パス正規化 | `/a/./b/../c` | `/a/c` |
| Punycode | `http://münich.de/a` | `http://xn--mnich-kva.de/a` |

---

## 4. `lib/matchers.ts` 設計（VIPマッチング）

### 4.1 目的
- タイトル・要約・（将来）本文から**対象要人（VIP）を特定**
- 別名・和英表記・略称に強い照合（**フェーズ以降の GNews 由来記事**に適用）

### 4.2 入力・出力
```ts
export type Vip = {
  id: string;
  name: string;
  aliases: string[];
  isActive?: boolean;
};

export type ArticleLike = {
  title?: string;
  description?: string;
  content?: string;
  lang?: "ja" | "en" | string;
};

export type MatchResult = {
  vipIds: string[];
  terms: string[];
  debug?: any;
};

export function matchVip(vips: Vip[], article: ArticleLike): MatchResult;
```

### 4.3 照合ロジック（段階式）
1. **テキスト統合**：`title + description + content` を連結し、言語別に**正規化**（小文字化、全角半角正規化、記号一部除去）
2. **別名辞書**：`vip.aliases + vip.name` を正規表現へコンパイル  
   - 英語：`\bPowell\b`（語境界） / 日本語：境界なし、**3〜4 文字以上**の短語制限
3. **スコアリング**：
   - 完全名一致 +2、別名一致 +1、総和スコア >= 1 でヒット
4. **結果**：スコア順に `vipIds`、一致語を `terms`

### 4.4 エッジケース
- 一般姓の誤検出（例：「岸田」）→**フルネーム優先**、短語閾値
- 多VIP同時ヒット→複数 ID を保持（Order はスコア）

### 4.5 テストケース例
| Case | 入力タイトル | VIP辞書 | 期待 |
|------|--------------|--------|------|
| 英語フルネーム | "Jerome Powell says..." | Powell | Powell |
| 日本語カタカナ | "パウエル議長が会見" | Powell | Powell |
| 両VIP | "Lagarde and Powell meet" | Lagarde/Powell | 2名 |
| 誤検出防止 | "市場はパワーアップ" | Powell | ヒットなし |
| 全角半角 | "ﾊﾟｳｴﾙ議長" | Powell | ヒット |

---

## 5. `lib/rss.ts` 設計（汎用RSS/Atomパーサ）

### 5.1 目的
- 以降フェーズの `gnews.ts` の補助・バックアップとして、RSS/Atom→JSON 変換の共通処理を提供

### 5.2 型とAPI
```ts
export type RssItem = {
  title: string;
  link: string;
  description?: string;
  pubDate?: string;
  guid?: string;
  source?: string;
  raw?: any;
};

export async function fetchRss(url: string, opts?: {
  timeoutMs?: number; userAgent?: string;
}): Promise<RssItem[]>;
```

### 5.3 仕様
- HTTP: `fetch` + `AbortController`、`timeoutMs` 既定 8s
- Parser: `fast-xml-parser`（RSS 2.0 / Atom 1.0 両対応）
- ソース名: `channel.title` / `feed.title`
- 相対リンクは**可能な限り絶対化**

### 5.4 エラーハンドリング
- HTTP !2xx → throw / XML 失敗 → throw

### 5.5 テスト
- RSS2 / Atom の最小フィクスチャで件数・フィールドを確認
- 壊れたXMLで throw を確認

---

## 6. テスト戦略（Jest）

### 6.1 目標
- 関数単位の純粋テスト、副作用はモック
- カバレッジ **90%+**

### 6.2 コマンド
```bash
npm run test
```

---

## 7. 実装スケルトン（抜粋）

### 7.1 `lib/url.ts`
```ts
import { domainToASCII } from "node:url";

const TRACKING_KEYS = new Set([
  "utm_source","utm_medium","utm_campaign","utm_term","utm_content",
  "gclid","fbclid","igshid","si","spm","mc_cid","mc_eid","yclid","sc_channel"
]);

export function normalizeUrl(input: string): string {
  const u = new URL(input);
  u.protocol = u.protocol.toLowerCase();
  u.hostname = domainToASCII(u.hostname.toLowerCase());
  if ((u.protocol === "http:" && u.port === "80") || (u.protocol === "https:" && u.port === "443")) u.port = "";
  if (u.pathname.endsWith("/") && u.pathname !== "/") u.pathname = u.pathname.slice(0, -1);
  u.hash = "";
  const params = Array.from(u.searchParams.entries())
    .filter(([k,v]) => !TRACKING_KEYS.has(k) && v !== "")
    .sort(([a],[b]) => a.localeCompare(b));
  u.search = params.length ? "?" + new URLSearchParams(params).toString() : "";
  return u.toString();
}

export function isLikelyDuplicate(urlNorm: string, existing: Set<string> | string[]): boolean {
  const set = Array.isArray(existing) ? new Set(existing) : existing;
  return set.has(urlNorm);
}
```

### 7.2 `lib/matchers.ts`
```ts
export type Vip = { id: string; name: string; aliases: string[]; isActive?: boolean; };
export type ArticleLike = { title?: string; description?: string; content?: string; lang?: "ja"|"en"|string; };
export type MatchResult = { vipIds: string[]; terms: string[]; debug?: any; };

function normalizeText(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u3000\s]+/g, " ")
    .replace(/[\p{P}\p{S}]/gu, " ");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function matchVip(vips: Vip[], article: ArticleLike): MatchResult {
  const text = normalizeText([article.title, article.description, article.content].filter(Boolean).join(" "));
  const results: Array<{ vip: Vip; score: number; terms: string[] }> = [];

  for (const vip of vips) {
    const terms: string[] = [];
    let score = 0;
    const all = [vip.name, ...vip.aliases].filter(Boolean);

    for (const term of all) {
      const t = normalizeText(term);
      if (!t) continue;
      const isEnglish = /[a-z]/i.test(t);
      if (!isEnglish && t.length < 3) continue; // 日本語短語の誤検出防止
      const pattern = isEnglish ? new RegExp(`\b${escapeRegex(t)}\b`, "i") : new RegExp(escapeRegex(t), "i");
      if (pattern.test(text)) {
        terms.push(term);
        score += (t === normalizeText(vip.name)) ? 2 : 1;
      }
    }
    if (score >= 1) results.push({ vip, score, terms });
  }

  results.sort((a,b) => b.score - a.score);
  return { vipIds: results.map(r => r.vip.id), terms: results.flatMap(r => r.terms) };
}
```

### 7.3 `lib/rss.ts`
```ts
import { XMLParser } from "fast-xml-parser";

export type RssItem = { title: string; link: string; description?: string; pubDate?: string; guid?: string; source?: string; raw?: any; };

export async function fetchRss(url: string, opts?: { timeoutMs?: number; userAgent?: string; }): Promise<RssItem[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 8000);
  const res = await fetch(url, { headers: { "user-agent": opts?.userAgent ?? "finance-vip/1.0" }, signal: controller.signal }).catch((e) => { clearTimeout(timeout); throw e; });
  clearTimeout(timeout);
  if (!res.ok) throw new Error(`RSS fetch failed: ${res.status}`);
  const xml = await res.text();

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", parseTagValue: true });
  const obj = parser.parse(xml);

  if (obj?.rss?.channel?.item) {
    const ch = obj.rss.channel;
    const items = Array.isArray(ch.item) ? ch.item : [ch.item];
    return items.map((it: any) => ({ title: it.title ?? "", link: it.link ?? "", description: it.description, pubDate: it.pubDate, guid: it.guid?.toString(), source: ch.title, raw: it }));
  }
  if (obj?.feed?.entry) {
    const feed = obj.feed;
    const entries = Array.isArray(feed.entry) ? feed.entry : [feed.entry];
    const pickLink = (e:any) => Array.isArray(e.link) ? (e.link.find((l:any)=>l.rel==="alternate")?.href ?? e.link[0]?.href ?? "") : (e.link?.href ?? e.link ?? "");
    return entries.map((e: any) => ({ title: e.title ?? "", link: pickLink(e), description: e.summary ?? e.content, pubDate: e.updated ?? e.published, guid: e.id?.toString(), source: feed.title, raw: e }));
  }
  return [];
}
```

---

## 8. README 追補
```md
### Phase 2 ガイド
- `lib/url.ts` のルールは以降フェーズでも**唯一の正規化規則**として使用
- `lib/matchers.ts` は `aliases[]` の管理が鍵。誤検出が多い短語は削除または下位重み
- `lib/rss.ts` は GNews 非依存の共通実装。壊れたXMLは throw で上位へ
- `npm run test` でユニットテスト（90%+目標）
```

---

## 9. DoD / AC
- **DoD**：3モジュールのユニットテスト**90%+**、主要エッジケースが緑
- **AC**：正規化・マッチング・RSS解析が仕様通りに機能し、以降フェーズのインターフェース（型・関数名）が安定

---

## 10. 次フェーズ
- Phase 3：`lib/gnews.ts`（要人別検索URL生成＋GoogleNews→元記事URL解決）を追加。  
  本フェーズの `normalizeUrl` / `matchVip` を直接使用して**重複排除＆VIP付与**を実現する。
