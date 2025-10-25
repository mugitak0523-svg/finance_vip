type ApiResponse<T> = {
  ok: boolean;
  data: T;
  error?: string;
};

function resolveRequestUrl(input: string): string {
  if (/^https?:/i.test(input)) {
    return input;
  }

  if (typeof window !== "undefined") {
    return input;
  }

  const baseEnv =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ??
    (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : undefined) ??
    (process.env.RAILWAY_STATIC_URL ? `https://${process.env.RAILWAY_STATIC_URL}` : undefined);

  const fallbackPort = process.env.PORT ?? "3000";
  const base = baseEnv ?? `http://127.0.0.1:${fallbackPort}`;

  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  const normalizedInput = input.startsWith("/") ? input : `/${input}`;

  return `${normalizedBase}${normalizedInput}`;
}

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const url = resolveRequestUrl(input);

  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    cache: "no-store"
  });

  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }

  const json = (await res.json()) as ApiResponse<T>;
  if (!json.ok) {
    throw new Error(json.error ?? "unknown_error");
  }

  return json.data;
}

export type ArticleSummary = {
  id: string;
  title: string;
  description: string | null;
  url: string;
  sourceName: string;
  displaySource: string;
  publishedAt: string | null;
  createdAt: string;
  fetchedAt: string;
  status: string;
  vipMatches: Array<{ id: string; name: string; isActive: boolean }>;
  matchTerms: string[];
};

export type ArticleListResult = {
  items: ArticleSummary[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
};

export type ArticleQuery = {
  vipId?: string;
  q?: string;
  page?: number;
  limit?: number;
  from?: string;
  to?: string;
};

export async function fetchArticles(params: ArticleQuery = {}): Promise<ArticleListResult> {
  const search = new URLSearchParams();

  if (params.vipId) search.set("vipId", params.vipId);
  if (params.q) search.set("q", params.q);
  if (typeof params.page === "number" && !Number.isNaN(params.page)) {
    search.set("page", String(params.page));
  }
  if (typeof params.limit === "number" && !Number.isNaN(params.limit)) {
    search.set("limit", String(params.limit));
  }
  if (params.from) search.set("from", params.from);
  if (params.to) search.set("to", params.to);

  const suffix = search.toString();
  const url = suffix ? `/api/articles?${suffix}` : "/api/articles";

  return request<ArticleListResult>(url);
}

export type IngestLogEntry = {
  id: string;
  jobId: string | null;
  startedAt: string;
  endedAt: string;
  stats: Record<string, unknown>;
  level: string;
  message: string | null;
  createdAt: string;
};

export async function fetchLogs(limit = 20): Promise<IngestLogEntry[]> {
  const url = `/api/logs?limit=${Math.max(1, Math.min(limit, 100))}`;
  return request<IngestLogEntry[]>(url);
}

export type VipEntry = {
  id: string;
  name: string;
  aliases: string[];
  org: string | null;
  title: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export async function fetchVips(): Promise<VipEntry[]> {
  return request<VipEntry[]>("/api/vips");
}
