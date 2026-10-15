# Stage 5 — Accounting masters and posting core

Chart of accounts and the service that later modules use to post. Purchase and sales are not built here. Ledger rows are created only by `AccountingService`.

## Depends on

Stages 2 and 4. Parties gain a required check: a customer or supplier used in a later posted document must have `accountId`. The field stays optional on the master so you can save a draft party.

## Models

From the database document section "Accounting Models":

`Account`, `Bank`, `Cashbook`, `Asset`, `Liability`, `Income`, `PropertyAccount`, `ExpenseCategory`.

Also create `LedgerEntry` now (fields in the Payment, Receipt & Voucher section). No Payment, Receipt, or Voucher models yet.

`Capital` is a transaction, not a master. Build it in stage 9.

`Expense` (the transaction) is stage 10. `ExpenseCategory` is this stage.

Account rules:

- `accountType`: `asset`, `liability`, `equity`, `income`, `expense`.
- `code` unique.
- `parentId` optional, same cycle check as product categories.
- `openingBalance` is Decimal128. `openingBalanceType` is `debit` or `credit`.
- Opening balance is posted once, through `AccountingService.postOpening`, into `LedgerEntry`. Do not add the opening amount again on every read.

Bank and Cashbook each point at one `accountId` of type `asset`. An account cannot be linked to two banks or two cashbooks.

ExpenseCategory supports `parentId` and one `accountId` of type `expense`. Seed the top categories from the blueprint, as data:

- Procurement, Sales & Distribution, Warehouse, Operational, Miscellaneous, Logistics, Financial

## AccountingService

One module: `src/modules/accounting/accounting.service.js`.

`post({ branchId, date, voucherType, voucherId, currencyId, exchangeRate, lines, session })`

Each line: `{ accountId, debit, credit, description }`.

Rules inside the service:

- At least two lines.
- A line has either debit or credit, not both, and not both zero.
- Sum of debits equals sum of credits in base currency after `exchangeRate`.
- All writes use the caller's `session` so the caller's transaction can roll back.
- Returns the created ledger ids.

Do not expose a public route that inserts `LedgerEntry` directly.

Normal balance direction, for reports later:

| Type | Debit | Credit |
| --- | --- | --- |
| Asset, Expense | Increase | Decrease |
| Liability, Income, Equity | Decrease | Increase |

## Endpoints

Standard list, create, get, patch, patch status for:

`/api/v1/accounts`, `/banks`, `/cashbooks`, `/assets`, `/liabilities`, `/incomes`, `/property-accounts`, `/expense-categories`.

Extra:

| Method | Path | Action |
| --- | --- | --- |
| GET | `/api/v1/accounts/tree` | `account.read` |
| POST | `/api/v1/accounts/:id/opening-balance` | `account.post` |

`POST opening-balance` is allowed once per account. A second call returns 409.

Account list filters: `accountType`, `search` on `code` and `name`, `status`, `parentId`.

## Validation

- Account `code` required.
- Bank requires `bankName`, `accountTitle`, `accountNumber`, `currencyId`, `accountId`.
- Cashbook requires `branchId`, `name`, `currencyId`, `accountId`.
- Status values follow the master enum, except Asset: `active`, `disposed`, `inactive`.

## Cache

`acct:accounts:tree` and `acct:expense-categories`. Delete on write. Do not cache ledger entries.

## Indexes

- Account unique `code`, index `{ accountType: 1, status: 1 }`, index `parentId`.
- LedgerEntry: `{ accountId: 1, date: 1 }`, `{ voucherType: 1, voucherId: 1 }`, `{ branchId: 1, date: 1 }`.

## Done when

- An unbalanced `post()` throws and writes nothing.
- Opening balance creates two lines that balance (account and an opening-balance equity account you seed).
- A second opening-balance call is rejected.
- Bank cannot attach an income account.
- Account tree is cached and drops after a new account is created.
- No route inserts into `ledgerentries` except the service.
