# Stage 3 — Product masters

Products and the units they are counted in. No stock quantities in this stage.

## Depends on

Stage 2. Categories, units, and products are global for the single client (not per branch).

## Models

`ProductCategory`, `QuantityUnit`, `PackingUnit`, `Product`. Fields match the database document section "Product & Inventory Models" for those four only. Do not create `InventoryItem` or `StockBalance` yet.

Rules:

- Category `parentId` may be null. Reject a parent that would create a cycle. Reject a parent that is the category itself.
- `PackingUnit.quantityUnitId` is required. `conversionQuantity` is a positive decimal.
- Product `sku` unique. `barcode` unique when present (sparse unique index).
- Product `categoryId` and `quantityUnitId` must reference active records. `packingUnitId` is optional; if set, its `quantityUnitId` must match the product's `quantityUnitId`.
- `costPrice`, `salePrice`, `reorderLevel` are Decimal128, zero or positive.

## Endpoints

| Resource | Base path |
| --- | --- |
| ProductCategory | `/api/v1/product-categories` |
| QuantityUnit | `/api/v1/quantity-units` |
| PackingUnit | `/api/v1/packing-units` |
| Product | `/api/v1/products` |

Each gets list, create, get, patch, patch status. Permissions: `product_category`, `quantity_unit`, `packing_unit`, `product`.

Product list filters: `search` (name, sku, barcode), `categoryId`, `status`. Sort allow-list: `name`, `sku`, `createdAt`.

`GET /api/v1/product-categories/tree` returns active categories as a nested tree. This is the one extra route. Cache it.

## Validation

- `sku` and `shortCode` trimmed, uppercase.
- `trackBatch` and `trackExpiry` booleans, default false.
- Status change to `inactive` is allowed even if products still point at the record. Transactions in later stages must reject inactive products; do not block inactivation here.

## Cache

Prefixes: `prod:categories`, `prod:units`, `prod:packing`, `prod:products:active`.

Cache the category tree and the active unit lists. Do not cache product search results.

## Indexes

- Category: unique `code`, index `parentId`.
- Units: unique `shortCode`.
- Product: unique `sku`, unique sparse `barcode`, index `{ categoryId: 1, status: 1 }`, index `{ name: 1 }`.

## Done when

- A packing unit cannot point at a mismatched quantity unit.
- Category parent cycles are rejected.
- Duplicate SKU returns 409 using the standard error shape.
- Product list stays paginated and does not return `description`.
- Scalar documents the tree route and the decimal price fields as strings.
