# Stage 10 — Expense and logistics

Expenses post to the ledger. Shipments track delivery of a sale. They do not change stock; stock already moved when the sale was posted.

## Depends on

Stages 4, 5, and 9. Expense payment uses the payment module when `paymentMethod` is cash or bank.

## Models

`Expense` and `ExpenseCategory` (category already exists from stage 5).

`Shipment`, `TransporterVehicle`. Transporter already exists from stage 4.

Expense fields match the database document. `expenseNumber` prefix `EXP`.

Shipment status: `pending`, `prepared`, `dispatched`, `in_transit`, `delivered`, `cancelled`.

Vehicle status: `available`, `in_transit`, `inactive`.

## Expense posting

`POST /expenses/:id/post` in one transaction:

- Category is active and has `accountId`.
- Cash or bank: Expense account DR, Cashbook or Bank CR. Also create a Payment with `partyType: expense` so the payment list stays complete. Do that through the payment service, same session.
- Credit (`paymentMethod: credit`): Expense DR, and CR the category's payable or a general expense payable account. `paidFromAccountId` is null.
- Status becomes `posted`.

Cancel posts the reversal.

## Shipment

Create from a posted sale or standalone (`saleId` null).

Status changes are separate posts so each step can be authorized:

| Method | Path | From -> to |
| --- | --- | --- |
| POST | `/shipments/:id/prepare` | `pending` -> `prepared` |
| POST | `/shipments/:id/dispatch` | `prepared` -> `dispatched`, vehicle becomes `in_transit` |
| POST | `/shipments/:id/deliver` | `dispatched` or `in_transit` -> `delivered`, set `deliveryDate`, vehicle returns to `available` |
| POST | `/shipments/:id/cancel` | not from `delivered` |

Dispatch requires `transporterId` and `vehicleId`. The vehicle must be `available` and belong to that transporter.

No inventory call. No ledger call, unless you later add a freight expense. Do not add freight in this stage.

## Endpoints

Standard list, create, get, patch (draft expense only), patch status is not used on expenses; use post and cancel.

| Resource | Base |
| --- | --- |
| Expense | `/api/v1/expenses` |
| Shipment | `/api/v1/shipments` |
| Vehicle | `/api/v1/vehicles` |

Expense filters: `branchId`, `categoryId`, `status`, `from`, `to`.

Shipment filters: `branchId`, `status`, `saleId`, `transporterId`, `from`, `to`.

Vehicle filters: `transporterId`, `status`.

Number prefix for shipment: `SHP`.

## Validation

- Expense `amount` positive. `categoryId` active.
- Vehicle `vehicleNumber` unique per transporter.
- Shipment `originWarehouseId` is an active warehouse in the user's branches.
- A delivered shipment cannot be cancelled.

## Cache

Cache active expense categories only if stage 5 did not already do that. No cache on expenses or shipments.

## Indexes

- Expense unique `expenseNumber`, `{ branchId: 1, date: -1 }`, `{ categoryId: 1, date: -1 }`.
- Shipment unique `shipmentNumber`, `{ saleId: 1 }`, `{ status: 1, date: -1 }`.
- Vehicle `{ transporterId: 1, vehicleNumber: 1 }` unique.

## Done when

- A cash expense creates a ledger pair and a payment row. Totals match.
- Cancelling that expense reverses the ledger and does not leave the payment looking posted without a reversal.
- Dispatch sets the vehicle in transit. A second shipment cannot take that vehicle.
- Deliver frees the vehicle.
- Creating a shipment for a draft sale is rejected.
