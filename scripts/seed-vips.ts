#!/usr/bin/env tsx
import 'dotenv/config';

import { prisma } from '@/lib/db';

type SeedVip = {
  name: string;
  aliases: string[];
  gnewsQueryExtra?: string;
  org?: string;
  title?: string;
};

const VIPS: SeedVip[] = [
  {
    name: 'Christine Lagarde',
    aliases: ['Christine Lagarde', 'ラガルド', 'クリスティーヌ・ラガルド'],
    title: 'President',
    org: 'European Central Bank',
    gnewsQueryExtra: 'ECB'
  },
  {
    name: 'Jerome Powell',
    aliases: ['Jerome Powell', 'ジェローム・パウエル', 'パウエル議長'],
    title: 'Chair',
    org: 'Federal Reserve',
    gnewsQueryExtra: 'Federal Reserve'
  },
  {
    name: '植田和男',
    aliases: ['植田和男', 'Kazuo Ueda', '上田和男', '植田総裁'],
    title: 'Governor',
    org: '日本銀行',
    gnewsQueryExtra: '日銀 OR BOJ'
  },
  {
    name: 'Janet Yellen',
    aliases: ['Janet Yellen', 'ジャネット・イエレン', 'イエレン長官'],
    title: 'Secretary',
    org: 'U.S. Treasury',
    gnewsQueryExtra: 'Treasury Secretary'
  },
  {
    name: 'Andrew Bailey',
    aliases: ['Andrew Bailey', 'アンドリュー・ベイリー', 'ベイリー総裁'],
    title: 'Governor',
    org: 'Bank of England',
    gnewsQueryExtra: 'Bank of England OR BOE'
  },
  {
    name: 'Kristalina Georgieva',
    aliases: ['Kristalina Georgieva', 'クリスタリナ・ゲオルギエヴァ', 'ゲオルギエバ'],
    title: 'Managing Director',
    org: 'International Monetary Fund',
    gnewsQueryExtra: 'IMF'
  },
  {
    name: 'Philippe Hildebrand',
    aliases: ['Philippe Hildebrand', 'フィリップ・ヒルデブランド'],
    title: 'Vice Chairman',
    org: 'BlackRock',
    gnewsQueryExtra: 'BlackRock vice chairman'
  },
  {
    name: 'Mario Draghi',
    aliases: ['Mario Draghi', 'マリオ・ドラギ', 'ドラギ前総裁'],
    title: 'Former President',
    org: 'European Central Bank',
    gnewsQueryExtra: 'Mario Draghi'
  },
  {
    name: 'Lael Brainard',
    aliases: ['Lael Brainard', 'レール・ブレイナード', 'ブレイナード'],
    title: 'Director',
    org: 'National Economic Council',
    gnewsQueryExtra: 'Lael Brainard'
  },
  {
    name: 'Pierre-Olivier Gourinchas',
    aliases: ['Pierre-Olivier Gourinchas', 'ピエール・オリヴィエ・グランシャ'],
    title: 'Chief Economist',
    org: 'International Monetary Fund',
    gnewsQueryExtra: 'IMF chief economist'
  }
];

async function main() {
  let created = 0;
  let updated = 0;

  for (const vip of VIPS) {
    const existing = await prisma.vip.findFirst({ where: { name: vip.name } });
    if (existing) {
      await prisma.vip.update({
        where: { id: existing.id },
        data: {
          aliases: vip.aliases,
          gnewsQueryExtra: vip.gnewsQueryExtra,
          org: vip.org,
          title: vip.title,
          isActive: true
        }
      });
      updated += 1;
    } else {
      await prisma.vip.create({
        data: {
          name: vip.name,
          aliases: vip.aliases,
          gnewsQueryExtra: vip.gnewsQueryExtra,
          org: vip.org,
          title: vip.title,
          isActive: true
        }
      });
      created += 1;
    }
  }

  console.log(`Seeded VIPs. created=${created}, updated=${updated}`);
}

main()
  .catch((error) => {
    console.error('Failed to seed VIPs:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
