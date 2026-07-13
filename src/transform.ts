import type { ProductRow, VariantRow, CustomerRow } from "./types.js";

export function gidToId(gid: string | null | undefined): number | null {
  if (!gid) return null;
  const tail = gid.split("/").pop();
  const n = Number.parseInt(tail ?? "", 10);
  return Number.isNaN(n) ? null : n;
}

export function money(m: { amount: string } | null | undefined): number | null {
  if (!m || m.amount == null) return null;
  const n = Number.parseFloat(m.amount);
  return Number.isNaN(n) ? null : n;
}

const lower = (s: string | null | undefined): string | null =>
  s == null ? null : String(s).toLowerCase();

export function toProductRow(node: any): ProductRow {
  return {
    shopify_id: gidToId(node.id)!,
    title: node.title,
    handle: node.handle ?? null,
    vendor: node.vendor ?? null,
    product_type: node.productType ?? null,
    status: lower(node.status) ?? "active",
    tags: Array.isArray(node.tags) ? node.tags : [],
    total_inventory: node.totalInventory ?? null,
    min_price: money(node.priceRangeV2?.minVariantPrice),
    max_price: money(node.priceRangeV2?.maxVariantPrice),
    created_at: node.createdAt,
    updated_at: node.updatedAt,
  };
}

export function toVariantRows(productNode: any): VariantRow[] {
  const productId = gidToId(productNode.id)!;
  const nodes = productNode.variants?.nodes ?? [];
  return nodes.map((v: any) => ({
    shopify_id: gidToId(v.id)!,
    product_id: productId,
    title: v.title ?? null,
    sku: v.sku ?? null,
    price: money(v.price != null ? { amount: String(v.price) } : null),
    compare_at_price: money(v.compareAtPrice != null ? { amount: String(v.compareAtPrice) } : null),
    inventory_quantity: v.inventoryQuantity ?? null,
    position: v.position ?? null,
    created_at: v.createdAt,
    updated_at: v.updatedAt,
  }));
}

export function toCustomerRow(node: any): CustomerRow {
  return {
    shopify_id: gidToId(node.id)!,
    email: node.email ?? null,
    first_name: node.firstName ?? null,
    last_name: node.lastName ?? null,
    orders_count: node.numberOfOrders != null ? Number.parseInt(String(node.numberOfOrders), 10) : null,
    total_spent: money(node.amountSpent),
    state: lower(node.state),
    created_at: node.createdAt,
    updated_at: node.updatedAt,
  };
}
