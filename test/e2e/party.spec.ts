// Party Mode MVP: setup -> disco intro -> 1v1 -> automatic draw -> a best-of-3 Sprint series -> final.
// The fake camera CAM2 has two mascots with arms up, so the shared 2-player gate passes without picks.
import {test,expect,tap,screen,savedGames,a11y} from "./fixtures.ts";
import {CAM2,camArgs} from "./paths.ts";

test.setTimeout(8*60_000);
// The race canvas + MediaPipe compete for the software GPU; no trace (see sprint.spec.ts).
test.use({trace:"off",launchOptions:{args:camArgs(CAM2)}});

const audioState=(page:import("@playwright/test").Page)=>page.evaluate(()=>{
  const a=(window as any).__audios?.[0] as HTMLAudioElement|undefined;
  return a?{paused:a.paused,volume:a.volume,t:a.currentTime,src:a.src}:null;
});

test("party MVP: setup -> VS -> auto draw -> sprint series -> final",async({page},info)=>{
  await page.addInitScript(()=>{
    const Orig=window.Audio;
    (window as any).__audios=[];
    (window as any).Audio=class extends Orig{constructor(src?:string){super(src);(window as any).__audios.push(this)}};
  });
  await page.goto("/#/vakarelis");
  await screen(page,"party").toBeVisible();
  await expect(page.locator("#partySetup")).toBeVisible();
  await expect(page.locator("#partyStart")).toBeVisible();

  // Leave only Sprint in the random pool: the draw is then deterministic without a test hook.
  for(const id of ["rr","bx","lj","sk","wl","dc"])await tap(page,`[data-pool="${id}"]`,`pool ${id} off`);
  await expect(page.locator('[data-pool="sp"]')).toHaveAttribute("aria-pressed","true");
  await a11y(page,"party-setup",info);

  await tap(page,"#partyStart","start party");
  // No skip button: the disco-ball intro flows into the 1v1 card, then the draw starts automatically.
  await expect(page.locator("#partyVs")).toBeVisible({timeout:10_000});
  expect(await audioState(page),"no music in the intro/VS").toBeNull();
  await expect(page.locator("#partyDraw")).toBeVisible({timeout:10_000});

  // The draw starts the Sprint leg without a click; the arms-up gate gives players time to stand.
  await screen(page,"ready").toBeVisible({timeout:120_000});
  await screen(page,"sprintRun").toBeVisible({timeout:90_000});
  await expect(page.locator("#spCall"),"sprint starts").toHaveClass(/is-go/,{timeout:30_000});
  const music=await audioState(page);
  expect(music,"music plays during the game").not.toBeNull();
  expect(music!.paused,"music is playing").toBe(false);
  expect(music!.volume,"low background volume").toBeGreaterThan(0.1);
  await page.evaluate(()=>(window as any).__sp.feed(3));

  await screen(page,"partyResult").toBeVisible({timeout:120_000});
  const firstMode=await page.locator("#partyResult").getAttribute("data-mode");
  expect(["round","series"]).toContain(firstMode);
  await expect(page.locator("#partyResTitle")).toContainText(/Raudoni|Mėlyni|Lygiosios|Raundas lygus/);

  // The big score is the series round wins (1:0, 1:1, 2:1), never the party totals.
  const roundWins=await page.evaluate(()=>JSON.parse(localStorage.getItem("novacore.history")||"[]")[0]?.party?.roundWins as [number,number]);
  expect(await page.locator("#partyResScore b").allTextContents(),"round wins, not totals").toEqual(roundWins.map(String));
  const roundWin=Number(await page.locator("#partyResult").getAttribute("data-win"));
  expect(roundWin).toBe(roundWins[0]>roundWins[1]?0:roundWins[1]>roundWins[0]?1:-1);
  if(roundWin>=0){
    await expect(page.locator("#partyResPlayers .won")).toHaveCount(1);
    await expect(page.locator("#partyResPlayers .won .party-res-crown"),"winner gets a crown").toHaveCount(1);
  }else{
    await expect(page.locator("#partyResPlayers .party-res-crown"),"a tie stays neutral").toHaveCount(0);
  }

  // The music stops at the end of the round (the result overlay is silent).
  await expect.poll(async()=>{const s=await audioState(page);return s?.paused??true},{timeout:5_000}).toBe(true);

  // Play the remaining rounds by skipping the auto wait. The series ends at 2 wins or after 3 rounds.
  let rounds=1;
  while(await page.locator("#partyResult").getAttribute("data-mode")==="round" && rounds<4){
    await tap(page,"#partyResBtn","next round");
    await screen(page,"sprintRun").toBeVisible({timeout:120_000});
    await expect(page.locator("#spCall"),"next sprint starts").toHaveClass(/is-go/,{timeout:30_000});
    await page.evaluate(()=>(window as any).__sp.feed(3));
    await screen(page,"partyResult").toBeVisible({timeout:120_000});
    rounds++;
  }
  await expect(page.locator("#partyResult")).toHaveAttribute("data-mode","series");
  expect(rounds,"best-of-3 is 2-3 rounds").toBeGreaterThanOrEqual(2);
  expect(rounds).toBeLessThanOrEqual(3);

  const [g]=await savedGames(page);
  expect(g,"each round is a normal sprint history row").toMatchObject({mode:"sprint",players:2});
  expect(g.party,"party metadata on the row").toBeTruthy();
  expect(g.party.game).toBe("sp");
  expect(g.party.round,"the last row says which round it was").toBe(rounds);
  const party=await page.evaluate(()=>JSON.parse(localStorage.getItem("novacore.party")||"null"));
  expect(party.legs,"the series is one party leg").toHaveLength(1);
  expect(party.legs[0].results).toHaveLength(rounds);
  expect(party.legs[0].points,"only game = the 2x comeback leg").toBe(2);
  expect(party.totals[0]+party.totals[1],"the double leg awards 2 points").toBe(2);

  // The series card shows the final round wins (2:0 / 2:1 / 1:1) and colours the series winner.
  expect(await page.locator("#partyResScore b").allTextContents(),"series round wins").toEqual(party.legs[0].values.map(String));
  if(party.legs[0].winner>=0){
    await expect(page.locator("#partyResult")).toHaveAttribute("data-win",String(party.legs[0].winner));
    await expect(page.locator("#partyResPlayers .won .party-res-crown")).toHaveCount(1);
  }

  await tap(page,"#partyResBtn","back to the party");
  await screen(page,"partyFinal").toBeVisible({timeout:10_000});
  await expect(page.locator("#partyFinal")).toContainText(/Raudoni|Mėlyni|Lygiosios/);
  await a11y(page,"party-final",info);
});
