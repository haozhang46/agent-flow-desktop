# App theme toggle (light / dark)

## Goal

Let users switch the desktop app between light and dark (black) theme from Settings, persist the choice, and apply it on startup with no light flash when dark is selected.

## Background

- UnoCSS already uses `darkMode: "class"`.
- `src/style.css` already defines `html.dark` overrides for backgrounds, text, borders, inputs, prose, and scrollbars.
- Components already use `dark:` utility classes.
- `src/main.ts` does not currently attach the `dark` class to `<html>`, so the dark styles never activate.

## Decisions

| Decision | Choice |
|----------|--------|
| Modes | `light` \| `dark` only (no system preference) |
| Default when unset | `dark` |
| Persistence | `localStorage` key `agentflow:theme` |
| Toggle UI | Settings page only |
| Approach | Lightweight composable + init in `main.ts` |

## Architecture

```
main.ts                    Settings.vue
   │                            │
   ▼                            ▼
applyTheme(readTheme())    useTheme() → setTheme()
   │                            │
   └──────────► document.documentElement.classList
                + localStorage (`agentflow:theme`)
```

### Units

1. **`src/composables/useTheme.ts`**
   - Pure theme helpers (no Electron IPC):
     - `THEME_STORAGE_KEY = "agentflow:theme"`
     - `ThemeMode = "light" | "dark"`
     - `readTheme(): ThemeMode` — read storage; invalid/missing → `"dark"`
     - `applyTheme(mode: ThemeMode): void` — toggle `html` class `dark`
     - `setTheme(mode: ThemeMode): void` — write storage + `applyTheme`
     - `useTheme()` — returns reactive `theme` ref + `setTheme` for Settings
   - Applying the class on `<html>` (not `#app`) so Uno `dark:` variants and `html.dark` CSS both work.

2. **`src/main.ts`**
   - Before `createApp(App).mount("#app")`, call `applyTheme(readTheme())` so the first paint matches preference.

3. **`src/pages/Settings.vue`**
   - New **Appearance** section (placed near the top of the page, after the page title).
   - Two mutually exclusive controls (segmented buttons): Light | Dark.
   - Binding uses `useTheme()`; changing selection calls `setTheme` immediately (no separate Save button).

## Data flow

1. App boot: `readTheme()` → `applyTheme()` → `<html class="dark">` when dark.
2. User opens Settings → sees current mode from storage / reactive ref.
3. User picks Light or Dark → `setTheme` updates `localStorage` and `<html>` class in the same tick.
4. Next launch: step 1 restores the last choice.

## Error handling

- Corrupt or unknown storage values: treat as `"dark"`.
- `localStorage` unavailable (should not happen in Electron renderer): fall back to default `"dark"` for read; skip write silently (still apply in-memory via class).

## Out of scope

- System / `prefers-color-scheme` mode
- Header quick toggle
- Electron main-process preference storage
- New color palettes (reuse existing dark CSS / Uno tokens)
- Changing Mermaid or third-party webview themes beyond existing behavior

## Testing

- Unit: `readTheme` defaults and invalid values; `applyTheme` adds/removes `dark` on `document.documentElement` (jsdom).
- Manual: cold start with no key → dark; switch to light in Settings → page updates; reload → stays light; switch back to dark → persists.

## Success criteria

- User can set light or dark from Settings only.
- Preference survives app restart.
- Dark mode activates existing `html.dark` / `dark:` styles without restyling the whole app.
- Startup with dark preference does not flash light UI.
