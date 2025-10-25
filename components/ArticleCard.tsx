import type { ArticleSummary } from "@/lib/fetchers";

function formatDate(value: string | null, fallback: string) {
  const source = value ?? fallback;
  const date = source ? new Date(source) : null;
  if (!date || Number.isNaN(date.valueOf())) {
    return "日時不明";
  }
  const formatted = date.toLocaleString("ja-JP", { hour12: false, timeZone: "Asia/Tokyo" });
  return `${formatted} JST`;
}

function decodeEntities(input: string) {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripHtml(input: string) {
  return input.replace(/<[^>]*>/g, "");
}

function normalizeWhitespace(input: string) {
  return input.replace(/\s+/g, " ").trim();
}


function isLikelyQuery(text: string) {
  return /\bOR\b/.test(text) || /\bAND\b/.test(text) || text.includes(") - Google News");
}

function cleanDescription(article: ArticleSummary) {
  const raw = article.description;
  if (!raw) {
    return null;
  }

  const decoded = decodeEntities(raw);
  const stripped = normalizeWhitespace(stripHtml(decoded));
  if (!stripped) {
    return null;
  }

  if (isLikelyQuery(stripped)) {
    return null;
  }

  const withoutSource = stripped.replace(/\s+-\s+[\w .]+$/i, "");

  const titleNormalized = normalizeWhitespace(article.title);
  if (withoutSource.toLowerCase() === titleNormalized.toLowerCase()) {
    return null;
  }

  if (withoutSource.startsWith("http")) {
    return null;
  }

  return withoutSource.length > 200 ? `${withoutSource.slice(0, 200)}…` : withoutSource;
}

export function ArticleCard({ article }: { article: ArticleSummary }) {
  const description = cleanDescription(article);
  const uniqueTerms = Array.from(new Set(article.matchTerms)).filter(Boolean);
  const publishedLabel = formatDate(article.publishedAt, article.fetchedAt);
  const fetchedLabel = formatDate(article.fetchedAt, article.fetchedAt);
  const fetchedRelative = formatRelative(article.fetchedAt);

  return (
    <article className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500 md:flex-row md:items-center md:gap-3">
          <span className="rounded bg-slate-100 px-2 py-1 text-slate-600">{article.displaySource}</span>
          <div className="flex flex-col gap-0.5 text-[11px] font-normal uppercase tracking-normal text-slate-500 md:flex-row md:items-center md:gap-3">
            <span className="normal-case text-slate-500">公開: {publishedLabel}</span>
            <span className="normal-case text-slate-500">
              収集: {fetchedLabel}
              {fetchedRelative ? <span className="ml-2 text-slate-400">({fetchedRelative})</span> : null}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {article.vipMatches.map((vip) => (
            <span
              key={vip.id}
              className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700"
            >
              {vip.name}
            </span>
          ))}
        </div>
      </header>

      <div className="space-y-3">
        <a
          href={article.url}
          target="_blank"
          rel="noreferrer"
          className="text-lg font-semibold text-blue-700 hover:underline"
        >
          {article.title}
        </a>
        {description ? <p className="text-sm leading-relaxed text-slate-700">{description}</p> : null}
      </div>

      {uniqueTerms.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {uniqueTerms.map((term) => (
            <span key={term} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
              {term}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export default ArticleCard;
function formatRelative(value: string | null) {
  if (!value) {
    return "";
  }
  const timestamp = new Date(value).valueOf();
  if (Number.isNaN(timestamp)) {
    return "";
  }
  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) {
    return "たった今";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}分前`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}時間前`;
  }
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}日前`;
}
