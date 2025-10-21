import { XMLParser } from 'fast-xml-parser';

export type RssItem = {
  title: string;
  link: string;
  description?: string;
  pubDate?: string;
  guid?: string;
  source?: string;
  raw?: unknown;
};

type FetchOptions = {
  timeoutMs?: number;
  userAgent?: string;
};

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_USER_AGENT = 'finance-vip/1.0';

function toText(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    if ('#text' in record) {
      return toText(record['#text']);
    }
    if ('text' in record) {
      return toText(record.text);
    }
    if ('value' in record) {
      return toText(record.value);
    }
  }
  return '';
}

function toAbsoluteLink(link: unknown, baseUrl: string): string {
  const candidate =
    typeof link === 'string'
      ? link
      : typeof link === 'object' && link !== null
      ? (() => {
          const record = link as Record<string, unknown>;
          if ('href' in record && record.href) {
            return String(record.href);
          }
          if ('#text' in record && record['#text']) {
            return String(record['#text']);
          }
          if ('value' in record && record.value) {
            return String(record.value);
          }
          return '';
        })()
      : '';

  if (!candidate) {
    return '';
  }

  try {
    return new URL(candidate, baseUrl).toString();
  } catch {
    return candidate;
  }
}

function normalizeRss(parsed: any, requestUrl: string): RssItem[] {
  if (parsed?.rss?.channel) {
    const channel = Array.isArray(parsed.rss.channel)
      ? parsed.rss.channel[0]
      : parsed.rss.channel;
    const items = channel?.item
      ? Array.isArray(channel.item)
        ? channel.item
        : [channel.item]
      : [];

    return items.map((item: any) => {
      const description = toText(item.description);
      const pubDate = toText(item.pubDate);
      const guid = toText(item.guid);

      return {
        title: toText(item.title) || '',
        link: toAbsoluteLink(item.link, requestUrl),
        description: description || undefined,
        pubDate: pubDate || undefined,
        guid: guid || undefined,
        source: toText(channel?.title) || undefined,
        raw: item
      };
    });
  }

  if (parsed?.feed?.entry) {
    const feed = parsed.feed;
    const entries = Array.isArray(feed.entry) ? feed.entry : [feed.entry];

    const pickLink = (entry: any): string => {
      if (!entry?.link) {
        return '';
      }
      const links = Array.isArray(entry.link) ? entry.link : [entry.link];
      const preferred = links.find((link: any) => link?.rel === 'alternate') ?? links[0];
      return toAbsoluteLink(preferred, requestUrl);
    };

    return entries.map((entry: any) => {
      const summary = toText(entry.summary) || toText(entry.content);
      const updated = toText(entry.updated) || toText(entry.published);
      const guid = toText(entry.id);

      return {
        title: toText(entry.title) || '',
        link: pickLink(entry),
        description: summary || undefined,
        pubDate: updated || undefined,
        guid: guid || undefined,
        source: toText(feed?.title) || undefined,
        raw: entry
      };
    });
  }

  return [];
}

export async function fetchRss(url: string, opts?: FetchOptions): Promise<RssItem[]> {
  const controller = new AbortController();
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: { 'user-agent': opts?.userAgent ?? DEFAULT_USER_AGENT },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`RSS fetch failed: ${response.status} ${response.statusText}`);
    }

    const xml = await response.text();
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      trimValues: true,
      processEntities: true,
      parseTagValue: true
    });

    const parsed = parser.parse(xml);
    return normalizeRss(parsed, url);
  } finally {
    clearTimeout(timeout);
  }
}
