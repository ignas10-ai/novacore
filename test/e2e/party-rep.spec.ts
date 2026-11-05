// Party Mode MVP, the core Rep Maratonas leg: the rep game is not a GameMode, so game.ts has its own party branch
// (recordGame -> party sink). Two mascots pass the gate; the round runs its full 60 s, then the party overlay appears.
import {test,expect,tap,screen,savedGames,a11y} from "./fixtures.ts";
import {CAM2,camArgs} from "./paths.ts";

test.setTimeout(6*60_000);
test.use({trace:"off",launchOptions:{args:camArgs(CAM2)}});

test("party rep leg: core game -> party result -> final",async({page},info)=>{
  await page.goto("/#/vakarelis");
  await screen(page,"party").toBeVisible();
  for(const id of ["sp","bx","lj","wl"])await tap(page,`[data-pool="${id}"]`,`pool ${id} off`);
  await expect(page.locator('[data-pool="rr"]')).toHaveAttribute("aria-pressed","true");

  await tap(page,"#partyStart","start party");
  await tap(page,"#partyDrawBtn","draw a game");
  await expect(page.locator("#partySheet")).toBeVisible({timeout:10_000});
  await expect(page.locator("#partySheetTitle")).toContainText(/Rep/);
  await tap(page,'[data-pick="0"][data-i="0"]',"Raudoni player 1");
  await tap(page,'[data-pick="1"][data-i="0"]',"Mėlyni player 1");
  await tap(page,"#partyLegGo","start the leg");

  await screen(page,"ready").toBeVisible({timeout:120_000});
  await screen(page,"partyResult").toBeVisible({timeout:180_000});
  await expect(page.locator("#partyResTitle")).toContainText(/Raudoni|Mėlyni|Lygiosios/);

  const [g]=await savedGames(page);
  expect(g,"rep row").toMatchObject({players:2});
  expect(g.party,"party metadata").toBeTruthy();
  expect(g.party.game).toBe("rr");
  expect(g.party.pts[0]+g.party.pts[1],"3 for a win, 1+1 for a tie").toBeGreaterThanOrEqual(2);

  await tap(page,"#partyResBtn","back to the party");
  await screen(page,"partyFinal").toBeVisible({timeout:10_000});
  await a11y(page,"party-rep-final",info);
});
