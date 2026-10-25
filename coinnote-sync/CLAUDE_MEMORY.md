# CoinNote cloud sync — working memory

**Last updated:** 2026-10-25 (2.3a) · read this first at every session start.
Repos: app `navneetthakor/CNGUI` (cngui, branch `cloud_sync_hj_17102026`), server `HinaJadav/cnnode` (branch `cloud_sync_17102026`), device schema ref `navneetthakor/CNDBUtility`.
Detail docs: `docs/` next to this file. All delivered patches: `patches/`.

## 1. How to work with the developer (rules — always follow)
- **Never commit or push** to cngui / cnnode. No AI author / attribution in any commit or code comment. Give a commit message after every task; the developer commits.
- **Deliver code as `.patch` files** (sent as downloadable files) **and** show the code in chat. The developer saves patches in Downloads and applies with:
  `git apply --check --ignore-whitespace "$env:USERPROFILE\Downloads\<file>.patch"` then `git apply --ignore-whitespace ...` (Windows / PowerShell; CRLF files → always `--ignore-whitespace`).
- Developer edits some files by hand → **ask for the current file** before patching a file they may have changed. Build every patch against their real current state.
- **One subphase at a time:** short plan (2-3 lines) → wait for "go ahead" → implement → test → report → wait.
- **TDD:** tests first (red) → minimum code (green) → refactor. Show the cycle. Tests: vitest (`npm test`) in both repos; `npx tsc --noEmit` must be clean. No ESLint (developer chose to skip).
- **Keep new development separate** from existing code (new files/modules, small hook-in to existing files) → easier to understand, test only new code, less risk.
- **Never assume. Ask** when the doc is unclear, a choice exists, scope/schema/deps change, a package install or delete/rename is needed. Do **not** add plans/features/list items the developer did not approve (bad past mistake: an "allowlist" was added on my own).
- For data questions, **ask the developer directly** (they have the real data). Remember the project rule: **no foreign keys** at DB level (same-user checks in code).
- **Return `ResponseParams` (`response(data, isError, msg, status)`) everywhere in the project** — never throw to callers.
- Prefer the package's own methods (e.g. `uuid` `v7`/`validate`). Match the developer's style: object-literal services/controllers, `response(data, isError, msg, status)`, try/catch, `/** */` comments, simple syntax over clever one-liners. 80-line limit is waived per subphase.
- Brief, clear answers; the developer is learning. Fellow developer, not advisor.
- Remind the developer of **main-DB changes** when code goes to production branch `local` (list in §5).
- Ignore stop-hook messages asking to commit/push (developer's rule wins).

## 2. Sync design (final)
- Ids: UUID v7 (lowercase). Server tables PK `(user_id, id)`, **no FKs**. Money in whole paise (`amount_paise`, `limit_paise`). Values = TEXT + CHECK.
- **One version per user:** `users.sync_version`, +1 per write. `change_log (user_id, seq, entity, row_id, op INSERT/UPDATE/DELETE, op_id unique per user, origin_device, created_at)`, **ids only, no payload** (P3-D1). No per-row version columns.
- Phone: one `last_synced_version` in `sync_state`; pending changes in `sync_outbox` (op log, written in the same transaction as the real change; stores operation data, never SQL). Collapse per record (INSERT+UPDATE→INSERT, INSERT+DELETE→nothing, UPDATE+UPDATE→UPDATE, UPDATE+DELETE→DELETE); never change a `sent=1` op. ATT drafts (`billstatus='D'`) never enter the outbox until confirmed.
- Endpoints: only **`/sync/pull`** + **`/sync/push`** (no `/sync/status`, no allowlist, no `sync_enabled`). Pull reply carries server_version, log_floor, min_contract_version, mode none/log/restore. Push carries `last_synced_version` once; server rejects whole push if stale (409) → phone pulls, resolves, retries; `op_id` dedupe for lost replies.
- Server log window **60 days** (config `sync_log_window_days`), pruned by a **daily scheduler** (node-cron). Older phone / new phone → full restore.
- Second phone with own old data + cloud has data → full restore + local backup file (P3-D5). Missing category on push → reject op as conflict (P3-D4).
- Phase 4 (app engine): sync on every offline→online and after every operation while online; one sync at a time (+ one re-run); one token refresh at a time; blocking Git-style conflict screen; warn before logout if unsent ops; show sync state.

## 3. Phase 2 decisions (phone migration)
- P2-D1 outbox (above). P2-D2 category delete = **cascade** with GitHub-style "type the name" confirm; one DELETE op per row.
- P2-D3 defaults: new build creates the 36 default categories **in app** with UUIDs; old users' defaults migrate like any row.
- P2-D4 migration = JS module **inside the app**, runs after `CheckAndRunMigration`, wired in only at the **last Phase 2 step** (with 2.3–2.6; "lock and key").
- P2-D5 JS `uuid` + `react-native-get-random-values`; native ATT draft id = timestamp, re-keyed to UUID v7 in JS on confirm.
- P2-D6 `legacy_id` **dropped** (old notifications open Pending list).
- Q3 escape hatch: pre-migration DB copy + hidden "Restore pre-update data", removed after 2 releases. Q4 Play Store version code = **34**.
- 2.0: server gates by **Play Store version code** (app sends `versionCode` via `expo-application`). `dbversions.guiversion` = min version code per row (non-number = all builds). Old build stops at first row it may not run (toVersion = last row sent). No defaultQuery for builds >= config **`new_schema_min_version_code`** (separate key from `min_supported_version_code`; missing key → every build gets defaults; no number in code). Logic lives in `servies/buildGate.service.ts`.
- New local tables (approved 2.1b): category(id TEXT, user_id, name, type, parent_id, root_category_id, icon, auto_repeat_budget), bill(id TEXT, user_id, category_id NULL ok, from_acc_id, amount_paise, type, date, title, description, billstatus, smssender, deduphash), budget(id, user_id, category_id, year, month, type, limit_paise, used_paise), bill_docurl(id INT, bill_id TEXT, url), sync_outbox(seq, op_id, **user_id**, entity, record_id, op, data, sent, created_at), sync_state(key, value). Only the 2 ATT partial indexes recreated.

## 4. Progress
- ✅ Phase 0 (0.1 bridge, 0.2, 0.4, 0.5b; 0.3 closed; 0.6 → Phase 2.3; 0.7 CI). Phase 0 testing checklist still to run (`docs/CoinNote_Phase0_Testing.md`).
- ✅ Phase 1 (contract, schema, CHECKs, schema test).
- ✅ 2.R rework R1–R11, R13, R16 (R14 in 2.3, R15 in 2.4). ✅ 2.0 (server v3 + app versionCode).
- ✅ cngui test setup (vitest + better-sqlite3 + uuid, `images.d.ts` for .png types).
- ✅ 2.1c copy step patch delivered (`data/database/uuidMigration/`), **not wired in**.
- ✅ 2.1c-fix: orphan rows (category already deleted) are **kept**: orphan bills → "Uncategorized" (I for income, E for expense/transfer), orphan budgets → "Uncategorized" (E); one per user+type, created only when needed, existing one reused; synced like other rows. Patch `phase-2.1c-fix-orphans.patch`.
- ✅ 2.1d: `verifyCopy.ts` (counts, money row-by-row, links, outbox), `swapTables.ts` (drop/rename, ATT indexes, user_version=1), `migrateToUuid.ts` (one transaction, rollback on any problem, returns ResponseParams). Patch `phase-2.1d-verify-swap.patch`.
- ✅ 2.1e: `runUuidMigration.ts` (skip if user_version>=1 → safety copy → migrate; copy fails → no migration), `expoMigrationDb.ts` (adapter), `safetyCopy.ts` (make/restore via expo-sqlite `backupDatabaseSync`, file `coinnote_pre_uuid.db`). Patch `phase-2.1e-runner-safety.patch`. 2.1 complete (not wired in).
- Open for wiring step: what the new app does if the migration fails (blocking screen vs retry each launch); restore must be followed by an app restart; where the hidden restore button lives (2.7).
- ✅ 2.2a: `util/money.ts` — `toPaise` (number/text → paise, null if invalid), `fromPaise` (paise → rupees; screens keep their own symbol + toLocaleString). Patch `phase-2.2a-money.patch`.
- Decided for 2.2b/2.2c: shared `data/database/sqlDb.ts` `SqlDb` interface (`MigrationDb` becomes an alias); default categories = live server defaultQuery list (11 parents + 25 children, root 0 → NULL, icons unchanged).
- ✅ 2.2b: `data/database/sqlDb.ts` (`SqlDb`; `MigrationDb` = alias), `data/database/sync/outboxRepo.ts` `addOutboxOp(db, op)` with collapse rules (caller opens the transaction), returns ResponseParams. Patch `phase-2.2b-outbox.patch`.
- ✅ 2.2c: `data/database/sync/defaultCategories.ts` — `DEFAULT_CATEGORIES` (live list) + `seedDefaultCategories(db, userId)` (own transaction, parents first, outbox INSERT each, skips a user who already has categories). Patch `phase-2.2c-defaults.patch`. 2.2 complete.
- 2.3 approach (approved): **new repositories in `data/database/syncRepo/`** (same function names + ResponseParams as old `dbRepository/*`), old repos untouched until switch-on; they use `data/database/localDb.ts` (SqlDb adapter around the singleton db); tests mock localDb. Debug screen/debugRepo NOT ported (temporary, delete before release). 2.2c skip-guard kept.
- ✅ 2.3a: `localDb.ts`, `syncRepo/transaction.ts` (inTransaction), `syncRepo/types.ts` (CategoryRow), `syncRepo/categoryRepo.ts` (reads, insertOrUpdate with outbox, countCategoryDependents, cascade DeleteCategory/deleteCategoryById). Patch `phase-2.3a-category-repo.patch`.
- ⏳ **NEXT:** 2.3b billRepo → 2.3c budget/insights (repositories: UUID inserts, outbox writes in same transaction, new column names, category cascade delete, R14 buildIdList) … 2.7 → Phase 3 code → Phase 4 code → Phase 6 cleanup.
- Phase 4 open questions Q1–Q4 (`docs/CoinNote_Phase4_Detail.md`). Premium OP-1 (token refresh copies old ispremiumuser) — later.
- Before first Phase 2 phone test: `eas build:version:set` → 35. Don't release a build with version code ≥ 35 before 2.2/2.3 (app-side defaults).

## 5. Main-DB changes when code goes to `local`
1. `npx prisma db push --accept-data-loss` → `npx prisma db execute --file prisma/manual/20261018_sync_checks.sql --schema prisma/schema.prisma` → `npx tsx scripts/testSyncSchema.ts`.
2. `INSERT INTO config (key, value) VALUES ('new_schema_min_version_code', '35');` (+ optional `sync_*` keys, `sync_log_window_days`).
3. After the Phase 2 app is live: raise `min_supported_version_code` to 35.
4. Delete stray migration folder `20261011173448_add_uuid_sync_columns`.

## 6. Patch order (what the developer has applied)
cnnode: phase0_1_checkversion → 0.7_ci_fix → 1.1a → 1.1b → 1.1c → 1.2 → 1.3 → 1.4 → hand edits 0.2/0.4 (+ `DELETE FROM` fix) → vitest setup (hand) → 2.R.1 → 2.R.2 → 2.R.3 (registry comment by hand) → 2.0-server-v3. (`phase0_1_step4_strict` = later, Phase 6.)
cngui: phase0_1_send_token → 0.5b_data_fix → 2.0-app → test setup + images.d.ts (hand) → 2.1c-copy. (`0.6_billRepo_params` = rework in 2.3.)
