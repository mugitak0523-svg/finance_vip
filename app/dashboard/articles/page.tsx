import ArticleCard from "@/components/ArticleCard";
import Filters from "@/components/Filters";
import { fetchArticles, fetchVips } from "@/lib/fetchers";

type SearchParams = Record<string, string | string[] | undefined>;

function getParamValue(input: SearchParams, key: string) {
  const value = input?.[key];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value ?? undefined;
}

function parsePage(input: string | undefined) {
  const parsed = Number.parseInt(input ?? "", 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return 1;
  }
  return parsed;
}

function buildPageLink(base: URLSearchParams, page: number) {
  const params = new URLSearchParams(base);
  params.set("page", String(page));
  return `/dashboard/articles?${params.toString()}`;
}

export default async function ArticlesPage({ searchParams = {} }: { searchParams?: SearchParams }) {
  const q = getParamValue(searchParams, "q")?.trim();
  const vipId = getParamValue(searchParams, "vipId")?.trim();
  const page = parsePage(getParamValue(searchParams, "page"));

  const baseParams = new URLSearchParams();
  if (q) baseParams.set("q", q);
  if (vipId) baseParams.set("vipId", vipId);

  let articleData: Awaited<ReturnType<typeof fetchArticles>> | null = null;
  let vipData: Awaited<ReturnType<typeof fetchVips>> | null = null;
  let errorMessage: string | null = null;

  try {
    [articleData, vipData] = await Promise.all([
      fetchArticles({ q, vipId, page }),
      fetchVips()
    ]);
  } catch (error) {
    console.error("[dashboard/articles] fetch error", error);
    errorMessage = "データの取得に失敗しました。時間を置いて再度お試しください。";
  }

  const vipOptions = (vipData ?? []).map((vip) => ({ id: vip.id, name: vip.name }));
  const articles = articleData?.items ?? [];

  const prevHref = articleData && articleData.page > 1 ? buildPageLink(baseParams, articleData.page - 1) : null;
  const nextHref = articleData && articleData.hasMore ? buildPageLink(baseParams, articleData.page + 1) : null;

  return (
    <div className="space-y-6">
      <Filters
        vips={vipOptions}
        initial={{ q: q ?? undefined, vipId: vipId ?? undefined }}
      />

      {errorMessage ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 shadow-sm">
          {errorMessage}
        </div>
      ) : null}

      {!errorMessage && articles.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
          該当する記事が見つかりませんでした。
        </div>
      ) : null}

      <div className="grid gap-4">
        {articles.map((article) => (
          <ArticleCard key={article.id} article={article} />
        ))}
      </div>

      {articleData && articleData.total > 0 ? (
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
          <div>
            全{articleData.total}件中 {(articleData.page - 1) * articleData.pageSize + 1}〜
            {(articleData.page - 1) * articleData.pageSize + articles.length}件を表示
          </div>
          <div className="flex gap-2">
            {prevHref ? (
              <a
                href={prevHref}
                className="rounded-lg border border-slate-300 px-3 py-1 font-semibold text-slate-700 hover:border-blue-400 hover:text-blue-700"
              >
                前へ
              </a>
            ) : (
              <span className="rounded-lg border border-slate-200 px-3 py-1 font-semibold text-slate-400">前へ</span>
            )}
            {nextHref ? (
              <a
                href={nextHref}
                className="rounded-lg border border-slate-300 px-3 py-1 font-semibold text-slate-700 hover:border-blue-400 hover:text-blue-700"
              >
                次へ
              </a>
            ) : (
              <span className="rounded-lg border border-slate-200 px-3 py-1 font-semibold text-slate-400">次へ</span>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
