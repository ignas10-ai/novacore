// Šuolis į tolį, 2 players x 3 rounds on one phone: Pradžia tile -> setup (players + names) -> ready gate (fake camera,
// arms up) -> 6 turns in the order P1, P2, P1, P2, P1, P2 -> results -> stored history row -> back to the setup -> Pradžia.
// A CPU runner sees ~1 pose/s, so the run-up uses the test hook's synthetic cadence (__lj.feed) and the take-off is
// triggered at 28.8 m (__lj.jumpAt; the real detector has unit tests on tools/fixtures). P2's 2nd attempt never jumps:
// it must become a foul (X) once the runner crosses the line.
import {test,expect,tap,screen,state,savedGames,a11y} from "./fixtures.ts";

test.setTimeout(5*60_000);
test.use({trace:"off"}); // same reason as sprint.spec: trace screenshots compete with MediaPipe for the software GPU

const lj=(page:import("@playwright/test").Page)=>page.evaluate(()=>(window as any).__lj.state());

test("long jump, 2 players x 3 attempts: rotation, foul, ranking, history",async({page},info)=>{
  await page.goto("/#/");
  await tap(page,".lj-tile","Šuolis į tolį tile on Pradžia");
  await screen(page,"longjump").toBeVisible();
  expect((await state(page)).hash).toBe("#/tolis");
  await tap(page,'[data-lj="2"]',"2 players");
  await expect(page.locator("#ljN3")).toBeHidden();
  await (await tap(page,"#ljN2","P2 name")).fill("Martynas");
  await a11y(page,"longjump-setup",info);
  await tap(page,"#ljGo","Į sektorių");
  await screen(page,"ready").toBeVisible({timeout:120_000});
  await screen(page,"ljRun").toBeVisible({timeout:90_000});
  await page.evaluate(()=>(window as any).__lj.feed(3.2));

  const order:number[]=[];
  for(let k=0;k<6;k++){
    await expect.poll(async()=>{const s=await lj(page);return s.k===k&&s.phase!=="off"},{timeout:60_000}).toBe(true);
    const s=await lj(page);order.push(s.player);
    await expect(page.locator("#ljTurnN"),"turn card names the jumper").toHaveText(s.player?"Martynas":/./);
    await page.evaluate(x=>(window as any).__lj.jumpAt(x),k===3?-1:28.8);
    if(k>0)await page.evaluate(()=>(window as any).__lj.ready()); // the fake camera's arms-up part is over
    await expect.poll(async()=>(await lj(page)).phase,{timeout:30_000}).toBe("run");
    if(k===0){
      await page.evaluate(()=>history.back()); // Android back mid-attempt is swallowed
      await page.waitForTimeout(500);
      await screen(page,"ljRun").toBeVisible();
    }
    if(k===3)await expect(page.locator("#ljCall"),"foul call").toHaveClass(/is-foul/,{timeout:30_000});
    await expect.poll(async()=>{const x=await lj(page);return x.k>k||x.phase==="off"},{timeout:60_000}).toBe(true);
  }
  expect(order,"turn order P1, P2, P1, P2, P1, P2").toEqual([0,1,0,1,0,1]);

  await screen(page,"ljEnd").toBeVisible({timeout:20_000});
  const [g]=await savedGames(page);
  expect(g,"long jump stored in local history").toMatchObject({mode:"longjump",players:2,ex:["longjump"],score:[0,0]});
  expect(g.jumps).toHaveLength(2);
  expect(g.jumps.every((j:(number|null)[])=>j.length===3)).toBe(true);
  expect(g.jumps[1][1],"P2's 2nd attempt = foul").toBeNull();
  for(const d of g.jumps.flat().filter((d:number|null)=>d!=null)){expect(d).toBeGreaterThan(3);expect(d).toBeLessThanOrEqual(8.95)}
  await expect(page.locator("#ljRows>li")).toHaveCount(2);
  const fouls=g.jumps.flat().filter((d:number|null)=>d==null).length; // on a CPU runner (~1-2 fps) a slow run-up may also end in "Nešokta"
  await expect(page.locator("#ljRows .lj-tries li.x")).toHaveCount(fouls);
  const best=(j:(number|null)[])=>Math.max(...j.map(d=>d??-1));
  const w=best(g.jumps[0])>best(g.jumps[1])?0:1;
  if(best(g.jumps[0])!==best(g.jumps[1]))await expect(page.locator("#ljWin")).toContainText(w?"Martynas":"laimi");
  await a11y(page,"longjump-results",info);
  info.annotations.push({type:"longjump",description:JSON.stringify(g.jumps)});console.log("[longjump] jumps",JSON.stringify(g.jumps));

  await page.goBack();
  await screen(page,"longjump").toBeVisible();
  expect((await state(page)).ingame).toBe(false);
  await page.goBack();
  await screen(page,"home").toBeVisible();
});
