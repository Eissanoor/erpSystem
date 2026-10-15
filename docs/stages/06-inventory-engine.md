# Stage 6 — Inventory engine

All quantity changes go through `InventoryService`. Purchase and sales do not exist yet. You prove the engine with transfer, adjustment, and damage.

## Depends on

Stages 2, 3, and 5. Damage can post an accounting entry, so `AccountingService.post` must exist.

## Models

`InventoryItem`, `StockBalance`, `StockMovement`, `WarehouseTransfer`, `StockAdjustment`, `ProductDamage`. Fields match the database document.

`StockBalance` unique key: `{ warehouseId, productId, inventoryItemId }`. `inventoryItemId` is null for products that do not track batch or serial. Use a partial index so the null case stays unique.

`StockMovement.movementType`: `purchase`, `sale`, `transfer_in`, `transfer_out`, `purchase_return`, `sales_return`, `damage`, `adjustment`.

Purchase and sale types are reserved. This stage writes `transfer_in`, `transfer_out`, `damage`, `adjustment` only.

## InventoryService

`src/modules/inventory/inventory.service.js`

`apply({ branchId, warehouseId, productId, inventoryItemId, quantityIn, quantityOut, unitCost, movementType, referenceType, referenceId, movementDate, createdBy, session })`

Rules:

- Exactly one of `quantityIn` or `quantityOut` is positive.
- Product and warehouse are active. Warehouse belongs to `branchId`.
- If the product has `trackBatch` or `trackExpiry`, `inventoryItemId` is required.
- Quantity-out cannot drive `StockBalance.quantity` below zero. Reserved quantity is not available to ship.
- Update `StockBalance` and insert `StockMovement` in the same session.
- `movementNumber` comes from `documentNumber.next("MOV")`.

Callers never update `StockBalance` themselves.

## Endpoints

| Method | Path | Action | Effect |
| --- | --- | --- | --- |
| GET | `/api/v1/stock-balances` | `stock.read` | Filter `warehouseId`, `productId`, `branchId`. No cache |
| GET | `/api/v1/stock-movements` | `stock.read` | Filter `warehouseId`, `productId`, `movementType`, `from`, `to`. Paginated |
| GET | `/api/v1/inventory-items` | `stock.read` | Filter warehouse, product, batch |
| POST | `/api/v1/transfers` | `transfer.create` | Draft |
| POST | `/api/v1/transfers/:id/dispatch` | `transfer.approve` | Stock out at source, status `in_transit` |
| POST | `/api/v1/transfers/:id/receive` | `transfer.approve` | Stock in at destination, status `received` |
| POST | `/api/v1/transfers/:id/cancel` | `transfer.update` | Only from `draft` |
| POST | `/api/v1/adjustments` | `adjustment.create` | Draft with system qty, actual qty, difference |
| POST | `/api/v1/adjustments/:id/approve` | `adjustment.approve` | Writes movements for the difference |
| POST | `/api/v1/damages` | `damage.create` | Draft |
| POST | `/api/v1/damages/:id/approve` | `damage.approve` | Stock out. If `accountingPosted`, debit a damage expense account and credit inventory |

List routes for transfers, adjustments, and damages follow the standard pattern plus `status` and `warehouseId`.

Read routes for balances and movements have no create/update from the client.

## Validation

- Transfer source and destination warehouses differ and belong to branches the user can access.
- Transfer items are non-empty. Quantity is a positive decimal.
- Adjustment difference is `actual - system`, computed on the server from `StockBalance`, not trusted from the client.
- Damage `damageType`: `broken`, `expired`, `leaked`, `defective`, `lost`, `other`.
- Approve routes accept no quantity fields. They load the saved document.

## Cache

Do not cache stock balances or movements.

You may cache nothing in this stage. A transfer of stock must be visible to the next read immediately.

## Indexes

- StockBalance unique `{ warehouseId, productId, inventoryItemId }`.
- StockMovement `{ productId: 1, movementDate: 1, warehouseId: 1 }`.
- StockMovement `{ referenceType: 1, referenceId: 1 }`.
- Transfer, adjustment, damage: unique document numbers, index `{ status: 1, date: 1 }`.

## Done when

- Dispatch then receive moves quantity from warehouse A to B and writes two movements.
- Receive without dispatch is rejected.
- Adjustment approval uses the server quantity, and a concurrent sale-style out (a direct `apply` out) cannot make stock negative.
- Failed damage approval rolls back both the movement and the ledger lines.
- Cancelling a received transfer is rejected.
- Two approvals of the same document do not double the movement.
