import "dotenv/config";
import { loadConfig } from "../config.js";
import { getPool } from "../db/pool.js";
import { runSyncIfStale } from "../sync.js";
import { getDailyMetrics, getWeeklyMetrics, getSyncState, getStoreCurrency } from "../db/metrics.js";
import { formatReport } from "../report.js";

const config = loadConfig();
const pool = getPool(config);
try {
  let syncFailed = false;
  try {
    await runSyncIfStale({ pool, config });
  } catch (err) {
    syncFailed = true;
    console.error("Warning: refresh failed, reporting on last-good data:", (err as Error).message);
  }
  const [daily, weekly, state, currency] = await Promise.all([
    getDailyMetrics(pool), getWeeklyMetrics(pool), getSyncState(pool), getStoreCurrency(pool),
  ]);
  console.log(formatReport({ daily, weekly, currency, syncedAt: state.last_synced_at, syncFailed }));
} catch (err) {
  console.error("Report failed:", (err as Error).message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
