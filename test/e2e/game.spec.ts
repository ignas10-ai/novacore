// The whole rep game with the fake camera: onboarding -> Pradžia -> setup -> loading -> ready gate (arms up 3 s)
// -> 1-minute game -> results -> clips (highlight cut) -> Į pradžią. MediaPipe runs for real (wasm + model from
// the CDN), so this is slow (~2-3 min) and needs network.
import {test,expect,hook,tap,screen,state,savedGames,a11y} from "./fixtures.ts";

test.use({skipOnboarding:false});
test.setTimeout(6*60_000);

test("onboarding -> setup -> ready gate -> game -> results -> clips -> home",async({page},info)=>{
  await page.goto("/");
  await screen(page,"onb").toBeVisible();
  await tap(page,"#onbNext","onboarding next");await tap(page,"#onbNext","onboarding next");
  await (await hook(page,"#onbNick","nickname input")).fill("Testas");
  await tap(page,"#onbNext","onboarding finish");
  await screen(page,"home").toBeVisible();

  await tap(page,"#homePlay","Pradžia play button");
  await screen(page,"start").toBeVisible();
  await tap(page,'[data-p="1"]',"1 player");await tap(page,'[data-d="60"]',"1 minute");
  await tap(page,"#go","Start");

  await test.step("loading -> ready gate",async()=>{
    await screen(page,"ready").toBeVisible({timeout:120_000}); // camera + MediaPipe model from the CDN
    await screen(page,"loading").toBeHidden();
    expect(await state(page)).toMatchObject({hash:"#/zaidimas",ingame:true});
  });
  await test.step("arms up passes the gate, the game starts",async()=>{
    await expect(page.locator("#hud"),"HUD turns on after the arms-up gate").toHaveClass(/\bon\b/,{timeout:60_000});
    await expect(page.locator("#exName")).not.toBeEmpty();
  });
  await test.step("back mid-game is swallowed",async()=>{
    await page.evaluate(()=>history.back());
    await page.waitForTimeout(800);
    await expect(page.locator("#hud")).toHaveClass(/\bon\b/);
    expect((await state(page)).hash).toBe("#/zaidimas");
  });
  await test.step("results after 60 s",async()=>{
    await screen(page,"end").toBeVisible({timeout:100_000});
    await expect(page.locator("#winner")).not.toBeEmpty();
    const [g]=await savedGames(page);
    expect(g,"game recorded in local history").toMatchObject({players:1,duration:60});
    expect(g.exReps).toHaveLength(2);
    await a11y(page,"results",info);
  });
  await test.step("clips: highlight preview is cut",async()=>{
    await tap(page,"#toClips","to clips");
    await screen(page,"clips").toBeVisible();
    await expect(page.locator("#previewLoad"),"highlight cut finishes").toBeHidden({timeout:120_000});
    expect(await page.locator("#previewVid").evaluate((v:HTMLVideoElement)=>!!v.src&&v.readyState>=1)).toBe(true);
    await tap(page,"#dlToggle","download menu");
    await expect(page.locator("#dlMenu")).toBeVisible();
  });
  await test.step("Į pradžią -> Pradžia, no game entries left",async()=>{
    await page.locator("#clips [data-home]").first().click();
    await screen(page,"home").toBeVisible();
    expect(await state(page)).toMatchObject({d:0,ingame:false});
    expect(["","#/"],"back on the first entry (Pradžia), no #/zaidimas left").toContain((await state(page)).hash);
    await expect(page.locator("#streakN"),"streak counts today's game").toHaveText("1");
  });
});
