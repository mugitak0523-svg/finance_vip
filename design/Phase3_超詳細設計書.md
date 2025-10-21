# Phase 3 超詳細設計書（Google News 連携：要人別RSS生成／リンク正規化／元記事解決）

> 前提：**Phase 1（DB疎通 & 最小API）**, **Phase 2（URL正規化・VIPマッチング・RSS基盤）**が完了していること。  
> 目的：要人（VIP）ごとに **Google News 検索RSS** を日本語/英語で生成・取得し、`news.google.com` の中継URLから**元記事URL**へ解決、**正規化（`normalizeUrl`）**までを完了する。  
> このフェーズでは**DB保存は行わない**（Phase 4 で統合）。

---

## 0. スコープ / 非スコープ

**含む（今回の成果）**
- `config/gnews.ts`：Google News 検索RSSの既定パラメータ/語彙
- `lib/gnews.ts`：
  - `buildVipQueries(vip)`：要人別・言語別・キーワード付の**検索クエリ→RSS URL**生成
  - `fetchGnewsRss(url)`：RSS取得→`RssItem[]`（Phase2 `fetchRss` の再利用）
  - `resolveCanonical(url)`：`news.google.com/articles/...` を**元記事URL**へ 3 段階で解決
- 単体テスト（Jest）：`tests/unit/gnews.test.ts`
- フィクスチャ：`tests/fixtures/gnews/*.xml`（ミニ）

**含まない（次フェーズ以降）**
- DB への書込み・重複排除（Phase 4）
- Cron（Railway）（Phase 5）
- UI（Phase 6）

---

## 1. 依存・設計指針

- Node.js 20（標準 `fetch` / `AbortController` / `URL`）
- Phase 2 の `lib/rss.ts` / `lib/url.ts` / `lib/matchers.ts` を**再利用**
- **タイムゾーン**：保存は UTC、表示は JST（Phase 6）。Phase 3 では `pubDate` は文字列で保持し、Phase 4 で `Date` にパース予定。
- **ユーザーエージェント**：`finance-vip/1.0 (+https://example.org)`（適宜）
- **スロットリング**：デフォルト 2 req/s、バースト 4（簡易実装）。
- **リトライ**：指数バックオフ（最大2回）。

---

## 2. `config/gnews.ts` 仕様

```ts
export const GNEWS_DEFAULTS = {
  ja: { hl: "ja", gl: "JP", ceid: "JP:ja" },
  en: { hl: "en-US", gl: "US", ceid: "US:en" },
} as const;

// AND で付与する弱関連キーワード（要人発言の文脈を強化）
export const VIP_KEYWORDS = [
  "speech", "remarks", "statement", "comment",
  "発言", "講演", "声明", "会見"
] as const;

// Google News 検索ベース
export const GNEWS_SEARCH_BASE = "https://news.google.com/rss/search";

export type LangKey = keyof typeof GNEWS_DEFAULTS; // "ja" | "en"

export const DEFAULT_FETCH_TIMEOUT_MS = 8000;
export const DEFAULT_UA = "finance-vip/1.0 (+https://example.org)";
export const RATE_LIMIT_RPS = 2; // 簡易
```

---

## 3. `lib/gnews.ts` API設計

### 3.1 型定義（抜粋）
```ts
import type { Vip } from "@/lib/matchers";      // Phase 2
import type { RssItem } from "@/lib/rss";

export type BuiltQuery = {
  url: string;
  lang: "ja" | "en";
  rawQuery: string;         // URLエンコード前
  params: Record<string,string>; // hl/gl/ceid 等
};

export type ResolveResult = {
  input: string;     // 入力（news.google.com 等）
  finalUrl: string;  // 解決後の元記事URL（正規化前）
  urlNorm: string;   // normalizeUrl 後（Phase2）
  hops: string[];    // どのURLを辿ったか（デバッグ）
};
```

### 3.2 公開関数
```ts
export function buildVipQueries(vip: Vip): BuiltQuery[];

export async function fetchGnewsRss(url: string, opts?: {
  timeoutMs?: number; userAgent?: string;
}): Promise<RssItem[]>;

export async function resolveCanonical(url: string, opts?: {
  timeoutMs?: number; followHtmlCanonical?: boolean;
}): Promise<ResolveResult>;
```

---

## 4. クエリ生成 `buildVipQueries(vip)`

### 4.1 クエリ方針
- **OR 結合**：`(alias1 OR alias2 OR "full name")`
- **AND 追加**：`(VIP_KEYWORDS + vip.gnewsQueryExtra)` を **1 グループ**として AND 結合  
  例：`("Christine Lagarde" OR ラガルド OR クリスティーヌ・ラガルド) (speech OR remarks OR 発言 OR 講演)`
- **引用符**：空白を含む別名/フルネームは `"` で囲む
- **言語別パラメータ**：`hl/gl/ceid` を `ja`/`en` で切替

### 4.2 実装骨子
```ts
import { GNEWS_DEFAULTS, GNEWS_SEARCH_BASE, VIP_KEYWORDS } from "@/config/gnews";

function quoteIfNeeded(s: string) {
  return /\s/.test(s) ? `"${s}"` : s;
}

export function buildVipQueries(vip: Vip): BuiltQuery[] {
  const names = [vip.name, ...(vip.aliases ?? [])].filter(Boolean).map(quoteIfNeeded);

  const orBlock = `(${names.join(" OR ")})`;

  const kw = [...VIP_KEYWORDS];
  if ((vip as any).gnewsQueryExtra) kw.push((vip as any).gnewsQueryExtra as string);
  const kwBlock = `(${kw.join(" OR ")})`;

  const rawQuery = `${orBlock} ${kwBlock}`.trim();

  return (["ja","en"] as const).map((lang) => {
    const p = GNEWS_DEFAULTS[lang];
    const qs = new URLSearchParams({ q: rawQuery, hl: p.hl, gl: p.gl, ceid: p.ceid });
    const url = `${GNEWS_SEARCH_BASE}?${qs.toString()}`;
    return { url, lang, rawQuery, params: { hl: p.hl, gl: p.gl, ceid: p.ceid } };
  });
}
```

### 4.3 エッジケース
- `aliases` が空でも **`name`単体でORブロック**を作成
- `gnewsQueryExtra` が空/未設定なら **キーワードは VIP_KEYWORDS のみ**
- AND/OR の括弧は**常に2ブロック**（名前群 / キーワード群）

---

## 5. フィード取得 `fetchGnewsRss(url)`

- Phase 2 の `fetchRss` を**そのまま使用**（RSS/Atom両対応）
- 追加仕様：`source` が空の時は `Google News` を補完
- タイムアウト/UA は `config` からデフォルト値を利用

```ts
import { fetchRss } from "@/lib/rss";
import { DEFAULT_FETCH_TIMEOUT_MS, DEFAULT_UA } from "@/config/gnews";

export async function fetchGnewsRss(url: string, opts?: { timeoutMs?: number; userAgent?: string; }) {
  const items = await fetchRss(url, { timeoutMs: opts?.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS, userAgent: opts?.userAgent ?? DEFAULT_UA });
  return items.map(it => ({ ...it, source: it.source ?? "Google News" }));
}
```

---

## 6. 元記事解決 `resolveCanonical(url)`

### 6.1 目的
- `https://news.google.com/articles/…` 形式の **中継URL** を **媒体の元記事URL** へ解決する
- **正規化（`normalizeUrl`）** まで実施し、重複排除に供する（Phase 4 で UNIQUE 制約へ）

### 6.2 解決アルゴリズム（段階式）
1. **HTTP リダイレクト追跡（最大 5 hops）**
   - `HEAD` → 失敗時 `GET`（タイムアウト短め）
   - `redirect: "follow"` で最終 `res.url` を採用
2. **HTML の `<link rel="canonical">` 解析（任意）**
   - オプション `followHtmlCanonical=true` の場合のみ
   - レスポンスが HTML かつ **同一ドメイン/AMP** の場合は `<link rel="canonical">` を優先採用
3. **AMP → Canonical 正規化**
   - URL に `/amp` `/amp/` `?output=amp` 等が含まれる場合：AMP を除去した正規URLへ置換（ベンダーごとに簡易ルール）
4. **`normalizeUrl` 適用**
   - Phase 2 の `normalizeUrl` で最終URLを正規化

### 6.3 実装骨子
```ts
import { normalizeUrl } from "@/lib/url";

export async function resolveCanonical(input: string, opts?: { timeoutMs?: number; followHtmlCanonical?: boolean; }): Promise<ResolveResult> {
  const hops: string[] = [input];
  let current = input;

  // 1) follow redirects
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 7000);
  let res: Response;
  try {
    res = await fetch(current, { redirect: "follow", signal: controller.signal });
    clearTimeout(to);
  } catch (e) {
    clearTimeout(to);
    throw e;
  }
  current = res.url;
  hops.push(current);

  // 2) optional: HTML canonical
  const ct = res.headers.get("content-type") || "";
  if ((opts?.followHtmlCanonical ?? true) && ct.includes("text/html")) {
    const html = await res.text();
    const m = html.match(/<link[^>]+rel=["']?canonical["']?[^>]+href=["']([^"']+)["']/i);
    if (m?.[1]) {
      const canonical = new URL(m[1], current).toString();
      if (canonical !== current) {
        current = canonical;
        hops.push(current);
      }
    }
  }

  // 3) basic AMP normalization
  current = current
    .replace(/\/amp(\/)?(\?.*)?$/i, "$1$2")
    .replace(/\?output=amp(&|$)/i, (match, tail) => tail ? `?` : "");

  // 4) normalize
  const urlNorm = normalizeUrl(current);
  return { input, finalUrl: current, urlNorm, hops };
}
```

### 6.4 例外処理・再試行
- `fetch` 失敗 / `AbortError`：指数バックオフ（`400ms -> 1200ms`）、最大 2 回再試行
- HTML パース失敗は**無視**（リダイレクト結果のみで続行）

---

## 7. スロットリング（簡易）

- **トークンバケット**に近い簡易版を `lib/gnews.ts` 内部ユーティリティとして実装：
  - RPS = 2、最大バースト 4
  - `await rateLimit()` を**RSS取得ごと**・**解決ごと**に適用可能
- 実運用は Phase 5 の Cron と併用でさらに分散（輪番）

```ts
let tokens = 4;
let lastRefill = Date.now();

export async function rateLimit(rps = 2, burst = 4) {
  const refill = Math.floor((Date.now() - lastRefill) / 1000) * rps;
  if (refill > 0) {
    tokens = Math.min(burst, tokens + refill);
    lastRefill = Date.now();
  }
  while (tokens <= 0) {
    await new Promise(r => setTimeout(r, 100));
    const refill2 = Math.floor((Date.now() - lastRefill) / 1000) * rps;
    if (refill2 > 0) {
      tokens = Math.min(burst, tokens + refill2);
      lastRefill = Date.now();
    }
  }
  tokens -= 1;
}
```

---

## 8. 結合ポイント（Phase 4 で使用）

- `buildVipQueries(vip)` で **言語×VIP** の RSS URL を得る
- `fetchGnewsRss(url)` で `RssItem[]` を得る
- 各 `item.link` を `resolveCanonical` → `normalizeUrl` 済の `urlNorm` を得る
- `matchVip`（Phase 2）で **feed VIP + 追加ヒット VIP** を付与
- **DB保存は Phase 4** で実装（`Article` / `IngestLog`）

---

## 9. テスト計画（Jest）

### 9.1 テスト対象
- `buildVipQueries`：OR/AND 括弧、言語別パラメータ、引用符
- `fetchGnewsRss`：RSS2/Atom のパース（`source` の補完）
- `resolveCanonical`：
  - 3xx フォローで `res.url` が媒体ドメインになる
  - HTML canonical を採用する（`followHtmlCanonical=true`）
  - AMP 除去 → `normalizeUrl` の適用

### 9.2 フィクスチャ
- `tests/fixtures/gnews/rss_min_ja.xml`（最小アイテム×2）
- `tests/fixtures/gnews/atom_min_en.xml`
- `tests/fixtures/gnews/html_canonical.html`（`<link rel="canonical">` を含む）

### 9.3 モック戦略
- `global.fetch` をモックし、`Response` を自前生成
- `resolveCanonical` の 3 段階（redirect/html/canonical）を **擬似URL** で再現

### 9.4 例：`gnews.test.ts` 骨子
```ts
import { buildVipQueries, resolveCanonical, fetchGnewsRss } from "@/lib/gnews";

test("buildVipQueries: OR/AND & lang params", () => {
  const vip = { id:"1", name:"Christine Lagarde", aliases:["ラガルド","クリスティーヌ・ラガルド"] };
  const qs = buildVipQueries(vip);
  expect(qs).toHaveLength(2);
  expect(qs[0].url).toContain("hl=ja");
  expect(qs[1].url).toContain("hl=en-US");
  expect(decodeURIComponent(qs[0].url)).toMatch(/\(Christine Lagarde|ラガルド|クリスティーヌ・ラガルド\)/);
  expect(decodeURIComponent(qs[0].url)).toMatch(/\(speech|remarks|発言|講演|声明|会見/);
});

test("resolveCanonical: follow html canonical & normalize", async () => {
  // fetch をモックして 302 -> html -> canonical の順に返す…（省略）
  const r = await resolveCanonical("https://news.google.com/articles/abc");
  expect(r.finalUrl).toMatch(/reuters\.com|bloomberg\.com|nikkei\.com|nhk\.or\.jp/);
  expect(r.urlNorm).toBeDefined();
});
```

---

## 10. DoD / AC（完了基準）

**DoD**
- `lib/gnews.ts` の関数群が**単体テスト90%+**で緑
- 代表VIP 2〜3 名で手動実行し、`resolveCanonical` が媒体URLへ到達すること

**AC**
- `buildVipQueries` が **括弧・引用**・**言語パラメータ**を正しく生成
- `fetchGnewsRss` が `source` を補完し、RSS2/Atom 最小フィクスチャで緑
- `resolveCanonical` が 3xx / HTML canonical / AMP を正しく処理し、`normalizeUrl` を適用

---

## 11. 参考実装サマリ（最終イメージ）

```ts
// 1) VIP → GNews RSS URL
const queries = buildVipQueries(vip);

// 2) RSS 取得 → items
for (const q of queries) {
  await rateLimit();
  const items = await fetchGnewsRss(q.url);

  for (const it of items) {
    await rateLimit();
    const rr = await resolveCanonical(it.link, { followHtmlCanonical: true });
    const urlNorm = rr.urlNorm;
    // Phase 4: DBへ保存（重複排除は UNIQUE(urlNorm) で）
  }
}
```

---

## 12. 付録：運用メモ（将来のPhase 5/6連携）
- **Cron（Railway）**：毎時 0 分。VIP を**輪番**で分割し、1 サイクルの総リクエスト数を制御
- **UI**：記事一覧には媒体名・公開日時（JST）・VIP名・外部リンクを表示（全体設計に準拠）
- **障害時**：`resolveCanonical` の失敗は記事保存時に `status="NEW"` のままでも良い（Phase 4で再試行フラグ実装予定）
