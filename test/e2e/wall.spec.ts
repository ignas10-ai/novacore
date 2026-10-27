// Siena, 2 players on one phone: Pradžia tile -> setup (players + names) -> ready gate (fake camera, arms up) ->
// P1's run (real detection on the 1st wall: the mascot stands still inside it) -> walls -> caught -> P2's turn card ->
// caught on the 1st wall -> results -> stored history row -> back to the setup -> Pradžia.
// The fake camera cannot dodge, so verdicts go through the test hook (__wl.force); the inside test, the pause when the
// body is lost and the verdict window have unit tests (test/unit/wall.test.ts, incl. real clips from tools/fixtures).
import {test,expect,tap,screen,state,savedGames,a11y} from "./fixtures.ts";

test.setTimeout(5*60_000);
test.use({trace:"off"}); // same reason as sprint.spec: trace screenshots compete with MediaPipe for the software GPU

const wl=(page:import("@playwright/test").Page)=>page.evaluate(()=>(window as any).__wl.state());
const force=(page:import("@playwright/test").Page,v:string)=>page.evaluate(v=>(window as any).__wl.force(v),v);

test("wall, 2 players: turns, walls survived, caught, ranking, history",async({page},info)=>{
  await page.goto("/#/");
  await tap(page,".wl-tile","Siena tile on Pradžia");
  await screen(page,"wall").toBeVisible();
  expect((await state(page)).hash).toBe("#/siena");
  await tap(page,'[data-wl="2"]',"2 players");
  await expect(page.locator("#wlN3")).toBeHidden();
  await (await tap(page,"#wlN2","P2 name")).fill("Martynas");
  await a11y(page,"wall-setup",info);
  await page.evaluate(()=>(window as any).__wl.seed(7));
  await tap(page,"#wlGo","Prie sienos");
  await screen(page,"ready").toBeVisible({timeout:120_000});
  await screen(page,"wlRun").toBeVisible({timeout:90_000});

  // P1: the first wall is a side wall that covers where the player stands; the clock runs (or pauses while lost)
  await expect.poll(async()=>(await wl(page)).phase,{timeout:30_000}).toBe("wall");
  let s=await wl(page);
  expect(s.round).toBe(1);
  expect(["left","right"]).toContain(s.kind);
  const first=s.kind;
  expect(s.secs).toBe(5);
  await expect(page.locator("#wlCall"),"the wall hint").toHaveClass(/is-hint/);
  await page.evaluate(()=>history.back()); // Android back mid-run is swallowed
  await page.waitForTimeout(500);
  await screen(page,"wlRun").toBeVisible();
  // survive 3 walls, then get caught on the 4th
  await force(page,"safe");
  await expect.poll(async()=>(await wl(page)).round,{timeout:60_000}).toBe(4);
  await force(page,"caught");
  await expect(page.locator("#wlCall"),"caught call").toHaveClass(/is-caught/,{timeout:30_000});
  s=await wl(page);
  expect(s.scores[0].rounds).toBe(3);
  expect(s.scores[0].secs).toBeCloseTo(5+4.4+3.872+3.407,1);

  // P2's turn: card with the name, the gate (skipped through the hook), caught on the 1st wall
  await expect.poll(async()=>{const x=await wl(page);return x.k===1&&x.phase==="card"},{timeout:30_000}).toBe(true);
  await expect(page.locator("#wlTurnN")).toHaveText("Martynas");
  await expect(page.locator("#wlMini li")).toHaveCount(2);
  await page.evaluate(()=>(window as any).__wl.ready());
  await expect.poll(async()=>(await wl(page)).phase,{timeout:30_000}).toBe("wall");
  expect((await wl(page)).kind,"the same seed + the same spot = the same first wall for every player").toBe(first);

  await screen(page,"wlEnd").toBeVisible({timeout:60_000});
  const [g]=await savedGames(page);
  expect(g,"wall stored in local history").toMatchObject({mode:"wall",players:2,ex:["wall"],score:[0,0],reps:[3,0]});
  expect(g.secs[1]).toBe(5);
  await expect(page.locator("#wlRows>li")).toHaveCount(2);
  await expect(page.locator("#wlRows>li").first()).toContainText("3 raundai");
  await expect(page.locator("#wlWin")).toContainText("laimi");
  await a11y(page,"wall-results",info);

  await page.goBack();
  await screen(page,"wall").toBeVisible();
  expect((await state(page)).ingame).toBe(false);
  await page.goBack();
  await screen(page,"home").toBeVisible();
});
