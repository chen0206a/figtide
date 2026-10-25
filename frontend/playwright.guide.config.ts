import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// A separate project keeps documentation captures out of the normal 87-test suite.
export default defineConfig({ ...base, testDir: "./guide", timeout: 180_000,
  use: { ...base.use, viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" },
});
