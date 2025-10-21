import {
  DEFAULT_FETCH_TIMEOUT_MS,
  DEFAULT_UA,
  GNEWS_DEFAULTS,
  GNEWS_SEARCH_BASE,
  RATE_LIMIT_BURST,
  RATE_LIMIT_RPS,
  VIP_KEYWORDS,
  type LangKey
} from '@/config/gnews';
import type { Vip } from '@/lib/matchers';
import type { RssItem } from '@/lib/rss';
import { fetchRss } from '@/lib/rss';
import { normalizeUrl } from '@/lib/url';

export type BuiltQuery = {
  url: string;
  lang: 'ja' | 'en';
  rawQuery: string;
  params: Record<string, string>;
};

export type ResolveResult = {
  input: string;
  finalUrl: string;
  urlNorm: string;
  hops: string[];
};

const DEFAULT_RESOLVE_TIMEOUT_MS = 7000;
const MAX_REDIRECTS = 5;
const MAX_RETRIES = 2;
const INITIAL_RETRY_DELAY_MS = 400;

let tokens = RATE_LIMIT_BURST;
let lastRefill = Date.now();

function quoteIfNeeded(value: string): string {
  return /\s/.test(value) ? `"${value}"` : value;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value) {
      continue;
    }
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }
  return result;
}

function buildQuery(names: string[], keywords: string[]): string {
  const nameBlock = names.length > 0 ? `(${names.join(' OR ')})` : '';
  const keywordBlock = keywords.length > 0 ? `(${keywords.join(' OR ')})` : '';
  return [nameBlock, keywordBlock].filter(Boolean).join(' ').trim();
}

function encodeQueryParams(params: Record<string, string>): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    searchParams.set(key, value);
  }
  return searchParams.toString();
}

function computeRetryDelay(attempt: number): number {
  if (attempt <= 0) {
    return INITIAL_RETRY_DELAY_MS;
  }
  return INITIAL_RETRY_DELAY_MS * 3 ** attempt;
}

export async function rateLimit(rps = RATE_LIMIT_RPS, burst = RATE_LIMIT_BURST): Promise<void> {
  const now = Date.now();
  const elapsedSeconds = (now - lastRefill) / 1000;
  if (elapsedSeconds >= 1) {
    const refill = Math.floor(elapsedSeconds) * rps;
    if (refill > 0) {
      tokens = Math.min(burst, tokens + refill);
      lastRefill = now;
    }
  }

  while (tokens <= 0) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const innerNow = Date.now();
    const elapsed = (innerNow - lastRefill) / 1000;
    const refill = Math.floor(elapsed) * rps;
    if (refill > 0) {
      tokens = Math.min(burst, tokens + refill);
      lastRefill = innerNow;
    }
  }

  tokens -= 1;
}

export function buildVipQueries(vip: Vip): BuiltQuery[] {
  const aliases = Array.isArray(vip.aliases) ? vip.aliases : [];
  const sourceNames = uniqueStrings([vip.name, ...aliases].map((value) => value?.trim()).filter(Boolean) as string[]);
  const names = sourceNames.map(quoteIfNeeded);

  const keywordPool = [...VIP_KEYWORDS];
  const extra = (vip as { gnewsQueryExtra?: string }).gnewsQueryExtra;
  if (extra && typeof extra === 'string' && extra.trim().length > 0) {
    keywordPool.push(extra.trim());
  }
  const keywords = uniqueStrings(
    keywordPool
      .map((kw) => kw.trim())
      .filter(Boolean)
      .map(quoteIfNeeded)
  );

  const rawQuery = buildQuery(names, keywords);

  const languages: LangKey[] = ['ja', 'en'];

  return languages.map((lang) => {
    const defaults = GNEWS_DEFAULTS[lang];
    const params: Record<string, string> = {
      q: rawQuery,
      hl: defaults.hl,
      gl: defaults.gl,
      ceid: defaults.ceid
    };

    const search = encodeQueryParams(params);
    const url = `${GNEWS_SEARCH_BASE}?${search}`;

    return {
      url,
      lang,
      rawQuery,
      params
    };
  });
}

export async function fetchGnewsRss(
  url: string,
  opts?: { timeoutMs?: number; userAgent?: string }
): Promise<RssItem[]> {
  await rateLimit();
  const items = await fetchRss(url, {
    timeoutMs: opts?.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS,
    userAgent: opts?.userAgent ?? DEFAULT_UA
  });

  return items.map((item) => ({
    ...item,
    source: item.source ?? 'Google News'
  }));
}

type FollowResult = {
  response: Response;
  url: string;
  hops: string[];
};

async function doFetch(
  targetUrl: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  await rateLimit();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(targetUrl, {
      ...init,
      signal: controller.signal,
      headers: {
        'user-agent': DEFAULT_UA,
        ...(init.headers ?? {})
      }
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function followRedirects(
  initialUrl: string,
  method: 'HEAD' | 'GET',
  timeoutMs: number,
  seedHops: string[] = []
): Promise<FollowResult> {
  let currentUrl = initialUrl;
  const hops = seedHops.length > 0 ? [...seedHops] : [initialUrl];
  if (!hops.includes(initialUrl)) {
    hops.push(initialUrl);
  }

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const response = await doFetch(currentUrl, { method, redirect: 'manual' }, timeoutMs);

    if (response.status >= 300 && response.status < 400) {
      const locationHeader = response.headers.get('location');
      response.body?.cancel?.();
      if (!locationHeader) {
        return { response, url: currentUrl, hops };
      }

      const nextUrl = new URL(locationHeader, currentUrl).toString();
      if (hops[hops.length - 1] !== nextUrl) {
        hops.push(nextUrl);
      }
      currentUrl = nextUrl;
      continue;
    }

    if (method === 'HEAD' && response.status >= 400) {
      response.body?.cancel?.();
      throw new Error(`HEAD failed with status ${response.status}`);
    }

    if (method === 'GET' && response.status >= 400) {
      response.body?.cancel?.();
      throw new Error(`GET failed with status ${response.status}`);
    }

    return { response, url: currentUrl, hops };
  }

  throw new Error('Too many redirects');
}

function removeAmpArtifacts(url: string): string {
  try {
    const parsed = new URL(url);
    let pathname = parsed.pathname.replace(/\/amp\/?$/i, '/');
    pathname = pathname.replace(/\/amp$/i, '/');
    pathname = pathname.replace(/\/amp\.html$/i, '.html');
    pathname = pathname.replace(/\/{2,}/g, '/');
    if (!pathname) {
      pathname = '/';
    }
    parsed.pathname = pathname;

    const searchParams = new URLSearchParams(parsed.search);
    const keysToDelete: string[] = [];
    for (const [key, value] of searchParams.entries()) {
      const lowerKey = key.toLowerCase();
      const lowerValue = value.toLowerCase();
      if (lowerKey === 'amp' || (lowerKey === 'output' && lowerValue === 'amp')) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      searchParams.delete(key);
    }

    const serialized = searchParams.toString();
    parsed.search = serialized ? `?${serialized}` : '';

    return parsed.toString();
  } catch {
    return url;
  }
}

async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
  let attempt = 0;
  // Attempt count: initial try + MAX_RETRIES retries.
  // attempt variable counts retries already performed.
  // For clarity we use for loop.
  for (;;) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= MAX_RETRIES) {
        throw error;
      }
      const delay = computeRetryDelay(attempt);
      attempt += 1;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

export async function resolveCanonical(
  input: string,
  opts?: { timeoutMs?: number; followHtmlCanonical?: boolean }
): Promise<ResolveResult> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_RESOLVE_TIMEOUT_MS;
  const followHtmlCanonical = opts?.followHtmlCanonical ?? true;

  const result = await withRetry(async () => {
    const hops: string[] = [input];

    let headResult: FollowResult | null = null;
    try {
      headResult = await followRedirects(input, 'HEAD', Math.min(timeoutMs, 4000), hops);
    } catch {
      headResult = null;
    } finally {
      headResult?.response.body?.cancel?.();
    }

    const baseUrl = headResult?.url ?? input;
    const baseHops = headResult?.hops ?? hops;

    const getResult = await followRedirects(baseUrl, 'GET', timeoutMs, baseHops);
    const response = getResult.response;
    let finalUrl = getResult.url;
    const finalHops = getResult.hops;

    const contentType = response.headers.get('content-type') ?? '';

    let htmlContent: string | undefined;

    if (followHtmlCanonical && /\btext\/html\b/i.test(contentType)) {
      try {
        htmlContent = await response.text();
      } catch {
        htmlContent = undefined;
      }
    } else {
      response.body?.cancel?.();
    }

    if (htmlContent) {
      const canonicalMatch = htmlContent.match(
        /<link\s+[^>]*rel=["']?canonical["']?[^>]*href=["']?([^"' >]+)["']?/i
      );
      if (canonicalMatch?.[1]) {
        try {
          const candidate = new URL(canonicalMatch[1], finalUrl).toString();
          if (candidate && candidate !== finalUrl) {
            finalUrl = candidate;
            if (finalHops[finalHops.length - 1] !== finalUrl) {
              finalHops.push(finalUrl);
            }
          }
        } catch {
          // Ignore malformed canonical URLs.
        }
      }
    }

    finalUrl = removeAmpArtifacts(finalUrl);
    const urlNorm = normalizeUrl(finalUrl);

    return {
      input,
      finalUrl,
      urlNorm,
      hops: finalHops
    };
  });

  return result;
}
