// Iečio metimas, 2 players x 3 attempts on one phone: Pradžia tile -> setup (players + names) -> ready gate (fake
// camera, arms up) -> per turn card -> hand pick -> countdown -> short run -> throw -> flight -> next turn -> results
// -> stored history row -> back to the setup -> Pradžia. The fake camera cannot hold an arm out or throw, so the
// hand pick and the throw use the window.__jv hooks (the real gesture detector has unit tests).
import {test,expect,tap,screen,state,savedGames,a11y} from "./fixtures.ts";

test.setTimeout(5*60_000);
test.use({trace:"off"}); // same reason as sprint.spec: trace screenshots compete with MediaPipe for the software GPU

const jv=(page:import("@playwright/test").Page)=>page.evaluate(()=>(window as any).__jv.state());

test("javelin throw, 2 players x 3 attempts: hand pick, throw, foul, total ranking, history",async({page},info)=>{
  await page.goto("/#/");
  await tap(page,".jv-tile","Iečio metimas tile on Pradžia");
  await screen(page,"javelin").toBeVisible();
  expect((await state(page)).hash).toBe("#/ietis");
  await tap(page,'[data-jv="2"]',"2 players");
  await expect(page.locator("#jvN3")).toBeHidden();
  await (await tap(page,"#jvN2","P2 name")).fill("Martynas");
  await a11y(page,"javelin-setup",info);
  await tap(page,"#jvGo","Į sektorių");
  await screen(page,"ready").toBeVisible({timeout:120_000});
  await screen(page,"jvRun").toBeVisible({timeout:90_000});
  await page.evaluate(()=>(window as any).__jv.feed(3.2));

  const order:number[]=[];
  for(let k=0;k<6;k++){
    await expect.poll(async()=>{const s=await jv(page);return s.k===k&&s.phase!=="off"},{timeout:60_000}).toBe(true);
    const s=await jv(page);order.push(s.player);
    await expect(page.locator("#jvTurnN"),"turn card names the thrower").toHaveText(s.player?"Martynas":/./);
    await page.evaluate(()=>(window as any).__jv.ready()); // skip the turn gate -> hand pick
    await expect.poll(async()=>(await jv(page)).phase,{timeout:15_000}).toBe("pick");
    await page.evaluate(kk=>{const w=window as any;w.__jv.hand(1);w.__jv.throwAt(kk===3?-1:12.8)},k); // P2's 2nd attempt never throws
    await expect.poll(async()=>(await jv(page)).phase,{timeout:20_000}).toBe("run");
    if(k===0){
      await page.evaluate(()=>history.back()); // Android back mid-attempt is swallowed
      await page.waitForTimeout(500);
      await screen(page,"jvRun").toBeVisible();
    }
    if(k===3)await expect(page.locator("#jvCall"),"foul call").toHaveClass(/is-foul/,{timeout:40_000});
    await expect.poll(async()=>{const x=await jv(page);return x.k>k||x.phase==="off"},{timeout:60_000}).toBe(true);
  }
  expect(order,"turn order P1, P2, P1, P2, P1, P2").toEqual([0,1,0,1,0,1]);

  await screen(page,"jvEnd").toBeVisible({timeout:20_000});
  const [g]=await savedGames(page);
  expect(g,"javelin stored in local history").toMatchObject({mode:"javelin",players:2,ex:["javelin"],score:[0,0]});
  expect(g.throws).toHaveLength(2);
  expect(g.throws.every((j:(number|null)[])=>j.length===3)).toBe(true);
  expect(g.throws[1][1],"P2's 2nd attempt = foul").toBeNull();
  for(const d of g.throws.flat().filter((d:number|null)=>d!=null)){expect(d).toBeGreaterThan(3);expect(d).toBeLessThanOrEqual(86)}
  await expect(page.locator("#jvRows>li")).toHaveCount(2);
  const fouls=g.throws.flat().filter((d:number|null)=>d==null).length;
  await expect(page.locator("#jvRows .lj-tries li.x")).toHaveCount(fouls);
  const total=(j:(number|null)[])=>j.reduce((a,d)=>a+(d??0),0);
  if(total(g.throws[0])!==total(g.throws[1]))await expect(page.locator("#jvWin")).toContainText(total(g.throws[0])>total(g.throws[1])?"laimi":"Martynas");
  await a11y(page,"javelin-results",info);
  info.annotations.push({type:"javelin",description:JSON.stringify(g.throws)});console.log("[javelin] throws",JSON.stringify(g.throws));

  await page.goBack();
  await screen(page,"javelin").toBeVisible();
  expect((await state(page)).ingame).toBe(false);
  await page.goBack();
  await screen(page,"home").toBeVisible();
});
