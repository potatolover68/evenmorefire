import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/bench.ts"],
    testTimeout: 120_000,
  },
});
