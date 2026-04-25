import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    globals: true,
  },
  resolve: {
    alias: { "@": "/Users/georgenikabadze/Desktop/verdict" },
  },
});
