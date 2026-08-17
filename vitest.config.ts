import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // "server-only" resolves to a throwing stub under its "browser"
      // export condition, which Vite's default resolver picks up even
      // under the node test environment. Point it at a no-op so tests
      // can import server-only modules directly (route tests already
      // avoid this by mocking; these are plain utility modules).
      "server-only": path.resolve(__dirname, "./src/test/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
