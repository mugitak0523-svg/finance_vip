import path from 'node:path';
import { readFile } from 'node:fs/promises';

import { buildVipQueries, fetchGnewsRss, resolveCanonical } from '@/lib/gnews';
import type { Vip } from '@/lib/matchers';

const originalFetch = global.fetch;
const fixturesDir = path.join(__dirname, '..', 'fixtures', 'gnews');

afterEach(() => {
  if (originalFetch) {
    global.fetch = originalFetch;
  } else {
    // @ts-expect-error -- restore to undefined when not available
    delete global.fetch;
  }
  jest.clearAllMocks();
  jest.useRealTimers();
});

describe('buildVipQueries', () => {
  it('constructs OR/AND grouped queries for both languages', () => {
    const vip: Vip & { gnewsQueryExtra: string } = {
      id: 'vip-1',
      name: 'Christine Lagarde',
      aliases: ['ラガルド', 'クリスティーヌ・ラガルド'],
      gnewsQueryExtra: 'central bank'
    };

    const queries = buildVipQueries(vip);

    expect(queries).toHaveLength(2);
    const jaQuery = queries.find((q) => q.lang === 'ja');
    const enQuery = queries.find((q) => q.lang === 'en');

    expect(jaQuery?.params.hl).toBe('ja');
    expect(enQuery?.params.hl).toBe('en-US');

    expect(jaQuery?.rawQuery).toBe(
      '("Christine Lagarde" OR ラガルド OR クリスティーヌ・ラガルド) (speech OR remarks OR statement OR comment OR 発言 OR 講演 OR 声明 OR 会見 OR "central bank")'
    );

    const jaSearch = new URL(jaQuery!.url);
    expect(jaSearch.searchParams.get('hl')).toBe('ja');
    expect(jaSearch.searchParams.get('gl')).toBe('JP');
    expect(jaSearch.searchParams.get('ceid')).toBe('JP:ja');
    expect(decodeURIComponent(jaSearch.searchParams.get('q') ?? '')).toContain('Christine Lagarde');
    expect(decodeURIComponent(jaSearch.searchParams.get('q') ?? '')).toContain('speech');
  });
});

describe('fetchGnewsRss', () => {
  it('returns normalized RSS items and fills missing source', async () => {
    const rssPath = path.join(fixturesDir, 'rss_min_ja.xml');
    const rssXml = await readFile(rssPath, 'utf8');

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => rssXml
    });

    global.fetch = fetchMock as unknown as typeof fetch;

    const items = await fetchGnewsRss('https://news.google.com/rss/search?q=test&hl=ja');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe('ニュース速報');
    expect(items[0].source).toBe('Google News');
  });

  it('preserves existing source from Atom feeds', async () => {
    const atomPath = path.join(fixturesDir, 'atom_min_en.xml');
    const atomXml = await readFile(atomPath, 'utf8');

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => atomXml
    });

    global.fetch = fetchMock as unknown as typeof fetch;

    const items = await fetchGnewsRss('https://news.google.com/rss/search?q=atom&hl=en');

    expect(items).toHaveLength(1);
    expect(items[0].source).toBe('Google News - Global');
  });
});

describe('resolveCanonical', () => {
  const htmlPath = path.join(fixturesDir, 'html_canonical.html');

  it('follows redirects, applies canonical link, and normalizes AMP URLs', async () => {
    const html = await readFile(htmlPath, 'utf8');

    const fetchMock = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const targetUrl = typeof url === 'string' ? url : url.toString();
      const method = (init?.method ?? 'GET').toUpperCase();

      if (method === 'HEAD') {
        return {
          ok: false,
          status: 405,
          statusText: 'Method Not Allowed',
          headers: new Headers(),
          url: targetUrl,
          body: { cancel: jest.fn() },
          text: async () => ''
        } as unknown as Response;
      }

      if (method === 'GET' && targetUrl === 'https://news.google.com/articles/abc') {
        return {
          ok: false,
          status: 302,
          statusText: 'Found',
          headers: new Headers({
            location: 'https://www.example.com/story/amp?output=amp'
          }),
          url: targetUrl,
          body: { cancel: jest.fn() },
          text: async () => ''
        } as unknown as Response;
      }

      if (method === 'GET' && targetUrl === 'https://www.example.com/story/amp?output=amp') {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Headers({
            'content-type': 'text/html; charset=utf-8'
          }),
          url: targetUrl,
          text: async () => html
        } as unknown as Response;
      }

      throw new Error(`Unexpected fetch call to ${targetUrl} via ${method}`);
    });

    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await resolveCanonical('https://news.google.com/articles/abc');

    expect(fetchMock).toHaveBeenCalled();
    expect(result.finalUrl).toBe('https://www.example.com/story');
    expect(result.urlNorm).toBe('https://www.example.com/story');
    expect(result.hops).toEqual([
      'https://news.google.com/articles/abc',
      'https://www.example.com/story/amp?output=amp',
      'https://www.example.com/story'
    ]);
  });

  it('can skip canonical extraction and still strip AMP artifacts', async () => {
    const fetchMock = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const targetUrl = typeof url === 'string' ? url : url.toString();
      const method = (init?.method ?? 'GET').toUpperCase();

      if (method === 'HEAD') {
        return {
          ok: false,
          status: 405,
          statusText: 'Method Not Allowed',
          headers: new Headers(),
          url: targetUrl,
          body: { cancel: jest.fn() },
          text: async () => ''
        } as unknown as Response;
      }

      if (method === 'GET' && targetUrl === 'https://news.google.com/articles/xyz') {
        return {
          ok: false,
          status: 302,
          statusText: 'Found',
          headers: new Headers({
            location: 'https://www.example.com/story/amp?output=amp'
          }),
          url: targetUrl,
          body: { cancel: jest.fn() },
          text: async () => ''
        } as unknown as Response;
      }

      if (method === 'GET' && targetUrl === 'https://www.example.com/story/amp?output=amp') {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Headers({
            'content-type': 'text/plain'
          }),
          url: targetUrl,
          text: async () => 'AMP version'
        } as unknown as Response;
      }

      throw new Error(`Unexpected fetch call to ${targetUrl} via ${method}`);
    });

    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await resolveCanonical('https://news.google.com/articles/xyz', {
      followHtmlCanonical: false
    });

    expect(result.finalUrl).toBe('https://www.example.com/story/');
    expect(result.urlNorm).toBe('https://www.example.com/story');
    expect(result.hops).toEqual([
      'https://news.google.com/articles/xyz',
      'https://www.example.com/story/amp?output=amp'
    ]);
  });
});
