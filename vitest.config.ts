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
    include: ["src/**/*.test.{ts,tsx}"],
    // DB integration tests run separately via vitest.db.config.ts (test:db).
    exclude: ["src/test/db/**"],
    environment: "node",
  },
});
