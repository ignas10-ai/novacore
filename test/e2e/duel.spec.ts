// Remote duel happy path: TWO browser contexts (two phones, two anonymous users) on one shared mocked Supabase
// (tools/mock-duel.cjs: REST RPCs + Phoenix Realtime with presence / broadcast / postgres_changes / private channel).
// Invite -> live incoming invite -> accept -> lobby with presence -> camera -> both pass the arms-up gate ->
// synchronized start -> live opponent score -> both results agree with the DB.
import {test,expect} from "@playwright/test"; // plain test: this spec makes its own two contexts
import {createDuelMock,mockDuel,watchErrors,seedStorage,tap,screen} from "./fixtures.ts";

test.setTimeout(6*60_000);
test.use({trace:"off"}); // see sprint.spec.ts: two MediaPipe pages on a software GPU have no headroom for tracing

test("duel: invite -> accept -> lobby -> game -> both results",async({browser,baseURL})=>{
  const M=createDuelMock();
  const phone=async(who:"A"|"B",nick:string)=>{
    const ctx=await browser.newContext({baseURL,viewport:{width:390,height:844},isMobile:true,hasTouch:true,permissions:["camera"],serviceWorkers:"block",locale:"lt-LT",timezoneId:"Europe/Vilnius"});
    const page=await ctx.newPage();
    const errors=watchErrors(page,who+": ");
    await seedStorage(page,{"novacore.onb":"1","novacore.nick":nick,...(who==="A"?{"novacore.exercises":JSON.stringify(["sidestep"])}:{})});
    await mockDuel(page,M,M.U[who]);
    await page.goto("/#/");
    return {ctx,page,errors};
  };
  const A=await phone("A","Ignas"),B=await phone("B","Martynas");
  try{
    await A.page.waitForTimeout(2500); // duel.ts starts the inbox channel ~1.5 s after the app
    await test.step("A invites from the group leaderboard",async()=>{
      await A.page.goto("/#/kompanijos/g1");
      await expect(A.page.locator(".lb-duel"),"swords button only next to the friend").toHaveCount(1);
      await tap(A.page,".lb-duel","duel button on a leaderboard row");
      await tap(A.page,'[data-dd="60"]',"1 minute duel");
      await tap(A.page,"#duelYes","send invite");
      await expect(A.page.locator("#duelTitle")).toContainText("Laukiam");
    });
    await test.step("B gets the invite live and accepts",async()=>{
      await expect(B.page.locator("#duelSheet"),"invite pops up on B").toHaveAttribute("open","",{timeout:15_000});
      await expect(B.page.locator("#duelTitle")).toContainText("Ignas");
      await expect(B.page.locator("#duelSub")).toContainText("1 min");
      await tap(B.page,"#duelYes","accept");
      await expect(B.page.locator("#duelYes")).toContainText("kamer");
      await expect(A.page.locator("#duelYes"),"A sees the accept").toContainText("kamer");
      await expect(A.page.locator("#dvOpp"),"A sees B online (presence)").toHaveAttribute("data-on","1");
    });
    await test.step("both to the camera, gate, synchronized start",async()=>{
      await A.page.locator("#duelYes").click();
      await A.page.waitForTimeout(4000);
      await B.page.locator("#duelYes").click();
      for(const P of [A,B])await screen(P.page,"ready").toBeVisible({timeout:150_000});
      await Promise.all([A,B].map(P=>expect(P.page.locator("#hud"),"game starts on both phones").toHaveClass(/\bon\b/,{timeout:150_000})));
      await expect(A.page.locator(".pl.p1 .chip")).toHaveText("Tu");
      await expect(A.page.locator(".pl.p2 .chip")).toHaveText("Martynas");
      expect(await A.page.locator("#exName").textContent(),"same exercise order").toBe(await B.page.locator("#exName").textContent());
    });
    await test.step("results agree with the server on both phones",async()=>{
      for(const P of [A,B])await screen(P.page,"end").toBeVisible({timeout:120_000});
      await expect.poll(()=>M.db.duels.at(-1)?.status,{message:"finish_duel from both",timeout:15_000}).toBe("done");
      const d=M.db.duels.at(-1);
      await expect(A.page.locator("#duelResTxt")).toContainText(`Tu ${d.from_score} : ${d.to_score}`,{timeout:15_000});
      await expect(B.page.locator("#duelResTxt")).toContainText(`Tu ${d.to_score} : ${d.from_score}`,{timeout:15_000});
      test.info().annotations.push({type:"duel",description:`score ${d.from_score}:${d.to_score}, realtime messages ${JSON.stringify(M.count)}`});
    });
    await test.step("Į pradžią restores the solo setup",async()=>{
      await A.page.locator("#end [data-home]").first().click();
      await screen(A.page,"home").toBeVisible();
      await expect(A.page.locator("body")).not.toHaveClass(/\bduel\b/);
      await expect(A.page.locator(".pl.p2 .chip")).toHaveText("P2");
    });
    expect([...A.errors,...B.errors],"browser errors").toEqual([]);
  }finally{await A.ctx.close();await B.ctx.close()}
});
