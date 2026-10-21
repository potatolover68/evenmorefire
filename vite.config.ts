import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5174,
    strictPort: true,
  },
  preview: {
    port: 5173,
    strictPort: true,
    host: true,
    cors: {
      origin: "https://en.wikipedia.org",
    },
  },
});
