import {defineConfig} from "vite";

export default defineConfig({
  build:{
    target:"esnext", // ship the code as written (it ran untranspiled before Vite)
    cssMinify:false, // ponytail: unminified CSS so no minifier can drop -webkit-backdrop-filter etc. (~10 KB gz)
  },
});
