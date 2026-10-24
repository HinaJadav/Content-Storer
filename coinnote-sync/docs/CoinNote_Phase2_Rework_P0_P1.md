# CoinNote — Rework of Phase 0 / 1 code caused by Phase 2 decisions

**Created:** 2026-10-19 · **2.R done:** 2026-10-24 (R12, R14, R15 come inside 2.0 / 2.3 / 2.4)
**Rule:** resolve every item below during Phase 2 development (sub-phase **2.R**, done first, before 2.0). Tick when the patch is applied and tested.

Status: ⬜ open · ✅ done

## Phase 1 (cnnode) — sync design changed to "one version per user + change log"

| # | File | Today (Phase 1 code) | Change to | Why (Phase 2 decision) | Status |
|---|---|---|---|---|---|
| R1 | `prisma/schema.prisma` — `category`, `bill`, `budget` | `updated_seq BigInt` + `@@index([user_id, updated_seq])` | **remove** both | no per-row version (P2-D1) | ✅ |
| R2 | `prisma/schema.prisma` — `category`, `bill`, `budget` | `last_op_id String? @db.Uuid` | **remove**; retry dedupe moves to `change_log.op_id` | op dedupe by log, not per row | ✅ |
| R3 | `prisma/schema.prisma` — `change_log` | `op` = `upsert` / `delete`; no `op_id` | `op` = `INSERT` / `UPDATE` / `DELETE`; add `op_id String @db.Uuid` + unique `(user_id, op_id)`; keep `seq` (= version), `created_at`, `origin_device` | team op names; idempotent retries | ✅ |
| R4 | `prisma/schema.prisma` — `users` | `current_seq` | ✅ **rename to `sync_version`** (P3-D7) | team named it `sync_version` | ✅ |
| R5 | `prisma/manual/20261018_sync_checks.sql` | `change_log_op_check IN ('upsert','delete')` | `IN ('INSERT','UPDATE','DELETE')` | follows R3 | ✅ |
| R6 | `src/contract/envelope.ts` | op: `kind upsert/delete`, `base_seq`; pull: `cursor` | op: `op INSERT/UPDATE/DELETE`, **no `base_seq`**; push request: `last_synced_version` once; pull: `last_synced_version` | P2-D1 sync flow | ✅ |
| R7 | `src/contract/limits.ts` + `syncLimits.service.ts` | 4 limits | add `logWindowDays` (config key `sync_log_window_days`, default **60**, P3-D2) | server log kept 30/60 days; older → full restore | ✅ |
| R8 | `src/contract/registry.ts` | header comment says deletes are op `"delete"` | update wording to `DELETE` | follows R6 | ✅ |
| R9 | `scripts/testSyncSchema.ts` | inserts use `updated_seq`; change_log op tests use `upsert`/`delete` | drop `updated_seq`; test new op values + duplicate `op_id` rejected | follows R1–R5 | ✅ |
| R10 | envelope tests (1.1c) | tests for `base_seq`, `kind` | rewrite for new shape | follows R6 | ✅ |
| R16 | `prisma/schema.prisma` `users.cloud_state` + `users_cloud_state_check` in sync_checks.sql | column `none/imported/seeded` | **remove** (unused; `sync_version > 0` replaces it) | P3-D5 | ✅ |
| R11 | `CoinNote_Phase1_Detail.md` | describes per-row `updated_seq` | update to new design | doc must match code | ✅ |

**✅ Decided (P3-D1, 2026-10-20):** `change_log` stores **ids only** (entity, row_id, op, op_id) — no payload column.

## Phase 0 (cnnode + cngui)

| # | File | Change | Why | Status |
|---|---|---|---|---|
| R12 | cnnode `servies/dbversion.service.ts` | stop sending `defaultQuery` to builds > 34; new-shape `dbversions` rows only for builds > 34 (`GUIVersion` check, today commented out) | P2-D3, F-C, Q4 = 34 (this is 2.0) | ✅ |
| R13 | `CoinNote_Phase0_Testing.md` 0.3-1 / 0.3-2 | new build: defaults created **in app** with UUIDs, not from server | P2-D3 | ✅ |
| R14 | `cngui_0.6_billRepo_params.patch` (`buildIdList`) | rework for UUID strings (`?` placeholders, no numbers) | moved to Phase 2 (2.3) | ⬜ |
| R15 | cngui `CLAUDE.md` `att-open` section | says "not a route" → describe `app/att-open.tsx` | F-D confirmed (2.4) | ⬜ |

## Main-DB reminder (when code goes to `local`)
After R1–R5 the production steps stay the same: `npx prisma db push` → `prisma db execute --file prisma/manual/20261018_sync_checks.sql` → `npx tsx scripts/testSyncSchema.ts`. Tables are still empty, so dropping `updated_seq` / `last_op_id` loses nothing.

## Phase 3 additions (new, not rework) — returned by `/sync/pull`

**Decided (2026-10-20): no `/sync/status` endpoint.** These fields come at the start of every `/sync/pull` reply; pull with an up-to-date `last_synced_version` returns them with an empty change list.

| Field | Exists? | Plan |
|---|---|---|
| `server_version` | ✅ `users.sync_version` | return as is |
| `min_contract_version` | ✅ `limits.ts` `minContractVersion` / config key `sync_min_contract_version` (1.1b) | return as is |
| `log_floor` | ❌ | **no new column** — `SELECT MIN(seq) FROM change_log WHERE user_id = ?` (uses PK index) |
