// Party Mode, the core Rep Maratonas leg: 30 s party rounds, best-of-3. The rep game has its own party branch
// (recordGame -> party sink); no player picks or stand card — the arms-up gate is the only preparation.
import {test,expect,tap,screen,savedGames,a11y} from "./fixtures.ts";
import {CAM2,camArgs} from "./paths.ts";

test.setTimeout(8*60_000);
test.use({trace:"off",launchOptions:{args:camArgs(CAM2)}});

test("party rep leg: 30 s rounds -> series -> final",async({page},info)=>{
  await page.goto("/#/vakarelis");
  await screen(page,"party").toBeVisible();
  for(const id of ["sp","bx","lj","sk","wl","dc"])await tap(page,`[data-pool="${id}"]`,`pool ${id} off`);
  await expect(page.locator('[data-pool="rr"]')).toHaveAttribute("aria-pressed","true");

  await tap(page,"#partyStart","start party");
  await expect(page.locator("#partyVs")).toBeVisible({timeout:10_000});
  await screen(page,"ready").toBeVisible({timeout:120_000});

  let rounds=0;
  for(;;){
    await screen(page,"partyResult").toBeVisible({timeout:120_000});
    rounds++;
    if(await page.locator("#partyResult").getAttribute("data-mode")==="series") break;
    if(rounds>=3) throw new Error("the rep series did not end after 3 rounds");
    await tap(page,"#partyResBtn","next round");
    await screen(page,"ready").toBeVisible({timeout:120_000});
  }
  await expect(page.locator("#partyResult")).toHaveAttribute("data-mode","series");
  await expect(page.locator("#partyResTitle")).toContainText(/Raudoni|Mėlyni|Lygiosios/);
  expect(rounds,"best-of-3 is 2-3 rounds").toBeGreaterThanOrEqual(2);
  expect(rounds).toBeLessThanOrEqual(3);

  const [g]=await savedGames(page);
  expect(g,"rep row").toMatchObject({players:2,duration:30});
  expect(g.party,"party metadata").toBeTruthy();
  expect(g.party.game).toBe("rr");
  expect(g.party.round,"the last row says which round it was").toBe(rounds);
  const party=await page.evaluate(()=>JSON.parse(localStorage.getItem("novacore.party")||"null"));
  expect(party.legs,"one series").toHaveLength(1);
  expect(party.legs[0].results,"the played rounds").toHaveLength(rounds);
  expect(party.legs[0].points,"only game = the 2x comeback leg").toBe(2);
  expect(party.totals[0]+party.totals[1],"the double leg awards 2 points").toBe(2);

  await tap(page,"#partyResBtn","back to the party");
  await screen(page,"partyFinal").toBeVisible({timeout:10_000});
  await a11y(page,"party-rep-final",info);
});
