import "dotenv/config";
import { loadConfig } from "../config.js";
import { getPool } from "../db/pool.js";
import { runMigrations } from "../db/migrate.js";

const pool = getPool(loadConfig());
try {
  const applied = await runMigrations(pool);
  console.log(`Applied migrations: ${applied.join(", ")}`);
} catch (err) {
  console.error("Migration failed:", (err as Error).message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
