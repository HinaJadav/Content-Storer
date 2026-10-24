# 0.5b — Remove nested `Data.Data` (cngui)

**Branch:** cngui `cloud_sync_hj_17102026` · **Do after 0.5** · Generated from code on 2026-10-18

## Step 1 — `data/database/execute.ts` (core change)

Replace the three functions' return lines so the rows / result are the top-level `Data`:

```ts
// Execute a raw SQL statement (INSERT, UPDATE, DELETE)
// Data is null; check IsError / ErrorMessage
export function execute(sql: string, args: any[] = []) {
  try {
    db.runSync(sql, args);
  } catch (error) {
    const message = `SQL Execution Error: ${error instanceof Error ? error.message : String(error)}`;
    return response(null, true, message, 500);
  }
  return response(null, false, "", 200);
}

// Execute a raw SQL query (SELECT)
// Data is the rows array directly (was Data.Data before)
export function query<T = any>(sql: string, args: any[] = []) {
  let result: T[] = [];
  try {
    result = db.getAllSync<T>(sql, args);
  } catch (error) {
    const message = `SQL Query Error: ${error instanceof Error ? error.message : String(error)}`;
    return response<T[]>([], true, message, 500);
  }
  return response<T[]>(result, false, "", 200);
}

export function runInTransaction(fn: () => void) {
  try {
    db.withTransactionSync(() => {
      fn();
    });
    return response(null, false, "", 200);
  } catch (error) {
    const message = `Transaction failed: ${error instanceof Error ? error.message : String(error)}`;
    return response(null, true, message, 500);
  }
}
```

## Step 2 — Rule for every line below

| Old | New |
|---|---|
| `x.Data.Data` | `x.Data` |
| `x.Data?.Data` | `x.Data` |
| `x.Data.Data[0]` | `x.Data[0]` |
| `x.Data?.IsError` | `x.IsError` |
| `x.Data.ErrorMessage` | `x.ErrorMessage` |

**Special cases:**
- `features/Debug/AttDebugProcess.ts:204` → `if (!r.IsError) written++;`
- `features/Debug/AttDebugProcess.ts:249` → `if (res.IsError) return \`Insert failed: ${res.ErrorMessage}\`;`
- `data/database/dbRepository/notificationRepo.ts:7` is a **comment** describing the old bug — update it to: `query failure -> result.IsError (top-level)`
- `data/database/schemaInfo.ts`: `result.Data?.Data ?? []` → `result.Data ?? []`, and `result.Data?.Data?.length` → `result.Data?.length`

## Step 3 — All places (83 lines, 31 files)

Tick each one as you change it.

### `app/(protected)/modals/AddCategory/SelectParentCategoryScreen.tsx`

- [ ] **L49** `setCurrent(result.Data.Data);`
- [ ] **L56** `if (result.Data.Data && result.Data.Data.length > 0) {`

### `app/(protected)/modals/AddRecord/SelectCategoryScreen.tsx`

- [ ] **L85** `setCurrent(result.Data.Data);`
- [ ] **L92** `if (result.Data.Data && result.Data.Data.length > 0) {`

### `app/(protected)/modals/Profile/CurrencySetup.tsx`

- [ ] **L76** `(await getConfigValueContext("currency"))?.Data?.Data?.[0]?.value ??`

### `app/(protected)/modals/ViewRecord/ViewRecordScreen.tsx`

- [ ] **L30** `////console.log(result.Data.Data[0]);`
- [ ] **L33** `const bill = result.Data.Data[0];`

### `components/insights/EFofIFgraph.tsx`

- [ ] **L110** `const fetched: EForIfGraphDataParams[] = dbData.Data.Data.map(`

### `data/database/dbRepository/backupRepo.ts`

- [ ] **L7** `const inner = result?.Data?.Data ?? result?.Data;`

### `data/database/dbRepository/budgetRepo.ts`

- [ ] **L168** `if (checkResult.Data.Data && checkResult.Data.Data.length > 0) {`

### `data/database/dbRepository/configRepo.ts`

- [ ] **L22** `// titleData.Data.Data[0].name`

### `data/database/dbRepository/debugRepo.ts`

- [ ] **L23** `return !result.IsError && (result.Data?.Data?.length ?? 0) > 0;`
- [ ] **L29** `const rows: { name: string }[] = result.Data?.Data ?? [];`
- [ ] **L38** `return result.Data?.Data ?? [];`
- [ ] **L46** `return result.Data?.Data ?? [];`
- [ ] **L56** `return result.Data?.Data ?? [];`
- [ ] **L70** `return result.Data?.Data ?? [];`
- [ ] **L78** `return Number(result.Data?.Data?.[0]?.c ?? 0);`

### `data/database/dbRepository/localConfigRepo.ts`

- [ ] **L42** `return (result.Data?.Data?.[0] as any)?.value ?? null;`

### `data/database/dbRepository/notificationRepo.ts`

- [ ] **L6** `//   rows           -> result.Data.Data`
- [ ] **L7** `//   query failure  -> result.Data.IsError (top-level IsError stays false)`

### `data/database/dbRepository/smsPatternRepo.ts`

- [ ] **L60** `const rows = (result.Data?.Data as SmsSenderPattern[] | undefined) ?? [];`
- [ ] **L77** `const rows = (result.Data?.Data as SmsSenderPattern[] | undefined) ?? [];`
- [ ] **L138** `((result.Data?.Data as { count: number }[] | undefined)?.[0]?.count ?? 0) > 0;`

### `data/database/schemaInfo.ts`

- [ ] **L33** `const columns: { name: string }[] = result.Data?.Data ?? [];`
- [ ] **L35** `// on a query error `Data.Data` is absent, so this lands on false — and an unfiltered`
- [ ] **L59** `hasLocalConfig = !result.IsError && (result.Data?.Data?.length ?? 0) > 0;`

### `features/Budget/BudgetProcess.ts`

- [ ] **L35** `return result.Data.Data[0].count > 0;`
- [ ] **L49** `return result.Data.Data[0].count > 0;`

### `features/Budget/BudgetScreen.tsx`

- [ ] **L121** `setListA(result.Data.Data);`

### `features/Category/CategoryProcess.ts`

- [ ] **L33** `if (!result.IsError && result.Data && result.Data.Data) {`
- [ ] **L34** `const countResult = result.Data.Data[0] as any;`

### `features/Category/CategoryScreen.tsx`

- [ ] **L89** `setListA(expense.Data.Data);`
- [ ] **L90** `setListB(income.Data.Data);`
- [ ] **L98** `setListA(result.Data.Data);`

### `features/Debug/AttDebugProcess.ts`

- [ ] **L204** `if (!r.Data?.IsError) written++;`
- [ ] **L249** `if (res.Data?.IsError) return `Insert failed: ${res.Data.ErrorMessage}`;`

### `features/Home/HomeProcess.ts`

- [ ] **L19** `const rows = Array.isArray(sqlData.Data.Data) ? sqlData.Data.Data : [];`
- [ ] **L88** `const data = sqlData.Data.Data[0] || {};`

### `features/Insights/InsightsProcess.ts`

- [ ] **L23** `return result.Data.Data[0].count > 0;`

### `features/Notifications/NotificationProcess.ts`

- [ ] **L55** `const inner = result?.Data?.Data;`

### `features/Pending/PendingProcess.ts`

- [ ] **L26** `const rows = Array.isArray(sqlData.Data.Data) ? sqlData.Data.Data : [];`
- [ ] **L51** `return Number(sqlData.Data.Data?.[0]?.count ?? 0);`

### `features/Profile/AboutUsProcess.ts`

- [ ] **L23** `const email = result.Data?.Data?.[0]?.value;`

### `features/Profile/FeedbackProcess.ts`

- [ ] **L18** `const email = result.Data?.Data?.[0]?.value;`

### `features/Profile/HelpProcess.ts`

- [ ] **L24** `const raw = result.Data.Data[0]?.value;`

### `features/model/AddCategoryProcess.ts`

- [ ] **L24** `if (!response.IsError && response.Data.Data.length > 0) {`
- [ ] **L26** `id: response.Data.Data[0].id,`
- [ ] **L27** `name: response.Data.Data[0].name,`
- [ ] **L28** `typeofcategory: response.Data.Data[0].typeofcategory,`
- [ ] **L29** `icon: response.Data.Data[0].icon,`
- [ ] **L30** `parentid: response.Data.Data[0].parentid,`
- [ ] **L41** `if (!parentCat.IsError && parentCat.Data.Data.length > 0) {`
- [ ] **L42** `response.Data.parentCatName = parentCat.Data.Data[0].name;`
- [ ] **L43** `response.Data.parentCatIcon = parentCat.Data.Data[0].icon;`

### `features/model/AddRecordProcess.ts`

- [ ] **L44** `if (!response.IsError && response.Data.Data.length > 0) {`
- [ ] **L46** `id: response.Data.Data[0].id,`
- [ ] **L47** `amount: response.Data.Data[0].amount,`
- [ ] **L48** `catId: response.Data.Data[0].toaccid,`
- [ ] **L49** `date: response.Data.Data[0].date,`
- [ ] **L50** `typeofbill: response.Data.Data[0].typeofbill,`
- [ ] **L51** `title: response.Data.Data[0].title,`
- [ ] **L52** `description: response.Data.Data[0].description,`
- [ ] **L53** `docurl: response.Data.Data[0].docurl`
- [ ] **L54** `? response.Data.Data[0].docurl.split(",")`
- [ ] **L56** `categoryName: response.Data.Data[0].categoryName,`
- [ ] **L57** `categoryIcon: response.Data.Data[0].image,`

### `features/model/RateAppProcess.ts`

- [ ] **L11** `await Linking.openURL(result.Data.Data[0].value);`
- [ ] **L22** `message: `CoinNote - Ultimate Money Management App 🚀\n\nDownload now 👇\n${result.Data.Data[0].value}`,`

### `features/model/ViewCategoryWiseRecrodProcess.ts`

- [ ] **L45** `childCatIdsRes.Data?.Data?.map((item: { ids: number }) =>`
- [ ] **L61** `const rows = Array.isArray(sqlData.Data.Data) ? sqlData.Data.Data : [];`
- [ ] **L129** `if (!response.IsError && response.Data?.Data?.length > 0) {`
- [ ] **L131** `id: response.Data.Data[0].id,`
- [ ] **L132** `name: response.Data.Data[0].name,`
- [ ] **L133** `typeofcategory: response.Data.Data[0].typeofcategory,`
- [ ] **L134** `icon: response.Data.Data[0].icon,`
- [ ] **L135** `parentid: response.Data.Data[0].parentid,`
- [ ] **L143** `childCatIdsRes.Data?.Data?.map((item: { ids: number }) =>`
- [ ] **L153** `response.Data.totalExpense = totalExpenseRes.Data?.Data[0].total || 0;`

### `hooks/useAuth.ts`

- [ ] **L149** `if (UserData && UserData.Data.Data.length > 0 && !UserData.IsError) {`
- [ ] **L152** `name: UserData.Data.Data[0].name,`
- [ ] **L168** `dispatch(changeCurrency(currencyValue?.Data?.Data?.[0]?.value || "INR"));`

### `util/utilFunctions.ts`

- [ ] **L102** `const IsFirstTimeLogin = GetUserById(Number(userId)).Data.Data.length === 0;`

## Step 4 — Verify

1. Search again — should find **0** results:
   - regex `\.Data\??\.Data\b` and `Data\??\.IsError` across `*.ts, *.tsx` (ignore `resData.Data` from API calls)
2. `npx tsc --noEmit` → same 53 errors as before, none new
3. Click through: Home, Records list, Add/Edit record, Categories, Budget, Insights, Pending, Profile, Notifications, ATT debug, Backup/Restore

**Note:** `ResponseParams.Data` is typed `T | any`, so TypeScript will NOT catch a missed `.Data.Data` — the search in step 4.1 is the safety net.
