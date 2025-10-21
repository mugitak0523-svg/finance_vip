import { domainToASCII } from 'node:url';
import path from 'node:path';

const TRACKING_KEYS = new Set([
  'gclid',
  'fbclid',
  'igshid',
  'si',
  'spm',
  'mc_cid',
  'mc_eid',
  'yclid',
  'sc_channel'
]);

const TRACKING_PREFIXES = ['utm_'];

export function normalizeUrl(input: string): string {
  const url = new URL(input);

  url.protocol = url.protocol.toLowerCase();

  const lowerHost = url.hostname.toLowerCase();
  const asciiHost = domainToASCII(lowerHost);
  url.hostname = asciiHost ? asciiHost.toLowerCase() : lowerHost;

  if (
    (url.protocol === 'http:' && url.port === '80') ||
    (url.protocol === 'https:' && url.port === '443')
  ) {
    url.port = '';
  }

  const normalizedPath = path.posix.normalize(url.pathname || '/');
  url.pathname = normalizedPath === '/' ? '/' : normalizedPath.replace(/\/$/, '');

  url.hash = '';

  const filtered = Array.from(url.searchParams.entries())
    .filter(([key, value]) => {
      const keyLower = key.toLowerCase();
      if (value.trim() === '') {
        return false;
      }
      if (TRACKING_KEYS.has(keyLower)) {
        return false;
      }
      if (TRACKING_PREFIXES.some((prefix) => keyLower.startsWith(prefix))) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      const keyComparison = a[0].localeCompare(b[0]);
      if (keyComparison !== 0) {
        return keyComparison;
      }
      return a[1].localeCompare(b[1]);
    });

  if (filtered.length === 0) {
    url.search = '';
  } else {
    const params = new URLSearchParams();
    for (const [key, value] of filtered) {
      params.append(key, value);
    }
    url.search = `?${params.toString()}`;
  }

  return url.toString();
}

export function isLikelyDuplicate(
  urlNorm: string,
  existing: Set<string> | string[]
): boolean {
  const haystack = Array.isArray(existing) ? new Set(existing) : existing;
  return haystack.has(urlNorm);
}
