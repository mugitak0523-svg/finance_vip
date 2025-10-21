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
