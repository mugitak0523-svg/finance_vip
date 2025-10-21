import { prisma } from '@/lib/db';
import { buildVipQueries, fetchGnewsRss, resolveCanonical } from '@/lib/gnews';
import { matchVip } from '@/lib/matchers';
import type { Vip as MatchVip } from '@/lib/matchers';

import type { Vip } from '@prisma/client';

export type IngestOptions = {
  vipIds?: string[];
  recentHours?: number;
  followHtmlCanonical?: boolean;
  dryRun?: boolean;
};

export type IngestResult = {
  jobId: string;
  startedAt: string;
  endedAt: string;
  totals: { new: number; skip: number; error: number; seen: number };
  perVip: Record<string, { queries: number; items: number; new: number; skip: number; error: number }>;
};

type VipStats = {
  queries: number;
  items: number;
  new: number;
  skip: number;
  error: number;
};

const SOURCE_HOST_MAP: Record<string, string> = {
  'reuters.com': 'Reuters',
  'jp.reuters.com': 'Reuters',
  'bloomberg.com': 'Bloomberg',
  'www.bloomberg.com': 'Bloomberg',
  'nhk.or.jp': 'NHK',
  'www3.nhk.or.jp': 'NHK',
  'nikkei.com': 'Nikkei',
  'asia.nikkei.com': 'Nikkei',
  'www.nikkei.com': 'Nikkei',
  'ft.com': 'Financial Times',
  'wsj.com': 'Wall Street Journal'
};

function sanitizeHostname(hostname: string): string {
  return hostname.replace(/^www\./i, '').toLowerCase();
}

export function guessLang(input: string): string {
  if (!input) {
    return 'und';
  }
  if (/[ぁ-んァ-ン一-龯]/.test(input)) {
    return 'ja';
  }
  if (/[A-Za-z]/.test(input)) {
    return 'en';
  }
  return 'und';
}

export function deriveSourceName(finalUrl: string, fallback?: string | null): string {
  const trimmed = fallback?.trim();
  if (trimmed) {
    return trimmed;
  }

  try {
    const url = new URL(finalUrl);
    const host = sanitizeHostname(url.hostname);
    if (SOURCE_HOST_MAP[host]) {
      return SOURCE_HOST_MAP[host];
    }
    if (host) {
      return host;
    }
  } catch {
    // Ignore URL parsing errors and fall through.
  }

  return 'Google News';
}

function ensureRecentWindow(hours?: number): number | undefined {
  if (typeof hours !== 'number' || Number.isNaN(hours)) {
    return undefined;
  }
  if (hours <= 0) {
    return undefined;
  }
  return hours;
}

function toMatchVip(vip: Vip): MatchVip {
  return {
    id: vip.id,
    name: vip.name,
    aliases: vip.aliases,
    isActive: vip.isActive
  };
}

export async function runIngest(opts: IngestOptions = {}): Promise<IngestResult> {
  const jobId = `ingest-${Date.now()}`;
  const startedAt = new Date();

  const totals = { new: 0, skip: 0, error: 0, seen: 0 };
  const perVip: Record<string, VipStats> = {};

  const vipWhere: Parameters<typeof prisma.vip.findMany>[0]['where'] = {
    isActive: true
  };
  if (opts.vipIds && opts.vipIds.length > 0) {
    vipWhere.id = { in: opts.vipIds };
  }

  const activeVips = await prisma.vip.findMany({ where: vipWhere });
  const matchableVips = activeVips.map(toMatchVip);
  const recentWindowHours = ensureRecentWindow(opts.recentHours);

  for (const vip of activeVips) {
    perVip[vip.id] = { queries: 0, items: 0, new: 0, skip: 0, error: 0 };
    const queryVip: MatchVip & { gnewsQueryExtra?: string } = {
      id: vip.id,
      name: vip.name,
      aliases: vip.aliases,
      isActive: vip.isActive,
      gnewsQueryExtra: vip.gnewsQueryExtra ?? undefined
    };
    const queries = buildVipQueries(queryVip);
    perVip[vip.id].queries = queries.length;

    for (const query of queries) {
      let items: Awaited<ReturnType<typeof fetchGnewsRss>> = [];
      try {
        items = await fetchGnewsRss(query.url);
      } catch (error) {
        perVip[vip.id].error += 1;
        totals.error += 1;
        console.error('[ingest] rss fetch error', error);
        continue;
      }

      perVip[vip.id].items += items.length;

      for (const item of items) {
        totals.seen += 1;

        if (recentWindowHours && item.pubDate) {
          const published = new Date(item.pubDate);
          if (!Number.isNaN(published.getTime())) {
            const maxAgeMs = recentWindowHours * 3600_000;
            if (Date.now() - published.getTime() > maxAgeMs) {
              continue;
            }
          }
        }

        try {
          const canonical = await resolveCanonical(item.link, {
            followHtmlCanonical: opts.followHtmlCanonical ?? true
          });

          const existing = await prisma.article.findUnique({
            where: { urlNorm: canonical.urlNorm },
            select: { id: true }
          });
          if (existing) {
            perVip[vip.id].skip += 1;
            totals.skip += 1;
            continue;
          }

          const match = matchVip(matchableVips, {
            title: item.title,
            description: item.description
          });

          const personMatch = {
            feedVipId: vip.id,
            vipIds: Array.from(new Set([vip.id, ...match.vipIds])),
            terms: match.terms
          };

          const publishedAt =
            item.pubDate && !Number.isNaN(new Date(item.pubDate).valueOf())
              ? new Date(item.pubDate)
              : null;

          const sourceName = deriveSourceName(canonical.finalUrl, item.source);
          const lang = guessLang(item.title ?? item.description ?? '');

          if (!opts.dryRun) {
            await prisma.article.create({
              data: {
                url: canonical.finalUrl,
                urlNorm: canonical.urlNorm,
                sourceName,
                title: item.title ?? canonical.finalUrl,
                description: item.description ?? null,
                content: null,
                publishedAt,
                fetchedAt: new Date(),
                lang,
                personMatch,
                status: 'NEW'
              }
            });
          }

          perVip[vip.id].new += 1;
          totals.new += 1;
        } catch (error) {
          perVip[vip.id].error += 1;
          totals.error += 1;
          console.error('[ingest] item error', error);
        }
      }
    }
  }

  const endedAt = new Date();

  try {
    await prisma.ingestLog.create({
      data: {
        jobId,
        startedAt,
        endedAt,
        stats: { totals, perVip }
      }
    });
  } catch (error) {
    console.error('[ingest] log error', error);
  }

  return {
    jobId,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    totals: { ...totals },
    perVip
  };
}
