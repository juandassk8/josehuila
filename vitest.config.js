import { defineConfig } from "vitest/config";

// Separate config from vite.config.js on purpose: another concern owns the
// app build config. This file only configures the test runner.
export default defineConfig({
  test: {
    environment: "node",
    // `api/` también entra: la lógica pura de los endpoints (chequeos de guion,
    // rate limits) se testea igual que la del front, y antes quedaba afuera.
    include: [
      "src/**/*.{test,spec}.{js,jsx}", "src/**/__tests__/**/*.{js,jsx}",
      "api/**/*.{test,spec}.js", "api/**/__tests__/**/*.js", "shared/**/*.test.js",
      "services/**/*.test.js",
    ],
    globals: false,
  },
});
