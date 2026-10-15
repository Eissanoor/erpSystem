# Stage 12 — Audit and hardening

The system already posts stock and money. This stage records who changed what, and closes the gaps left on purpose in earlier stages.

## Depends on

Stages 1 through 11.

## Models

`AuditLog`. Fields match the database document. Do not store `passwordHash` in `oldData` or `newData`.

## AuditService

`record({ userId, module, action, entityType, entityId, oldData, newData, ipAddress, session })`

Call it after a successful write, inside the same transaction when the business write uses a transaction. If the business write rolls back, the audit row rolls back with it.

Cover these actions: create, update, status change, approve, post, cancel. Skip pure reads.

`oldData` and `newData` store the changed fields only (`pick` the diff), not the whole populated document.

## Endpoints

| Method | Path | Action |
| --- | --- | --- |
| GET | `/api/v1/audit-logs` | `audit.read` |
| GET | `/api/v1/audit-logs/:id` | `audit.read` |

Filters: `module`, `entityType`, `entityId`, `userId`, `from`, `to`. Paginated. No create route. No update route.

Index: `{ entityType: 1, entityId: 1, createdAt: -1 }` and `{ userId: 1, createdAt: -1 }`.

## Hardening checklist

Work through this list in the same stage:

- Posted purchase, sale, expense, payment, receipt, and journal cannot be patched. Tests assert 409.
- Inactive masters cannot be used on a new post (product, warehouse, customer, supplier, account, currency).
- `scopeToBranches` is present on every list and get that has `branchId`. Search the services for a list that omits it.
- User access changes delete `auth:user:{id}`.
- Master writes delete their cache prefix. Stock and ledger routes do not read from cache.
- Unique indexes exist for every document number and every business `code` / `sku`.
- Decimal fields reject JSON numbers that are not strings, so `0.1` cannot arrive as a float. Joi schema: decimal string.
- Request body limit stays 1mb. List `limit` cannot exceed 100.
- Helmet, cors, and compression stay in `app.js`.
- Scalar spec includes every route mounted in the app. A small script can compare `app` routes to OpenAPI paths and fail if one is missing.
- Seed script is idempotent: running it twice does not duplicate the admin, base currency, or chart of accounts.
- `.env` is gitignored. `.env.example` has every key and no secrets.

Token denylist is optional. Add it only if you need logout to kill the access token before the 15 minute expiry. Store `jti` until `exp` in the cache. `authenticate` rejects a listed `jti`.

## Done when

- Updating a branch writes an audit row with the user id and the changed fields, and a failed transaction does not leave that row behind.
- `GET /audit-logs?entityType=Sale&entityId=` returns the post action for that sale.
- The route-to-OpenAPI check passes.
- A user outside a branch cannot read that branch's sales, stock, or ledger report.
- Re-running the seed does not create a second admin.
