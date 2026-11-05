// Party Mode MVP: setup -> random draw -> team pick -> a real Sprint leg (two poses) -> party result -> final.
// The fake camera CAM2 has two mascots with arms up, so the shared 2-player gate passes for both party reps.
import {test,expect,tap,screen,savedGames,a11y} from "./fixtures.ts";
import {CAM2,camArgs} from "./paths.ts";

test.setTimeout(5*60_000);
// The race canvas + MediaPipe compete for the software GPU; no trace (see sprint.spec.ts).
test.use({trace:"off",launchOptions:{args:camArgs(CAM2)}});

test("party MVP: setup -> draw -> team pick -> sprint -> result -> final",async({page},info)=>{
  await page.goto("/#/vakarelis");
  await screen(page,"party").toBeVisible();
  await expect(page.locator("#partySetup")).toBeVisible();

  // Leave only Sprint in the random pool: the draw is then deterministic without a test hook.
  for(const id of ["rr","bx","lj","wl"])await tap(page,`[data-pool="${id}"]`,`pool ${id} off`);
  await expect(page.locator('[data-pool="sp"]')).toHaveAttribute("aria-pressed","true");
  await a11y(page,"party-setup",info);

  await tap(page,"#partyStart","start party");
  await screen(page,"partyLobby").toBeVisible();
  await expect(page.locator("#partyLobby")).toContainText("Traukti rungtį");

  await tap(page,"#partyDrawBtn","draw a game");
  await expect(page.locator("#partySheet")).toBeVisible({timeout:10_000});
  await expect(page.locator("#partySheetTitle")).toContainText(/Sprint/);
  await tap(page,'[data-pick="0"][data-i="0"]',"Raudoni player 1");
  await tap(page,'[data-pick="1"][data-i="0"]',"Mėlyni player 1");
  await expect(page.locator("#partyLegGo")).toBeEnabled();
  await tap(page,"#partyLegGo","start the leg");

  await screen(page,"ready").toBeVisible({timeout:120_000});
  await screen(page,"sprintRun").toBeVisible({timeout:90_000});
  await expect(page.locator("#spCall"),"sprint starts").toHaveClass(/is-go/,{timeout:30_000});
  await page.evaluate(()=>(window as any).__sp.feed(3));

  await screen(page,"partyResult").toBeVisible({timeout:120_000});
  await expect(page.locator("#partyResTitle")).toContainText(/Raudoni|Mėlyni|Lygiosios/);
  await expect(page.locator("#partyResScore")).toContainText(/[0-9]/);

  const [g]=await savedGames(page);
  expect(g,"the leg is a normal sprint history row").toMatchObject({mode:"sprint",players:2});
  expect(g.party,"party metadata on the leg row").toBeTruthy();
  expect(g.party.game).toBe("sp");
  expect((g.party.pts?.[0]??0)+(g.party.pts?.[1]??0),"the leg is worth 2 points").toBe(2);

  await tap(page,"#partyResBtn","back to the party");
  await screen(page,"partyFinal").toBeVisible({timeout:10_000});
  await expect(page.locator("#partyFinal")).toContainText(/Raudoni|Mėlyni|Lygiosios/);
  await a11y(page,"party-final",info);
});
