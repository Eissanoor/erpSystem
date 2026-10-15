# Stage 2 — Organization

Locations the rest of the ERP hangs from. There is no Company resource.

## Depends on

Stage 1. After this stage, user create/update must reject `branchIds` and `warehouseIds` that do not exist.

## Models

`Branch`, `Warehouse`, `Shop`, `Currency`. Fields are the tables in the database document, section "Branch & Location Models".

Rules:

- `code` unique on Branch, Warehouse, Shop, Currency.
- Warehouse and Shop require `branchId`.
- Only one Currency may have `isBaseCurrency: true`. Setting a new base currency clears the previous one inside a transaction.
- `managerId` is optional until Employee exists (stage 4). Until then accept null only. In stage 4, validate the employee if the field is sent.

## Endpoints

Same five-route pattern for each resource:

| Method | Path | Action |
| --- | --- | --- |
| GET | `/api/v1/branches` | `read` |
| POST | `/api/v1/branches` | `create` |
| GET | `/api/v1/branches/:id` | `read` |
| PATCH | `/api/v1/branches/:id` | `update` |
| PATCH | `/api/v1/branches/:id/status` | `update` |

Repeat for `/warehouses`, `/shops`, `/currencies`.

List filters:

- Branch: `search` on `name` and `code`, `status`
- Warehouse and Shop: above, plus `branchId`
- Currency: `search` on `name` and `code`, `status`

`GET` list and `GET :id` call `scopeToBranches`. A warehouse query also restricts `branchId` to the user's branches.

## Validation

- `name` and `code` required, `code` uppercase trim.
- `status` is `active` or `inactive`.
- `decimalPlaces` integer 0–6.
- Currency `code` length 3 (PKR, USD).

## Cache

Prefixes: `org:branches`, `org:warehouses`, `org:shops`, `org:currencies`.

List endpoints for active records use `getOrSet` when the query is the default active list with no search (the dropdown case). Searches and paged admin screens hit MongoDB. Any write deletes that prefix.

## Indexes

- Unique `code` on each model.
- `{ branchId: 1, status: 1 }` on Warehouse and Shop.

## Done when

- Creating a warehouse with an unknown `branchId` returns 400.
- A user limited to branch A does not see branch B or its warehouses.
- Two currencies cannot both be the base currency.
- Inactivating a branch does not delete its warehouses.
- Dropdown-style active branch list is served from cache on the second call and refreshes after an update.
- Scalar lists all four resources.
