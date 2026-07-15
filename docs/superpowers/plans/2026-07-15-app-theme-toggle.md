# App Theme Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable light/dark theme switching from Settings, persist via `localStorage`, and apply on startup before mount.

**Architecture:** Pure helpers in `useTheme.ts` read/write `agentflow:theme` and toggle `html.dark`. `main.ts` applies the stored theme before mount. Settings adds an Appearance segmented control that calls `setTheme` immediately.

**Tech Stack:** Vue 3, UnoCSS class dark mode, Vitest + happy-dom, existing `html.dark` CSS in `src/style.css`.

## Global Constraints

- Modes: `"light" | "dark"` only (no system preference)
- Default when unset/invalid: `"dark"`
- Storage key: `agentflow:theme`
- Toggle UI: Settings page only
- Apply class on `document.documentElement` (not `#app`)
- Reuse existing `html.dark` / `dark:` styles — no new palette

## File Structure

| File | Responsibility |
|------|----------------|
| `src/composables/useTheme.ts` | `readTheme`, `applyTheme`, `setTheme`, `useTheme` |
| `tests/composables/useTheme.test.ts` | Unit tests for read/apply/set |
| `src/main.ts` | Call `applyTheme(readTheme())` before mount |
| `src/pages/Settings.vue` | Appearance section with Light/Dark buttons |
| `tests/pages/Settings.theme.test.ts` | Mount Settings, click Dark/Light, assert class + storage |

---

### Task 1: Theme composable (TDD)

**Files:**
- Create: `tests/composables/useTheme.test.ts`
- Create: `src/composables/useTheme.ts`

**Interfaces:**
- Consumes: none
- Produces:
  - `export type ThemeMode = "light" | "dark"`
  - `export const THEME_STORAGE_KEY = "agentflow:theme"`
  - `export function readTheme(): ThemeMode`
  - `export function applyTheme(mode: ThemeMode): void`
  - `export function setTheme(mode: ThemeMode): void`
  - `export function useTheme(): { theme: Ref<ThemeMode>; setTheme: (mode: ThemeMode) => void }`

- [ ] **Step 1: Write the failing test**

Create `tests/composables/useTheme.test.ts` (must start with `// @vitest-environment happy-dom`):

```ts
// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import {
  THEME_STORAGE_KEY,
  applyTheme,
  readTheme,
  setTheme,
} from "../../src/composables/useTheme";

describe("readTheme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("defaults to dark when unset", () => {
    expect(readTheme()).toBe("dark");
  });

  it("defaults to dark when value is invalid", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "purple");
    expect(readTheme()).toBe("dark");
  });

  it("returns light when stored", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    expect(readTheme()).toBe("light");
  });

  it("returns dark when stored", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    expect(readTheme()).toBe("dark");
  });
});

describe("applyTheme", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark");
  });

  it("adds dark class for dark mode", () => {
    applyTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("removes dark class for light mode", () => {
    document.documentElement.classList.add("dark");
    applyTheme("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});

describe("setTheme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("persists and applies light", () => {
    setTheme("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("persists and applies dark", () => {
    setTheme("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/composables/useTheme.test.ts`
Expected: FAIL (module not found / exports missing)

- [ ] **Step 3: Write minimal implementation**

Create `src/composables/useTheme.ts`:

```ts
import { ref, type Ref } from "vue";

export type ThemeMode = "light" | "dark";

export const THEME_STORAGE_KEY = "agentflow:theme";

const DEFAULT_THEME: ThemeMode = "dark";

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark";
}

export function readTheme(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function applyTheme(mode: ThemeMode): void {
  document.documentElement.classList.toggle("dark", mode === "dark");
}

export function setTheme(mode: ThemeMode): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Still apply in-memory when storage is unavailable.
  }
  applyTheme(mode);
}

export function useTheme(): {
  theme: Ref<ThemeMode>;
  setTheme: (mode: ThemeMode) => void;
} {
  const theme = ref<ThemeMode>(readTheme());

  function setThemeAndSync(mode: ThemeMode): void {
    setTheme(mode);
    theme.value = mode;
  }

  return { theme, setTheme: setThemeAndSync };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/composables/useTheme.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add tests/composables/useTheme.test.ts src/composables/useTheme.ts
git commit -m "$(cat <<'EOF'
Add useTheme composable for light/dark preference.

Persist mode in localStorage and toggle html.dark for Uno/CSS dark styles.
EOF
)"
```

---

### Task 2: Apply theme on boot

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `readTheme`, `applyTheme` from `src/composables/useTheme.ts`
- Produces: theme applied on `<html>` before Vue mounts

- [ ] **Step 1: Update main.ts**

Replace `src/main.ts` with:

```ts
import { createApp } from "vue";
import App from "./App.vue";
import "@unocss/reset/tailwind.css";
import "virtual:uno.css";
import "./style.css";
import { applyTheme, readTheme } from "./composables/useTheme";

applyTheme(readTheme());

createApp(App).mount("#app");
```

- [ ] **Step 2: Smoke-check types / test still pass**

Run: `pnpm test -- tests/composables/useTheme.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "$(cat <<'EOF'
Apply stored theme before Vue mount.

Avoid light flash on startup when dark is the active preference.
EOF
)"
```

---

### Task 3: Settings Appearance UI

**Files:**
- Modify: `src/pages/Settings.vue`
- Create: `tests/pages/Settings.theme.test.ts`

**Interfaces:**
- Consumes: `useTheme()` → `{ theme, setTheme }`
- Produces: Appearance section with Light/Dark buttons that call `setTheme` immediately

- [ ] **Step 1: Write the failing UI test**

Create `tests/pages/Settings.theme.test.ts`:

```ts
// @vitest-environment happy-dom
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsPage from "../../src/pages/Settings.vue";
import { THEME_STORAGE_KEY } from "../../src/composables/useTheme";

vi.mock("../../src/composables/useWorkflow", () => ({
  useWorkflow: () => ({
    fetchOpsConfig: vi.fn().mockResolvedValue(null),
  }),
}));

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
  window.desktop = {
    getApiKeyStatus: vi.fn().mockResolvedValue(""),
    getResourceServerUrl: vi.fn().mockResolvedValue(""),
    getWorkspace: vi.fn().mockResolvedValue(""),
    getLangflowBaseUrl: vi.fn().mockResolvedValue(""),
    getLangflowApiKeyStatus: vi.fn().mockResolvedValue(""),
    getLangflowAutoStart: vi.fn().mockResolvedValue(true),
    getAgentRecursionLimit: vi.fn().mockResolvedValue({ unlimited: true, limit: null }),
    setApiKey: vi.fn(),
    clearApiKey: vi.fn(),
    setResourceServerUrl: vi.fn(),
    setLangflow: vi.fn(),
    setLangflowAutoStart: vi.fn(),
    setAgentRecursionLimit: vi.fn(),
  } as unknown as Window["desktop"];
});

describe("Settings Appearance", () => {
  it("switches to light and persists", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    document.documentElement.classList.add("dark");

    const wrapper = mount(SettingsPage);
    await wrapper.get('[data-testid="theme-light"]').trigger("click");

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("switches to dark and persists", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");

    const wrapper = mount(SettingsPage);
    await wrapper.get('[data-testid="theme-dark"]').trigger("click");

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/pages/Settings.theme.test.ts`
Expected: FAIL (missing `data-testid` buttons)

- [ ] **Step 3: Add Appearance section to Settings.vue**

In `<script setup>`, add:

```ts
import { useTheme } from "../composables/useTheme";

const { theme, setTheme } = useTheme();
```

In `<template>`, insert this section immediately after `<h1 class="text-xl font-semibold mb-4">Settings</h1>`:

```vue
    <section class="mb-8">
      <h2 class="text-sm font-medium mb-2">Appearance</h2>
      <p class="text-sm text-gray-500 mb-3">Choose light or dark theme for the app.</p>
      <div class="inline-flex rounded border border-gray-200 dark:border-gray-600 overflow-hidden">
        <button
          type="button"
          data-testid="theme-light"
          class="text-sm px-3 py-1.5 transition-colors"
          :class="
            theme === 'light'
              ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          "
          @click="setTheme('light')"
        >
          Light
        </button>
        <button
          type="button"
          data-testid="theme-dark"
          class="text-sm px-3 py-1.5 transition-colors border-l border-gray-200 dark:border-gray-600"
          :class="
            theme === 'dark'
              ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          "
          @click="setTheme('dark')"
        >
          Dark
        </button>
      </div>
    </section>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- tests/composables/useTheme.test.ts tests/pages/Settings.theme.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/Settings.vue tests/pages/Settings.theme.test.ts
git commit -m "$(cat <<'EOF'
Add Appearance theme toggle on Settings page.

Let users switch light/dark immediately with localStorage persistence.
EOF
)"
```

---

### Task 4: Manual verification checklist

- [ ] Cold start with no `agentflow:theme` key → app is dark
- [ ] Settings → Light → UI goes light immediately
- [ ] Reload app → stays light
- [ ] Settings → Dark → UI goes dark; reload keeps dark

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| `readTheme` / `applyTheme` / `setTheme` / `useTheme` | Task 1 |
| Default `dark`, key `agentflow:theme` | Task 1 |
| Apply on `<html>` | Task 1 |
| Boot apply in `main.ts` | Task 2 |
| Settings Appearance Light/Dark | Task 3 |
| Immediate set (no Save) | Task 3 |
| Unit tests for read/apply | Task 1 |
| localStorage unavailable fallback | Task 1 (`try/catch`) |
| No system mode / header toggle | Out of scope — not implemented |
