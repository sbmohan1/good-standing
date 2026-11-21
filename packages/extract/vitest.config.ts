import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "extract",
    include: ["test/**/*.test.ts"],
  },
});
