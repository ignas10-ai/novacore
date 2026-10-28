// Badmintonas, solo against the bot: Pradžia tile -> setup (1 player, 11 points) -> ready gate (fake camera, arms up)
// -> hand-pick overlay -> serve -> 11 points through the hooks -> results -> history row -> back to setup -> Pradžia.
// A second test checks the third-person target: the bot serves, the red bubble appears on P1's side, the character
// auto-runs there, a return at the contact is accepted and a jump + smash counts as a jump shot. The fake camera sees
// one mascot, so the 2-player camera cut has its own spec with CAM2 (badminton-2p.spec.ts).
import {test,expect,tap,screen,state,savedGames,a11y} from "./fixtures.ts";
import type {Page} from "@playwright/test";

test.setTimeout(6*60_000);
test.use({trace:"off"}); // the trace competes with MediaPipe for the software GPU (same as sprint/duel/bowling)

const bd=(page:Page)=>page.evaluate(()=>(window as any).__bd.state());
const waitTarget=async(page:Page,side:0|1)=>{
  await expect.poll(async()=>{
    const s=await bd(page);
    return !!(s.mark&&s.mark.side===side);
  },{timeout:15_000}).toBe(true);
};

test("badminton third person: target bubble, auto-run, return, jump smash",async({page})=>{
  await page.goto("/#/");
  await tap(page,".bd-tile","Badmintonas tile on Pradžia");
  await tap(page,'[data-bd="1"]',"1 player (vs the bot)");
  await tap(page,"#bdGo","Į aikštę");
  await screen(page,"bdRun").toBeVisible({timeout:120_000});
  await page.evaluate(()=>(window as any).__bd.script(true)); // the fake camera must not swing on its own
  await page.evaluate(()=>(window as any).__bd.pick(0,1));
  await expect.poll(async()=>(await bd(page)).phase,{timeout:10_000}).toBe("serve");

  // the bot serves to P1: the view stays behind P1, the red bubble marks the contact and the character auto-runs
  await page.evaluate(()=>(window as any).__bd.tossServe(1));
  await waitTarget(page,0);
  const s1=await bd(page);
  expect(s1.near,"solo is always behind P1").toBe(0);
  expect(s1.mark.y).toBeGreaterThan(0);
  expect(s1.mark.x).toBeGreaterThanOrEqual(-2.59);
  expect(s1.mark.x).toBeLessThanOrEqual(2.59);
  expect(s1.hint,"the first target triggers the swing hint").toBe(true);

  // a return at the marked contact (the timing window itself is unit-tested); the bot is the next receiver
  expect(await page.evaluate(()=>(window as any).__bd.hitNow(0,"clear"))).toBe(true);
  await expect.poll(async()=>(await bd(page)).strokes[0].clear,{timeout:10_000}).toBeGreaterThanOrEqual(1);
  await expect.poll(async()=>(await bd(page)).run[0].z,{timeout:5_000}).toBeGreaterThan(2); // the character ran there
  await page.screenshot({path:"test-results/badminton-return.png"});

  // jump + smash = a counted jump shot (start a fresh serve so the rally cannot end under us)
  await page.evaluate(()=>(window as any).__bd.point(0));
  await expect.poll(async()=>(await bd(page)).phase,{timeout:15_000}).toBe("serve");
  await page.evaluate(()=>(window as any).__bd.tossServe(1));
  await waitTarget(page,0);
  await page.evaluate(()=>(window as any).__bd.jump(0));
  await page.evaluate(()=>(window as any).__bd.hitNow(0,"smash"));
  await expect.poll(async()=>(await bd(page)).jumps[0],{timeout:10_000}).toBe(1);
  expect((await bd(page)).jumpFx[0]).toBeGreaterThanOrEqual(0);
});

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
  await page.evaluate(()=>(window as any).__bd.script(true)); // deterministic: the fake camera must not swing
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
