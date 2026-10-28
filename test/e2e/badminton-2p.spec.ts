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

  // P2 returns at the marked contact (a drop keeps the return inside P1's court); the camera cuts back to P1
  expect(await page.evaluate(()=>(window as any).__bd.hitNow(1,"drop"))).toBe(true);
  await expect.poll(async()=>(await bd(page)).near,{timeout:10_000}).toBe(0);
  await expect.poll(async()=>(await bd(page)).mark?.side,{timeout:10_000}).toBe(0);
  await page.screenshot({path:"test-results/badminton-2p-return.png"});

  // finish the match through the hooks: serve when needed and force a P1 point, until P1 reaches 11.
  // (The first P2 return is still in the air and may land for P2; the result is P1 11 : P2 < 11 either way.)
  for(let n=0;n<80;n++){
    const s=await bd(page);
    if(s.phase==="done"||s.score[0]>=11)break;
    if(s.phase==="serve")await page.evaluate(()=>(window as any).__bd.serve());
    else if(s.phase==="rally")await page.evaluate(()=>(window as any).__bd.point(0));
    await page.waitForTimeout(300);
  }

  await screen(page,"bdEnd").toBeVisible({timeout:30_000});
  await expect(page.locator("#bdF1S")).toHaveText("11");
  const p2Score=Number(await page.locator("#bdF2S").textContent());
  expect(p2Score).toBeLessThan(11);
  await expect(page.locator("#bdRows>li"),"both players in the results").toHaveCount(2);
  await expect(page.locator("#bdRows .sp-row.p2")).toContainText(/Mėlynas/);
  await page.screenshot({path:"test-results/badminton-2p-results.png"});
  await page.waitForTimeout(900);
  await a11y(page,"badminton-2p-results",info);

  const [g]=await savedGames(page);
  expect(g,"2-player badminton in local history").toMatchObject({mode:"badminton",players:2,score:[0,0],bdTarget:11});
  expect(g.bdScore[0]).toBe(11);
  expect(g.bdScore[1]).toBeLessThan(11);
  expect(g.bdStrokes).toHaveLength(2);
  expect(g.bdJumps).toBeDefined();
});
