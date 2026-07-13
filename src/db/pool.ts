import pg from "pg";
import type { Config } from "../config.js";

export function getPool(config: Config): pg.Pool {
  return new pg.Pool({ connectionString: config.supabaseDbUrl, max: 4 });
}
