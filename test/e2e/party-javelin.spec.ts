// Party beta leg: turn on beta games, keep only Javelin, then play the first best-of-3 round through the __jv hooks.
// This verifies the beta toggle, the automatic draw, the solo adapter (n=2, team names, S.players=1) and the
// round -> series state (the round is not the leg: the series continues after it).
import {test,expect,tap,screen,savedGames} from "./fixtures.ts";

test.setTimeout(8*60_000);
test.use({trace:"off"});

const jv=(page:import("@playwright/test").Page)=>page.evaluate(()=>(window as any).__jv.state());

test("party beta javelin leg: toggle -> auto draw -> one series round",async({page})=>{
  await page.goto("/#/vakarelis");
  await screen(page,"party").toBeVisible();
  await tap(page,"[data-beta-toggle]","include beta games");
  for(const id of ["rr","sp","bx","lj","sk","wl","hd","bw","bd"])await tap(page,`[data-pool="${id}"]`,`pool ${id} off`);
  await expect(page.locator('[data-pool="jv"]')).toHaveAttribute("aria-pressed","true");

  await tap(page,"#partyStart","start party");
  await expect(page.locator("#partyVs")).toBeVisible({timeout:10_000});
  await screen(page,"ready").toBeVisible({timeout:120_000});
  await screen(page,"jvRun").toBeVisible({timeout:90_000});
  await page.evaluate(()=>(window as any).__jv.feed(3.2));
  for(let k=0;k<6;k++){
    await expect.poll(async()=>{const s=await jv(page);return s.k===k&&s.phase!=="off"},{timeout:60_000}).toBe(true);
    await page.evaluate(()=>(window as any).__jv.ready());
    await expect.poll(async()=>(await jv(page)).phase,{timeout:15_000}).toBe("pick");
    await page.evaluate(()=>{const w=window as any;w.__jv.hand(1);w.__jv.throwAt(12.8)});
    await expect.poll(async()=>{const s=await jv(page);return s.k>k||s.phase==="off"},{timeout:60_000}).toBe(true);
  }

  await screen(page,"partyResult").toBeVisible({timeout:60_000});
  await expect(page.locator("#partyResult")).toHaveAttribute("data-mode","round");
  await expect(page.locator("#partyResTitle")).toContainText(/Raudoni|Mėlyni|Lygiosios|Reds|Blues|Tie/);
  const [g]=await savedGames(page);
  expect(g).toMatchObject({mode:"javelin",players:2});
  expect(g.party?.game).toBe("jv");
  expect(g.party?.round,"the first round is recorded").toBe(1);
  const party=await page.evaluate(()=>JSON.parse(localStorage.getItem("novacore.party")||"null"));
  expect(party.legs,"the series is not finished after one round").toHaveLength(0);
  expect(party.current.results,"one round stored").toHaveLength(1);
  expect(party.current.points,"only game = the 2x comeback leg").toBe(2);
  expect(party.totals,"no points until the series ends").toEqual([0,0]);
});
