# Backend Architecture Decision: New Repo vs Extend Existing

## Context

- **Existing backend:** `sunsky-admin/backend` — deployed at `http://91.134.71.79:5000/`
- **New frontend:** `sunsky-website` — customer-facing portal
- **Shared database:** Same MySQL instance used by both systems
- **Overlap:** `PrivateCustomer` and `ProfessionalCustomer` models already exist in the admin backend

---

## Option A — Add a new backend inside `sunsky-website`

Create a separate Express/Node backend in this repo that connects to the same MySQL database.

### Advantages

| # | Advantage | Detail |
|---|---|---|
| 1 | **Self-contained repo** | Frontend and its API live together — one `git clone`, one deployment unit |
| 2 | **Independent deployments** | Can deploy the customer portal without touching the admin system |
| 3 | **Separate concerns** | Admin backend handles internal ops; this backend handles only customer-facing routes |
| 4 | **Different auth strategy** | Admin uses permission/role-based auth; customer portal can use a simpler JWT/session approach without polluting admin auth logic |
| 5 | **No risk to existing system** | Changes here cannot accidentally break the admin panel in production |
| 6 | **Easier onboarding** | A new developer only needs this repo to work on the customer portal |

### Disadvantages

| # | Disadvantage | Detail |
|---|---|---|
| 1 | **Two apps writing to the same DB** | Race conditions, conflicting transactions, and schema drift become your problem — especially on `PrivateCustomer` / `ProfessionalCustomer` tables |
| 2 | **Schema migrations are dangerous** | Running `ALTER TABLE` from one service while the other is live can break both. You need a migration strategy shared across both backends |
| 3 | **Duplicated models and validation** | Sequelize models for `PrivateCustomer`, `ProfessionalCustomer`, etc. would need to be copied and kept in sync manually |
| 4 | **No shared business logic** | Any rule change (e.g. `customerCode` generation format, status transitions) must be updated in two places |
| 5 | **Two DB connection pools** | Each backend holds open connections — adds load to MySQL, especially under concurrent usage |
| 6 | **Harder to enforce data integrity** | If both backends can create customers, you need to ensure unique constraints, email checks, and balance updates stay consistent across services |
| 7 | **More infrastructure to maintain** | Two Node processes, two PM2/Docker configs, two sets of env vars, two sets of logs |

---

## Option B — Add new routes to the existing `sunsky-admin/backend`

Add a `/api/customer-portal/` (or similar) route group to the existing backend that serves the new frontend.

### Advantages

| # | Advantage | Detail |
|---|---|---|
| 1 | **Single source of truth** | One set of models, one migration history, one connection pool |
| 2 | **Reuse existing logic** | `createPrivateCustomer`, email uniqueness checks, `customerCode` generation — already built and tested |
| 3 | **Atomic operations** | Registration can create a User + Customer record in a single transaction |
| 4 | **One deployment** | Backend update deploys once, both admin and customer portal benefit |
| 5 | **Easier debugging** | One log stream, one error tracker, one place to look |

### Disadvantages

| # | Disadvantage | Detail |
|---|---|---|
| 1 | **Admin and customer code in same repo** | A bug in customer-facing code can take down admin features if not careful |
| 2 | **Deployment coupling** | Cannot deploy a customer portal feature without doing a full admin backend release |
| 3 | **Growing codebase** | The admin backend grows bigger over time — needs good folder structure to stay clean |

---

## Recommendation

**Extend the existing backend (Option B)** for the current scope of this project.

The shared database is the deciding factor. Two backends on one DB creates real operational risk with no strong upside for a project of this size. The admin backend already has all the models, validation, and business logic needed — adding a `POST /api/auth/register` public endpoint is a small, low-risk change.

**Practical structure inside the existing backend:**

```
routes/
  auth.routes.js          ← add public register route here
  portal/
    portal.routes.js      ← future customer-portal-specific routes
controllers/
  portal/
    register.controller.js
```

**If the project grows** to the point where the customer portal needs its own release cadence, its own team, or fundamentally different scaling requirements — revisiting a microservice split at that point is a reasonable call. Not now.

---

## What needs to be added to the existing backend

1. `POST /api/auth/register` — public endpoint, no auth required
   - Accepts `type: 'private' | 'professional'` + form fields + `password`
   - Creates a `User` record (for login) + a `PrivateCustomer` or `ProfessionalCustomer` record, linked
   - Returns a JWT so the user is immediately logged in after registering

2. `POST /api/auth/login` — likely already exists, verify it returns the customer type and `customerCode` so the frontend can route correctly

3. Any customer-portal-specific read routes (booking history, profile, etc.) added under a separate route group with customer-scoped auth middleware