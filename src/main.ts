import { createApp } from "vue";
import App from "./App.vue";
import "@unocss/reset/tailwind.css";
import "virtual:uno.css";
import "./style.css";
import { applyTheme, readTheme } from "./composables/useTheme";

applyTheme(readTheme());

createApp(App).mount("#app");
