// Shared e2e helpers: Supabase mocks (reusing tools/mock-supabase.cjs and tools/mock-duel.cjs through a small
// puppeteer -> Playwright adapter), a browser-error check on every test, stable-hook lookups with a clear message
// when the UI restyle renames something, and the axe accessibility smoke check.
import {test as base,expect,type Page,type Route,type TestInfo} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {createRequire} from "node:module";

const req=createRequire(import.meta.url);
const {mockSupabase:mockRest,CHAL_ID,ME}=req("../../tools/mock-supabase.cjs");
export const {createDuelMock}=req("../../tools/mock-duel.cjs") as {createDuelMock:()=>DuelMock};
export {CHAL_ID,ME,expect};
export interface DuelMock{U:Record<"A"|"B",string>;db:any;count:Record<string,number>;rest:(me:string)=>(r:any)=>void;connect:(ws:any)=>void}

// the tools/ mocks speak puppeteer's HTTPRequest; give them a Playwright route in that shape
const asPuppeteer=(route:Route)=>{const q=route.request();return {url:()=>q.url(),method:()=>q.method(),postData:()=>q.postData(),
  continue:()=>route.continue(),respond:(o:{status:number;headers:Record<string,string>;body:string})=>route.fulfill(o)}};
const SUPABASE=/^https:\/\/[^/]+\.supabase\.co\//, SUPABASE_WS=/^wss?:\/\/[^/]+\.supabase\.co\//;

export async function mockRealtime(page:Page,M:DuelMock){
  // Playwright WebSocketRoute -> the `ws`-socket shape mock-duel.cjs expects (readyState, send, on message/close)
  await page.routeWebSocket(SUPABASE_WS,ws=>{
    let open=true;
    M.connect({get readyState(){return open?1:3},send:(m:string)=>{if(open)ws.send(m)},
      on:(ev:string,fn:(...a:any[])=>void)=>{
        if(ev==="message")ws.onMessage(m=>fn(m,typeof m!=="string"));
        if(ev==="close")ws.onClose(()=>{open=false;fn()});
      }});
  });
}
// solo screens: tools/mock-supabase.cjs (groups, leaderboard, challenge) + a Realtime server that accepts joins
export async function mockSocial(page:Page){
  let handler:(r:any)=>void=()=>{};
  await mockRest({setRequestInterception:async()=>{},on:(_:string,fn:(r:any)=>void)=>{handler=fn}});
  await page.route(SUPABASE,r=>handler(asPuppeteer(r)));
  await mockRealtime(page,createDuelMock());
}
// duels: one shared in-memory DB for both phones, REST per user
export async function mockDuel(page:Page,M:DuelMock,me:string){
  const h=M.rest(me);
  await page.route(SUPABASE,r=>h(asPuppeteer(r)));
  await mockRealtime(page,M);
}

// browser errors fail the test (same filter as tools/nav-check.cjs)
export function watchErrors(page:Page,who=""){
  const errs:string[]=[];
  if(process.env.E2E_LOG)page.on("console",m=>console.log(`[${who||"page"} ${m.type()}] ${m.text().slice(0,300)}`)); // E2E_LOG=1: browser console in the test output
  page.on("pageerror",e=>errs.push(`${who}PAGEERROR ${e.message}`));
  page.on("console",m=>{const t=m.text();if(m.type()==="error"&&!/favicon|Failed to load resource/.test(t))errs.push(who+t.slice(0,300))});
  return errs;
}
export async function seedStorage(page:Page,items:Record<string,string>){
  await page.addInitScript(items=>{for(const [k,v] of Object.entries(items))if(localStorage.getItem(k)==null)localStorage.setItem(k,v)},items);
}

type Fx={skipOnboarding:boolean;social:boolean;errors:string[]};
export const test=base.extend<Fx>({
  skipOnboarding:[true,{option:true}],
  social:[true,{option:true}],
  errors:[async({page},use)=>{
    const errs=watchErrors(page);
    await use(errs);
    expect(errs,"browser errors during the test").toEqual([]);
  },{auto:true}],
  page:async({page,skipOnboarding,social},use)=>{
    if(skipOnboarding)await seedStorage(page,{"novacore.onb":"1"});
    if(social)await mockSocial(page);
    await use(page);
  },
});

// A stable hook (id / data-* / role) the tests rely on. Fails with a message that says what to update.
export async function hook(page:Page,sel:string,what:string){
  const l=page.locator(sel).first();
  await expect(l,`UI hook ${sel} (${what}) not found - if the UI restyle renamed it, update test/e2e to the new hook`).toBeAttached();
  return l;
}
export async function tap(page:Page,sel:string,what:string){const l=await hook(page,sel,what);await l.click();return l}
export const screen=(page:Page,id:string)=>expect(page.locator(`#${id}`),`screen #${id} should be visible`);
export const state=(page:Page)=>page.evaluate(()=>({hash:location.hash,d:(history.state?.d as number)||0,ingame:document.body.classList.contains("ingame"),view:document.body.dataset.view}));
export const savedGames=(page:Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem("novacore.history")||"[]"));

// Accessibility smoke check (axe-core, WCAG 2 A/AA). Every violation is attached to the report and printed;
// only impacts listed in A11Y_FAIL_ON fail the test (default "critical"; e.g. A11Y_FAIL_ON=serious,critical or none).
const FAIL_ON=(process.env.A11Y_FAIL_ON??"critical").split(",").map(s=>s.trim()).filter(s=>s&&s!=="none");
export async function a11y(page:Page,name:string,info:TestInfo){
  const r=await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa"]).analyze();
  const v=r.violations.map(x=>({id:x.id,impact:x.impact,help:x.help,nodes:x.nodes.length,targets:x.nodes.slice(0,3).map(n=>n.target.join(" "))}));
  await info.attach(`axe-${name}.json`,{body:JSON.stringify(v,null,2),contentType:"application/json"});
  for(const x of v)info.annotations.push({type:`a11y ${x.impact}`,description:`${name}: ${x.id} - ${x.help} (${x.nodes}x: ${x.targets.join(", ")})`});
  if(v.length)console.log(`[a11y] ${name}: ${v.map(x=>`${x.impact}:${x.id}×${x.nodes}`).join(" ")}`);
  const bad=v.filter(x=>FAIL_ON.includes(x.impact||""));
  expect(bad,`axe ${name}: ${FAIL_ON.join("/")} violations (set A11Y_FAIL_ON to change)`).toEqual([]);
  return v;
}
