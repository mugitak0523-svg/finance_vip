import { matchVip, type ArticleLike, type Vip } from '@/lib/matchers';

describe('matchVip', () => {
  const powell: Vip = {
    id: 'powell',
    name: 'Jerome Powell',
    aliases: ['Powell', 'ジェローム・パウエル', 'パウエル']
  };

  it('matches English full names and aliases with scoring', () => {
    const article: ArticleLike = {
      title: 'Jerome Powell says rates will stay high'
    };

    const result = matchVip([powell], article);

    expect(result.vipIds).toEqual(['powell']);
    expect(result.terms).toEqual(['Jerome Powell', 'Powell']);
    expect(result.debug?.powell?.score).toBeGreaterThanOrEqual(3);
  });

  it('matches Japanese aliases with normalization', () => {
    const article: ArticleLike = {
      title: 'ﾊﾟｳｴﾙ議長が会見'
    };

    const result = matchVip([powell], article);

    expect(result.vipIds).toEqual(['powell']);
    expect(result.terms).toContain('パウエル');
  });

  it('returns multiple VIPs ordered by score', () => {
    const lagarde: Vip = {
      id: 'lagarde',
      name: 'Christine Lagarde',
      aliases: ['Lagarde', 'Christine Lagarde']
    };

    const article: ArticleLike = {
      title: 'Jerome Powell meets with Lagarde in Basel'
    };

    const result = matchVip([powell, lagarde], article);

    expect(result.vipIds[0]).toBe('powell');
    expect(result.vipIds).toContain('lagarde');
    expect(result.terms).toContain('Lagarde');
  });

  it('skips ambiguous short Japanese aliases', () => {
    const vip: Vip = {
      id: 'kishida',
      name: '岸田文雄',
      aliases: ['岸']
    };

    const article: ArticleLike = {
      title: '市場は岸高を警戒'
    };

    const result = matchVip([vip], article);

    expect(result.vipIds).toEqual([]);
    expect(result.terms).toEqual([]);
  });

  it('respects inactive VIP flags', () => {
    const inactive: Vip = { ...powell, id: 'inactive', isActive: false };
    const article: ArticleLike = { title: 'Jerome Powell speaks' };

    const result = matchVip([inactive], article);

    expect(result.vipIds).toEqual([]);
    expect(result.terms).toEqual([]);
  });

  it('returns empty result when article text is missing', () => {
    const result = matchVip([powell], {});
    expect(result.vipIds).toEqual([]);
    expect(result.terms).toEqual([]);
    expect(result.debug).toBeUndefined();
  });
});
