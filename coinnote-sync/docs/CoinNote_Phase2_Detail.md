# CoinNote Cloud Sync — Phase 2 in detail (phone database migration)

**Date:** 2026-10-18
**Repos:** cngui `cloud_sync_hj_17102026` (+ native ATT under `plugins/att/`), cnnode (2.6 only)
**Status:** analysis only, no code yet — decisions being discussed one by one (team review pending)

## Decision tracker

| # | Topic | Recommendation | Final call |
|---|---|---|---|
| P2-D1 | Offline changes + sync flow | **`sync_outbox`** + one `last_synced_version` per user; pull log in window else full restore; collapse per record | 🟡 **agreed direction**, team final pending |
| P2-D2 | Category delete | **B — cascade** with GitHub-style "type the name to confirm" alert | ✅ **decided** (2026-10-19) |
| P2-D3 | Default categories | **B — app generates UUIDs, then inserts**; old users' defaults migrate like any row | 🟡 **agreed direction**, team final pending |
| P2-D4 | Where migration runs | JS code inside the app (UUIDs generated in JS), runs after `CheckAndRunMigration` | ✅ **decided** (2026-10-19) |
| P2-D5 | UUID libraries | JS `uuid` + `react-native-get-random-values`; ATT draft id = timestamp, re-keyed to UUID v7 on confirm | ✅ **decided** (2026-10-19) |
| P2-D6 | Keep `legacy_id` | — | ❌ **dropped** (2026-10-19) — no `legacy_id` column |
| Q1 | Category-delete trigger in `dbversions`? | — | ✅ closed — cascade done in app code (P2-D2 B), no trigger relied on |
| Q3 | Restore-copy escape hatch | yes | ✅ **yes** (2026-10-19) — pre-migration copy + hidden restore option, kept 2 releases |
| Q4 | Current Play Store version code | — | ✅ **34** → Phase 2 build = 35+; 2.0 gating: new-shape `dbversions` rows only for builds > 34 |
**Depends on:** Phase 0 (execute() fix) ✅, Phase 1 contract ✅

---

## Goal

Convert every phone's local SQLite to the **sync-ready shape** — UUID ids, money in paise, sync bookkeeping columns — and update all app code + native ATT to use it.
After Phase 2 the app works **exactly as today** (still no network sync), but its data is ready to sync in Phase 4.

---

## What I checked in the code

### Current phone schema (from CNDBUtility `20260304091618_init` + ATT `att_migration_v1.sql`)

| Table | Today | Problem for sync |
|---|---|---|
| `category` | `id INTEGER AUTOINCREMENT`, `userid`, `rootcategoryid`, `parentid`, `typeofcategory`, `icon`, `autorepeatbudget` | integer ids clash across devices |
| `bill` | `id INTEGER AUTOINCREMENT`, `amount INTEGER` (holds rupee floats), `toaccid` (= category id), `fromaccid`, `userid`, `date`, `typeofbill`, `title`, `description` + ATT `billstatus`, `smssender`, `deduphash` | ids, money as rupees |
| `budget` | `id INTEGER AUTOINCREMENT`, `categoryid`, `initialbudget`, `usedamount`, `year`, `month`, `type` | ids, money |
| `bill_docurl` | `id`, `billid`, `url` | device-only, but `billid` must follow bill's new id |
| `smssenderpattern`, `localconfig`, `config`, `users` | — | **not synced, unchanged** |

### Size of the app change

| What | Count |
|---|---|
| Files touching `toaccid` / `categoryid` / `parentid` / `parseInt` / `lastInsertRowId` | **23 files** |
| References to category/parent id columns | 87 |
| `parseInt` / `Number(id)` on ids | 19 |
| `lastInsertRowId` (restore id remapping) | 8 |
| Amount references in screens/components | 23 |
| Hard `DELETE FROM` on synced tables | `billRepo.ts:304`, `budgetRepo.ts:222`, `categoriesRepo.ts:84`, `:109` |

### Findings that change the plan

**F-A — Deleting a category leaves its bills/budgets/children behind.**
`categoriesRepo.ts:108` `DeleteCategory` runs only `DELETE from category ...`. `DeleteItemScreen.tsx:64` comments "its records and budgets are gone too", but no code deletes them (no trigger found in repo code — **needs your confirmation**, see Q1). Today this leaves orphan rows; with sync it would push a category delete while its bills still point to it.

**F-B — New installs would break on default categories.**
The live `defaultQuery` rows insert categories **without an `id` column** (SQLite autoincrement). After Phase 2, `category.id` is `TEXT` (UUID) with no auto value → those inserts **fail**. New users (or a second account on a phone) would get no categories.

**F-C — Server migrations are not gated by app build.**
`dbversion.service.ts` sends the same SQL to every build (the `guiversion` check is commented out). Old ATT `ALTER TABLE bill ADD COLUMN ...` statements would fail on a rebuilt `bill` table, and since 0.5 now reports errors, the whole batch would roll back. → 2.6 must ship **before** the Phase 2 app release.

**F-D — `att-open` is now a real route.** `app/att-open.tsx` exists and passes `id` (string) to AddRecord, which does `parseInt(recordId)` (`AddRecordScreen.tsx:147`). Works with UUIDs once `parseInt` is removed. CLAUDE.md still says it is "not a route" — doc is stale.
**✅ Confirmed by team (2026-10-19):** `app/att-open.tsx` route is the real current behaviour; the CLAUDE.md `att-open` section is stale → update CLAUDE.md in 2.4 (when `parseInt` is removed).

---

## Decisions already made that Phase 2 follows

| Decision | Effect |
|---|---|
| H1 UUID PK | `id TEXT` UUID v7 on every synced table |
| D3 delete + note | rows are **really deleted** on the phone too; a `kind='delete'` outbox row is kept until pushed (P2-D1) |
| D4 paise | `amount_paise`, `limit_paise` integers |
| D7 snake_case | `toaccid` → `category_id`, `userid` → `user_id`, etc. on synced tables |
| Registry 1.1a | wire columns: category(id,name,type,parent_id,icon), bill(id,category_id,amount_paise,type,date,title,description), budget(id,category_id,year,month,type,limit_paise) |
| "Use package methods" | UUIDs from the `uuid` package on the phone too |

---

## Open decisions (need your answer)

### P2-D1 — Offline changes and sync flow (team design)

**Status (2026-10-19):** team design agreed as direction; final call after team discussion. Replaces the earlier `sync_pending_delete` / `pending_delete` options and the per-row version idea.

#### Versions — one per user, not per row
- **Server:** `users.sync_version` (today `current_seq`) — +1 on every insert/update/delete of a synced table, in the same transaction.
- **Server:** `change_log` row per write: `user_id, version, table, record_id, op (INSERT/UPDATE/DELETE), payload?, created_at`. Kept for a **limited window (30 or 60 days)**, older rows pruned.
- **Phone:** one `last_synced_version` in `sync_state`. **No version column on data rows, no version on ops.**

#### Local operation log (phone)
```
sync_outbox (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,  -- order
  op_id      TEXT NOT NULL UNIQUE,               -- UUID v7, server dedupes retries
  entity     TEXT NOT NULL,                      -- 'category' | 'bill' | 'budget'
  record_id  TEXT NOT NULL,                      -- UUID of the row
  op         TEXT NOT NULL,                      -- 'INSERT' | 'UPDATE' | 'DELETE'
  data       TEXT,                               -- JSON of wire columns (registry 1.1a); NULL for DELETE
  sent       INTEGER NOT NULL DEFAULT 0,         -- 1 = in a push not confirmed yet
  created_at TEXT NOT NULL
)
```
- Kept **with no time limit** until synced.
- Every repo write = real table change + outbox row in **one SQLite transaction**. Screens keep reading the real tables.
- Store the **operation (data)**, never SQL text — server validates with the 1.1c zod envelope and builds its own SQL.
- **ATT drafts** (`billstatus='D'`) never go into the outbox; they enter it when the user confirms. Native Java has no outbox code.

#### Collapse — one op per record (only into `sent=0` rows)
| Old op | New op | Keep |
|---|---|---|
| INSERT | UPDATE | INSERT with latest data |
| INSERT | DELETE | nothing — remove both |
| UPDATE | UPDATE | UPDATE with latest data |
| UPDATE | DELETE | DELETE |

If the old op is `sent=1` (in flight) → add a new op, never change a sent one.

#### Sync flow (when online)
1. **Pull**
   - `last_synced_version` == server `sync_version` → nothing to pull.
   - inside the server log window → pull `change_log WHERE version > last_synced_version` (ordered) and apply.
   - outside the window (log pruned) → **full restore**: download synced tables into temp tables, swap in one transaction.
     Never touched by the restore: ATT drafts (`billstatus='D'`), `bill_docurl`, `sync_outbox`.
2. **Compare** local outbox with the pulled changes: same `entity + record_id` changed on server → **conflict → user resolves** (keep mine / keep server).
3. **Push** outbox ops (batches of `maxPushOps`), request carries `last_synced_version` once. Server compares with its data again; new conflict → back to step 2 (user resolves), then retry.
4. **Done:** server confirms → `last_synced_version` = returned server version; delete confirmed outbox rows. No reply → resend same `op_id`s (idempotent).

#### Example
```
last sync: version 20
offline: add Tea ₹45   → outbox INSERT u1 {4500}
offline: edit to ₹50   → outbox INSERT u1 {5000}    (collapse)
offline: edit bill u2  → outbox UPDATE u2 {...}
online:  pull log > 20 → server has u2 changed at v22 by other phone → conflict → user picks
         push INSERT u1, UPDATE u2 (if "keep mine") → server v24 → last_synced_version = 24
```

#### Impact on Phase 1 (to change in Phase 3)
- Per-row `updated_seq` on server `category` / `bill` / `budget` becomes unused → remove (tables still empty).
- Envelope 1.1c: drop per-op `base_seq`; push request gets `last_synced_version`.
- `change_log`: add `created_at` (+ payload if decided); add pruning job + window config key.
- **Open:** `change_log` stores full payload, or only ids (pull reads the current row)?

### P2-D2 — What deleting a category does (F-A)

| Option | Behaviour |
|---|---|
| **A. Block** | refuse delete if the category has bills, budgets or child categories ("move or delete them first") |
| B. Cascade | delete the category **and** its child categories, bills, budgets (each becomes a pending delete) |
| C. Keep today's behaviour | leaves orphans — **not workable with sync** |

**✅ Decided (2026-10-19): B — cascade, with a strong GitHub-style confirm.** A is dropped.

How B works:
1. User taps delete on a category.
2. App counts what will go: child categories (recursive, via `GetAllChildCatIds`), bills and budgets under the category and all its children.
3. **Strong alert (like GitHub "delete repository"):**
   ```
   ⚠️ Delete category "Food & Dining"?
   This will permanently delete:
     • 2 sub-categories
     • 152 records (incl. 4 unconfirmed SMS drafts)
     • 3 budgets
   This cannot be undone, and will be removed from all your devices.

   Type  Food & Dining  to confirm:  [______________]

   [ Cancel ]   [ Delete permanently ]   ← red, disabled until the typed text matches exactly
   ```
   - Delete button stays **disabled** until the typed name matches (case-sensitive, trimmed).
   - Counts are read fresh when the alert opens.
   - If nothing depends on the category (0 / 0 / 0), show a normal simple confirm instead.
4. On confirm, **one SQLite transaction**: delete bills → budgets → child categories → the category; in the **same transaction**, every deleted row is stored in `sync_outbox` for cloud sync:
   ```
   DELETE bill     u-b1 … u-b152   (one op per bill; drafts skipped)
   DELETE budget   u-g1 … u-g3
   DELETE category u-c2, u-c3      (children)
   DELETE category u-c1            (the category itself, last)
   ```
   - One op **per row**, not one "cascade" op → server and other phones just apply exact deletes, no cascade logic needed on their side.
   - Collapse (P2-D1): a row with an unsent INSERT → both removed (never on server); unsent UPDATE → becomes DELETE.
   - Unconfirmed ATT drafts write nothing (never synced).
5. Phase 3 server: applies the deletes in the same order (children before parents); no FK means nothing blocks it.

Things to watch with B:
- ATT drafts (`billstatus='D'`) under the category are deleted too and shown in the alert count.
- Very large deletes (thousands of rows) → still one transaction, but sync pushes them in batches (`maxPushOps`).
- If the user has 2 phones and the other phone adds a bill to this category offline → on sync that bill points to a deleted category (Phase 4 conflict rule needed: re-assign to "Uncategorized" or reject).

### P2-D3 — Default categories after migration (F-B)

| Option | How | Pros | Cons |
|---|---|---|---|
| **A. New `defaultQuery` rows for new builds** | same 2 statements, but `id` generated in SQLite (`lower(hex(randomblob(...)))` formatted as UUID v4); server picks old/new rows by app build (2.6) | works offline, today's flow unchanged | two default sets on server until old builds are gone |
| B. App creates defaults itself (`uuid` v7) on first login | list of 36 defaults bundled in app | no server change | defaults list lives in app code now |
| C. Server seeds on first sync (Phase 3) | — | single source | **gap**: Phase 2 ships before sync, new users would have no categories |

**Decided direction (2026-10-18): B — minimal method.** Team final pending.

**New user (first login on a phone):**
1. App has the 36 defaults (11 parents + 25 children) as a constant list: name, type, icon, parent name.
2. **First** generate a UUID v7 for every default (parents first, so each child gets its parent's UUID as `parent_id`).
3. **Then** insert them in one `runInTransaction` — same `AddCategory` repo path as a user-created category, so each one also gets its `upsert` outbox row (P2-D1).
4. Server stops sending `defaultQuery` to new builds (2.0 gating). Old builds keep getting it unchanged.

**Old user (already has default categories):** nothing special — default categories are normal rows of the `category` table and go through the 2.1 migration exactly like every other row (UUID via id map, links rewritten, outbox INSERT).

**Rule:** after creation a default category is a normal category — edit, delete (P2-D2) and sync exactly the same. No "is default" flag.

**Phase 4 note:** existing user logging in on a **new** phone → seed only if the server has no categories for the user, otherwise pull; duplicates by name are merged there.

### P2-D4 — Where the local migration runs

| Option | |
|---|---|
| **A. Bundled in the app**, runs at startup before any repo query (plan F9) | ✅ only new builds run it; can't reach old builds |
| B. Through the signed server SQL pipeline | ❌ old builds would receive it and break |

**Recommendation: A.**

### P2-D5 — UUID generation

- **JS:** `uuid` package `v7()` — needs a secure random source in React Native: add **`react-native-get-random-values`** (import once in `_layout.tsx`) or use `expo-crypto`.
- **Java (ATT) — decided direction (2026-10-18): no UUID library in native.**
  - Drafts (`billstatus='D'`) are device-only and **never synced** until the user confirms (P2-D1 rule 6).
  - Native inserts the draft with a **timestamp id** (text, e.g. `att-1760780000123`). Keeps native simple.
  - **On confirm (JS `UpdateBillRecord`)**, in one `runInTransaction`: generate UUID v7 → `UPDATE bill SET id = <uuid>, billstatus = 'C'` → `UPDATE bill_docurl SET billid = <uuid>` → outbox `upsert` with the new id. The server only ever sees UUIDs (zod `isUuid` would reject a timestamp).
  - Same-millisecond clash (2 SMS at once): on unique-key error, add a `-1` suffix and retry the insert once.
  - Old notification tapped after confirm → id no longer exists → open Pending list / "already saved" toast.

### P2-D6 — Keep a `legacy_id` column?

**❌ Dropped (2026-10-19).** No `legacy_id` column. Accepted loss:
- a notification posted **before** the update carries the old integer id → after update it is not found → app opens the **Pending list** (the draft is still there).
- v1 backup import (2.6) maps old ids → UUIDs **in memory** during the import; no column needed.

---

## Sub-phases

| Sub | What | Repo | Size |
|---|---|---|---|
| **2.R** | Rework of Phase 0/1 code from Phase 2 decisions — see `CoinNote_Phase2_Rework_P0_P1.md` (R1–R15). **Do first.** | cnnode + cngui | small–medium |
| **2.0** | Server: gate `dbversions` by app build and stop sending `defaultQuery` to new builds (F-B, F-C). **Must deploy first.** | cnnode (+ Postgres rows) | small |
|  | ✅ **2.0 decision (2026-10-24): gate by Play Store version code (B1 = B)** — app sends `versionCode` (`expo-application` `nativeBuildVersion`, already installed) in `/db/check-version`; server: `versionCode >= 35` → new behaviour, missing/invalid → old build. |  |  |
| **2.1** | Local migration `MIGRATION_UUID_V1` (bundled): rebuild category/bill/budget/bill_docurl with UUID + paise + sync columns, one transaction, re-runnable | cngui | medium |
| **2.2** | `uuid` setup + `util/money.ts` (`toPaise`, `formatPaise`) + `outboxRepo.ts` (`addOp` with collapse rules, used inside repo transactions) | cngui | small |
| **2.3** | Repositories: UUID on insert, every write = table change + `addOp` in one `runInTransaction`, new column names, category delete rule (P2-D2), 0.6 `buildIdList` for UUIDs | cngui | medium |
| **2.4** | Process files + screens + components: ids as strings, amounts in paise, remove `parseInt` on ids | cngui | **large** (23 files) |
| **2.5** | Native ATT (Java): timestamp-id drafts (re-keyed to UUID on confirm in JS), paise via `BigDecimal`, notification URI with the draft id, pre-migration fallback | cngui `plugins/att/` | medium |
| **2.6** | Backup/restore v2 (keep UUIDs) + v1 import converter | cngui | medium |
| **2.7** | Tests: migration fixtures + kill-mid-migration + regression checklist | cngui | medium |

### 2.1 Local migration — how existing data gets UUIDs

Runs **once per phone**, automatically, the first time the user opens the new app version — from `useAuth.restoreStoredSession`, **before** `CheckAndRunMigration` and before any screen loads data.

#### What is `PRAGMA user_version`?

- **PRAGMA** = a special SQLite command that reads/changes **settings of the database itself**, not table data. The app already uses one: `db.config.ts` → `PRAGMA journal_mode=WAL;`.
- **`PRAGMA user_version`** = **one whole number stored inside the `coinnote.db` file**, starting at **0**. SQLite never uses it itself — it is free for the app to store a version number.
  ```sql
  PRAGMA user_version;        -- read: 0 on a phone not migrated yet
  PRAGMA user_version = 1;    -- write: set at the end of the migration
  ```
- **Why not AsyncStorage (like `LastMigrationVersion`)?** AsyncStorage is separate from the DB — if the app dies after the DB commit but before AsyncStorage saves, they disagree (the audit problem). `user_version` lives **inside the same DB file** and is set **inside the same transaction**, so data and "done" mark always save together or not at all.

#### Steps

1. **Safety copy** — `VACUUM INTO 'coinnote_pre_uuid.db'`: full copy of the DB file first (kept for 2 releases).
2. **Already done?** — if `PRAGMA user_version >= 1`, skip. Makes it safe to call on every launch.
3. **One transaction** — `PRAGMA foreign_keys = OFF`, then `BEGIN IMMEDIATE`. Everything below happens fully or not at all.
4. **Probe columns** — `PRAGMA table_info` (some phones may lack ATT columns).
5. **Create new tables** next to the old ones: `category_new`, `bill_new`, `budget_new`, `bill_docurl_new`, plus `sync_outbox`, `sync_state` (`last_synced_version`) (new shape: `id TEXT` UUID, `amount_paise`).
6. **Build an id map** — every old row gets a UUID v7, generated in JS **in old-id order** (keeps sort order), stored in temp table `id_map(entity, old_id, new_id)`:

   | table | old id | new id |
   |---|---|---|
   | category | 1 | `0190a1…-0001` |
   | category | 7 | `0190a1…-0002` |
   | bill | 42 | `0190a1…-0003` |

7. **Copy rows, rewriting every link through the map:**
   ```
   OLD bill:  id=42, toaccid=7, amount=450.5, typeofbill='E'
   NEW bill:  id='0190a1…-0003', category_id='0190a1…-0002', amount_paise=45050, type='E',
   ```
   - `toaccid` / `categoryid` / `parentid` → the **new UUID** of the row they pointed to.
   - `0` ("no category", ATT drafts) → `NULL`.
   - Money → `ROUND(amount * 100)` and `ROUND(initialbudget * 100)` (paise).
   - Every copied category/bill/budget (except ATT drafts `billstatus='D'`) gets one `upsert` outbox row, in order category → budget → bill → Phase 4 uploads everything on first sync.
   - `bill_docurl.billid` → the bill's new UUID.
8. **Verify before committing** (else `ROLLBACK`):
   - row counts equal per table,
   - `SUM(amount_paise) = SUM(ROUND(amount*100))`,
   - no link points to a missing row (counts orphans that were **already** broken before).
9. **Swap** — drop old tables, rename `*_new` to real names, recreate indexes (incl. ATT partial indexes).
10. **Mark done** — `PRAGMA user_version = 1`, `COMMIT`.

#### What if something goes wrong?

| Situation | Result |
|---|---|
| App killed / phone dies mid-way | transaction never committed → DB **fully old**; migration runs again next launch |
| A check in step 8 fails | `ROLLBACK` → old data untouched; error logged; app keeps working on old schema until a fixed build ships |
| Phone low on storage | fails cleanly, data untouched, retries next launch |
| SMS arrives during migration | native ATT waits briefly, then writes in the right shape (2.5) |
| Old notification tapped after update | old integer id not found → open Pending list (accepted loss, P2-D6) |

#### Not changed

`users` (id stays integer), `smssenderpattern`, `localconfig`, `config`, notification settings.

**New phone columns:** none besides the new shape (no `legacy_id` / `dirty` / `pending_op_id` / `server_seq` — outbox + `sync_state.last_synced_version` replace them); bill keeps `billstatus`, `smssender`, `deduphash`.

### 2.5 Native ATT — details

- `AttDb.insertDraft`: read `PRAGMA user_version`; **if 0** (app updated but not opened yet) insert the old shape exactly as today — 2.1 converts it later; **if ≥ 1** insert `id = timestamp id` (P2-D5), `amount_paise` via `BigDecimal`, `category_id NULL`, `billstatus 'D'`. **No outbox row** — drafts enter the outbox only when confirmed in JS (P2-D1 rule 6).
- `SQLITE_BUSY` (migration holding the lock): short bounded retry, then drop (today's policy).
- `AttNotifier`: URI `cnrn:///att-open?id=<uuid>`; notification id = `uuid.hashCode()`.
- `att-open`: an id that is not found (e.g. old integer id from a pre-update notification) → open Pending list.
- Parity: `util/attMatcher.ts` / `AttAmount.java` amount parsing must give identical paise.

---

## Failure modes

| What breaks | User sees | Detect | Prevent / recover |
|---|---|---|---|
| Migration bug corrupts data | lost/misplaced records, wrong totals | count/sum checks in step 8 | single transaction + checks → ROLLBACK; pre-migration DB copy |
| App killed mid-migration | nothing (next launch retries) | `user_version` still 0 | one transaction — DB is fully old or fully new |
| SMS arrives during migration | draft lost | — | native busy-retry; pre-migration native path |
| Old notification tapped after update | Pending list opens instead of the draft | — | accepted loss (P2-D6 dropped) |
| A screen still uses `parseInt(id)` | record not found / crash | regression checklist | remove all 19 sites; grep check |
| A screen still treats paise as rupees | amounts 100× too big | regression checklist | renamed columns (`amount_paise`) make misses obvious |
| Server sends old ALTERs to rebuilt tables | migration batch rolls back, ATT patterns stop | error toast / logs | 2.0 gating **before** release |
| New user gets no categories | empty category list | test 0.3-1 | P2-D3: app seeds defaults with UUIDs; 2.0 stops old `defaultQuery` for new builds |
| Category delete leaves orphans | bills under missing category | — | P2-D2 |
| Repo write without outbox row | change never reaches server/other phones | regression checklist + grep for writes outside `runInTransaction` | all synced-table writes go through repo functions that call `addOp` |
| Edited a row while its op was in flight | newer edit lost | — | collapse only into `sent=0` rows (P2-D1 rule 4) |
| Phone low on storage | migration fails (needs ~2× DB size) | migration error | check free space; abort cleanly; retry next launch |
| Backup v1 restored on migrated app | ids clash / duplicates | restore error | v1 converter (2.6) |

---

## Impact on current code

**a. Conflicts:** every repository writing synced tables; 23 app files with integer ids; ATT Java insert/notify; backup/restore id remapping; `defaultQuery` rows.
**b. Order (each step leaves the app working):** 2.0 (server, deploy) → 2.2 → 2.1 + 2.3 + 2.4 + 2.5 + 2.6 **ship together in one app release** (schema and code must match) → 2.7 before release.
**c. Unchanged:** auth/tokens, `/db/check-version` flow, `smssenderpattern`, `localconfig`, `config`, `users` (id stays integer), notifications scheduling logic, theme/currency.
**d. Migration risk:** highest of all phases — it rewrites every user's financial data. Mitigation: transaction + checks + DB copy + internal testing track first. Rollback: previous build can't read the new schema → restore from the pre-migration copy (needs a small "restore copy" path) — ✅ **planned** (Q3): `VACUUM INTO` copy in 2.1 step 1 + hidden "Restore pre-update data" option; copy and option removed after 2 releases.
**e. Effort:** large (biggest phase).
**f. Conflicts with earlier decisions:** none; 0.6 (`buildIdList`) folds into 2.3.

---

## Questions for you

| # | Question |
|---|---|
| Q1 | When a category is deleted today, are its bills/budgets/children deleted too (any SQLite trigger in your `dbversions` rows)? Run on Postgres: `SELECT id FROM "dbversions" WHERE query ILIKE '%TRIGGER%';` |
| Q2 | Answer P2-D1 … P2-D6 | ✅ done (2026-10-19) |
| Q3 | Build a "restore pre-migration copy" escape hatch? ✅ yes |
| Q4 | Which build is on the Play Store now (version code)? 2.0 gating needs it. |

## Decision log entry (to fill)

`2026-10-__ | Phase 2: deletes=__, category delete=__, defaults=__, migration=bundled, uuid=__, legacy_id=dropped | rejected: __ | reason: __ | cngui data/*, features/*, app/*, plugins/att/*, cnnode dbversion.*`
