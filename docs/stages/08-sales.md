# Stage 8 — Sales

A posted sale decreases stock and creates a balanced ledger entry. Customer balance is the customer account in the ledger.

## Depends on

Stage 7. Copy the purchase transaction pattern. Do not invent a second posting style.

## Models

`Sale`, `SaleItem`, `SalesReturn`. Fields match the database document.

`customerId` may be null for a cash sale. A credit sale (`receivedAmount < total`) requires a customer with `accountId`.

Server-calculated: `subtotal`, `tax`, `total`, `balanceAmount`.

`balanceAmount = total - receivedAmount`.

## Posting rules

On post, one transaction:

1. Sale is `approved`. Warehouse and products are active. Each product has enough available quantity (`quantity - reservedQuantity`).
2. Each line calls `InventoryService.apply` with `movementType: sale` and `quantityOut`.
3. `AccountingService.post`, `voucherType: sale`:
   - Cash sale: Cashbook or Bank DR, Sales income CR.
   - Credit sale: Customer receivable DR, Sales income CR.
   - Partial: Cash/Bank DR for `receivedAmount`, Customer receivable DR for `balanceAmount`, Sales income CR for `total`.
4. If the header discount is non-zero, post it as a debit to a seeded sales-discount account and reduce the income credit so the voucher still balances. Compute this inside the sale service and pass finished lines to `AccountingService`.

Sales income account is a seeded income account (for example code `4000`).

Optional credit check: if the customer has `creditLimit > 0`, reject the post when current receivable plus `balanceAmount` exceeds the limit. Current receivable is the ledger balance of `customer.accountId`, computed in the transaction.

## Sales return

Posted return:

- Stock in, `movementType: sales_return`.
- Reverse accounting: Sales income DR (and discount reversal if you posted one), Customer receivable CR or cash CR when cash is refunded.
- Quantity cannot exceed the remaining sold quantity on that sale.

Shipment is stage 10. A sale does not create a shipment in this stage. Leave `saleId` ready for it.

## Endpoints

| Method | Path | Action |
| --- | --- | --- |
| GET/POST | `/api/v1/sales` | `sale.read` / `sale.create` |
| GET/PATCH | `/api/v1/sales/:id` | read / update (draft only) |
| POST | `/api/v1/sales/:id/approve` | `sale.approve` |
| POST | `/api/v1/sales/:id/post` | `sale.post` |
| POST | `/api/v1/sales/:id/cancel` | `sale.update` |
| GET/POST | `/api/v1/sales-returns` | `sales_return.read` / `create` |
| POST | `/api/v1/sales-returns/:id/post` | `sales_return.post` |

List filters: `branchId`, `customerId`, `status`, `from`, `to`, `search` on `saleNumber`. Lines only on `GET :id`.

Number prefixes: `SAL`, `SRT`.

## Validation

Same numeric rules as purchase. `receivedAmount` between 0 and `total`. Insufficient stock returns 409 and posts nothing.

## Cache

None.

## Indexes

- Unique `saleNumber`, `{ customerId: 1, date: -1 }`, `{ branchId: 1, date: -1 }`, `{ warehouseId: 1, date: -1 }`.
- SaleItem `{ saleId: 1 }`, `{ productId: 1 }`.

## Done when

- Cash sale reduces stock and increases cash and income. The voucher balances.
- Credit sale above the credit limit is rejected with no stock change.
- Two concurrent posts cannot oversell the same product (the stock check and update stay inside the transaction).
- A full return restores stock and clears the receivable.
- Posted sale cannot be patched.
