// Party Mode, solo/turn-based leg: only Hole in the Wall in the pool. The party starts the wall game with
// P1 = the starter team and P2 = the other team; two rounds wins the series. No player pick/stand click.
import {test,expect,tap,screen,savedGames,a11y} from "./fixtures.ts";
import {CAM2,camArgs} from "./paths.ts";

test.setTimeout(8*60_000);
test.use({trace:"off",launchOptions:{args:camArgs(CAM2)}});

const wl=(page:import("@playwright/test").Page)=>page.evaluate(()=>(window as any).__wl.state());
const force=(page:import("@playwright/test").Page,v:string)=>page.evaluate(v=>(window as any).__wl.force(v),v);
const ready=(page:import("@playwright/test").Page)=>page.evaluate(()=>(window as any).__wl.ready());

async function wallRound(page:import("@playwright/test").Page){
  // P1 = the round starter; survive one wall, then get caught.
  await expect.poll(async()=>(await wl(page)).phase,{timeout:60_000}).toBe("wall");
  await force(page,"safe");
  await expect.poll(async()=>(await wl(page)).round,{timeout:30_000}).toBeGreaterThanOrEqual(2);
  await force(page,"caught");
  await expect.poll(async()=>{const s=await wl(page);return s.k===1&&s.phase==="card"},{timeout:30_000}).toBe(true);
  await ready(page);
  await expect.poll(async()=>(await wl(page)).phase,{timeout:30_000}).toBe("wall");
  await force(page,"caught");
}

test("party solo leg: wall series -> team mapping -> final",async({page},info)=>{
  await page.goto("/#/vakarelis");
  await screen(page,"party").toBeVisible();
  for(const id of ["rr","sp","bx","lj","sk"])await tap(page,`[data-pool="${id}"]`,`pool ${id} off`);
  await expect(page.locator('[data-pool="wl"]')).toHaveAttribute("aria-pressed","true");

  await tap(page,"#partyStart","start party");
  await expect(page.locator("#partyVs")).toBeVisible({timeout:10_000});
  await screen(page,"ready").toBeVisible({timeout:120_000});
  await screen(page,"wlRun").toBeVisible({timeout:90_000});

  let rounds=0;
  for(;;){
    await wallRound(page);
    rounds++;
    await screen(page,"partyResult").toBeVisible({timeout:60_000});
    if(await page.locator("#partyResult").getAttribute("data-mode")==="series") break;
    if(rounds>=3) throw new Error("the wall series did not end after 3 rounds");
    await tap(page,"#partyResBtn","next round");
  }
  await expect(page.locator("#partyResult")).toHaveAttribute("data-mode","series");
  expect(rounds,"best-of-3 is 2-3 rounds").toBeGreaterThanOrEqual(2);
  expect(rounds).toBeLessThanOrEqual(3);

  const [g]=await savedGames(page);
  expect(g,"wall row").toMatchObject({mode:"wall",players:2});
  expect(g.party,"party metadata").toBeTruthy();
  expect(g.party.game).toBe("wl");
  const party=await page.evaluate(()=>JSON.parse(localStorage.getItem("novacore.party")||"null"));
  const leg=party.legs[0];
  expect(party.legs,"one series").toHaveLength(1);
  expect(leg.results,"the played rounds").toHaveLength(rounds);
  expect(leg.winner,"a team with 2 round wins takes the series").not.toBe(-1);
  expect(Math.max(...leg.wins)).toBe(2);
  expect(party.totals[leg.winner],"only game = the 2x comeback leg").toBe(2);
  expect(leg.wins[leg.winner],"team order is not game order").toBe(2);

  await tap(page,"#partyResBtn","back to the party");
  await screen(page,"partyFinal").toBeVisible({timeout:10_000});
  await expect(page.locator("#partyFinal")).toContainText(/Raudoni|Mėlyni|Lygiosios/);
  await a11y(page,"party-solo-final",info);
});
