# CoinNote — Over-the-Air (OTA) Updates: discussion notes

**Date:** 2026-10-17
**Status:** idea only, to be discussed later. Nothing implemented.
**Checked in code (cngui `local` @ `b2b43d3`):** `expo-updates` is **not** installed; no `updates` / `runtimeVersion` config in `app.json`, `app.config.js` or `eas.json`. So today every change, even a one-line JS fix, needs a full Play Store release.

---

## 1. What an OTA update is

Sending new app code to phones **directly from a server**, without the user installing a new version from the Play Store.

A React Native / Expo app has two parts:

| Part | Examples in CoinNote | Built into the APK |
|---|---|---|
| **Native** | `plugins/att/*.java` (ATT SMS receiver), permissions, native libraries, `app.json` native settings | yes, fixed per build |
| **JavaScript bundle** | screens, `features/*Process.ts`, `data/api/*` (e.g. `dbMigration.ts`), repositories | yes, but **replaceable** with `expo-updates` |

With **`expo-updates`** (Expo's **EAS Update** service), the JS bundle can be replaced over the air.

---

## 2. How it works

### 2.1 One-time setup (in a future Play Store release)

- Add the `expo-updates` library.
- Configure in `app.json` / `eas.json`:
  - **`runtimeVersion`** — a label for the native part (e.g. `"1.0.0"`). Only JS bundles made for this native version are sent to this build.
  - **`channel`** — which update stream the build listens to (e.g. `production`, `internal`).
- Build with EAS and release on the Play Store as usual.

From then on, the installed app knows **where to look** for new JS and **which updates fit it**.

### 2.2 Publishing a JS fix later

1. Change `.ts` / `.tsx` files.
2. Run `eas update --channel production`.
3. EAS bundles the JS + assets and uploads them to Expo's servers (CDN), labelled with channel and runtime version.
4. No Play Store release, no review.

### 2.3 On the user's phone

```
User opens app
   │
   ├─► app starts with the JS bundle it already has (no waiting)
   │
   ├─► in background: asks Expo server "any new bundle for
   │   channel=production, runtimeVersion=1.0.0?"
   │
   ├─► yes → downloads and stores it
   │
   └─► NEXT launch → app runs the new bundle
```

- **Default:** the update applies on the **next** launch.
- **Immediate (optional):** check at launch and call `Updates.reloadAsync()` to restart with it right away (for urgent fixes).
- **Safety:** if a new bundle crashes on launch, `expo-updates` falls back to the previous working bundle.

---

## 3. What OTA can and cannot change

| Change | Path |
|---|---|
| JS/TS logic, screens, API calls (`dbMigration.ts`, `token.ts`, …), repositories, process files | ✅ `eas update` |
| Native code (`plugins/att/*.java`), permissions, new native libraries, native `app.json` settings | ❌ new Play Store build **and** bump `runtimeVersion` |

Bumping `runtimeVersion` on every native change is what stops an old native build from receiving JS that needs new native code.

---

## 4. Why it matters for CoinNote

| Situation in this project | Without OTA | With OTA (after it ships) |
|---|---|---|
| Phase 0.1 — sending the token from `dbMigration.ts` | Play release + wait for users to update; temporary tokenless path needed | Same-day fix for every build that has `expo-updates` |
| Bug fixes in sync logic (Phase 4) | Each fix = Play release | JS-only fixes ship immediately |
| Token gaps 1–3 fixes in `data/api/token.ts` | Play release | OTA |
| Native ATT changes (`plugins/att/`) | Play release | Still Play release |

---

## 5. Limits and cautions

1. **Builds already installed cannot receive OTA.** Only builds released *after* `expo-updates` is added. The temporary tokenless path in 0.1 is still needed for today's builds.
2. **Cost:** EAS Update has a free tier and paid tiers based on monthly active users. Check Expo's current pricing before deciding (not quoted here).
3. **Play policy:** JS updates are allowed as long as they don't change the app's core purpose or add behaviour that would fail review. Large feature changes should still go through the store.
4. **Testing discipline:** publish to an `internal` channel for your own devices first, then `production`.
5. **Runtime version mistakes are the main risk:** shipping JS that calls new native code to an old native build crashes the app. Rule: any change under `plugins/att/`, any new native library, or any native `app.json` change → bump `runtimeVersion`.
6. **Interaction with the forced update** (`features/AppUpdate`, `minSupportedVersionCode`): forced Play updates are still needed for native changes; OTA covers JS-only changes.
7. **Signed migrations are unaffected:** schema SQL still comes from the backend signed pipeline (`/db/check-version`), not from OTA.

---

## 6. Questions to discuss later

1. Do we want OTA at all, or keep Play-only releases?
2. If yes, in which release do we add `expo-updates` (it needs one Play release to start)?
3. Channels: `production` + `internal`? Do `closed-testing` / `internal-testing` branches map to channels?
4. Runtime version policy: manual string, or Expo's `"appVersion"` / `"fingerprint"` policy?
5. Apply updates on next launch, or force reload for critical fixes?
6. Who is allowed to run `eas update` to production (you, Navneet, both)?
7. Budget: is the free tier enough for our active users?
8. Does the Play Store data-safety / ATT disclosure need any update for OTA? (Probably not, but confirm.)

---

## 7. Decision log entry (to fill once decided)

`2026-__-__ | OTA updates: __ | rejected: __ | reason: __ | areas: package.json, app.json, eas.json, release process`
