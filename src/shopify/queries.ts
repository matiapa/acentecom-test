export const SHOP_QUERY = `query { shop { currencyCode ianaTimezone } }`;

export const PRODUCTS_QUERY = `
query Products($cursor: String) {
  products(first: 100, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id title handle vendor productType status tags totalInventory createdAt updatedAt
      priceRangeV2 { minVariantPrice { amount } maxVariantPrice { amount } }
      variants(first: 100) {
        nodes { id title sku price compareAtPrice inventoryQuantity position createdAt updatedAt }
      }
    }
  }
}`;

export const ORDERS_QUERY = `
query Orders($cursor: String) {
  orders(first: 50, after: $cursor, sortKey: CREATED_AT) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id name test createdAt processedAt updatedAt cancelledAt
      displayFinancialStatus displayFulfillmentStatus
      customer { id }
      currentSubtotalPriceSet { shopMoney { amount currencyCode } }
      totalTaxSet { shopMoney { amount currencyCode } }
      totalDiscountsSet { shopMoney { amount currencyCode } }
      totalRefundedSet { shopMoney { amount currencyCode } }
      totalPriceSet { shopMoney { amount currencyCode } }
      lineItems(first: 100) {
        nodes {
          id title variantTitle sku quantity
          product { id } variant { id }
          originalUnitPriceSet { shopMoney { amount } }
          totalDiscountSet { shopMoney { amount } }
        }
      }
    }
  }
}`;

// Note: customer PII (email, firstName, lastName) is only accessible on paid Shopify
// plans; development stores return ACCESS_DENIED for it. We therefore request only
// non-PII customer fields here, and fetchSyncData tolerates the Customer object being
// denied entirely (dev store) by skipping customers rather than failing the sync.
export const CUSTOMERS_QUERY = `
query Customers($cursor: String) {
  customers(first: 100, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id numberOfOrders state createdAt updatedAt
      amountSpent { amount currencyCode }
    }
  }
}`;
