import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const header = readFileSync(
  fileURLToPath(new URL("./restorer/header.js", import.meta.url)),
  "utf8",
);

function prependHeader(): Plugin {
  return {
    name: "restorer-header",
    generateBundle(_options, bundle) {
      for (const item of Object.values(bundle)) {
        if (item.type !== "chunk" || !item.fileName.endsWith(".js")) continue;
        const banner = header.endsWith("\n") ? header : `${header}\n`;
        item.code = `${banner}${item.code}`;
      }
    },
  };
}

export default defineConfig({
  plugins: [prependHeader()],
  build: {
    emptyOutDir: false,
    minify: true,
    rolldownOptions: {
      input: fileURLToPath(new URL("./restorer/main.ts", import.meta.url)),
      output: {
        format: "iife",
        codeSplitting: false,
        entryFileNames: "restorer.js",
      },
    },
  },
});
