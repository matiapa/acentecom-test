export interface Config {
  shopifyStoreDomain: string; shopifyAdminToken: string; shopifyApiVersion: string;
  supabaseDbUrl: string; supabaseProjectRef: string;
  syncTtlSeconds: number; reportTimezone: string;
}

const REQUIRED = [
  "SHOPIFY_STORE_DOMAIN", "SHOPIFY_ADMIN_TOKEN", "SHOPIFY_API_VERSION",
  "SUPABASE_DB_URL", "SUPABASE_PROJECT_REF",
] as const;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const missing = REQUIRED.filter((k) => !env[k] || env[k]!.trim() === "");
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}. ` +
        `Copy .env.example to .env and fill them in.`,
    );
  }
  const ttlRaw = env.SYNC_TTL_SECONDS ?? "300";
  const ttl = Number.parseInt(ttlRaw, 10);
  if (Number.isNaN(ttl) || ttl < 0) {
    throw new Error(`SYNC_TTL_SECONDS must be a non-negative integer, got "${ttlRaw}".`);
  }
  return {
    shopifyStoreDomain: env.SHOPIFY_STORE_DOMAIN!,
    shopifyAdminToken: env.SHOPIFY_ADMIN_TOKEN!,
    shopifyApiVersion: env.SHOPIFY_API_VERSION!,
    supabaseDbUrl: env.SUPABASE_DB_URL!,
    supabaseProjectRef: env.SUPABASE_PROJECT_REF!,
    syncTtlSeconds: ttl,
    reportTimezone: env.REPORT_TIMEZONE?.trim() || "UTC",
  };
}
