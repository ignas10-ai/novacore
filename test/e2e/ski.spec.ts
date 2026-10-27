// Slidinėjimas solo: Pradžia tile -> setup -> ready gate (fake camera) -> turn card -> countdown -> run ->
// finish -> results -> history -> back rules. The run itself is driven by the test hooks: the e2e camera is a
// jumping-jack mascot, not a skier, so script mode ignores it and warp(z) puts the skier near the finish (the
// gates before that point count as clean). Course, gates, physics and gestures are unit-tested on synthetic poses.
// The 2-player race has its own spec (ski-race.spec.ts) with a two-person fake camera.
import {test,expect,tap,screen,state,savedGames} from "./fixtures.ts";

test.setTimeout(5*60_000);
test.use({trace:"off"}); // MediaPipe + the 2D slope share the software GPU (same reason as sprint.spec)

const sk=(page:import("@playwright/test").Page)=>page.evaluate(()=>(window as any).__sk.state());

test("solo skiing: tile -> setup -> gate -> run -> results -> history",async({page})=>{
  await page.goto("/#/");
  await tap(page,".sk-tile","Slidinėjimas tile on Pradžia");
  await screen(page,"ski").toBeVisible();
  expect((await state(page)).hash).toBe("#/slidinejimas");
  await tap(page,'[data-sk="1"]',"solo");
  await tap(page,"#skGo","start");
  await screen(page,"ready").toBeVisible({timeout:120_000});
  await screen(page,"skRun").toBeVisible({timeout:90_000});
  await page.waitForFunction(()=>!!(window as any).__sk);
  await page.evaluate(()=>(window as any).__sk.ready()); // skip the turn card (the first run just passed the gate)
  await expect.poll(async()=>(await sk(page)).phase,{timeout:30_000}).toBe("run");
  await page.evaluate(()=>history.back()); // Android back mid-run is swallowed
  await page.waitForTimeout(400);
  await screen(page,"skRun").toBeVisible();
  await page.evaluate(()=>{(window as any).__sk.script(true);(window as any).__sk.warp(398)});
  await screen(page,"skEnd").toBeVisible({timeout:60_000});
  await expect(page.locator("#skRows>li")).toHaveCount(1);
  await expect(page.locator("#skCall"),"finish call").toContainText("Finišas");
  const [g]=await savedGames(page);
  expect(g,"skiing stored in local history").toMatchObject({mode:"ski",players:1,score:[0,0]});
  expect(g.times).toHaveLength(1);
  expect(g.times[0]).toBeGreaterThan(0);
  expect(g.skiGates[0]).toBe(12);
  expect(g.skiPen[0]).toBe(0);
  await page.goBack();
  await screen(page,"ski").toBeVisible();
  expect((await state(page)).ingame).toBe(false);
  await page.goBack();
  await screen(page,"home").toBeVisible();
});
