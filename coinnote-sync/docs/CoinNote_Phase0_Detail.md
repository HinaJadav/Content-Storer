# CoinNote Cloud Sync — Phase 0 in detail

**Date:** 2026-10-17
**Branches audited:** cngui `local` @ `b2b43d3`, cnnode `local` @ `9af7fda`
**Status:** plan only, no code written yet

---

## Goal

Make the existing app **honest about failures** and **close two security holes** before building sync on top of it.
Nothing in Phase 0 is a sync feature. It is groundwork: sync cannot be trusted while errors are hidden and personal data leaks.

Not every item is equally important. Each one has an honest rating below.

---

## 0.1 🚨 Lock down `/db/check-version` — 🔴 MUST, FIRST

**Problem**
- `cnnode/src/routes/dbversion.routes.ts` has no `authMiddleware`.
- `dbversion.service.ts:95–96` puts the name, email, mobile, age, gender, city and profession of **whatever `userId` the caller sends** into the reply.
- Anyone can collect all ~30 users' details in a minute.

**Change (in words)**
1. Server: require a valid access token on this route, and take `userId` from the token (`req.user.userid`), not from the request body.
2. App: `data/api/db/dbMigration.ts` must send the `Authorization` header (via `getAccessToken()`).

**⚠️ Catch: old app versions already on users' phones**
Builds from `Live` / `gui_live` do not send a token. If the server starts requiring one, those phones stop receiving migrations (including new ATT SMS patterns), and a first-time login there won't create the local `users` row.

| Option | How it works | Pros | Cons |
|---|---|---|---|
| **A. Enforce immediately** | Calls without a token are rejected | Leak closes today | Old builds break until users update |
| **B. Two steps** | Ship an app that sends the token, enforce once most users have updated | Nothing breaks | Leak stays open for weeks |
| **C. Strip personal data now, enforce later** | Tokenless calls still get migrations but **never personal data**; calls with a token get everything; switch to A later | Leak closes today, migrations keep working | On old builds a first login on a new phone misses the local profile row (name/email screens empty until they update) |

**Recommendation:** C.

---

## 0.2 `TRUNCATE` → `DELETE FROM` — 🟡 MUST (only because of 0.5)

**Problem**
- `dbversion.service.ts:70` sends `TRUNCATE TABLE guidbversion;`.
- SQLite has no `TRUNCATE`, so the statement **fails on every phone**. Nobody notices today because `execute()` hides the error.

**Why it must be done:** once 0.5 makes errors visible, this failing statement makes the **whole migration batch roll back on every phone**. Fix and deploy it **before** 0.5 reaches users.

**Risk:** very low. `DELETE FROM` works on old and new builds. One-word server change.

---

## 0.3 Default categories → `INSERT OR IGNORE` — 🟡 MUST (because of 0.5), also fixes a real bug

**Problem**
- Default categories are inserted with fixed ids 1–67 on every first login per phone.
- A **second account** on the same phone collides with those ids, every insert fails silently, and **the second account gets no categories at all.** This is a real bug today.

**Why now:** same as 0.2. After 0.5 this failure would roll back the whole batch.

**Note:** Phase 2 moves categories to UUIDs, so this is a **stopgap**: small and safe.

**Where:** the `defaultQuery` rows in Postgres (content came from CNDBUtility `default_categories.sql`). A **server data change**, not a code change.

---

## 0.4 Send user data as data, not pasted SQL — 🟡 SHOULD (with an old-builds catch)

**Problem**
- `dbversion.service.ts:96` builds `INSERT INTO users ... VALUES (..., '${userData.name}', ...)`.
- A name like `D'Souza` breaks the statement (realistic in India).
- A crafted name can inject SQL, and the phone **trusts it because it is signed**.
- `script.split(";")` means a `;` inside a name cuts a statement in half.

**Proper fix (plan F8):** send the user as JSON inside the signed envelope; `runMigrations.ts` inserts it with `?` placeholders.

**Catch:** old builds don't understand the new format.

| Option | How it works | Pros | Cons |
|---|---|---|---|
| **A. New format for new builds only** | Check `GUIVersion`: old builds get SQL, new builds get JSON | Correct and safe for new builds | Two server code paths until old builds are gone |
| **B. Interim escaping** | Keep the SQL, double every `'` → `''`, reject `;` in profile fields | Works for every build today, tiny change | Still SQL built from text — a patch, not a fix |

**Recommendation:** B now, A in Phase 2 (which ships a new build and migration anyway).

---

## 0.5 Fix `execute()` / `query()` / `runInTransaction()` — 🔴 MUST before any sync

**Problem**
`util/response.ts` takes values **in order**: `response(Data, IsError = false, ErrorMessage = "", StatusCode = 200)`.
`data/database/execute.ts` passes **one object**: `response({ IsError: true, ErrorMessage: "..." })`.
1. The whole object lands in `Data`.
2. `IsError` takes its default: `false`.
3. Every caller checks the outer `result.IsError`, which is always `false`.

Effects: `runMigrations.ts` `ROLLBACK` never runs; every repository reports "saved" even when SQLite refused the write.

**Change (in words):** pass `IsError: true` and the message as **separate arguments** to `response()`.

**⚠️ Why it is risky** — it reveals failures that have been hidden for months:
- any other broken statement in the migration batch will now roll the batch back,
- screens that "saved" fine may start showing errors,
- `schemaInfo.ts` has workarounds built around the bug (`result.Data?.Data`) that must be updated at the same time.

**How to make it safe**
1. Deploy 0.2, 0.3 and 0.4 to the server **first**.
2. Copy a **real phone's `coinnote.db`** and run the full migration batch against it with the fixed `execute()`. Zero errors means it's safe.
3. Release to the **internal testing track** first (`internal-testing` / `closed-testing` branches exist).

**Rollback:** app-only change, so re-ship the previous build. Server changes 0.2–0.4 can stay.

---

## 0.6 Parameterise `billRepo.ts:104` and `:318` — 🟢 LOW, CAN SKIP

**Problem:** `"b.toaccid IN (" + toAccId + ")"` builds SQL from strings.

**Honest view:** the values are **category ids from your own database**, not user-typed text, so there is no real injection path today. Phase 2 rewrites these queries for UUIDs anyway. **Recommend skipping in Phase 0.**

---

## 0.7 Test runners and CI — 🟡 SHOULD (small)

- **Fix CI:** `cnnode/.github/workflows/build.yml` targets `s-master`, which doesn't exist. Point it at the branch you actually merge into. One line.
- **Minimal test harness** for the migration runner and `execute()`, so the 0.5 safety check is repeatable.
- **Full test setup** (`vitest`, `better-sqlite3`): can grow over time; don't block Phase 0 on it.

---

## Summary

| Item | Importance | Repo | Effort | Breaks old builds? |
|---|---|---|---|---|
| 0.1 Lock down check-version | 🔴 must, first | cnnode + cngui | small | Option C: no |
| 0.2 `TRUNCATE` → `DELETE` | 🟡 must, before 0.5 | cnnode | tiny | no |
| 0.3 `INSERT OR IGNORE` | 🟡 must, before 0.5 | Postgres data | tiny | no |
| 0.4 User data as data | 🟡 should | cnnode (+ cngui later) | small with option B | Option B: no |
| 0.5 Fix `execute()` | 🔴 must, before sync | cngui | small code, **high risk** | app-only |
| 0.6 `billRepo` parameters | 🟢 skip | cngui | small | — |
| 0.7 CI fix + minimal tests | 🟡 should | both | small | — |

## Release order

```
Server deploy (0.1-C, 0.2, 0.3, 0.4-B)
   → test 0.5 against a real DB copy
   → app release (0.1 token header, 0.5) to internal track
   → everyone
```

---

## Decisions needed

1. **0.1:** option A, B or C?
2. **0.4:** option A or B for now?
3. **0.6:** skip it?
4. **0.7:** which cnnode branch do you merge into (`master`, `local`, other), so CI points at it?
