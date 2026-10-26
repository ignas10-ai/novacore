// Boksas solo 30 s with the TV board on: Pradžia cast icon -> room -> TV page; Boksas tile -> setup -> ready gate
// (TV "ready") -> countdown -> round (TV "play", exercise "Boksas", back swallowed) -> results (TV "done") ->
// stored history row -> back to the setup -> back to Pradžia. On a CPU runner MediaPipe is slow, so hits are not
// asserted (the pure hit logic has its own unit tests); the stored points must equal the round's points.
import {test,expect,tap,screen,state,savedGames,watchErrors,mockSocial,a11y} from "./fixtures.ts";

test.setTimeout(5*60_000);
test.use({trace:"off"}); // same reason as sprint.spec: trace screenshots compete with MediaPipe for the software GPU

test("solo boxing + TV board: tile -> setup -> gate -> round -> results -> back",async({page,context},info)=>{
  await page.goto("/#/");
  await tap(page,"#homeCast","cast icon on Pradžia");
  await tap(page,"#castOn","Įjungti didelį ekraną");
  await expect(page.locator("#castCode")).toHaveText(/^[A-Z2-9]{6}$/);
  const code=(await page.locator("#castCode").textContent())!.trim();
  await tap(page,"#screenClose","close the cast sheet");
  const tv=await context.newPage();
  const tvErrors=watchErrors(tv,"TV: ");
  await mockSocial(tv);
  await tv.setViewportSize({width:844,height:390});
  await tv.goto(`/#/ekranas/${code}`);
  await expect(tv.locator("#screen")).toHaveAttribute("data-phase","idle");
  await page.bringToFront();

  await tap(page,".bx-tile","Boksas tile on Pradžia");
  await screen(page,"boxing").toBeVisible();
  expect((await state(page)).hash).toBe("#/boksas");
  await tap(page,'[data-bx="1"]',"solo");
  await tap(page,'[data-bxd="30"]',"30 s round");
  await a11y(page,"boxing-setup",info);
  await tap(page,"#bxGo","Į ringą");
  await screen(page,"ready").toBeVisible({timeout:120_000});
  await expect(tv.locator("#screen"),"TV shows the arms-up gate").toHaveAttribute("data-phase","ready",{timeout:15_000});
  await screen(page,"boxRun").toBeVisible({timeout:90_000});
  await expect.poll(()=>page.evaluate(()=>(window as any).__boxState().phase),{timeout:30_000}).toBe("play");
  await page.evaluate(()=>history.back()); // Android back mid-round is swallowed
  await page.waitForTimeout(600);
  await screen(page,"boxRun").toBeVisible();
  await expect(tv.locator("#screen"),"TV follows the round").toHaveAttribute("data-phase","play",{timeout:15_000});
  await expect(tv.locator("#bsEx")).toHaveText("Boksas");

  await screen(page,"boxEnd").toBeVisible({timeout:90_000});
  const end=await page.evaluate(()=>(window as any).__boxState());
  const [g]=await savedGames(page);
  expect(g,"boxing stored in local history").toMatchObject({mode:"boxing",players:1,duration:30,score:[0,0]});
  expect(g.pts[0],"stored points = the round's points").toBe(end.p[0].score);
  expect(g.reps[0]).toBe(end.p[0].hits);
  await expect(page.locator("#bxWin")).toHaveText(`${end.p[0].score} tšk.`);
  await expect(tv.locator("#screen"),"TV final board").toHaveAttribute("data-phase","done",{timeout:15_000});
  await expect(tv.locator("#bsS1")).toHaveText(String(end.p[0].score));
  await a11y(page,"boxing-results",info);
  info.annotations.push({type:"boxing",description:`${end.p[0].score} pts, ${end.p[0].hits} hits, ${end.p[0].misses} misses, ${end.p[0].bombs} bombs`});

  await page.goBack();
  await screen(page,"boxing").toBeVisible();
  expect((await state(page)).ingame).toBe(false);
  await expect(tv.locator("#screen")).toHaveAttribute("data-phase","idle",{timeout:15_000});
  await page.goBack();
  await screen(page,"home").toBeVisible();
  expect(tvErrors,"TV browser errors").toEqual([]);
});
