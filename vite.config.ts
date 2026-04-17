import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// https://vite.dev/config/
// This config backs `pnpm run dev` (options-page dev server only). The
// multi-entry extension build (options + content + background + inject + xhr
// per TAC-3.2) lives in scripts/build.mjs.
export default defineConfig({
  plugins: [preact(), tailwindcss()],
  build: {
    rollupOptions: {
      input: "options.html",
    },
  },
  server: {
    open: "/options.html",
  },
});
