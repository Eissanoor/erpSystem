# Stage 1 — Auth and access

Users can log in. Every later route can require a permission. Branch and warehouse lists on the user are stored now and enforced from stage 2.

## Depends on

Stage 0.

## Models

`User`, `Role`, `Permission`. Fields match the database document (User, Role, Permission sections).

Password is stored only as `passwordHash` (`bcrypt`, cost 12). Login accepts `email` and `password`. The response returns the user without `passwordHash`, plus an access token and a refresh token.

Seed permissions as data, not as hardcoded checks in controllers. One permission document per module action, `code` like `branch.read`, `sale.post`. Seed at least:

- `auth` is public for login only
- permissions for `user`, `role`, `permission` (`create`, `read`, `update`)
- a role `super_admin` that holds every permission and `all_branches`

Add new permission rows in the same stage that adds a module. Do not check permission by role name in code. Check `authorize(module, action)`.

## Endpoints

| Method | Path | Permission |
| --- | --- | --- |
| POST | `/api/v1/auth/login` | public |
| POST | `/api/v1/auth/refresh` | refresh token |
| POST | `/api/v1/auth/logout` | authenticated |
| GET | `/api/v1/auth/me` | authenticated |
| GET/POST | `/api/v1/users` | `user.read` / `user.create` |
| GET/PATCH | `/api/v1/users/:id` | `user.read` / `user.update` |
| PATCH | `/api/v1/users/:id/access` | `user.update` (roleIds, branchIds, warehouseIds) |
| GET/POST | `/api/v1/roles` | `role.read` / `role.create` |
| GET/PATCH | `/api/v1/roles/:id` | `role.read` / `role.update` |
| GET | `/api/v1/permissions` | `permission.read` |

No delete routes. Set `status` to `inactive` or `locked`.

## Validation

- Email is lowercase, trimmed, unique.
- Password at least 8 characters on create. Never return it.
- `roleIds`, `branchIds`, `warehouseIds` are ObjectId arrays. Branch and warehouse ids are not checked against those collections until stage 2; store them, and reject unknown ids once those models exist (add that check at the start of stage 2).
- `status` enum: `active`, `locked`, `inactive`.

## Cache

After login, cache `auth:user:{id}` with the permission codes and allowed branch/warehouse ids. TTL 10 minutes. `PATCH` user access and role permission changes call `cache.del`. Logout can keep the access token until expiry (15 minutes). Document that limitation in Scalar; a denylist is stage 12 if you need instant revoke.

## Middleware to add

- `authenticate` reads `Authorization: Bearer`, verifies the access token, loads the cached user.
- `authorize(module, action)` returns 403 when the code is missing.
- `scopeToBranches(filter, user)` is implemented here and used by later list services.

## Done when

- Login with the seed admin returns tokens. Wrong password returns 401 with the standard error shape.
- `GET /auth/me` works with the access token and fails without it.
- A user without `user.read` gets 403 on `GET /users`.
- Changing a role's permissions is visible on the next request after cache delete.
- Scalar shows security scheme `bearerAuth` and these paths.
