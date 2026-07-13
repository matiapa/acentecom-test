import type { Config } from "../config.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class ShopifyClient {
  private endpoint: string;
  constructor(private config: Config, private fetchFn: typeof fetch = fetch) {
    this.endpoint = `https://${config.shopifyStoreDomain}/admin/api/${config.shopifyApiVersion}/graphql.json`;
  }

  async graphql<T>(query: string, variables: object = {}): Promise<T> {
    const maxAttempts = 6;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const res = await this.fetchFn(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": this.config.shopifyAdminToken,
        },
        body: JSON.stringify({ query, variables }),
      });
      if (res.status === 429 || res.status >= 500) {
        await sleep(this.backoff(attempt, res));
        continue;
      }
      const body: any = await res.json();
      const throttled = body.errors?.some((e: any) => e?.extensions?.code === "THROTTLED");
      if (throttled) {
        await sleep(this.backoff(attempt));
        continue;
      }
      if (body.errors) {
        throw new Error(`Shopify GraphQL error: ${JSON.stringify(body.errors)}`);
      }
      return body.data as T;
    }
    throw new Error(`Shopify GraphQL failed after ${maxAttempts} attempts (throttled/5xx).`);
  }

  private backoff(attempt: number, res?: Response): number {
    const retryAfter = res?.headers?.get?.("Retry-After");
    if (retryAfter) return Number.parseFloat(retryAfter) * 1000;
    return Math.min(1000 * 2 ** (attempt - 1), 8000);
  }

  async *paginate<N>(query: string, connectionKey: string): AsyncGenerator<N> {
    let cursor: string | null = null;
    do {
      const data: any = await this.graphql(query, { cursor });
      const conn = data[connectionKey];
      for (const node of conn.nodes as N[]) yield node;
      cursor = conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null;
    } while (cursor);
  }
}
