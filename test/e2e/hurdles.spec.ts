// Barjerinis bėgimas solo: Pradžia tile -> setup -> ready gate (fake camera) -> race -> results -> history -> back.
// A CPU runner sees ~1 pose/s, so the run uses the test hooks: synthetic cadence (__hd.feed) and a take-off 2.5 m before (a ~2 fps frame moves the runner up to 2 m)
// every hurdle (__hd.jumpAt) except the 3rd, which must be clipped (falls, the runner slows, the race goes on).
// The real take-off detector has unit tests on tools/fixtures (test/unit/longjump.test.ts).
import {test,expect,tap,screen,state,savedGames} from "./fixtures.ts";

test.setTimeout(5*60_000);
test.use({trace:"off"}); // same reason as sprint.spec: trace screenshots compete with MediaPipe for the software GPU

const hd=(page:import("@playwright/test").Page)=>page.evaluate(()=>(window as any).__hd.state());

test("solo hurdles: 7 cleared + 1 clipped, finish time, history",async({page})=>{
  await page.goto("/#/");
  await tap(page,".hd-tile","Barjerinis bėgimas tile on Pradžia");
  await screen(page,"hurdles").toBeVisible();
  expect((await state(page)).hash).toBe("#/barjerai");
  await tap(page,'[data-hd="1"]',"solo");
  await tap(page,"#hdGo","start");
  await screen(page,"ready").toBeVisible({timeout:120_000});
  await screen(page,"hdRun").toBeVisible({timeout:90_000});
  await page.evaluate(()=>{(window as any).__hd.feed(3.2);(window as any).__hd.jumpAt(2.5)});
  await expect.poll(async()=>(await hd(page)).runs[0].next,{timeout:60_000}).toBe(2);
  await page.evaluate(()=>(window as any).__hd.jumpAt(-1));
  await expect(page.locator("#hdCall"),"clip call").toContainText("Užkliuvai",{timeout:30_000});
  await page.evaluate(()=>(window as any).__hd.jumpAt(2.5));
  await page.evaluate(()=>history.back()); // Android back mid-race is swallowed
  await page.waitForTimeout(500);
  await screen(page,"hdRun").toBeVisible();
  await screen(page,"hdEnd").toBeVisible({timeout:90_000});
  const [g]=await savedGames(page);
  expect(g,"hurdles stored in local history").toMatchObject({mode:"hurdles",players:1,score:[0,0]});
  expect(g.clr[0],"hurdles cleared").toBeGreaterThanOrEqual(6); // a ~1-2 fps runner may miss one more on a slow frame
  expect(g.clr[0]).toBeLessThan(8);
  expect(g.times[0]).toBeGreaterThan(8);
  await expect(page.locator("#hdRows>li")).toHaveCount(1);
  await expect(page.locator("#hdRows .hd-dots i.x")).toHaveCount(8-g.clr[0]);
  await page.goBack();
  await screen(page,"hurdles").toBeVisible();
  expect((await state(page)).ingame).toBe(false);
  await page.goBack();
  await screen(page,"home").toBeVisible();
});
