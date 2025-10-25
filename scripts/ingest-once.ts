#!/usr/bin/env tsx
import 'dotenv/config';

import { prisma } from '@/lib/db';
import { runIngest } from '@/lib/ingest';

async function main() {
  console.log('[Ingest] Starting full VIP ingest job...');

  const activeVips = await prisma.vip.findMany({ where: { isActive: true } });
  console.log(`[Ingest] Found ${activeVips.length} active VIPs`);

  const result = await runIngest({
    vipIds: activeVips.map((vip) => vip.id),
    recentHours: 120,
    followHtmlCanonical: true
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
