export const GNEWS_DEFAULTS = {
  ja: { hl: 'ja', gl: 'JP', ceid: 'JP:ja' },
  en: { hl: 'en-US', gl: 'US', ceid: 'US:en' }
} as const;

export const VIP_KEYWORDS = [
  'speech',
  'remarks',
  'statement',
  'comment',
  '発言',
  '講演',
  '声明',
  '会見'
] as const;

export const GNEWS_SEARCH_BASE = 'https://news.google.com/rss/search';

export type LangKey = keyof typeof GNEWS_DEFAULTS;

export const DEFAULT_FETCH_TIMEOUT_MS = 8000;
export const DEFAULT_UA = 'finance-vip/1.0 (+https://example.org)';
export const RATE_LIMIT_RPS = 2;
export const RATE_LIMIT_BURST = 4;
