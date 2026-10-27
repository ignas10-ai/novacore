// End-to-end tests (test/e2e): the BUILT app (vite build -> dist-e2e, vite preview) in Chromium with a fake camera
// file (test/e2e/global-setup.ts). Supabase is always mocked: the build points at a non-existent project
// (e2e-mock.supabase.co) and every request / websocket to *.supabase.co is answered in the browser by the shared
// mocks in tools/ (test/e2e/fixtures.ts), so no test can ever touch the live database.
import {defineConfig} from "@playwright/test";
import {CAM,camArgs} from "./test/e2e/paths.ts";

const PORT=4180, CI=!!process.env.CI;

export default defineConfig({
  testDir:"test/e2e",
  timeout:60_000,
  expect:{timeout:10_000},
  workers:1, // camera specs run MediaPipe on the CPU; in parallel the ready gate (arms up 3 s, 300 ms grace) gets flaky
  retries:CI?1:0,
  forbidOnly:CI,
  reporter:CI?[["list"],["github"],["html",{open:"never"}]]:[["list"]],
  globalSetup:"./test/e2e/global-setup.ts",
  use:{
    baseURL:`http://localhost:${PORT}/`,
    browserName:"chromium",
    viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,
    locale:"lt-LT",timezoneId:"Europe/Vilnius",
    permissions:["camera"],
    serviceWorkers:"block", // sw.js would cache the shell between tests and could hide requests from page.route
    trace:"retain-on-failure",screenshot:"only-on-failure",
    launchOptions:{args:camArgs(CAM)},
  },
  webServer:{
    command:`npx vite build --outDir dist-e2e --emptyOutDir --logLevel warn && npx vite preview --outDir dist-e2e --port ${PORT} --strictPort`,
    url:`http://localhost:${PORT}/`,
    reuseExistingServer:false,
    timeout:120_000,
    env:{VITE_SUPABASE_URL:"https://e2e-mock.supabase.co",VITE_SUPABASE_PUBLISHABLE_KEY:"sb_publishable_e2e_mock"},
  },
});
