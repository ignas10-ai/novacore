// Slidinėjimas dviese (#30): a two-person fake camera gives MediaPipe TWO poses, so the shared arms-up gate passes
// for both and the game starts a simultaneous race. The run itself is driven by the hooks (script + warp), because
// the mascots cannot ski. Checks the split HUD, both cards, both finish rows and the history row.
import {test,expect,tap,screen,state,savedGames} from "./fixtures.ts";
import {CAM2,camArgs} from "./paths.ts";

test.setTimeout(5*60_000);
test.use({trace:"off",launchOptions:{args:camArgs(CAM2)}}); // two mascots in the frame, both arms up

const sk=(page:import("@playwright/test").Page)=>page.evaluate(()=>(window as any).__sk.state());

test("two-player skiing race: two poses -> split run -> both results -> history",async({page})=>{
  await page.goto("/#/");
  await tap(page,".sk-tile","Slidinėjimas tile on Pradžia");
  await screen(page,"ski").toBeVisible();
  await tap(page,'[data-sk="2"]',"2 players (race)");
  await tap(page,"#skGo","start race");
  await screen(page,"ready").toBeVisible({timeout:120_000});
  await screen(page,"skRun").toBeVisible({timeout:90_000});
  await page.waitForFunction(()=>!!(window as any).__sk);
  await expect.poll(async()=>(await sk(page)).phase,{timeout:30_000}).toBe("run");

  const start=await sk(page);
  expect(start.race,"the 2-player mode is a race").toBe(true);
  expect(start.n).toBe(2);
  expect(start.racers[0],"P1 has a skier").toBeTruthy();
  expect(start.racers[1],"P2 has a skier").toBeTruthy();
  await expect(page.locator("#skRun")).toHaveClass(/race/);
  await expect(page.locator("#skMe"),"P1 card").toBeVisible();
  await expect(page.locator("#skMe2"),"P2 card").toBeVisible();
  await expect(page.locator("#skDot2"),"P2 dot on the map").toBeVisible();
  await expect(page.locator("#skMe2N")).not.toHaveText("");
  await expect(page.locator("#skMe2N")).not.toHaveText(await page.locator("#skMeN").innerText());

  await page.evaluate(()=>history.back()); // back mid-race is swallowed
  await page.waitForTimeout(400);
  await screen(page,"skRun").toBeVisible();

  await page.evaluate(()=>{(window as any).__sk.script(true);(window as any).__sk.warp(398)});
  await screen(page,"skEnd").toBeVisible({timeout:60_000});
  await expect(page.locator("#skRows>li")).toHaveCount(2);
  await expect(page.locator("#skCall"),"finish call").toContainText("Finišas");
  await page.evaluate(()=>document.getElementById("skEnd")!.scrollTo(0,0));
  await expect(page.locator("#skRows .sp-row-t")).toHaveCount(2);

  const [g]=await savedGames(page);
  expect(g,"race stored in local history").toMatchObject({mode:"ski",players:2,score:[0,0]});
  expect(g.times).toHaveLength(2);
  expect(g.times[0]).toBeGreaterThan(0);
  expect(g.times[1]).toBeGreaterThan(0);
  expect(g.skiGates[0]).toBe(12);
  expect(g.skiGates[1]).toBe(12);
  expect(g.skiPen[0]).toBe(0);
  expect(g.skiPen[1]).toBe(0);

  await page.goBack();
  await screen(page,"ski").toBeVisible();
  expect((await state(page)).ingame).toBe(false);
  await page.goBack();
  await screen(page,"home").toBeVisible();
});
