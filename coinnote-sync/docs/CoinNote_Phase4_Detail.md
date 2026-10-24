# CoinNote Cloud Sync — Phase 4 in detail (sync engine in the app)

**Date:** 2026-10-20
**Repo:** cngui `cloud_sync_hj_17102026`
**Status:** analysis — decisions P4-D1 … P4-D10 agreed; open questions at the end
**Depends on:** Phase 2 (phone data sync-ready, `sync_outbox`, `sync_state`), Phase 3 (`/sync/pull`, `/sync/push`)

## Decision tracker

| # | Topic | Final call |
|---|---|---|
| P4-D1 | When sync runs | ✅ (a) every **offline → online** change — at app open (after splash/login, on Home) or later while the app is open; (b) **after every operation** while online. Runs in the background. |
| P4-D2 | Pull | ✅ inside 60-day server log window → pull log; outside → full restore (P3-D2) |
| P4-D3 | Conflict detection | ✅ same UUID in pulled data and in local log = conflict |
| P4-D4 | Conflict resolution | ✅ **blocking popup** — user can't do anything else until resolved; Git-style screen, old vs new side by side; user picks; then sync |
| P4-D5 | Push | ✅ batches (≤ 500 ops / 512 KB); stale → pull, re-check, push again; lost reply → resend same `op_id`s |
| P4-D6 | First sync | ✅ cloud has data → full restore + local backup of old phone data (P3-D5) |
| P4-D7 | Failures | ✅ every DB step in a transaction, rollback on failure; **one token refresh at a time**; local log kept on re-login after session expiry |
| P4-D8 | Sync state | ✅ shown to the user |
| P4-D9 | Concurrency | ✅ **one sync at a time**; operations during a sync → one more sync right after |
| P4-D10 | Logout with unsynced changes | ✅ **warn the user** before logout |
| Q1–Q4 | see "Open questions" | ⏳ |

---

## Problem statement

After Phase 3 the server can sync and after Phase 2 the phone data is sync-ready, but nothing in the app connects them. Phase 4 makes the app decide when to sync, pull safely, find and resolve conflicts, push the local log, handle first sync, survive failures, and show sync state.
**Goal:** user works offline exactly as today; data stays the same across devices; the user is asked only on a real conflict.

---

## What I checked in the code

| What | Today | Effect on Phase 4 |
|---|---|---|
| Network | `@react-native-community/netinfo` installed; used only as one-time `NetInfo.fetch()` in Login/SignUp | need a `NetInfo.addEventListener` for offline → online (P4-D1) |
| Token | `data/api/token.ts` `getAccessToken()` — no lock; 2 parallel calls both refresh | second refresh reuses the rotated token → server "security violation" → logout. Lock needed (P4-D7) |
| Token errors | `getAccessToken()` shows a **toast** on every failure ("Session expired", "Network error") | background sync would show toasts the user didn't ask for → see Q2 |
| Logout | `hooks/useAuth.ts` `logout()` clears tokens + ATT state, keeps the local DB | warning goes before this (P4-D10) |
| Screen refresh | 7 screens reload on `useFocusEffect` only | a pull that changes data while a screen is open won't show until the user leaves and returns → see Q3 |
| Packages | `react-native-get-random-values`, `expo-crypto` present; `uuid` **not installed** | installed in Phase 2 (2.2) |

---

## Sync flow (from the decisions)

```
trigger (online again / operation done)
  └─ sync already running? → mark "run again" and stop
  1. PULL  /sync/pull { last_synced_version }
       mode none    → go to 3
       mode log     → changes after last_synced_version (paged)
       mode restore → full data (paged) into temp tables
  2. CONFLICTS  pulled record UUID also in local log?
       no  → apply pulled changes in one transaction (restore: swap temp tables)
       yes → blocking popup → Git-style screen → user picks per record
             keep mine  → keep my op in local log, apply the rest
             keep cloud → drop my op, apply cloud version
       last_synced_version = server_version
  3. PUSH  local log not empty → /sync/push in batches
       ok    → delete pushed ops, last_synced_version = new server version
       stale → back to 1
       no reply → retry same op_ids
  4. done → "run again" set? → start once more
```

First sync (P4-D6): `last_synced_version = 0`
- cloud empty (`server_version = 0`) → push everything (big batched upload).
- cloud has data → save local backup file → full restore → do not push old local data.

---

## Sub-phases

| Sub | What | Files (planned) | Size |
|---|---|---|---|
| **4.1** | Sync API client: `pull`, `push` (never throw, return `ResponseParams`, like `dbMigration.ts`) | `data/api/sync/syncApi.ts` | small |
| **4.2** | One token refresh at a time (shared promise in `getAccessToken`) | `data/api/token.ts` | small |
| **4.3** | Sync engine: one-at-a-time lock + "run again", triggers (NetInfo listener, after each repo write) | `features/Sync/SyncProcess.ts`, `hooks/useSync.ts`, `app/_layout.tsx` | medium |
| **4.4** | Apply pull: log mode + restore mode (temp tables + swap; keep drafts, `bill_docurl`, `sync_outbox`) | `data/database/dbRepository/syncRepo.ts` | medium |
| **4.5** | Conflict detection + blocking popup + Git-style compare screen | `features/Sync/ConflictProcess.ts`, `app/(protected)/modals/SyncConflict/` | **large** |
| **4.6** | Push: batches, stale loop, lost-reply retry | `features/Sync/SyncProcess.ts` | medium |
| **4.7** | First sync: big upload / restore + local backup | `features/Sync/FirstSyncProcess.ts` | medium |
| **4.8** | Sync state indicator + logout warning | `components/common/composite/`, `hooks/useAuth.ts`, Profile logout | small |
| **4.9** | Tests: 2 phones + server, offline edits, conflicts, kill mid-sync, logout warning | checklist md | medium |

---

## Failure modes

| What breaks | User sees | Prevent / recover |
|---|---|---|
| App killed during pull apply | nothing | one transaction → old data; next sync repeats |
| App killed during restore download | nothing | temp tables; swap only at the end |
| App killed after server saved push | nothing | same `op_id` resent; server skips duplicates |
| Two token refreshes at once | logged out | one refresh at a time (4.2) |
| Session expired while offline | login screen | local log kept; synced after login |
| Another phone pushed meanwhile | nothing | stale → pull → re-check → push |
| Many quick operations | nothing | one sync at a time + one re-run |
| Logout with unsent ops | warning | P4-D10 |
| Conflict popup closed by killing app | popup again next sync | conflicts found again from local log + pull |

---

## Impact on current code

**a. Changes:** `token.ts` (lock), `useAuth.ts` logout, `_layout.tsx` (start sync engine), every repo write calls "sync after operation" (one shared helper), new Sync feature folder + conflict modal.
**b. Order:** 4.1 → 4.2 → 4.3 → 4.4 → 4.6 → 4.5 → 4.7 → 4.8 → 4.9.
**c. Unchanged:** screens' own data loading, ATT native, migrations pipeline.
**d. Risk:** high — first time user data leaves/enters the phone automatically.
**e. Effort:** large (biggest after Phase 2).

---

## Open questions (found during analysis — not decided)

| # | Question |
|---|---|
| Q1 | **Another user logs in on the same phone** while the first user still has unsent ops: today local data stays per user id. Should the local log be per user (sync only the logged-in user's ops)? |
| Q2 | **Background toasts:** `getAccessToken()` shows a toast on every failure. During background sync, hide them (show only the sync state)? |
| Q3 | **Open screen after a pull:** screens reload only on focus. Refresh the visible screen when a pull changed data, or is "updates on next visit" OK? |
| Q4 | **Compliance before going live:** your cloud plan (F5) said finance data leaving the phone needs updates to the Play data-safety form, ATT disclosure and privacy policy. Still needed before Phase 4 release? |

## Decision log entry (to fill)

`2026-10-__ | Phase 4: triggers=offline→online + every operation, pull=log/restore, conflict=same UUID → blocking Git-style screen, push=batches/stale/op_id retry, first sync=restore+backup, one sync at a time, one token refresh at a time, logout=warn | rejected: __ | reason: __ | cngui data/api/sync, data/api/token.ts, features/Sync, hooks/useAuth.ts, app/_layout.tsx`
