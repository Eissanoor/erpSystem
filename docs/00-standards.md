# Shared standards

Every module uses these rules. Stage 0 creates the code. Later stages only call it.

## Request path

```text
HTTP
  -> compression
  -> JSON body parser (limit set)
  -> request id
  -> route
  -> auth (public routes skip this)
  -> permission
  -> Joi validation (body, query, params)
  -> thin controller
  -> service (business rules)
       -> InventoryService     (only when stock changes)
       -> AccountingService    (only when money is posted)
       -> AuditService         (stage 12; hook is reserved in stage 0)
  -> standard JSON response
```

Controllers do not contain business rules. Services do not read `req` or `res`.

## One response shape

Success:

```json
{
  "success": true,
  "message": "Branch created",
  "data": {},
  "meta": { "page": 1, "limit": 20, "total": 0 }
}
```

`meta` is present only on lists.

Error:

```json
{
  "success": false,
  "message": "Warehouse not found",
  "errors": [{ "field": "warehouseId", "message": "Invalid id" }]
}
```

Use one `ApiError` class with `statusCode`. A single error middleware maps it. Unknown errors return 500 and do not leak stack traces in production.

## Fast list endpoints

List routes always:

- Require `page` and `limit`. Default `page=1`, `limit=20`, max `limit=100`.
- Accept `sort` only from an allow-list on that module.
- Accept `search` and `status` as optional filters.
- Use `.select()` so list payloads omit heavy fields (`description`, address blobs, audit snapshots).
- Use `.lean()`.
- Populate at most the fields the list screen needs (`name`, `code`). Detail routes may populate more.
- Hit a compound index that matches the filter. If a new filter is added, add the index in the same stage.

Write routes that touch more than one collection run inside a MongoDB transaction (`withTransaction` helper).

Document numbers (`purchaseNumber`, `saleNumber`, `voucherNumber`, and the rest) come from one `documentNumber` helper. Format: `PREFIX-000001`. Never let a controller invent a number.

## Validation, three layers

1. **Joi, at the route.** Types, required fields, enums, string length, ObjectId shape, decimal strings. Invalid input never reaches the service.
2. **Service.** The record exists, status is active, the warehouse belongs to the branch, stock is sufficient, debits equal credits, credit limit holds, a posted document is not edited.
3. **MongoDB.** `required: true` on fields that must exist, unique indexes on codes, SKUs, and document numbers.

Amounts and quantities arrive as strings and are stored as `Decimal128`. Reject negative money except where the model explicitly allows a reversal.

Status enums used across the system:

| Kind | Values |
| --- | --- |
| Master | `active`, `inactive` |
| Document | `draft`, `approved`, `posted`, `cancelled` |
| Approval document | `draft`, `pending`, `approved`, `rejected`, `cancelled` |
| Transfer | `draft`, `in_transit`, `received`, `cancelled` |
| Shipment | `pending`, `prepared`, `dispatched`, `in_transit`, `delivered`, `cancelled` |

## Cache

Cache read-mostly masters only.

| Cache | Do not cache |
| --- | --- |
| Active branches, warehouses, shops | Stock balances |
| Currencies, units, categories | Stock movements |
| Chart of accounts (active) | Ledger entries |
| Roles and permissions for a user | Sales, purchases, payments |
| Document-number sequences are not cached | Anything that must be correct on the next read |

Interface:

```text
cache.getOrSet(key, ttlSeconds, loader)
cache.del(key)
cache.delByPrefix(prefix)
```

Start with an in-memory store behind that interface. Swap the store for Redis later without changing modules. TTL for masters: 10 minutes. Every create, update, and status change deletes that module's prefix in the same request, after the write succeeds.

User permission cache key: `auth:user:{userId}`. Delete it when the user's roles, branches, or warehouses change.

## Compression

Use the `compression` middleware on the app, threshold 1 KB, so small error JSON is not compressed and list/report JSON is. Do not compress file downloads twice. This is response compression for faster transfer, not a reason to omit pagination.

## Scalar documentation

One OpenAPI 3 document is the API spec. Scalar UI is mounted at `GET /docs`.

- Each module adds its paths and schemas in `src/docs/paths/<module>.js`.
- Joi remains the runtime validator. The OpenAPI file documents the same fields, enums, and error shape. When a Joi schema changes, the OpenAPI path changes in the same commit.
- Protected routes declare bearer JWT security.
- `GET /openapi.json` returns the raw spec.

Do not add a second documentation tool.

## Reusable functions (stage 0 owns these)

| Helper | Responsibility |
| --- | --- |
| `asyncHandler` | Forwards async errors to the error middleware |
| `ApiError`, `ApiResponse` | Status codes and the JSON shape above |
| `validate` | Runs Joi on `body`, `query`, `params` |
| `pagination` | Parses page, limit, sort allow-list, builds `skip` |
| `listQuery` | Search regex on allowed fields, status filter, `.lean()` options |
| `withTransaction` | Session + commit/abort |
| `documentNumber.next(prefix)` | Atomic sequence per prefix |
| `money.toDecimal` / `money.add` / `money.eq` | Decimal128 math |
| `cache.*` | Get, set, delete, prefix delete |
| `assertFound`, `assertActive` | Shared existence and status checks |
| `pick` | Copies only allowed fields from the body into the update |

Module services call these. They do not reimplement pagination, numbering, or decimal math.

## Module file layout

```text
src/modules/<name>/
  <name>.model.js
  <name>.validation.js
  <name>.service.js
  <name>.controller.js
  <name>.routes.js
```

A repository file is added only when a query is reused by a second module. Until then the service owns the query.

## Auth on routes

From stage 1 onward, every route except `POST /api/v1/auth/login` and `GET /health` uses `authenticate` and `authorize("<module>", "<action>")`. Actions: `create`, `read`, `update`, `delete`, `approve`, `post`.

Branch-scoped queries add `branchId: { $in: req.user.branchIds }` unless the user has the `all_branches` permission. That filter is a helper, `scopeToBranches(filter, user)`, used by every list and get.
