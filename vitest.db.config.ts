import { defineConfig } from "vitest/config";
import path from "node:path";

// Integration tests against a real Postgres (local cluster or CI service
// container). Kept out of `npm test` so unit tests never need a database.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "src/test/server-only-stub.ts"),
    },
  },
  test: {
    include: ["src/test/db/**/*.test.ts"],
    environment: "node",
    // The harness drops/recreates one shared database; keep runs serial.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
