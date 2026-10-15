# Stage 9 — Payments, receipts, and vouchers

Money in and out, plus manual journals. Sale and purchase already post their own ledger lines. This stage posts the later settlement (customer pays an invoice, you pay a supplier) and any manual journal.

## Depends on

Stages 5, 7, and 8.

## Models

`Payment`, `Receipt`, `PaymentVoucher`, `ReceiptVoucher`, `JournalVoucher`, and `Capital`. `LedgerEntry` already exists.

Voucher `entries` are the lines passed to `AccountingService`. The service still writes `LedgerEntry`. The voucher stores the same lines so the document can be reprinted. Totals on the voucher are server-calculated.

## Posting rules

Customer receipt (`partyType: customer`):

- Cashbook or Bank DR, Customer receivable CR.
- If `referenceType` is `sale`, `receivedAmount` on that sale increases and `balanceAmount` decreases, inside the same transaction. Do not let the applied amount exceed the sale balance.

Supplier payment (`partyType: supplier`):

- Supplier payable DR, Cashbook or Bank CR.
- If `referenceType` is `purchase`, reduce that purchase balance the same way.

Journal voucher:

- Lines come from the client, then `AccountingService.post` checks the balance.
- Status path: `draft` -> `approved` -> `posted`. Posting requires `journal.approve` then `journal.post` as two calls so one user is not forced to be both.

Capital (`transactionType`: `contribution`, `withdrawal`, `adjustment`):

- Contribution: Cash/Bank DR, Owner capital CR.
- Withdrawal: Owner capital DR, Cash/Bank CR.
- Posts immediately through the accounting service. Status `posted` or `cancelled`. Cancel posts the reversal; it does not delete ledger rows.

Every posted payment and receipt creates its voucher in the same transaction. A voucher cannot be saved unbalanced because `AccountingService.post` rejects it first.

## Endpoints

| Method | Path | Action |
| --- | --- | --- |
| GET/POST | `/api/v1/payments` | `payment.read` / `create` |
| POST | `/api/v1/payments/:id/post` | `payment.post` |
| POST | `/api/v1/payments/:id/cancel` | `payment.post` (reversal) |
| GET/POST | `/api/v1/receipts` | `receipt.read` / `create` |
| POST | `/api/v1/receipts/:id/post` | `receipt.post` |
| POST | `/api/v1/receipts/:id/cancel` | `receipt.post` |
| GET/POST | `/api/v1/journals` | `journal.read` / `create` |
| POST | `/api/v1/journals/:id/approve` | `journal.approve` |
| POST | `/api/v1/journals/:id/post` | `journal.post` |
| GET | `/api/v1/payment-vouchers/:id` | `payment.read` |
| GET | `/api/v1/receipt-vouchers/:id` | `receipt.read` |
| GET/POST | `/api/v1/capitals` | `capital.read` / `capital.post` |

List filters: `branchId`, `partyType`, `status`, `from`, `to`.

Number prefixes: `PAY`, `RCT`, `PV`, `RV`, `JV`, `CAP`.

## Validation

- `paymentMethod` is `cash` or `bank`. Cash requires `cashbookId`. Bank requires `bankId`. Not both.
- `amount` positive decimal.
- `partyType` for payment: `supplier`, `expense`, `employee`, `transporter`, `other`. Expense party is accepted as a type now and used fully in stage 10.
- `partyType` for receipt: `customer`, `other`.
- Journal lines use account ids that are active.

## Cache

None.

## Indexes

- Unique numbers on each document.
- `{ branchId: 1, date: -1 }` on Payment, Receipt, Journal, Capital.
- `{ partyType: 1, partyId: 1, date: -1 }` on Payment and Receipt.
- `{ referenceType: 1, referenceId: 1 }` on Payment and Receipt.

## Done when

- A receipt against a credit sale reduces the sale balance and the customer ledger by the same amount.
- Over-application above the sale balance is rejected.
- An unbalanced journal cannot be posted.
- Cancelling a payment writes a reversing voucher and does not delete the original ledger rows.
- Capital contribution increases cash and the owner capital account.
