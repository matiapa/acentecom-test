export interface ProductRow {
  shopify_id: number; title: string; handle: string | null; vendor: string | null;
  product_type: string | null; status: string; tags: string[];
  total_inventory: number | null; min_price: number | null; max_price: number | null;
  created_at: string; updated_at: string;
}

export interface VariantRow {
  shopify_id: number; product_id: number; title: string | null; sku: string | null;
  price: number | null; compare_at_price: number | null; inventory_quantity: number | null;
  position: number | null; created_at: string; updated_at: string;
}

export interface CustomerRow {
  shopify_id: number; email: string | null; first_name: string | null; last_name: string | null;
  orders_count: number | null; total_spent: number | null; state: string | null;
  created_at: string; updated_at: string;
}

export interface OrderRow {
  shopify_id: number; name: string; customer_id: number | null; email: string | null;
  financial_status: string | null; fulfillment_status: string | null; currency: string;
  test: boolean; subtotal_price: number | null; total_tax: number | null;
  total_discounts: number | null; total_refunded: number | null; total_price: number | null;
  created_at: string; processed_at: string | null; updated_at: string; cancelled_at: string | null;
}

export interface LineItemRow {
  shopify_id: number; order_id: number; product_id: number | null; variant_id: number | null;
  title: string | null; variant_title: string | null; sku: string | null; quantity: number;
  price: number | null; total_discount: number | null;
}

export interface SyncData {
  products: ProductRow[]; variants: VariantRow[]; customers: CustomerRow[];
  orders: OrderRow[]; lineItems: LineItemRow[];
}

export interface SyncCounts {
  products: number; variants: number; customers: number; orders: number; lineItems: number;
}

export interface Metrics {
  new_orders: number; revenue: number; new_products: number; units_sold: number;
}

export interface SyncState {
  last_synced_at: string | null; last_status: string | null; last_error: string | null;
}
