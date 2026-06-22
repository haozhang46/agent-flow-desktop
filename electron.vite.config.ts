import { defineConfig } from "electron-vite";
import vue from "@vitejs/plugin-vue";
import UnoCSS from "unocss/vite";
import { resolve } from "path";

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "electron/main.ts"),
        },
        external: ["better-sqlite3"],
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "electron/preload.ts"),
        },
      },
    },
  },
  renderer: {
    root: "src",
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/index.html"),
        },
      },
    },
    plugins: [
      UnoCSS({ configFile: resolve(__dirname, "uno.config.ts") }),
      vue(),
    ],
  },
});
