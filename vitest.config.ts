import {defineConfig} from "vitest/config";

// Unit tests (test/unit). Local calendar days matter (streaks, Monday week start): pin a zone with DST so the
// results are the same on a laptop in Vilnius and on a UTC CI runner.
process.env.TZ="Europe/Vilnius";

export default defineConfig({
  envDir:"test", // ponytail: no .env here, so src/online/api.ts never sees the real Supabase keys from .env.local (sb = null)
  test:{
    include:["test/unit/**/*.test.ts"],
    environment:"node", // DOM tests opt in with `// @vitest-environment jsdom`
    testTimeout:20000,
  },
});
