import "dotenv/config";
import { runSyncIfStale } from "../sync.js";

const force = process.argv.includes("--force");
try {
  const result = await runSyncIfStale({ force });
  if (result.skipped) console.log("Data is fresh — sync skipped (use --force to override).");
  else console.log(`Sync complete: ${JSON.stringify(result.counts)}`);
} catch (err) {
  console.error("Sync failed — check SHOPIFY_ADMIN_TOKEN / SUPABASE_DB_URL in .env.");
  console.error("Detail:", (err as Error).message);
  process.exitCode = 1;
}
