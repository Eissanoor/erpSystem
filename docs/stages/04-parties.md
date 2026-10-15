# Stage 4 — Parties

People and companies the business trades with. Balances are not stored on these models. Receivable and payable balances come from the ledger in later stages.

## Depends on

Stages 2 and 3. Currency must exist. `accountId` stays optional in this stage. Stage 5 requires it before a customer or supplier can be used on a posted sale or purchase.

## Models

`Customer`, `Supplier`, `Transporter`, `Employee`, `Owner`, `Partnership`, `Saraf`. Fields match the database document section "Customer, Supplier & People Models".

Also return to stage 2: `Branch.managerId`, `Warehouse.managerId`, and `Shop.managerId` may now reference an active Employee.

`Employee.userId` may reference a User. One user per employee (sparse unique).

`Partnership.partners` items: `{ ownerId, sharePercent }`. Shares in one partnership must sum to 100.

`Owner.ownershipPercentage` is informational. Partnership shares are the controlled numbers.

## Endpoints

| Resource | Base path | Permission module |
| --- | --- | --- |
| Customer | `/api/v1/customers` | `customer` |
| Supplier | `/api/v1/suppliers` | `supplier` |
| Transporter | `/api/v1/transporters` | `transporter` |
| Employee | `/api/v1/employees` | `employee` |
| Owner | `/api/v1/owners` | `owner` |
| Partnership | `/api/v1/partnerships` | `partnership` |
| Saraf | `/api/v1/sarafs` | `saraf` |

Standard list, create, get, patch, patch status.

List filters:

- Customer and Supplier: `search` on `code`, `name`, `phone`, plus `status`
- Employee: `search`, `branchId`, `status`
- Others: `search` on `code`/`name`, `status`

Employee list uses `scopeToBranches`.

## Validation

- `code` required and unique per collection.
- `creditLimit` on Customer is zero or positive Decimal128.
- `currencyId`, when sent, must be an active currency.
- Phone stored trimmed. Email lowercased when present.
- Do not accept a balance field from the client. Ignore it if sent (`pick` allow-list).

## Cache

Cache active customer and supplier dropdowns only when `search` is empty and `limit` is the default: prefixes `party:customers:active`, `party:suppliers:active`. Delete the prefix on write. Other party lists are not cached.

## Indexes

- Unique `code` on Customer, Supplier, Transporter, Saraf, Employee (`employeeCode`).
- `{ name: 1 }`, `{ phone: 1 }` on Customer and Supplier.
- Employee `{ branchId: 1, status: 1 }`.

## Done when

- Customer create does not accept `balance`.
- Partnership shares that do not total 100 are rejected.
- Employee branch must be an active branch inside the caller's scope.
- Linking `userId` twice is rejected by the sparse unique index.
- Stage 2 location update accepts a real `managerId`.
