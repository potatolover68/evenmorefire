import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig, type Plugin } from "vite";

const header = readFileSync(
  fileURLToPath(new URL("./userscript/header.js", import.meta.url)),
  "utf8",
);

function wrapVueLoader(): Plugin {
  return {
    name: "emf-vue-loader",
    generateBundle(_options, bundle) {
      for (const item of Object.values(bundle)) {
        if (item.type !== "chunk" || !item.fileName.endsWith(".js")) continue;
        const banner = header.endsWith("\n") ? header : `${header}\n`;
        item.code = `${banner}mw.loader.using(["vue","ext.gadget.morebits"],function(require){var Vue=require("vue");\n${item.code}\n});\n`;
      }
    },
  };
}

export default defineConfig({
  plugins: [vue(), wrapVueLoader()],
  build: {
    emptyOutDir: false,
    minify: true,
    rolldownOptions: {
      external: ["vue"],
      input: fileURLToPath(new URL("./userscript/main.ts", import.meta.url)),
      output: {
        format: "iife",
        codeSplitting: false,
        entryFileNames: "emf.js",
        globals: { vue: "Vue" },
      },
    },
  },
});
