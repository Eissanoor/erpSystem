# Stage 11 — Reports

Read-only endpoints. Every figure comes from `StockMovement`, `StockBalance`, or `LedgerEntry`. Do not keep a second balance column on Customer or Supplier.

## Depends on

Stages 6 through 10. Reports can ship one group at a time in the order below, but they live in one module: `src/modules/reports`.

## Shared query

Every report accepts `from`, `to`, and `branchId` when the underlying model has a branch. `scopeToBranches` applies. `page` and `limit` apply to detail reports. Summary reports return one object and do not paginate.

Dates are inclusive, compared on the stored date field in UTC. Document the timezone assumption in Scalar: the client sends `YYYY-MM-DD`, the server treats the range as that civil date in `Asia/Karachi` unless `TZ` is set.

Responses stay on the standard shape. Heavy reports rely on compression from stage 0 and on indexes from earlier stages. Add a compound index in this stage only when a report filter is not already indexed. Write the index next to the report that needed it.

Cache a summary only when the query is a closed month in the past (`to` before today) under key `report:{name}:{hash}`. TTL 1 hour. Do not cache any range that includes today. Delete is unnecessary if TTL is short; do not invent invalidation across every post.

## Endpoints

All `GET`, permission `report.read`.

| Path | Source | Returns |
| --- | --- | --- |
| `/api/v1/reports/sales/summary` | Sale `posted` | Count, total, discount, tax, by branch |
| `/api/v1/reports/sales/by-product` | SaleItem + posted Sale | Quantity and amount per product |
| `/api/v1/reports/sales/by-customer` | Sale | Amount per customer |
| `/api/v1/reports/purchases/summary` | Purchase `posted` | Count and total |
| `/api/v1/reports/purchases/by-supplier` | Purchase | Amount per supplier |
| `/api/v1/reports/inventory/stock` | StockBalance | On hand, reserved, damaged. Filter warehouse, product. Paginated |
| `/api/v1/reports/inventory/movements` | StockMovement | The movement list with type totals in `meta` |
| `/api/v1/reports/inventory/low-stock` | StockBalance + Product | `quantity <= reorderLevel` |
| `/api/v1/reports/customers/ledger` | LedgerEntry on the customer account | Opening, lines, closing |
| `/api/v1/reports/suppliers/ledger` | LedgerEntry on the supplier account | Opening, lines, closing |
| `/api/v1/reports/cashbook` | LedgerEntry on cashbook accounts | Lines and closing per cashbook |
| `/api/v1/reports/bank` | LedgerEntry on bank accounts | Lines and closing per bank |
| `/api/v1/reports/ledger` | LedgerEntry | One account, or all accounts when `accountId` is omitted (paginated) |
| `/api/v1/reports/trial-balance` | LedgerEntry | One row per account, debit and credit columns, totals equal |
| `/api/v1/reports/profit-and-loss` | Income and expense ledger | Income, expenses, net |
| `/api/v1/reports/balance-sheet` | Asset, liability, equity ledger | Assets = liabilities + equity |
| `/api/v1/reports/expenses` | Expense `posted` | Totals by category, branch, date |
| `/api/v1/reports/shipments` | Shipment | Counts by status |

Party ledger query params: `customerId` or `supplierId`, `from`, `to`. Opening balance is the sum of ledger lines before `from`, plus the account opening if it falls before `from`.

Trial balance, profit and loss, and balance sheet must use the normal-balance rules from stage 5 so an income credit shows as income, not as a negative expense.

## Validation

- `from` <= `to`.
- `accountId`, `customerId`, `supplierId`, `warehouseId` are ObjectIds when present.
- Reject a date range above 366 days on movement and ledger detail routes. Summary routes may allow a longer range.

## Done when

- Trial balance debits equal credits for a period that contains a cash sale, a credit purchase, an expense, and a receipt.
- Balance sheet equation holds after a capital contribution.
- Customer ledger closing equals the customer's receivable account balance.
- Low stock uses `reorderLevel` from the product master.
- A report for branch B is invisible to a user scoped to branch A.
- Scalar lists every report path and its query params.
