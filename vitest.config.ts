import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // Vitest runs outside Next.js, where the `server-only` guard package
      // would throw on import; stub it so server modules stay unit-testable.
      "server-only": path.resolve(__dirname, "src/test/server-only-stub.ts"),
    },
  },
  test: {
    // mobile/'s pure api-core is dependency-free TS, tested from here so the
    // mobile package needs no test toolchain of its own.
    include: ["src/**/*.test.{ts,tsx}", "mobile/src/**/*.test.ts"],
    // DB integration tests run separately via vitest.db.config.ts (test:db).
    exclude: ["src/test/db/**"],
    environment: "node",
  },
});
