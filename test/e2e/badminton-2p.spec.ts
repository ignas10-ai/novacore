// Badmintonas 2 players: the fake camera gives MediaPipe two mascots (CAM2), so both poses pass the shared arms-up
// gate. The test checks the third-person camera cut: P1 serves -> the view cuts behind P2 -> P2's red bubble -> a
// return at the contact -> the view cuts back to P1. Then the match is finished through the point hook and the 2-player
// results + history are verified.
import {test,expect,tap,screen,savedGames,a11y} from "./fixtures.ts";
import {CAM2,camArgs} from "./paths.ts";
import type {Page} from "@playwright/test";

test.setTimeout(6*60_000);
test.use({trace:"off",launchOptions:{args:camArgs(CAM2)}}); // two mascots in the frame, both arms up

const bd=(page:Page)=>page.evaluate(()=>(window as any).__bd.state());

test("badminton 2 players: camera cuts to the receiver, target, results, history",async({page},info)=>{
  await page.goto("/#/");
  await tap(page,".bd-tile","Badmintonas tile on Pradžia");
  await screen(page,"badminton").toBeVisible();
  await tap(page,'[data-bd="2"]',"2 players");
  await tap(page,'[data-bdt="11"]',"first to 11");
  await tap(page,"#bdGo","Į aikštę");
  await screen(page,"bdRun").toBeVisible({timeout:150_000});
  await expect(page.locator("#bdPr1"),"both human rows in the hand pick").toBeVisible();
  await page.evaluate(()=>(window as any).__bd.script(true)); // the two fake mascots must not swing on their own
  await page.evaluate(()=>(window as any).__bd.pick(0,1));
  await expect.poll(async()=>(await bd(page)).phase,{timeout:10_000}).toBe("serve");

  // P1 serves -> P2 receives: the camera cuts behind P2, the bubble is on P2's side
  await page.evaluate(()=>(window as any).__bd.serve());
  await expect.poll(async()=>{
    const s=await bd(page);
    return !!(s.mark&&s.mark.side===1);
  },{timeout:15_000}).toBe(true);
  expect((await bd(page)).near).toBe(1);
  await expect(page.locator("#bdC2"),"P2's card is the active one").toHaveClass(/active/);
  await page.screenshot({path:"test-results/badminton-2p-target.png"});

  // P2 returns (a drop keeps the return inside P1's court); the camera cuts back to P1 and the new bubble is on P1's side
  await page.evaluate(()=>(window as any).__bd.hitNow(1,"drop"));
  await expect.poll(async()=>(await bd(page)).near,{timeout:10_000}).toBe(0);
  await expect.poll(async()=>(await bd(page)).mark?.side,{timeout:10_000}).toBe(0);

  // finish the match through the hook; P1 wins every point
  for(let i=0;i<11;i++){
    await page.evaluate(()=>(window as any).__bd.point(0));
    await expect.poll(async()=>(await bd(page)).phase,{timeout:10_000}).toBe("point");
    expect((await bd(page)).score).toEqual([i+1,0]);
    if(i<10){
      await expect.poll(async()=>(await bd(page)).phase,{timeout:15_000}).toBe("serve");
      await page.evaluate(()=>(window as any).__bd.serve());
      await expect.poll(async()=>(await bd(page)).phase,{timeout:10_000}).toBe("rally");
    }
  }

  await screen(page,"bdEnd").toBeVisible({timeout:25_000});
  await expect(page.locator("#bdF1S")).toHaveText("11");
  await expect(page.locator("#bdF2S")).toHaveText("0");
  await expect(page.locator("#bdRows>li"),"both players in the results").toHaveCount(2);
  await expect(page.locator("#bdRows .sp-row.p2")).toContainText(/Mėlynas/);
  await page.screenshot({path:"test-results/badminton-2p-results.png"});
  await page.waitForTimeout(900);
  await a11y(page,"badminton-2p-results",info);

  const [g]=await savedGames(page);
  expect(g,"2-player badminton in local history").toMatchObject({mode:"badminton",players:2,score:[0,0],bdScore:[11,0],bdTarget:11});
  expect(g.bdStrokes).toHaveLength(2);
  expect(g.bdJumps).toBeDefined();
});
