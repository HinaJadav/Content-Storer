# CoinNote — Phase 0 Testing Checklist

**Created:** 2026-10-17
**Branches:** cnnode `cloud_sync_17102026`, cngui `cloud_sync_hj_17102026`
**When:** run all of this at the **end of Phase 0**, before release.
**How:** manual (no test runner exists in either repo yet — see 0.7).

Status legend: ⬜ not run · ✅ pass · ❌ fail · ⏭️ skipped

---

## Setup (once)

- [ ] cnnode running locally (or on staging) with a copy of the real `.env`
- [ ] A test Postgres with at least **2 users** (A and B) — never test against production data
- [ ] Postman / `curl` ready for `POST /db/check-version`
- [ ] A valid access token for user A (log in via `/auth/users/login`, copy `tokens.accessToken`)
- [ ] cngui dev build pointing `EXPO_PUBLIC_CLIENT_API_URL` at the test server
- [ ] The **current Play Store build** (old build) installed on a second phone / emulator
- [ ] A copy of a real phone's `coinnote.db` (for 0.5)

---

## 0.1 — Lock down `/db/check-version` 🚨

**Code:** cnnode `controllers/dbversion.controller.ts`, `servies/dbversion.service.ts`; cngui `data/api/db/dbMigration.ts`
**Status:** code written (bridge). Strict version prepared for step 4.

### Server (bridge)

| # | Request | Expected | Status |
|---|---|---|---|
| S1 | No `Authorization`, body `{ userId: A, currentVersion: 0, IsFirstTimeLogin: true, GUIVersion: "1" }` | migrations + users insert with blank values and `userA@placeholder.local`; "tokenless call" log line | ⬜ |
| S2 | Same body + `Authorization: Bearer <A token>` | users insert with **A's real** profile; no tokenless log | ⬜ |
| S3 | A's token, body `userId` = B | profile of **A**; B's data never appears | ⬜ |
| S4 | `Authorization: Bearer abc` (invalid) | same as S1 (placeholder) | ⬜ |
| S5 | `IsFirstTimeLogin: false`, with and without token | migrations only, no users insert | ⬜ |
| S6 | Body `userId: "abc"`, no token | 400 "User ID is required" | ⬜ |
| S7 | Expired access token | same as S1 (placeholder) | ⬜ |

### App (new build)

| # | Scenario | Expected | Status |
|---|---|---|---|
| A1 | Fresh install / clear data → log in | logged in; profile shows real name; server: no tokenless log | ⬜ |
| A2 | Close app, wait > 15 min, reopen | opens normally; stored `accessToken` changed (refreshed) | ⬜ |
| A3 | Open app with no internet | opens as today; no new toast | ⬜ |
| A4 | Sign up as a new user | same as A1 | ⬜ |
| A5 | **Old Play build** against bridge server → fresh login | logs in; profile name blank; **no logout loop** | ⬜ |
| A6 | New app against **current (undeployed) server** | works exactly as today (header ignored) | ⬜ |

### Step 4 (strict) — run only when switching to `authMiddleware`

| # | Scenario | Expected | Status |
|---|---|---|---|
| T1 | No token | 401 in body, no migrations | ⬜ |
| T2 | Valid token | migrations + real profile | ⬜ |
| T3 | New app, normal launch after > 15 min | refresh → migrations run | ⬜ |
| T4 | Old build with forced update active | force-update screen before login; cannot reach first-login call | ⬜ |

---

## 0.2 — `TRUNCATE` → `DELETE FROM`

**Code:** cnnode `servies/dbversion.service.ts` (line with `TRUNCATE TABLE guidbversion`)
**Status:** not started

| # | Scenario | Expected | Status |
|---|---|---|---|
| 0.2-1 | Request with `currentVersion` < latest | script contains `DELETE FROM guidbversion;` and no `TRUNCATE` | ⬜ |
| 0.2-2 | Run the generated script on a SQLite copy (e.g. `sqlite3 coinnote.db`) | runs without error; `guidbversion` has exactly 1 row = latest version | ⬜ |
| 0.2-3 | Old build + new server | migration still applies (DELETE works on all builds) | ⬜ |

---

## 0.3 — Default categories (CLOSED — change not needed)

**Finding (2026-10-18):** live `defaultQuery` rows have **no `id` column** (SQLite assigns ids) and children find their parent via `(SELECT id FROM category WHERE name=... AND userid={userid})`. No duplicate-id failure is possible, so `INSERT OR IGNORE` is not needed. Server loads rows `orderBy id asc` (parents row 1 before children row 2). `CNDBUtility/default_categories.sql` is stale (old fixed-id version).
**Status:** no change; regression tests only

| # | Scenario | Expected | Status |
|---|---|---|---|
| 0.3-1 | Log in as A on a fresh phone | 11 parent + 25 child categories; every child shows under the right parent. **New build (≥ 35):** created **in the app** with UUIDs (P2-D3); **old build (≤ 34):** from server `defaultQuery` | ⬜ |
| 0.3-2 | Log out, log in as **B** on the same phone | B gets its own 36 categories, parents correct. **New build:** new UUIDs per user, created in the app; **old build:** server `defaultQuery` (ids not starting at 1) | ⬜ |
| 0.3-3 | After 0.5 fix: full migration batch incl. default queries | no errors | ⬜ |
| 0.3-4 | B has **no mobile number** (real profile path) | users row inserted, no duplicate categories on next launch — see NK item "mobilenumber '' UNIQUE" | ⬜ |

---

## 0.4 — User data as data, not pasted SQL

**Code:** cnnode `servies/dbversion.service.ts` (users insert); later cngui `runMigrations.ts`
**Status:** not started — option A or B to decide

| # | Scenario | Expected | Status |
|---|---|---|---|
| 0.4-1 | User name `D'Souza` → first login on fresh phone | logs in; profile shows `D'Souza` exactly | ⬜ |
| 0.4-2 | User name `O'Brien'); DROP TABLE bill;--` | logs in; name round-trips; `bill` table still exists | ⬜ |
| 0.4-3 | Name / city containing `;` | statement not split; value stored correctly | ⬜ |
| 0.4-4 | Old build + new server | still logs in (backward compatible) | ⬜ |

---

## 0.5 — Fix `execute()` / `query()` / `runInTransaction()`

**Code:** cngui `data/database/execute.ts`, `schemaInfo.ts` (workarounds), `runMigrations.ts`
**Status:** not started — **highest risk**, requires 0.2–0.4 deployed first

| # | Scenario | Expected | Status |
|---|---|---|---|
| 0.5-1 | Deliberately invalid SQL through `execute()` | `IsError: true` with message | ⬜ |
| 0.5-2 | Deliberately invalid SQL through `query()` | `IsError: true`; `Data` empty | ⬜ |
| 0.5-3 | Migration batch with one bad statement | whole batch rolled back; `LastMigrationVersion` **not** bumped | ⬜ |
| 0.5-4 | Full real migration batch on **fresh** device | zero errors | ⬜ |
| 0.5-5 | Full real migration batch on a **copy of a real phone DB** | zero errors | ⬜ |
| 0.5-6 | `schemaInfo.ts` checks (`hasBillStatusColumn`, `hasLocalConfigTable`) | still return correct true/false | ⬜ |
| 0.5-7 | Regression: add / edit / delete record, category, budget | all work; no new error toasts | ⬜ |
| 0.5-8 | ATT: SMS draft → notification → confirm | works as before | ⬜ |
| 0.5-9 | Backup and restore | works as before | ⬜ |
| 0.5-10 | Release to internal testing track first | no crash reports / error spikes for N days | ⬜ |

---

## 0.6 — Parameterise `billRepo.ts:104` and `:318`

**Status:** recommended **skip** (rewritten in Phase 2) — decision pending

| # | Scenario | Expected | Status |
|---|---|---|---|
| 0.6-1 | If done: filter records by category, view category-wise totals | same results as before | ⏭️ |

---

## 0.7 — CI fix + minimal tests

**Code:** cnnode `.github/workflows/build.yml`; minimal harness (TBD)
**Status:** not started — target branch to decide

| # | Scenario | Expected | Status |
|---|---|---|---|
| 0.7-1 | Open a PR into the real target branch | "Build on PR" workflow runs | ⬜ |
| 0.7-2 | Build + health check step | `"signal":"green"` passes | ⬜ |
| 0.7-3 | Minimal migration/`execute()` test (if added) | runs and passes in CI or locally | ⬜ |

---

## Release checklist (after all tests pass)

- [ ] Server deploy: 0.1 bridge, 0.2, 0.3, 0.4
- [ ] Re-run 0.1 S1–S6 and A5 against the deployed server
- [ ] App release (0.1 token header, 0.5) → internal track → production
- [ ] Raise `minSupportedVersionCode` after rollout completes
- [ ] Later: 0.1 step 4 (strict) → run T1–T4

## Results log

| Date | Who | Section | Result | Notes |
|---|---|---|---|---|
| | | | | |
