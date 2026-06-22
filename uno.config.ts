import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, presetAttributify, presetUno } from "unocss";

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  darkMode: "class",
  presets: [presetUno(), presetAttributify()],
  content: {
    filesystem: [
      path.join(dir, "src/**/*.{vue,ts,html}"),
      path.join(dir, "../packages/shared-ui/src/**/*.{vue,ts}"),
    ],
  },
  shortcuts: {
    "btn-primary":
      "bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50",
    card: "bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700",
    "input-field":
      "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500",
  },
  theme: {
    colors: {
      // 暗色主题
      brand: { primary: "#2563eb", secondary: "#64748b" },
     
    },
  },
});
