import { invokePost } from '../helpers/next';

const storedUrls = new Set<string>();

jest.mock('@/lib/db', () => {
  return {
    prisma: {
      vip: {
        findMany: jest.fn()
      },
      article: {
        findUnique: jest.fn((args: { where: { urlNorm: string } }) =>
          storedUrls.has(args.where.urlNorm) ? { id: `article-${args.where.urlNorm}` } : null
        ),
        create: jest.fn((args: { data: { urlNorm: string } }) => {
          storedUrls.add(args.data.urlNorm);
          return { id: `article-${storedUrls.size}`, ...args.data };
        })
      },
      ingestLog: {
        create: jest.fn()
      }
    }
  };
});

jest.mock('@/lib/gnews', () => ({
  buildVipQueries: jest.fn(),
  fetchGnewsRss: jest.fn(),
  resolveCanonical: jest.fn()
}));

describe('POST /api/jobs/ingest:run', () => {
  const now = new Date();
  const recentPubDate = new Date(now.getTime() - 60 * 60 * 1000).toUTCString();
  const olderPubDate = new Date(now.getTime() - 50 * 60 * 60 * 1000).toUTCString();

  const vipRecord = {
    id: 'vip-1',
    name: 'Christine Lagarde',
    aliases: ['Christine Lagarde', 'ラガルド'],
    gnewsQueryExtra: null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    org: null,
    title: null
  };

  beforeEach(() => {
    storedUrls.clear();
    jest.clearAllMocks();
  });

  it('ingests new articles and skips duplicates on subsequent runs', async () => {
    process.env.API_KEY = 'test-key';

    const { prisma } = await import('@/lib/db');
    const gnews = await import('@/lib/gnews');

    (prisma.vip.findMany as jest.Mock).mockResolvedValue([vipRecord]);
    (prisma.ingestLog.create as jest.Mock).mockResolvedValue({});

    (gnews.buildVipQueries as jest.Mock).mockReturnValue([
      { url: 'https://news.google.com/rss?q=lagarde', lang: 'en', rawQuery: 'lagarde', params: {} }
    ]);

    (gnews.fetchGnewsRss as jest.Mock).mockResolvedValue([
      {
        title: 'Lagarde delivers remarks',
        link: 'https://news.google.com/articles/abc',
        description: 'ECB policy outlook',
        pubDate: recentPubDate,
        source: 'Google News'
      },
      {
        title: 'Lagarde archive story',
        link: 'https://news.google.com/articles/old',
        description: 'Old event',
        pubDate: olderPubDate,
        source: 'Google News'
      }
    ]);

    (gnews.resolveCanonical as jest.Mock).mockImplementation((link: string) => {
      const canonical = link === 'https://news.google.com/articles/abc'
        ? 'https://www.reuters.com/markets/europe/lagarde-addresses-inflation'
        : 'https://www.reuters.com/markets/europe/lagarde-archive';
      return {
        input: link,
        finalUrl: canonical,
        urlNorm: canonical,
        hops: [link, canonical]
      };
    });

    const { POST } = await import('@/app/api/jobs/ingest:run/route');

    const first = await invokePost(POST, {
      headers: { 'X-Admin-Key': 'test-key' },
      body: { recentHours: 48, dryRun: false }
    });

    expect(first.status).toBe(200);
    expect(first.body.ok).toBe(true);
    expect(first.body.totals.new).toBe(1);
    expect(first.body.totals.skip).toBe(0);
    expect(prisma.article.create).toHaveBeenCalledTimes(1);

    const second = await invokePost(POST, {
      headers: { 'X-Admin-Key': 'test-key' },
      body: { recentHours: 48 }
    });

    expect(second.status).toBe(200);
    expect(second.body.ok).toBe(true);
    expect(second.body.totals.new).toBe(0);
    expect(second.body.totals.skip).toBe(1);
    expect(prisma.article.create).toHaveBeenCalledTimes(1);

    expect(prisma.ingestLog.create).toHaveBeenCalledTimes(2);
  });

  it('rejects unauthorized requests', async () => {
    process.env.API_KEY = 'correct-key';

    const { POST } = await import('@/app/api/jobs/ingest:run/route');

    const response = await invokePost(POST, {
      headers: { 'X-Admin-Key': 'wrong-key' },
      body: {}
    });

    expect(response.status).toBe(401);
    expect(response.body.ok).toBe(false);
  });

  it('supports limiting ingest to specified VIP ids', async () => {
    process.env.API_KEY = 'scoped-key';

    const { prisma } = await import('@/lib/db');
    const gnews = await import('@/lib/gnews');

    (prisma.vip.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.ingestLog.create as jest.Mock).mockResolvedValue({});
    (gnews.buildVipQueries as jest.Mock).mockReturnValue([]);
    (gnews.fetchGnewsRss as jest.Mock).mockResolvedValue([]);

    const { POST } = await import('@/app/api/jobs/ingest:run/route');

    await invokePost(POST, {
      headers: { 'X-Admin-Key': 'scoped-key' },
      body: { vipIds: ['vip-123', ''], dryRun: true }
    });

    expect(prisma.vip.findMany).toHaveBeenCalledWith({
      where: {
        isActive: true,
        id: { in: ['vip-123'] }
      }
    });
  });
});
