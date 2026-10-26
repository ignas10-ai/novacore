// App screens without a camera game: onboarding, tabs, library detail, profile settings, Kompanijos (mocked
// Supabase), invite / challenge deep links, and the axe smoke check on each main screen.
import {test,expect,hook,tap,screen,state,a11y,CHAL_ID} from "./fixtures.ts";

test.describe("first run",()=>{
  test.use({skipOnboarding:false});
  test("onboarding 3 steps -> Pradžia with the nickname saved",async({page},info)=>{
    await page.goto("/");
    await screen(page,"onb").toBeVisible();
    await a11y(page,"onboarding",info);
    await tap(page,"#onbNext","onboarding next");
    await tap(page,"#onbNext","onboarding next");
    await (await hook(page,"#onbNick","nickname input")).fill("Ignas");
    await tap(page,"#onbNext","onboarding finish");
    await screen(page,"home").toBeVisible();
    await screen(page,"onb").toBeHidden();
    expect(await page.evaluate(()=>[localStorage.getItem("novacore.onb"),localStorage.getItem("novacore.nick")])).toEqual(["1","Ignas"]);
    await page.reload();
    await screen(page,"home").toBeVisible(); // not shown twice
  });
  test("skip keeps the app usable without a name",async({page})=>{
    await page.goto("/#/pratimai");
    await tap(page,"#onbSkip","onboarding skip");
    await screen(page,"library").toBeVisible(); // the URL's screen, not always Pradžia
    expect(await page.evaluate(()=>localStorage.getItem("novacore.nick"))).toBeNull();
  });
});

test("tabs: Pradžia -> Kompanijos -> Pratimai -> Profilis, back = Pradžia",async({page},info)=>{
  await page.goto("/#/");
  await screen(page,"home").toBeVisible();
  await a11y(page,"home",info);
  for(const [tab,id,hash] of [["groups","groups","#/kompanijos"],["library","library","#/pratimai"],["profile","profile","#/profilis"]]){
    await tap(page,`#tabbar [data-tab="${tab}"]`,`tab ${tab}`);
    await screen(page,id).toBeVisible();
    expect(await state(page)).toMatchObject({hash,d:1});
    await expect(page.locator(`#tabbar [data-tab="${tab}"]`)).toHaveAttribute("aria-current","page");
  }
  await page.goBack();
  await screen(page,"home").toBeVisible();
  expect(await state(page)).toMatchObject({hash:"#/",d:0});
});

test("Pratimai: open an exercise detail, Esc closes it",async({page},info)=>{
  await page.goto("/#/pratimai");
  await screen(page,"library").toBeVisible();
  await a11y(page,"library",info);
  await tap(page,'.ex-card[data-ex="jack"]',"exercise card");
  const d=page.locator("#exDetail");
  await expect(d,"exercise detail sheet opens").toHaveAttribute("open","");
  await expect(page.locator("#exdName")).toContainText("Pašokimai");
  await a11y(page,"exercise-detail",info);
  await page.keyboard.press("Escape");
  await expect(d).not.toHaveAttribute("open","");
});

test("Profilis: sound / vibration switches persist, history and nickname sheets",async({page},info)=>{
  // 5 games: more than the 3 shown inline, so the full history sheet button is offered
  await page.addInitScript(()=>{if(!localStorage.getItem("novacore.history"))localStorage.setItem("novacore.history",JSON.stringify(Array.from({length:5},(_,i)=>(
    {t:Date.now()-i*36e5,players:i?1:2,duration:180,ex:["squat","jack"],score:[100+i,i?0:90],reps:[40,i?0:35],exReps:[{squat:20,jack:20},i?{}:{squat:35}]}))))});
  await page.goto("/#/profilis");
  await screen(page,"profile").toBeVisible();
  await expect(page.locator("#stGames"),"games stat from history").toHaveText("5");
  await a11y(page,"profile",info);
  const snd=page.locator("#profile [data-snd]"),vibe=page.locator("#profile [data-vibe]");
  await expect(snd).toHaveAttribute("aria-checked","true");
  await snd.click();await vibe.click();
  await expect(snd).toHaveAttribute("aria-checked","false");
  await page.reload();
  await expect(page.locator("#profile [data-snd]")).toHaveAttribute("aria-checked","false");
  await expect(page.locator("#profile [data-vibe]")).toHaveAttribute("aria-checked","false");
  await tap(page,"#histOpen","history sheet button");
  await expect(page.locator("#histSheet")).toHaveAttribute("open","");
  await expect(page.locator("#histList li")).toHaveCount(5);
  await a11y(page,"history-sheet",info);
  await page.keyboard.press("Escape");
  await expect(page.locator("#histSheet")).not.toHaveAttribute("open","");
  await tap(page,"#nickOpen","nickname button");
  await expect(page.locator("#nickSheet")).toHaveAttribute("open","");
  await page.locator("#nickIn").fill("Rūta");
  await tap(page,"#nickSave","nickname save");
  await expect(page.locator("#nickSheet")).not.toHaveAttribute("open","");
  await expect(page.locator("#profNick")).toContainText("Rūta");
});

test("setup: exercise picker keeps at least one exercise",async({page},info)=>{
  await page.goto("/#/");
  await tap(page,"#homePlay","Pradžia play button");
  await screen(page,"start").toBeVisible();
  expect((await state(page)).hash).toBe("#/zaisti");
  await a11y(page,"setup",info);
  await tap(page,"#exOpen","exercise picker");
  await expect(page.locator("#exSheet")).toHaveAttribute("open","");
  const on=page.locator('#exGrid .ex-tile[aria-pressed="true"]');
  const n=await on.count();expect(n).toBeGreaterThan(0);
  for(let i=0;i<n;i++)await on.first().click(); // try to switch all off
  await expect(on,"the last exercise cannot be deselected").toHaveCount(1);
  await tap(page,"#exDone","picker done");
  await page.locator("#start [data-back]").first().click();
  await screen(page,"home").toBeVisible();
  expect((await state(page)).d).toBe(0);
});

test.describe("Kompanijos (mocked Supabase)",()=>{
  test.beforeEach(async({page})=>{await page.addInitScript(()=>localStorage.setItem("novacore.nick","Ignas"))});
  test("create a group, join one by code, leaderboard, back to the list",async({page},info)=>{
    await page.goto("/#/kompanijos");
    await screen(page,"groups").toBeVisible();
    await a11y(page,"groups-empty",info);
    await (await hook(page,"#grpName","new group name")).fill("10B klasė");
    await page.locator("#grpNewForm").evaluate((f:HTMLFormElement)=>f.requestSubmit());
    await screen(page,"group").toBeVisible();
    await expect(page.locator("#grpCode")).toContainText("K7Q2ZX");
    expect((await state(page)).hash).toBe("#/kompanijos/g1");
    await page.goBack();
    await screen(page,"groups").toBeVisible();
    await (await hook(page,"#grpCodeIn","join code input")).fill("bd42ff");
    await page.locator("#grpJoinForm").evaluate((f:HTMLFormElement)=>f.requestSubmit());
    await screen(page,"group").toBeVisible();
    await expect(page.locator("#lb"),"leaderboard rows").toContainText("Martynas");
    await expect(page.locator("#lb")).toContainText("318");
    await a11y(page,"group-leaderboard",info);
    await page.goBack();
    await expect(page.locator("#grpList"),"both groups listed").toContainText("Krepšinio komanda");
    await expect(page.locator("#grpList")).toContainText("10B klasė");
  });
  test("invite link /?g=CODE joins and opens the group, the param is removed",async({page})=>{
    await page.goto("/?g=ab12cd#/");
    await screen(page,"group").toBeVisible({timeout:15000});
    await expect(page.locator("#grpCode")).toContainText("AB12CD");
    expect(await page.evaluate(()=>location.search)).toBe("");
  });
  test("challenge link /?c=<id> shows the challenge card and leads to setup",async({page})=>{
    await page.goto(`/?c=${CHAL_ID}#/`);
    await expect(page.locator("#chal"),"challenge card").toBeVisible({timeout:15000});
    await expect(page.locator("#chalTxt")).toContainText("Martynas");
    await tap(page,"#chalGo","accept challenge");
    await screen(page,"start").toBeVisible();
    await expect(page.locator('[data-d="60"]'),"challenger's duration preselected").toHaveAttribute("aria-pressed","true");
  });
});

test.describe("offline build behaviour",()=>{
  test.use({social:false});
  test("Kompanijos explains instead of hiding when Supabase is unreachable",async({page,errors})=>{
    await page.route(/supabase\.co/,r=>r.abort("internetdisconnected"));
    await page.routeWebSocket(/supabase\.co/,ws=>ws.close());
    await page.addInitScript(()=>localStorage.setItem("novacore.nick","Ignas"));
    await page.goto("/#/kompanijos");
    await screen(page,"groups").toBeVisible();
    await expect(page.locator("#tabbar [data-tab=groups]")).toBeVisible();
    await expect(page.locator("#groups"),"a Lithuanian note instead of a crash").toContainText(/ryšio|Nepavyko|neparuoštas/,{timeout:15000});
    errors.length=0; // aborted requests log console errors by design here
  });
});
