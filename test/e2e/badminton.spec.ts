// Badmintonas, solo against the bot: Pradžia tile -> setup (1 player, 11 points) -> ready gate (fake camera, arms up)
// -> hand-pick overlay -> serve -> 11 points through the hooks -> results -> history row -> back to setup -> Pradžia.
// The fake camera sees one mascot, so the e2e uses solo; the 2-player hand pick and the real gesture classifiers have
// their own unit tests (test/unit/badminton.test.ts). The flight physics is deterministic and unit-tested too.
import {test,expect,tap,screen,state,savedGames,a11y} from "./fixtures.ts";
import type {Page} from "@playwright/test";

test.setTimeout(6*60_000);
test.use({trace:"off"}); // the trace competes with MediaPipe for the software GPU (same as sprint/duel/bowling)

const bd=(page:Page)=>page.evaluate(()=>(window as any).__bd.state());

test("badminton solo to 11: hand pick, serve, points, results, history, back",async({page},info)=>{
  await page.goto("/#/");
  await tap(page,".bd-tile","Badmintonas tile on Pradžia");
  await screen(page,"badminton").toBeVisible();
  expect((await state(page)).hash).toBe("#/badmintonas");
  await tap(page,'[data-bd="1"]',"1 player (vs the bot)");
  await tap(page,'[data-bdt="11"]',"first to 11");
  await a11y(page,"badminton-setup",info);

  await tap(page,"#bdGo","Į aikštę");
  await screen(page,"ready").toBeVisible({timeout:120_000});
  await screen(page,"bdRun").toBeVisible({timeout:120_000});
  await expect(page.locator("#bdPick"),"hand pick overlay").toBeVisible();
  await expect(page.locator("#bdPr0")).toBeVisible();
  await expect(page.locator("#bdPr1"),"solo: the bot row is hidden").toBeHidden();
  await expect(page.locator("#bdPr0 .bd-bub")).toHaveCount(2);
  expect((await bd(page)).phase).toBe("pick");

  await page.evaluate(()=>(window as any).__bd.pick(0,1)); // left hand, start the serve
  await expect.poll(async()=>(await bd(page)).phase,{timeout:10_000}).toBe("serve");
  await expect(page.locator("#bdCall")).toHaveClass(/is-serve/);
  await expect(page.locator("#bdPick")).toBeHidden();

  await page.evaluate(()=>(window as any).__bd.serve());
  await expect.poll(async()=>(await bd(page)).phase,{timeout:10_000}).toBe("rally");
  expect((await bd(page)).live).toBe(true);

  for(let i=0;i<11;i++){
    await page.evaluate(()=>(window as any).__bd.point(0));
    await expect.poll(async()=>(await bd(page)).phase,{timeout:10_000}).toBe("point");
    expect((await bd(page)).score).toEqual([i+1,0]);
    await expect(page.locator("#bdS1")).toHaveText(String(i+1));
    if(i<10){
      await expect.poll(async()=>(await bd(page)).phase,{timeout:15_000}).toBe("serve");
      await page.evaluate(()=>(window as any).__bd.serve());
      await expect.poll(async()=>(await bd(page)).phase,{timeout:10_000}).toBe("rally");
    }
  }

  await screen(page,"bdEnd").toBeVisible({timeout:25_000});
  await expect(page.locator("#bdWin")).toHaveText(/Laimėjai/);
  await expect(page.locator("#bdF1S")).toHaveText("11");
  await expect(page.locator("#bdF2S"),"the bot's score is part of the final score").toHaveText("0");
  await expect(page.locator("#bdRows>li"),"the human row + the bot row").toHaveCount(2);
  await expect(page.locator("#bdRows .sp-row.p2")).toContainText(/Botas/);
  await expect(page.locator("#bdResArt .mascot")).toHaveCount(1);
  await page.waitForTimeout(900); // the rows + header fade/scale in (modal-in / sp-row-in): scan after they settle
  await a11y(page,"badminton-results",info);

  const [g]=await savedGames(page);
  expect(g,"badminton stored in local history").toMatchObject({mode:"badminton",players:1,ex:["badminton"],score:[0,0],bdTarget:11,bdScore:[11,0]});
  expect(g.bdRallies).toBe(11);
  expect(g.bdLongest).toBeGreaterThanOrEqual(1);
  expect(g.bdStrokes[0].serve).toBeGreaterThanOrEqual(1);
  info.annotations.push({type:"badminton",description:JSON.stringify({score:g.bdScore,rallies:g.bdRallies,longest:g.bdLongest})});

  await page.goBack();
  await screen(page,"badminton").toBeVisible();
  expect((await state(page)).ingame).toBe(false);
  await page.goBack();
  await screen(page,"home").toBeVisible();
});
