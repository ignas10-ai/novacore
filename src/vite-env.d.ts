// Vite worker imports (`import W from "./x.ts?worker"`) are a constructor that returns a Worker.
declare module "*?worker" {
  const WorkerFactory:new(options?:{name?:string})=>Worker;
  export default WorkerFactory;
}
// The only Vite env flag this app reads (pose-worker.ts: dev module workers need the importScripts shim).
interface ImportMetaEnv{readonly DEV:boolean}
interface ImportMeta{readonly env:ImportMetaEnv}
