# Stage 0 — Foundation

Build the empty API shell. No business modules yet.

## Depends on

Nothing.

## Outcome

`npm run dev` starts Express, connects to MongoDB, serves `GET /health`, serves Scalar at `GET /docs`, and returns the standard error JSON for unknown routes.

## Create these files

```text
package.json
.env.example
src/server.js
src/app.js
src/config/env.js
src/config/db.js
src/common/utils/asyncHandler.js
src/common/utils/ApiError.js
src/common/utils/ApiResponse.js
src/common/utils/pagination.js
src/common/utils/listQuery.js
src/common/utils/withTransaction.js
src/common/utils/documentNumber.js
src/common/utils/money.js
src/common/utils/cache.js
src/common/utils/assert.js
src/common/utils/pick.js
src/common/middleware/validate.js
src/common/middleware/errorHandler.js
src/common/middleware/notFound.js
src/common/constants/status.js
src/docs/openapi.js
src/docs/paths/.gitkeep
src/modules/.gitkeep
```

`documentNumber` needs a `Counter` model: `{ prefix, seq }` with an atomic `findOneAndUpdate` `$inc`. That is the only model in this stage.

## Packages

- `express`, `mongoose`, `joi`, `jsonwebtoken`, `bcryptjs`, `compression`, `cors`, `helmet`, `morgan`, `dotenv`
- `@scalar/express-api-reference` for `GET /docs`

Pin versions in `package.json`. Do not add Redis in this stage. `cache.js` is an in-memory `Map` with TTL and prefix delete.

## App setup in `src/app.js`

Order: `helmet`, `cors`, `compression` (threshold 1024), `express.json` limit `1mb`, request id, routes, not-found, error handler.

`GET /health` returns `{ success: true, data: { db: "up" } }`.

`GET /openapi.json` returns the spec. `GET /docs` mounts Scalar against that spec.

## Environment

```text
NODE_ENV=development
PORT=5000
MONGODB_URI=
JWT_ACCESS_SECRET=
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_SECRET=
JWT_REFRESH_EXPIRES=7d
```

Secrets stay in `.env`. `.env.example` has empty values. Do not commit `.env`.

## Done when

- Health check reports the database is up.
- An unknown route returns the standard error shape with 404.
- A thrown `ApiError` returns its status and message.
- Scalar loads and shows the health path.
- `money` tests (or a small node script) show `0.1 + 0.2` stored as Decimal128 equals `0.3`.
- `documentNumber.next("TST")` returns `TST-000001`, then `TST-000002`, including two parallel calls without duplicates.
- Cache `getOrSet` calls the loader once until `del` or TTL.
