// Performance regression guard (#73): on hardware GL, MediaPipe pose inference must run in the classic Web Worker
// (its own core), not synchronously inside the game's requestAnimationFrame loop. The e2e browser uses swiftshader
// (software GL), where the app deliberately keeps the old main-thread path because a worker GPU context is slower per
// frame there; the first test forces ?posemode=worker to exercise the off-thread plumbing, the second proves the
// software fallback. The fake camera is only 640x360, so this does not test the 1080p downscale
// (test/unit/camera-sizes.test.ts does).
import {test,expect,tap,screen} from "./fixtures.ts";
import type {Page} from "@playwright/test";

test.setTimeout(5*60_000);

async function startRepGame(page:Page,url="/"){
  await page.goto(url);
  await tap(page,'#tabbar [data-tab="games"]',"Rungtys tab");
  await tap(page,"#rrTile","Rep Maratonas tile");
  await screen(page,"start").toBeVisible();
  await tap(page,'[data-p="1"]',"1 player");
  await tap(page,'[data-d="60"]',"1 minute");
  await tap(page,"#go","Start");
  await screen(page,"ready").toBeVisible({timeout:120_000}); // camera + the model (worker or main thread)
}
const stats=(page:Page)=>page.evaluate(()=>(window as Window&{__pose?:{stats():any}}).__pose!.stats());
const measure=(page:Page)=>page.evaluate(()=>new Promise<{p50:number;p95:number;fps:number}>((resolve)=>{
  const d:number[]=[];let last=performance.now();const end=last+3000;
  const tick=(t:number)=>{
    d.push(t-last);last=t;
    if(t<end){requestAnimationFrame(tick);return}
    const a=d.slice(1).sort((x,y)=>x-y);
    resolve({
      p50:a[Math.floor(a.length*.5)],
      p95:a[Math.floor(a.length*.95)],
      fps:Math.round(1000/(a.reduce((sum,v)=>sum+v,0)/a.length)*10)/10,
    });
  };
  requestAnimationFrame(tick);
}));

test("pose inference runs in a Web Worker and the main thread keeps its frames",async({page})=>{
  // ?posemode=worker forces the off-thread path even though the e2e camera/GPU is software (swiftshader): this is
  // the phone path. Real games on a software renderer use the main thread automatically (next test).
  await startRepGame(page,"/?posemode=worker");
  await expect.poll(async()=>stats(page),"pose engine").toMatchObject({mode:"worker"});
  await expect.poll(async()=>(await stats(page)).results,"landmarks produced by the worker",{timeout:60_000}).toBeGreaterThan(0);
  const first=await stats(page);

  await test.step("detection keeps producing results while the main thread animates",async()=>{
    const before=(await stats(page)).results;
    const frames=await measure(page);
    const after=(await stats(page)).results;
    expect(after,"pose results arrive during gameplay").toBeGreaterThan(before);
    console.log(`[perf] pose=${first.mode}/${first.engine} software=${first.software} detect=${first.detectMs}ms frames p50=${frames.p50.toFixed(1)} p95=${frames.p95.toFixed(1)} fps=${frames.fps}`);
    // Frame timings are logged, not asserted: a shared/loaded CI runner can starve both threads, and the real guard
    // is the worker mode + results above. Phone numbers are verified on a device with window.__pose.stats().
  });
});

test("software GL renderer uses the main-thread path (no worker overhead)",async({page})=>{
  // The e2e browser is swiftshader; there a worker GPU context was measured at seconds per frame on CI, while the
  // old main-thread path kept the dance/party tests green. Phones (hardware GL) get the worker by default.
  await startRepGame(page);
  const s=await stats(page);
  expect(s.software,"the e2e browser reports a software GL renderer").toBe(true);
  expect(s.mode,"software GL keeps the main-thread path").toBe("main");
});

test("main-thread fallback still detects poses (?posemode=main, old iOS/WebView)",async({page})=>{
  await startRepGame(page,"/?posemode=main");
  await expect.poll(async()=>stats(page),"pose engine").toMatchObject({mode:"main"});
  await expect.poll(async()=>(await stats(page)).results,"landmarks on the main-thread fallback",{timeout:60_000}).toBeGreaterThan(0);
  const s=await stats(page);
  const frames=await measure(page);
  console.log(`[perf] fallback pose=${s.mode}/${s.engine} detect=${s.detectMs}ms frames p50=${frames.p50.toFixed(1)} p95=${frames.p95.toFixed(1)} fps=${frames.fps}`);
});
