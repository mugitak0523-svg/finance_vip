import { fetchRss } from '@/lib/rss';
import { XMLParser } from 'fast-xml-parser';

const originalFetch = global.fetch;

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

describe('fetchRss', () => {
  it('parses RSS 2.0 feeds', async () => {
    const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Example News</title>
    <link>https://news.example.com</link>
    <description>Latest headlines</description>
    <item>
      <title>Top Story</title>
      <link>/articles/top-story</link>
      <description>Summary text</description>
      <pubDate>Mon, 01 Jul 2024 00:00:00 GMT</pubDate>
      <guid isPermaLink="false">abc-123</guid>
    </item>
  </channel>
</rss>`;

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => rssXml
    });

    global.fetch = fetchMock as unknown as typeof fetch;

    const items = await fetchRss('https://news.example.com/feed.xml');

    expect(fetchMock).toHaveBeenCalledWith('https://news.example.com/feed.xml', expect.objectContaining({
      headers: expect.objectContaining({ 'user-agent': 'finance-vip/1.0' }),
      signal: expect.any(Object)
    }));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: 'Top Story',
      link: 'https://news.example.com/articles/top-story',
      description: 'Summary text',
      pubDate: 'Mon, 01 Jul 2024 00:00:00 GMT',
      guid: 'abc-123',
      source: 'Example News'
    });
    expect(items[0].raw).toBeDefined();
  });

  it('parses Atom feeds and prefers alternate links', async () => {
    const atomXml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example Atom</title>
  <entry>
    <title>Atom Entry</title>
    <link href="/atom-entry" rel="alternate" />
    <link href="/alternate" rel="related" />
    <updated>2024-07-01T00:00:00Z</updated>
    <id>tag:example.com,2024:entry-1</id>
    <summary>Atom summary</summary>
  </entry>
</feed>`;

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => atomXml
    });

    global.fetch = fetchMock as unknown as typeof fetch;

    const items = await fetchRss('https://atom.example.com/feed.atom');

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: 'Atom Entry',
      link: 'https://atom.example.com/atom-entry',
      description: 'Atom summary',
      pubDate: '2024-07-01T00:00:00Z',
      guid: 'tag:example.com,2024:entry-1',
      source: 'Example Atom'
    });
  });

  it('throws on non-2xx HTTP responses', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => ''
    });

    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(fetchRss('https://news.example.com/feed.xml')).rejects.toThrow(
      'RSS fetch failed: 500 Internal Server Error'
    );
  });

  it('throws when XML parsing fails', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => '<rss><channel></channel></rss>'
    });

    global.fetch = fetchMock as unknown as typeof fetch;

    const parserSpy = jest.spyOn(XMLParser.prototype, 'parse').mockImplementation(() => {
      throw new Error('parse error');
    });

    try {
      await expect(fetchRss('https://news.example.com/feed.xml')).rejects.toThrow('parse error');
    } finally {
      parserSpy.mockRestore();
    }
  });
});
