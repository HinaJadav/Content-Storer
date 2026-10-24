# CoinNote Cloud Sync — Phase 1 in detail

**Date:** 2026-10-17
**Branches audited:** cngui `local` @ `b2b43d3`, cnnode `local` @ `9af7fda`
**Status:** done (1.1–1.4). **Updated 2026-10-24 (2.R):** sync design changed to one version per user + change log — see box below.
**Based on:** your `coinnote_Cloud_Plan.md` Phase 1, adjusted for decisions made so far

> **2.R update (2026-10-24) — current design**
> - `users.sync_version` = one version per user, +1 on every write.
> - `change_log (user_id, seq, entity, row_id, op, op_id, origin_device, created_at)`: `op` = `INSERT` / `UPDATE` / `DELETE`, `op_id` required and unique per user (retry dedupe), ids only — no payload (P3-D1).
> - No per-row version on `category` / `bill` / `budget` (`updated_seq`, `last_op_id` removed); `users.cloud_state` removed.
> - Contract: push op `op` INSERT/UPDATE/DELETE (no `base_seq`); push and pull send `last_synced_version`; limit `logWindowDays` = 60.
> - Older text below that mentions per-row `updated_seq` is history; this box wins.

---

## Goal

Define **once, in one place** what syncs (tables, columns, types, limits), and build the **server database** that will hold every user's finance data.

- **Server-only, invisible to users.** No app release. Existing users notice nothing.
- After Phase 1 the server *can store* synced data, but nothing sends it yet. Sending is Phase 3 (API) and Phase 4 (app).

## Can Phase 1 run before Phase 0?

**Yes.** Phase 1 touches new server tables only; it doesn't depend on the `execute()` fix or the migration-script fixes.
**But:** 0.1 (the `/db/check-version` personal-data leak) is live in production. Postponing Phase 0 is your call; postponing **0.1** leaves users' data exposed meanwhile.

---

## What I checked in the code

| Fact | Evidence |
|---|---|
| Nothing reads or writes the old finance tables | `grep prisma.bill / budget / category / accounttype / savingsaccdetails` in `cnnode/src` → **0 results** |
| Prisma version | `package.json`: `prisma` and `@prisma/client` `^6.19.0` |
| Migrations history | `prisma/migrations/`: `0001_baseline`, `20251213053427_init`, `…_add_refresh_tokens`, `…_status_enum`, `20260301122236_resolve_conflict`, `…_otp`, `…_guidbtable` |
| Config | `prisma.config.ts` uses `DATABASE_URL` |
| No validation library yet | no `zod` in `package.json` |
| Build output is committed | `dist/` is tracked in git (73 files) |
| `users.id` is an integer and the JWT carries it as `userid: number` | `schema.prisma` `users.id Int @id @default(autoincrement())`, `token.controller.ts` `verify.payload.userid` |

**Not checkable from code:** whether the production Postgres finance tables (`bill`, `budget`, `category`, …) are actually **empty**. Must be checked on the real DB before anything is dropped.

---

## Decisions already made that Phase 1 follows

| Decision | Effect in Phase 1 |
|---|---|
| H1: UUID primary keys | Synced tables use `uuid` ids |
| H3: sync counter per user | `users.sync_version` (renamed from `current_seq` in 2.R) |
| H10: server data endpoints in scope | Tables built now for Phase 3 |
| Web dashboard dropped | No web-specific rules (CSRF, browser device ids) |
| `users.id` stays integer (plan F4) | Auth, JWT, `refreshtoken`, `otp` untouched |

---

## The work, item by item

### 1.1 Shared contract — "the single definition of what syncs"

**What it is:** one file set that says, for each synced table, which columns exist, their type, max length, allowed values, and which columns are device-only or server-only. Both the app and the server read it, so they can never disagree silently.

**Why it matters:** if the app sends `amount` and the server expects `amount_paise`, or one side allows 150-char titles and the other 100, data is rejected or corrupted **silently**. The contract makes that a build error instead.

Contents (from your plan):
- `registry` — tables → columns → `{ type, nullable, max, allowed values, deviceOnly?, serverOnly? }`, plus sync order (`category` before `bill`/`budget`)
- `codecs` — convert values between Postgres, JSON and SQLite (bool ⇄ 0/1, bigint ⇄ number, lowercase UUID)
- `envelope` — request/response shapes, validated with `zod` `.strict()` (unknown fields are rejected, `user_id` in a payload is rejected)
- `limits` — 500 ops per push, 512 KB body, page sizes, `CONTRACT_VERSION = 1`
- `uuidv7` — reference implementation + test vectors (the Java ATT code must produce identical format)

**Where it lives — decision D1:**

| Option | How | Pros | Cons | Right when |
|---|---|---|---|---|
| **A. Own repo** `coinnote-sync-contract`, used by both as a git dependency pinned to a tag (plan) | separate repo | One true copy; version tags; matches separate cngui/cnnode repos | One more repo to manage; every contract change = tag + bump in 2 repos | Two people, two repos, long-lived project |
| **B. Copy the folder into both repos** + runtime version check (`X-Sync-Contract` header) | duplicated folder | Simplest; no new repo | Copies can drift; the version check only catches drift at runtime | Very early prototype |
| **C. Live in cnnode, published as a package** | npm (private) or git subpath | No new repo | cngui depends on the backend repo; publishing setup | You already publish packages |

**Recommendation:** A. Drift between app and server is exactly the kind of silent bug that destroys trust in sync, and A is the only option that prevents it by construction. The extra repo is a small, one-time cost.

### 1.2 Prisma spike (1–2 days)

**What it is:** a short experiment on a throwaway database to confirm Prisma 6.19 can express what the schema needs, **before** writing the real migration.

What to confirm (plan §1):
- composite primary key `@@id([user_id, id])` — supported
- composite foreign keys `(user_id, category_id) → category(user_id, id)` — supported
- **optional** composite relation for `category.parent_id` — **rejected by Prisma**; needs the plan's `parent_user_id` workaround
- CHECK constraints, deferrable FKs — not expressible in Prisma; must be hand-written in `--create-only` migrations, and Prisma must not remove them later

**Why composite keys `(user_id, id)`** (plan §1, in plain words): the database itself guarantees one user can never point at, overwrite or even detect another user's rows. Without it, that safety depends on every query remembering `WHERE user_id = ?`.

**Decision D2:** composite keys (plan) **or** a plain `id` primary key + `user_id` checks in code?
- Composite: safer by construction; more Prisma friction (workaround for `parent_id`).
- Plain: simpler Prisma; tenant safety relies on code and tests.
**Recommendation:** composite — this is everyone's finance data.

### 1.3 The Postgres migration

In order:

1. **Back up the production DB.** (Required — this is the rollback.)
2. **Confirm the old finance tables are empty** (`bill`, `budget`, `category`, `accounttype`, `savingsaccdetails`). If any has rows: stop and decide.
3. **Drop** those tables and their native enums (`accTypeEnum`, `typeOfBillTypeEnum`, `budgetTypeEnum`, `typeOfCategoryEnum`).
4. **Create** `category`, `bill`, `budget`:
   - `id uuid`, `user_id integer`, composite PK and FKs (if D2 = composite)
   - type columns as `text` + `CHECK (x IN (...))` instead of native enums
   - columns `created_at`, `updated_at` (no per-row version — 2.R removed `updated_seq` / `last_op_id`)
   - delete handling per **D3**
   - money per **D4**
5. **Add to `users`:** `sync_version bigint DEFAULT 0` (the per-user counter). (`cloud_state` was removed in 2.R — `sync_version > 0` tells the phone the cloud has data.)
6. **Create the change log** (per **D5**).
7. **Indexes:** `(user_id, parent_id)` / `(user_id, category_id)`; unique budget per `(user_id, category_id, year, month, type)`; `change_log` unique `(user_id, op_id)`.

Final columns synced (plan registry v1):
- **category:** `id`, `name`, `type` (I/E), `parent_id`, `icon` (+ delete marker)
- **bill:** `id`, `category_id`, amount, `type` (I/E/T), `date` (local wall-clock text), `title`, `description` (+ delete marker)
- **budget:** `id`, `category_id`, `year`, `month` (null = yearly), `type` (M/Y), limit (+ delete marker)

Not synced: `accounttype`, `savingsaccdetails`, `plantypes`, `premiumuser`, `bill_docurl` (attachments), derived values (`usedamount`, `currentbalance`), ATT drafts and SMS fields.

### 1.4 Align Prisma versions with CNDBUtility

Plan says cnnode is on Prisma 6.19 and CNDBUtility on 7.4. **CNDBUtility is not in this session**, so I can't check. Give me its `owner/repo` if this matters now.

### 1.5 Tests for the schema

Plan: DB-level tests on a real Postgres (Testcontainers) proving:
- a bill pointing at another user's category fails
- user B's upsert can never change user A's row
- an invalid type value fails its CHECK

**Decision D6:** Testcontainers needs Docker on your machine/CI. Alternative: a separate free test database (e.g. a Neon branch). Which can you run?

---

## Open decisions in Phase 1

### D3 — Deletes (your H2: "delete permanently")

| Option | Phase 1 schema effect |
|---|---|
| **B. Delete row + small "deleted" note** | No `deleted_at` column. Change log must record deletes with the row id, since the row is gone |
| **C. Tombstone (plan)** | `deleted_at timestamptz` on every synced table; rows never removed |

Still waiting on: is "permanent" about **how it looks to the user** (→ C) or **data physically gone** (→ B)?

### D4 — Money format

| Option | Phase 1 schema effect |
|---|---|
| **a. Whole paise (plan F3)** | `amount_paise bigint`, `limit_paise bigint` |
| **b. Keep rupees** | `amount numeric(12,2)` — exact on the server, but the phone stays float (H6 issues remain) |

Earlier agreed: decide this together with the UUID migration. **Phase 1 forces the decision**, because the column type is created here.

### D5 — Change log: partitions or not?

The plan uses a **partitioned** change log (split by month), a **nightly job** that drops old months, `log_floor_seq`, and a "full re-download" path for devices offline longer than the kept history.

**Honest view for ~30 users:** the log is tiny (a few rows per record change). Partitioning, the nightly job and the floor logic add real complexity — and a nightly job needs an always-on server (your host may sleep, B7).

| Option | How | Pros | Cons |
|---|---|---|---|
| **A. Partitioned + nightly drop (plan)** | as plan §3 | Scales to millions | Most complex; needs reliable scheduled job; more failure modes (R7, R8) |
| **B. Plain table, keep everything** | one normal table, never pruned | Simplest; no job; every device can always catch up from any point, so the full re-download path becomes optional | Grows forever (fine for years at your size) |
| **C. Plain table, prune later** | B now; add a simple `DELETE … older than N days` + `log_floor_seq` when needed | Simple now, room to grow | Must remember to add it before size matters |

**Recommendation:** C. Design columns so partitioning can be added later, but don't build it now. This **deviates from your plan**, so it's your call.

### D7 — Rename columns to snake_case?

Plan renames `toaccid` → `category_id`, `userid` → `user_id`, `typeofbill` → `type`, etc. On the server the tables are new, so renaming costs nothing there; on the phone it's part of the Phase 2 rebuild. Keep plan's names?

---

## Failure modes

| What breaks | User sees | How to detect | Prevent / recover |
|---|---|---|---|
| Old finance tables had real rows, dropped | Nothing now; data lost | Count rows before dropping | Step 2 check + step 1 backup |
| Migration fails halfway | Nothing (server-only) | `prisma migrate deploy` error | Postgres DDL is transactional; restore backup if needed |
| Prisma later "fixes drift" and removes hand-written CHECKs/FKs | Nothing at first; later bad data accepted | `prisma migrate diff` in CI | Keep hand-written SQL in migrations; CI check for drift |
| Messy migration history (`0001_baseline` + `init` + `resolve_conflict`) vs prod | Deploy refuses or re-applies | `prisma migrate status` against prod | Run status check first; resolve before adding new migrations |
| BigInt (`sync_version`) breaks `JSON.stringify` | Sync API crashes (Phase 3) | Unit test | Codec converts bigint → number (contract) |
| Free-tier DB too small for everyone's data | Writes fail later | DB size monitoring | Check plan limits now (B7) |
| Contract and server schema disagree | Phase 3 rejects valid data | Contract tests | Generate/verify schema from the registry |

---

## Impact on current code

**a. Conflicts:** `prisma/schema.prisma` models `bill`, `budget`, `category`, `accounttype`, `savingsaccdetails` and their enums are replaced/removed. No code in `src/` uses them (verified), so nothing breaks.
**b. Change order:** backup → empty-check → spike → migration → tests. Contract repo can be built in parallel.
**c. Unchanged:** auth, tokens, OTP, `/db/check-version`, `dbversions`, `defaultQuery`, `config`, `app_config`, `guidbversion`, the whole app.
**d. Migration risk:** low for users (invisible); real risk is only dropping tables that turn out to have data. Rollback = restore backup / revert migration.
**e. Effort:** medium — contract (new), 1–2 day spike, one hand-edited migration, schema tests.
**f. Conflicts with earlier decisions:** none, as long as D3/D4 are answered first.

---

## Decisions needed before writing Phase 1 code

| # | Question | Recommendation |
|---|---|---|
| D1 | Where does the contract live? | A — own repo |
| D2 | Composite keys `(user_id, id)`? | Yes |
| D3 | Deletes: tombstone or delete + note? | depends on your H2 answer |
| D4 | Money: whole paise or rupees? | a — paise |
| D5 | Change log: partitioned, plain, or plain-then-prune? | C — plain, prune later |
| D6 | Schema tests: Docker or a test DB? | whichever you can run |
| D7 | snake_case renames? | yes (plan) |
| — | Is the prod finance data really empty? | check on the real DB |

## Decision log entry (to fill once decided)

`2026-10-__ | Phase 1 scope: contract=__, keys=__, deletes=__, money=__, change log=__ | rejected: __ | reason: __ | cnnode prisma/*, new contract repo`
