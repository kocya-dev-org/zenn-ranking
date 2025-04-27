import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["**/test/**/*.{test,spec}.?(c|m)[jt]s?(x)"],
    exclude: ["**/node_modules/**"],
  },
});
