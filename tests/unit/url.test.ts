import { isLikelyDuplicate, normalizeUrl } from '@/lib/url';

describe('normalizeUrl', () => {
  it('removes tracking query parameters and empty values', () => {
    const input =
      'https://example.com/article?utm_source=feed&utm_medium=rss&gclid=abc123&headline=1&empty=';
    expect(normalizeUrl(input)).toBe('https://example.com/article?headline=1');
  });

  it('sorts query parameters and normalizes pathname', () => {
    const input = 'https://example.com/a/./b/../c?b=2&a=1&a=0';
    expect(normalizeUrl(input)).toBe('https://example.com/a/c?a=0&a=1&b=2');
  });

  it('drops default ports, fragments, and trailing slashes', () => {
    const input = 'http://www.example.com:80/path/?z=1#section';
    expect(normalizeUrl(input)).toBe('http://www.example.com/path?z=1');
  });

  it('handles punycode domains and preserves www subdomain', () => {
    const input = 'https://www.münich.de/finance';
    expect(normalizeUrl(input)).toBe('https://www.xn--mnich-kva.de/finance');
  });

  it('throws on invalid URLs', () => {
    expect(() => normalizeUrl('not a valid url')).toThrow();
  });
});

describe('isLikelyDuplicate', () => {
  const url = 'https://example.com/norm';

  it('detects duplicates in a Set', () => {
    const set = new Set([url]);
    expect(isLikelyDuplicate(url, set)).toBe(true);
  });

  it('detects duplicates in an array', () => {
    const list = [url];
    expect(isLikelyDuplicate(url, list)).toBe(true);
  });

  it('returns false when url is not present', () => {
    expect(isLikelyDuplicate(url, new Set())).toBe(false);
  });
});
