// Boulingas, 2 players x 3 frames on one phone: Pradžia tile -> setup (players + names + frames) -> ready gate
// (fake camera, arms up) -> 12 balls in the order P1, P1, P2, P2, P1... -> results -> history row -> back to setup.
// A CPU browser sees ~1 pose/s and the fake camera cannot make the arm-out / swing gestures, so the test hook
// window.__bw.script() ignores the camera and drives ready/hand/aim/knock; the real ball + pin physics has its own
// unit test (test/unit/bowling.test.ts), the camera gestures are checked with synthetic landmarks there too.
import {test,expect,tap,screen,state,savedGames,a11y} from "./fixtures.ts";
import type {Page} from "@playwright/test";

test.setTimeout(6*60_000);
test.use({trace:"off"}); // same reason as the sprint/duel specs: the trace competes with MediaPipe for the software GPU

const bw=(page:Page)=>page.evaluate(()=>(window as any).__bw.state());

test("bowling, 2 players x 3 frames: hand -> aim -> ball, scorecard, history, back",async({page},info)=>{
  await page.goto("/#/");
  await tap(page,".bw-tile","Boulingas tile on Pradžia");
  await screen(page,"bowling").toBeVisible();
  expect((await state(page)).hash).toBe("#/boulingas");
  await tap(page,'[data-bw="2"]',"2 players");
  await expect(page.locator("#bwN3")).toBeHidden();
  await (await tap(page,"#bwN2","P2 name")).fill("Martynas");
  await tap(page,'[data-bwf="3"]',"3 frames");
  await a11y(page,"bowling-setup",info);

  await tap(page,"#bwGo","Į taką");
  await screen(page,"ready").toBeVisible({timeout:120_000});
  await screen(page,"bwRun").toBeVisible({timeout:120_000});
  await page.evaluate(()=>(window as any).__bw.script());
  const order:string[]=[];
  const turns=2*3*2; // two balls per frame, no strike/spare (3 pins each)

  for(let k=0;k<turns;k++){
    await expect.poll(async()=>(await bw(page)).phase,{timeout:30_000}).toBe("card");
    const before=await bw(page);
    order.push(`${before.p}:${before.f}`);
    await expect(page.locator("#bwTurnN"),"turn card names the current bowler").toHaveText(before.p?"Martynas":/./);
    if(k===0)await a11y(page,"bowling-turn",info);
    await page.evaluate(()=>(window as any).__bw.ready());
    await expect.poll(async()=>(await bw(page)).phase,{timeout:10_000}).toBe("hand");
    await page.evaluate(()=>window.__bw.hand(1));
    await expect.poll(async()=>(await bw(page)).phase,{timeout:10_000}).toBe("aim");
    await page.evaluate(()=>window.__bw.aim(0.1,0));
    await page.evaluate(()=>window.__bw.knock(3));
    await expect.poll(async()=>(await bw(page)).phase,{timeout:10_000}).toBe("roll");
    if(k===0)await expect(page.locator("#bwCall"),"a ball result call").toHaveClass(/on/,{timeout:10_000});
    await expect.poll(async()=>{const s=await bw(page);return s.done||s.phase==="card"},{timeout:30_000}).toBe(true);
  }
  expect(order).toEqual(["0:0","0:0","1:0","1:0","0:1","0:1","1:1","1:1","0:2","0:2","1:2","1:2"]);

  await screen(page,"bwEnd").toBeVisible({timeout:20_000});
  const [g]=await savedGames(page);
  expect(g,"bowling stored in local history").toMatchObject({mode:"bowling",players:2,ex:["bowling"],score:[0,0],bwFrames:3});
  expect(g.bwTotals).toEqual([18,18]);
  expect(g.bwRolls).toHaveLength(2);
  expect(g.bwRolls.every((r:number[])=>r.length===6&&r.every(n=>n===3))).toBe(true);
  expect(g.bwFrameRolls).toHaveLength(2);
  expect(g.bwFrameRolls.every((f:number[][])=>f.length===3&&f.every(x=>x.length===2))).toBe(true);
  expect(g.reps).toEqual([18,18]);
  await expect(page.locator("#bwRows>li")).toHaveCount(2);
  await expect(page.locator("#bwRows .bw-fcell")).toHaveCount(6);
  await expect(page.locator("#bwWin"),"equal totals = a tie").toHaveText(/Lygiosios/);
  await a11y(page,"bowling-results",info);
  info.annotations.push({type:"bowling",description:JSON.stringify(g.bwTotals)});

  await page.goBack();
  await screen(page,"bowling").toBeVisible();
  expect((await state(page)).ingame).toBe(false);
  await page.goBack();
  await screen(page,"home").toBeVisible();
});
