#!/usr/bin/env tsx
import 'dotenv/config';

import { runIngest } from '@/lib/ingest';

async function main() {
  const result = await runIngest({ recentHours: 24, followHtmlCanonical: true });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
