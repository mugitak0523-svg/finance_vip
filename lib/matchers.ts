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
  lang?: 'ja' | 'en' | string;
};

export type MatchResult = {
  vipIds: string[];
  terms: string[];
  debug?: Record<string, { score: number; terms: string[] }>;
};

const JAPANESE_MIN_LENGTH = 3;

function sanitizeText(input: string): string {
  return input
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u3000\s]+/g, ' ')
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTerm(term?: string): string {
  if (!term) {
    return '';
  }
  return sanitizeText(term);
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesEnglish(text: string, term: string): boolean {
  const patternBody = escapeRegex(term).replace(/\s+/g, '\\s+');
  const pattern = new RegExp(`\\b${patternBody}\\b`, 'i');
  return pattern.test(text);
}

export function matchVip(vips: Vip[], article: ArticleLike): MatchResult {
  const merged = [article.title, article.description, article.content]
    .filter((segment): segment is string => typeof segment === 'string' && segment.trim().length > 0)
    .map(sanitizeText);

  const text = merged.join(' ').trim();
  if (!text) {
    return { vipIds: [], terms: [] };
  }

  const matches: Array<{ vip: Vip; score: number; terms: string[] }> = [];
  const debug: Record<string, { score: number; terms: string[] }> = {};

  for (const vip of vips) {
    if (vip.isActive === false) {
      continue;
    }
    const uniqueTerms = new Set([vip.name, ...(vip.aliases ?? [])].filter(Boolean));
    const canonical = normalizeTerm(vip.name);
    const hitTerms: string[] = [];
    let score = 0;

    for (const rawTerm of uniqueTerms) {
      const normalized = normalizeTerm(rawTerm);
      if (!normalized) {
        continue;
      }

      const isEnglish = /[a-z]/.test(normalized);
      if (!isEnglish && normalized.length < JAPANESE_MIN_LENGTH) {
        continue;
      }

      const matched = isEnglish
        ? matchesEnglish(text, normalized)
        : text.includes(normalized);

      if (matched) {
        hitTerms.push(rawTerm);
        score += normalized === canonical ? 2 : 1;
      }
    }

    if (score > 0) {
      matches.push({ vip, score, terms: hitTerms });
      debug[vip.id] = { score, terms: [...hitTerms] };
    }
  }

  matches.sort((a, b) => b.score - a.score);

  const vipIds = matches.map((entry) => entry.vip.id);
  const terms = matches.flatMap((entry) => entry.terms);

  return {
    vipIds,
    terms,
    debug: Object.keys(debug).length > 0 ? debug : undefined
  };
}
