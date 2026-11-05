// Party Mode + Dance Clash (the new #69 game): the dance tile is in the party pool, the party passes the
// team names, runs one 30 s Dance Clash round, and hands the round back to the party instead of the game result.
import {test,expect,tap,screen,savedGames} from "./fixtures.ts";
import {CAM2,camArgs} from "./paths.ts";

test.setTimeout(8*60_000);
test.use({trace:"off",launchOptions:{args:camArgs(CAM2)}});

const dance=(page:import("@playwright/test").Page)=>page.evaluate(()=>(window as any).__danceState());

test("party dance leg: Dance Clash in the pool -> one series round",async({page})=>{
  await page.goto("/#/vakarelis");
  await screen(page,"party").toBeVisible();
  await expect(page.locator('[data-pool="dc"]')).toHaveAttribute("aria-pressed","true");
  for(const id of ["rr","sp","bx","lj","sk","wl"])await tap(page,`[data-pool="${id}"]`,`pool ${id} off`);
  await expect(page.locator('[data-pool="dc"]')).toHaveAttribute("aria-pressed","true");

  await tap(page,"#partyStart","start party");
  await expect(page.locator("#partyVs")).toBeVisible({timeout:10_000});
  await screen(page,"ready").toBeVisible({timeout:120_000});
  await screen(page,"danceRun").toBeVisible({timeout:90_000});
  await expect.poll(async()=>(await dance(page)).phase,{timeout:30_000}).toBe("play");

  await screen(page,"partyResult").toBeVisible({timeout:90_000});
  await expect(page.locator("#partyResult")).toHaveAttribute("data-mode","round");
  await expect(page.locator("#partyResTitle")).toContainText(/Raudoni|Mėlyni|Lygiosios|Raundas lygus/);

  const [g]=await savedGames(page);
  expect(g,"dance history row").toMatchObject({mode:"dance",players:2,duration:30});
  expect(g.party?.game).toBe("dc");
  expect(g.party?.round,"the first round is recorded").toBe(1);
  const party=await page.evaluate(()=>JSON.parse(localStorage.getItem("novacore.party")||"null"));
  expect(party.legs,"the series is not finished after one round").toHaveLength(0);
  expect(party.current.results,"one round stored").toHaveLength(1);
  expect(party.current.points,"only game = the 2x comeback leg").toBe(2);
  expect(party.totals,"no points until the series ends").toEqual([0,0]);
});
