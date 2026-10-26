// Sprintas 100 m solo vs the ghost: Pradžia tile -> sprint setup -> ready gate -> countdown -> race -> results.
// On a CPU-only runner the knee detection is slow, so the race may end on the 60 s limit ("Laikas baigėsi")
// instead of the finish line; both must reach the results with a stored sprint row.
import {test,expect,tap,screen,state,savedGames} from "./fixtures.ts";

test.setTimeout(5*60_000);
// ponytail: no trace here - trace screenshots compete with MediaPipe + the race canvas for the software GPU
// (swiftshader); one detectForVideo() inside the race frame can then block the page for seconds.
test.use({trace:"off"});

test("solo sprint: tile -> setup -> gate -> race -> results -> back",async({page})=>{
  await page.goto("/#/");
  await tap(page,".sp-tile","Sprintas tile on Pradžia");
  await screen(page,"sprint").toBeVisible();
  expect((await state(page)).hash).toBe("#/sprintas");
  await tap(page,'[data-sp="1"]',"solo (vs ghost)");
  await tap(page,"#spGo","sprint start");
  await screen(page,"ready").toBeVisible({timeout:120_000});
  await screen(page,"sprintRun").toBeVisible({timeout:90_000});
  await expect(page.locator("#spCall"),"starter call: Marš!").toHaveClass(/is-go/,{timeout:30_000});
  await page.evaluate(()=>history.back()); // Android back mid-race is swallowed
  await page.waitForTimeout(600);
  await screen(page,"sprintRun").toBeVisible();
  await screen(page,"sprintEnd").toBeVisible({timeout:90_000});
  const [g]=await savedGames(page);
  expect(g,"sprint stored in local history").toMatchObject({mode:"sprint",players:1});
  expect(g.times,"one slot per lane, P2 empty in solo").toEqual([g.times[0],null]);
  if(g.times[0]!=null){expect(g.times[0]).toBeGreaterThan(5);expect(g.splits[0]).toHaveLength(10)}
  else await expect(page.locator("#sprintEnd")).toContainText("Nebaigta");
  test.info().annotations.push({type:"sprint",description:`time ${g.times[0]??"DNF (60 s limit)"} s, steps ${g.reps?.[0]}`});
  await page.goBack();
  await screen(page,"sprint").toBeVisible();
  expect((await state(page)).ingame).toBe(false);
  await page.goBack();
  await screen(page,"home").toBeVisible();
});
