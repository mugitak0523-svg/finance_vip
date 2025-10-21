import { deriveSourceName, guessLang } from '@/lib/ingest';

describe('guessLang', () => {
  it('returns ja when Japanese characters are present', () => {
    expect(guessLang('黒田総裁の会見')).toBe('ja');
  });

  it('returns en when alphabetic characters are present', () => {
    expect(guessLang('Lagarde delivers speech')).toBe('en');
  });

  it('falls back to und when language is indeterminate', () => {
    expect(guessLang('1234 !!!')).toBe('und');
    expect(guessLang('')).toBe('und');
  });
});

describe('deriveSourceName', () => {
  it('prefers explicit fallback source when provided', () => {
    const source = deriveSourceName('https://www.example.com/story', ' Reuters ');
    expect(source).toBe('Reuters');
  });

  it('maps known hostnames to canonical media names', () => {
    const source = deriveSourceName('https://www.bloomberg.com/economy/article', '');
    expect(source).toBe('Bloomberg');
  });

  it('returns sanitized hostname when no mapping exists', () => {
    const source = deriveSourceName('https://subdomain.example.org/topic', undefined);
    expect(source).toBe('subdomain.example.org');
  });
});
