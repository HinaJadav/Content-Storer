# Content-Storer

An Android app for saving text you type often (UPI ID, address, intro message, email signature) as
**key → value snippets**, then pasting it anywhere from the app, a custom keyboard, a home-screen widget,
a Quick Settings tile or the text-selection menu.

Built with **React Native + Expo (SDK 57)** and **TypeScript**, following the
[Content Storer design](https://claude.ai/artifact/QSAgfKtkjXAsQ4r1TT9qBR).

## How this project is built

The app is built in **steps**, and every step is split into **small tasks**. Each task goes through
the same loop, and the next task starts only after the current one is reviewed and tested:

1. **Learn**: the new topic the task needs, explained before any code.
2. **Build**: a small change, only what the task needs.
3. **Review**: walk through the code together, line by line if needed.
4. **Test**: run it and confirm it works.
5. **Move on**: mark the task ✅ and start the next one.

## Task tracker

### Step 1: Project setup and design tokens

| Task | What | Status |
|---|---|---|
| 1.1 | Create the Expo + TypeScript project | ✅ Built · 🔍 review pending |
| 1.2 | Design tokens: colours, radii, spacing, type (`src/theme/tokens.ts`) | ✅ Built · 🔍 review pending |
| 1.3 | Light / dark theme with React Context (`src/theme/ThemeProvider.tsx`) | ✅ Built · 🔍 review pending |
| 1.4 | Load Geist fonts (`src/theme/fonts.ts`) | ✅ Built · 🔍 review pending |
| 1.5 | Token preview screen to test it all (`App.tsx`) | ✅ Built · 🔍 review pending |

### Step 2: Snippet database

| Task | What | Status |
|---|---|---|
| 2.1 | Install `expo-sqlite` and open the database | ⬜ |
| 2.2 | Create the `snippets` table | ⬜ |
| 2.3 | `Snippet` type + read all snippets | ⬜ |
| 2.4 | Add a snippet | ⬜ |
| 2.5 | Edit and delete a snippet | ⬜ |
| 2.6 | Pin / unpin a snippet | ⬜ |

Steps 3–8 are broken into tasks when we reach them.

## Roadmap

| Step | Learn | Build | Status |
|---|---|---|---|
| 1 | Expo, React Native core components, styling, theming with Context, custom fonts | Project setup + design tokens + light/dark theme | 🔍 Built, review pending |
| 2 | SQLite on a device (`expo-sqlite`), SQL basics, the repository pattern | Snippet database: create, read, update, delete, pin | ⏳ Next |
| 3 | File-based navigation with Expo Router | Screens and routes: Home, Add/Edit, Settings | ⬜ |
| 4 | Lists (`SectionList`), search filtering, clipboard | Home screen: search, Pinned / All, tap to copy, empty states | ⬜ |
| 5 | Gestures and animation (`react-native-gesture-handler`, Reanimated) | Swipe to delete (with undo snackbar) / swipe to edit | ⬜ |
| 6 | Forms: controlled `TextInput`, live validation, keyboard avoiding | Add / Edit screen: duplicate-key check, auto-growing value, pin, delete dialog | ⬜ |
| 7 | Files on a device (`expo-file-system`, sharing, document picker), saving preferences | Settings: theme choice, JSON backup export / import | ⬜ |
| 8 | Native Android with Kotlin, Expo modules and config plugins | Keyboard (IME), widget, Quick Settings tile, "Save snippet" text action | ⬜ |

## Run it

```bash
npm install
npm start          # then press "a" for Android, or scan the QR code with Expo Go
npx tsc --noEmit   # typecheck
```

## Project structure

```
App.tsx                  app entry: loads fonts, wraps everything in ThemeProvider
index.ts                 registers App as the root component
app.json                 Expo config (name, Android package, icons, plugins)
src/theme/tokens.ts      colours (light + dark), radii, spacing, sizes, fonts, type scale
src/theme/ThemeProvider.tsx  System / Light / Dark theme via React Context
src/theme/fonts.ts       loads Geist and Geist Mono
```

---

## Step 1: Project setup and design tokens

### Learn

**What is Expo?**
React Native lets you write a mobile app in JavaScript/TypeScript with React, and it renders *real native*
views, not a web page. Expo is a toolkit on top of React Native. It provides:
- a project template and CLI (`npx create-expo-app`, `npx expo start`);
- ready-made native modules (fonts, SQLite, clipboard, file system…);
- **Expo Go**, a phone app that runs your code without building an APK;
- **Continuous Native Generation**: the `android/` folder is generated from `app.json`, so you don't edit it by hand.

Install libraries with `npx expo install <pkg>` instead of `npm install`. It picks the version that matches your Expo SDK.

**React Native core components.** These replace HTML tags:

| Web | React Native |
|---|---|
| `<div>` | `<View>` |
| `<p>`, `<span>` | `<Text>` (all text must be inside `<Text>`) |
| `<button>` | `<Pressable>` |
| `<input>` | `<TextInput>` |
| scrolling page | `<ScrollView>` / `<FlatList>` |

**Styling.** No CSS files. Styles are JavaScript objects, usually created with `StyleSheet.create({...})`.
Layout is **Flexbox**, with two differences from the web: `flexDirection` defaults to `column`, and numbers
are density-independent pixels (dp), with no `px`. You can pass an array of styles. Later items win:
`style={[styles.row, { color: colors.text }]}`.

**Design tokens.** A token is a named design decision, such as `accent = #5550C8` or `radius.button = 14`.
Components use the name, never the raw value. To change the look you then edit one file, and dark mode is
just a second set of the same names.

**Theming with React Context.** Context lets any component read a value without passing it through every
level of props:
1. `createContext()` makes the container.
2. `<ThemeProvider>` sits at the top of the app and *provides* the current colours.
3. `useTheme()` lets any screen *read* them.

`useColorScheme()` from React Native tells us whether the phone is in light or dark mode. Our provider adds
a manual override (System / Light / Dark), as the Settings design shows.

**Custom fonts.** `expo-font`'s `useFonts()` loads font files and returns `true` when they are ready. We show
nothing until then, so text never flashes in the wrong font. On Android every weight is a separate font
family, so we use `fontFamily: 'Geist_600SemiBold'` instead of `fontWeight: '600'`.

### Build

- Created the Expo project with the `blank-typescript` template (`expo` 57, React Native 0.86, React 19).
- Added `expo-font`, `@expo-google-fonts/geist` and `@expo-google-fonts/geist-mono`.
- `app.json`: app name **Content Storer**, Android package `com.hinajadav.contentstorer`, and
  `userInterfaceStyle: "automatic"` so the app can follow the phone's dark mode.
- `src/theme/tokens.ts`: every colour token from the design's component sheet in light and dark, plus
  radii (`chip 8 … sheet 28`), the 4-pt spacing scale, fixed sizes (row 64, input 52, FAB 56) and the type
  scale (`title`, `key`, `value`, `section`, …).
- `src/theme/ThemeProvider.tsx`: `ThemeProvider` and `useTheme()` with System / Light / Dark modes.
- `src/theme/fonts.ts`: `useAppFonts()` loads Geist 400/500/600 and Geist Mono 500/600.
- `App.tsx`: a temporary **token preview** screen with the theme switch, two snippet rows and a primary
  button, to check that colours, fonts and dark mode work. Step 4 replaces it with the real Home screen.

**Check:** `npx tsc --noEmit` passes, and `npx expo export --platform android` bundles successfully.
