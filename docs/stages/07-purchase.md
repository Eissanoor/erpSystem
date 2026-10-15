# Stage 7 — Purchase

A posted purchase increases stock and creates a balanced ledger entry. Supplier balance is the supplier account in the ledger, not a field on Supplier.

## Depends on

Stages 4, 5, and 6.

## Models

`Purchase`, `PurchaseItem`, `PurchaseReturn`. Fields match the database document.

`PurchaseItem` is its own collection with `purchaseId`.

Purchase `status`: `draft`, `approved`, `posted`, `cancelled`.

Server-calculated, never trusted from the client: `subtotal`, `tax`, `total`, `balanceAmount`. Client sends items, header discount, and `paidAmount`.

`balanceAmount = total - paidAmount`.

## Posting rules

On `POST /purchases/:id/post`, one transaction:

1. Purchase is `approved`. Supplier, warehouse, currency, and products are active.
2. Each line calls `InventoryService.apply` with `movementType: purchase`, `quantityIn` set, `referenceType: purchase`.
3. `AccountingService.post` with `voucherType: purchase`:
   - Cash purchase (`paidAmount == total`): Inventory DR, Cashbook or Bank CR.
   - Credit purchase (`paidAmount == 0`): Inventory DR, Supplier payable CR.
   - Partial: Inventory DR, Cash/Bank CR for `paidAmount`, Supplier payable CR for `balanceAmount`.
4. Status becomes `posted`.

Inventory account id comes from a seeded asset account (document the code, for example `1200`). Cash and bank come from the cashbook or bank on the payload when `paidAmount > 0`. Supplier must have `accountId`.

Cancel is allowed only from `draft` or `approved`. A posted purchase is reversed by `PurchaseReturn`, not by edit.

## Purchase return

`POST /purchase-returns` creates a draft linked to a posted purchase (or a supplier when `purchaseId` is null).

`POST /purchase-returns/:id/post`:

- Stock out via `movementType: purchase_return`.
- Accounting reverses the matching portion: Supplier payable DR (or cash DR if refunded), Inventory CR.
- Returned quantity cannot exceed the remaining purchased quantity for that product on that purchase.

## Endpoints

| Method | Path | Action |
| --- | --- | --- |
| GET/POST | `/api/v1/purchases` | `purchase.read` / `purchase.create` |
| GET/PATCH | `/api/v1/purchases/:id` | read / update (draft only) |
| POST | `/api/v1/purchases/:id/approve` | `purchase.approve` |
| POST | `/api/v1/purchases/:id/post` | `purchase.post` |
| POST | `/api/v1/purchases/:id/cancel` | `purchase.update` |
| GET/POST | `/api/v1/purchase-returns` | `purchase_return.read` / `create` |
| POST | `/api/v1/purchase-returns/:id/post` | `purchase_return.post` |

List filters: `branchId`, `supplierId`, `status`, `from`, `to`, `search` on `purchaseNumber`. Use `scopeToBranches`. List payload omits line arrays; `GET :id` returns lines.

`purchaseNumber` from `documentNumber.next("PUR")`. Return number prefix `PRT`.

## Validation

- At least one item.
- `quantity` and `unitPrice` positive decimals.
- `warehouseId` belongs to `branchId`.
- `paidAmount` between 0 and `total`.
- Patch on a posted purchase returns 409.

## Cache

None. Purchases are transactional.

## Indexes

- Unique `purchaseNumber`, `{ supplierId: 1, date: -1 }`, `{ branchId: 1, date: -1 }`, `{ status: 1 }`.
- PurchaseItem `{ purchaseId: 1 }`, `{ productId: 1 }`.

## Done when

- A credit purchase increases stock and creates a payable. Debits equal credits.
- Posting twice does not add stock twice.
- A return reduces stock and reduces the payable.
- A return above remaining quantity is rejected and rolls back.
- Draft patch works. Posted patch returns 409.
- Supplier with no `accountId` cannot be posted.
