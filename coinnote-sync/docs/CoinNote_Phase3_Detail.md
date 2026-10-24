# CoinNote Cloud Sync — Phase 3 in detail (sync API on the server)

**Date:** 2026-10-20
**Repo:** cnnode `cloud_sync_17102026`
**Status:** analysis only, no code yet — decisions to be discussed one by one
**Depends on:** Phase 1 ✅ (schema + contract), **2.R rework** (R1–R11, see `CoinNote_Phase2_Rework_P0_P1.md`) — must be done before 3.1

## Decision tracker

| # | Topic | Recommendation | Final call |
|---|---|---|---|
| P3-D0 | Endpoints | only `/sync/pull` + `/sync/push` (no `/sync/status`) | ✅ decided (2026-10-20) |
| P3-D1 | `change_log` content | ids only (entity, row_id, op, op_id) | ✅ **A decided** (2026-10-20) |
| P3-D2 | Server log window | 60 days | ✅ **60 days** (2026-10-20), config key `sync_log_window_days` |
| P3-D3 | Push when server moved on (stale) | reject whole push → phone pulls, resolves, retries | ✅ **A** (2026-10-20) |
| P3-D4 | Bill/budget/child pointing to a missing category | reject that op as conflict | ✅ **A** (2026-10-20) |
| P3-D5 | 2nd phone has its own old data, server already has data | first sync + `server_version > 0` → full restore, old local data saved as local backup file | ✅ **B + local backup** (2026-10-20) |
| P3-D6 | Log pruning | scheduler, daily | ✅ **scheduler** (2026-10-20) |
| P3-D7 | Rename `current_seq` → `sync_version` (R4) | rename (tables empty) | ✅ **rename** (2026-10-20), done in 2.R |

---

## Goal

Two endpoints that let a phone **download** changes (pull) and **upload** its local log (push) safely: right user only, valid data only, retries never duplicate, a change from another device is never silently overwritten.
After Phase 3 the server is ready; **no app uses it yet** (Phase 4).

---

## Sync model (agreed in Phase 2)

- **Server:** one `users.sync_version` per user, +1 per write; one `change_log` row per write; log kept for a window (30/60 days).
- **Phone:** one `last_synced_version`; pending changes in `sync_outbox`; the phone **never** creates versions.
- Two separate questions:

| | Phone outbox empty | Phone outbox has ops |
|---|---|---|
| **server = last_synced** | nothing | push |
| **server > last_synced** | pull | pull → compare → resolve → push |

---

## What I checked in the code

| What | Today | Effect on Phase 3 |
|---|---|---|
| Routes | `/auth`, `/db`, `/app` in `src/index.ts` | add `app.use("/sync", syncRouter)` |
| Auth | `authMiddleware` sets `req.user.userid` | every sync route uses it; **user id only from the token** |
| Error style | HTTP 200 + `response(data, isError, msg, statusCode)` | keep the same (phone already parses it) |
| Body size | `app.use(express.json())` → default **100 KB** | push needs route-level `express.json({ limit })` = `maxPushBytes` (512 KB), else big pushes fail before our code |
| Config | `appConfigRepository.getValue` (config table) | new key: `sync_log_window_days` |
| Contract | `envelope.ts`: `op` INSERT/UPDATE/DELETE, `last_synced_version` (2.R R6 ✅) | ready |
| BigInt | `sync_version`, `seq`, `*_paise` are BigInt | convert to number in replies (`JSON.stringify` fails on BigInt) |
| Redis | `redis.config.ts` exists | not needed for sync |

---

## Endpoints

### POST `/sync/pull`

**Request**
```json
{ "last_synced_version": 22, "contract_version": 1, "page_after": null }
```

**Reply** (`Data`)
```json
{
  "min_contract_version": 1,
  "server_version": 25,
  "log_floor": 3,
  "mode": "log",
  "changes": [
    { "version": 23, "entity": "bill", "record_id": "u2", "op": "UPDATE", "op_id": "o-9", "data": { ... } },
    { "version": 25, "entity": "bill", "record_id": "u7", "op": "DELETE", "op_id": "o-11", "data": null }
  ],
  "has_more": false,
  "next_page_after": null
}
```

**Server logic**
1. `contract_version < min_contract_version` → error 426 "update the app".
2. `last_synced_version == server_version` → `mode: "none"`, empty `changes` (cheap — replaces `/sync/status`).
3. `last_synced_version < log_floor` (log pruned) or `== 0` (new phone) → `mode: "restore"`: full rows of category → budget → bill, paged; the phone swaps them in at the end.
4. Else `mode: "log"`: `change_log WHERE seq > last_synced_version ORDER BY seq`, paged (`pullPageSize` = 500). With ids-only log (P3-D1) the server reads the **current** row; a row changed 5 times is sent once (latest).
5. `op_id` in each change → the phone recognises **its own** earlier push (lost reply case) and does not treat it as a conflict.

**Restore consistency:** `server_version` is read **before** the first page. A change made while paging is sent again by the next log pull → harmless (same final state).

### POST `/sync/push`

**Request**
```json
{
  "last_synced_version": 25,
  "contract_version": 1,
  "ops": [
    { "op_id": "o-20", "entity": "bill", "id": "u1", "op": "INSERT", "data": { "id": "u1", "category_id": "c1", "amount_paise": 4500, ... } },
    { "op_id": "o-21", "entity": "bill", "id": "u2", "op": "DELETE" }
  ]
}
```

**Server logic — one Postgres transaction**
1. Validate: zod envelope (2.R shape), `ops.length <= maxPushOps`, body ≤ `maxPushBytes`, contract version, sync enabled.
2. **Lock the user row:** `SELECT sync_version FROM users WHERE id = $1 FOR UPDATE` — two pushes of the same user run one after another.
3. **Dedupe:** drop ops whose `op_id` already exists in `change_log` (retry after a lost reply). If nothing left → success with current version.
4. **Stale check (P3-D3):** `sync_version > last_synced_version` → rollback, reply `409 stale` + `server_version`. Phone pulls, compares, user resolves, retries.
5. **Apply ops in the given order** (phone sends parents before children, deletes children before parents):
   - INSERT / UPDATE → upsert row with `user_id` from token (never from body).
   - DELETE → delete row if present (already gone = fine).
   - **Same-user link check (no FK rule):** `category_id` / `parent_id` must exist for this user (in DB or earlier in this batch). Missing → P3-D4.
   - each op: `sync_version + 1` → `change_log (user_id, seq, entity, row_id, op, op_id, origin_device, created_at)`.
6. Save `users.sync_version`, commit.
7. Reply `{ server_version, applied: [op_id...] }` → phone sets `last_synced_version`, deletes those outbox rows.

---

## Open decisions (need your answer)

### P3-D1 — What `change_log` stores
| Option | Pros | Cons |
|---|---|---|
| **A. Ids only** (entity, row_id, op, op_id) | small; 5 edits = phone gets latest row once; pruning trivial | pull does a join to read rows |
| B. Full payload per change | pull = read log only | log grows with every edit; old payloads may not match current schema |

**✅ Decided (2026-10-20): A — ids only** (`entity, row_id, op, op_id` + `seq`, `origin_device`, `created_at`). Pull reads the latest row from the real table (`DISTINCT ON (entity, row_id)` latest op per row). B rejected: more data to phone, storage growth, stale payloads after schema changes.

### P3-D2 — Log window
30 or 60 days. Storage at 30 users is tiny either way; longer = fewer full restores for phones offline a long time. **Recommendation: 60** (config key, changeable).

### P3-D3 — Push when the server has newer changes
| Option | |
|---|---|
| **A. Reject whole push (409 stale)** | phone pulls, resolves, retries — exactly the agreed flow; simple |
| B. Check per op, apply the clean ones | fewer round trips; more code, partial pushes harder to reason about |

**✅ Decided (2026-10-20): A.**

### P3-D4 — Op points to a missing category (deleted on another phone)
Example: phone A deletes "Food" (cascade); phone B, offline, adds a bill under "Food".
| Option | |
|---|---|
| **A. Reject the op as conflict** (`missing_category`) | phone shows it; user picks another category (Phase 4 UI) |
| B. Server moves it to "Uncategorized" | no user action; needs a fixed Uncategorized category per user |

**Recommendation: A** (no hidden data moves). Note: with P3-D3 A, phone B pulls first and already sees the delete → Phase 4 can catch it before pushing; the server check is the safety net.

### P3-D5 — Second phone already has its own data
Before sync, each phone of the same user has separate data. Phone 1 uploads first. Phone 2 then logs in with its own outbox full of INSERTs — its records have **different UUIDs**, so pull/compare finds no conflict and a push would create duplicates (same for a fresh-login phone with freshly seeded defaults).
| Option | |
|---|---|
| A. Upload anyway | duplicates (defaults twice, maybe same bills twice) |
| B. Discard phone 2 data, restore from cloud | loses phone-2-only records |
| C. Ask the user (Phase 4) | extra UI on an already heavy step |

**✅ Decided (2026-10-20): B + local backup.** On a phone's **first sync**, if `server_version > 0` → full restore from cloud, local pre-sync data is **not pushed**; before the restore the phone saves its old data as a local backup file (skipped when it only has freshly seeded defaults). No `cloud_state` needed — `server_version > 0` tells the phone the cloud has data. Phase 3 work: none extra (restore mode already exists); logic is Phase 4.

### P3-D6 — Log pruning

**✅ Decided (2026-10-20): scheduler** — keeps sync requests free of cleanup work.
- Daily job inside cnnode (`node-cron`, e.g. 03:00 IST): `DELETE FROM change_log WHERE created_at < now() - sync_log_window_days`.
- Runs in batches (e.g. 5 000 rows per loop) so it never holds a long lock.
- Logs how many rows were deleted; a failed run just retries next day (no data risk — only old rows).
- If cnnode ever runs as more than one instance: run the job on one only (env flag `RUN_JOBS=true`).
- `log_floor = MIN(seq)` of the user's remaining rows; empty log → floor = `sync_version + 1`.

### P3-D7 — Rename `current_seq` → `sync_version`
Tables empty, rename costs nothing now. **Recommendation: rename** (matches team wording). Done in 2.R.

---

## Sub-phases

| Sub | What | Size |
|---|---|---|
| **3.0** | Prerequisite: 2.R rework (schema, CHECKs, envelope, limits) applied and tested | — |
| **3.1** | `sync.repository.ts`: lock user, next version, write `change_log`, upsert/delete rows, link check, read changes, read snapshot pages | medium |
| **3.2** | `/sync/pull`: status fields, modes none / log / restore, paging, BigInt → number | medium |
| **3.3** | `/sync/push`: validation, size limit, dedupe, stale check, apply, reply | medium |
| **3.4** | Config `sync_log_window_days`; daily pruning job (`node-cron`) | small |
| **3.5** | Tests: `scripts/testSyncApi.ts` (rolled-back transaction, like 1.4) + Postman checklist | medium |

Files: `src/routes/sync.routes.ts`, `src/controllers/sync.controller.ts`, `src/servies/sync.service.ts`, `src/repositories/sync.repository.ts`, `src/index.ts` (1 line).

---

## Failure modes

| What breaks | User sees | Detect | Prevent / recover |
|---|---|---|---|
| Reply lost after server saved | — | same `op_id` on retry | dedupe by `op_id` (step 3) |
| Two phones push at once | — | — | `FOR UPDATE` on user row → serialised |
| Another device wrote between pull and push | — | stale check | 409 → pull → resolve → retry |
| Phone offline > window | — | `last_synced < log_floor` | `mode: restore` |
| Body > 100 KB | push fails | 413 | route-level json limit = `maxPushBytes`; phone batches |
| User A sends rows for user B | — | — | `user_id` only from token; `.strict()` envelope rejects `user_id` |
| Bill points to other user's category | data leak across users | link check | category must exist **for this user** |
| Bad data (amount 0, bad type) | — | zod + DB CHECKs | reject whole push with message |
| BigInt in JSON | 500 | — | convert in service |
| Old app without sync | nothing | — | `min_contract_version` |
| Restore while another device writes | — | — | `server_version` read before first page; next pull catches up |

---

## Impact on current code

**a. Conflicts:** none with existing endpoints; `src/index.ts` gets one route line.
**b. Order:** 2.R → 3.1 → 3.2 → 3.3 → 3.4 → 3.5. Can run in parallel with Phase 2 app work once 2.R is done.
**c. Unchanged:** auth, tokens, `/db/check-version`, `/app/update-config`, existing tables.
**d. Risk:** medium — new endpoints only; no app calls them until Phase 4.
**e. Effort:** medium.
**f. Main-DB changes when going to `local`:** config key `sync_log_window_days` (+ 2.R schema push).

---

## Questions for you

| # | Question |
|---|---|
| Q1 | Answer P3-D1 … P3-D7 (or accept recommendations). |

## Open points for later (premium work)

| # | Point | Effect today |
|---|---|---|
| OP-1 | Token refresh (`servies/token.service.ts` ~L95–122) copies `ispremiumuser` from the **old refresh token**, not from `users.ispremiumuser` → a user made premium in DB stays non-premium in tokens until next login. Fix: read the flag from `users` on refresh. | none — no feature reads the flag yet |

## Decision log entry (to fill)

`2026-10-20 | Phase 3: endpoints=pull+push, change_log=ids only, window=60d, stale=reject whole push, missing category=reject op, 2nd phone=restore+local backup, pruning=daily scheduler, rename=sync_version | rejected: /sync/status, allowlist, sync_enabled switch | reason: who may sync is decided later (premium idea) | cnnode src/routes, controllers, servies, repositories/sync.*`
