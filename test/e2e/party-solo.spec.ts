// Party Mode MVP, solo/turn-based leg: only Hole in the Wall in the pool. The party starts the wall game with
// P1 = the starter team's rep and P2 = the other team; the party must map the game result back to team order.
import {test,expect,tap,screen,savedGames,a11y} from "./fixtures.ts";
import {CAM2,camArgs} from "./paths.ts";

test.setTimeout(5*60_000);
test.use({trace:"off",launchOptions:{args:camArgs(CAM2)}});

const wl=(page:import("@playwright/test").Page)=>page.evaluate(()=>(window as any).__wl.state());
const force=(page:import("@playwright/test").Page,v:string)=>page.evaluate(v=>(window as any).__wl.force(v),v);

test("party solo leg: wall turn order -> team mapping -> result -> final",async({page},info)=>{
  await page.goto("/#/vakarelis");
  await screen(page,"party").toBeVisible();
  for(const id of ["rr","sp","bx","lj"])await tap(page,`[data-pool="${id}"]`,`pool ${id} off`);
  await expect(page.locator('[data-pool="wl"]')).toHaveAttribute("aria-pressed","true");

  await tap(page,"#partyStart","start party");
  await tap(page,"#partyDrawBtn","draw a game");
  await expect(page.locator("#partySheet")).toBeVisible({timeout:10_000});
  await expect(page.locator("#partySheetTitle")).toContainText(/Siena|Wall/);
  await expect(page.locator("#partySheetBody"),"solo leg explains that teams take turns").toContainText(/Paeiliui|Take turns/);
  await tap(page,'[data-pick="0"][data-i="0"]',"Raudoni player 1");
  await tap(page,'[data-pick="1"][data-i="0"]',"Mėlyni player 1");
  await tap(page,"#partyLegGo","start the leg");

  await screen(page,"ready").toBeVisible({timeout:120_000});
  await screen(page,"wlRun").toBeVisible({timeout:90_000});
  await expect.poll(async()=>(await wl(page)).phase,{timeout:30_000}).toBe("wall");
  await force(page,"safe");
  await expect.poll(async()=>(await wl(page)).round,{timeout:60_000}).toBe(4);
  await force(page,"caught");
  await expect.poll(async()=>{const s=await wl(page);return s.k===1&&s.phase==="card"},{timeout:60_000}).toBe(true);
  await page.evaluate(()=>(window as any).__wl.ready());
  await expect.poll(async()=>(await wl(page)).phase,{timeout:30_000}).toBe("wall");

  await screen(page,"partyResult").toBeVisible({timeout:120_000});
  await expect(page.locator("#partyResTitle")).toContainText(/Raudoni|Mėlyni/);

  const [g]=await savedGames(page);
  expect(g,"wall row").toMatchObject({mode:"wall",players:2,reps:[3,0]});
  expect(g.party,"party metadata").toBeTruthy();
  expect(g.party.game).toBe("wl");
  const party=await page.evaluate(()=>JSON.parse(localStorage.getItem("novacore.party")||"null"));
  const leg=party.legs[0];
  expect(party.totals[0]+party.totals[1],"one point in this leg").toBe(1);
  expect(leg.winner,"the team whose rep survived wins").toBe(leg.starter);
  expect(leg.values[leg.winner],"team order is not game order: the winner has 3 walls").toBe(3);
  expect(leg.values[1-leg.winner]).toBe(0);
  expect(party.totals[leg.winner]).toBe(1);

  await tap(page,"#partyResBtn","back to the party");
  await screen(page,"partyFinal").toBeVisible({timeout:10_000});
  await expect(page.locator("#partyFinal")).toContainText(/Raudoni|Mėlyni/);
  await a11y(page,"party-solo-final",info);
});
