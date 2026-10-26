// The English UI (?lang=en): onboarding -> setup -> ready gate -> 1-min game -> results -> clips, with a check on every
// screen that no Lithuanian text leaked through (letters ąčęėįšųūž outside the mocked user data), then the language
// switch in Profilis back to Lithuanian. Same fake camera and mocks as game.spec.ts; slow (~2-3 min), needs network.
import {test,expect,hook,tap,screen} from "./fixtures.ts";
import type {Page,TestInfo} from "@playwright/test";

test.use({skipOnboarding:false});
test.setTimeout(6*60_000);

const USER_DATA=["Rūta","Krepšinio","klasė"]; // nicknames / group names from tools/mock-*.cjs
async function noLithuanian(page:Page,where:string,info:TestInfo){
  const words:string[]=await page.evaluate(()=>(document.body.innerText.match(/\S*[ąčęėįšųūžĄČĘĖĮŠŲŪŽ]\S*/g)||[]));
  expect(words.filter(w=>!USER_DATA.some(u=>w.includes(u))),`Lithuanian text left on ${where} in the English UI`).toEqual([]);
  await page.screenshot({path:info.outputPath(`en-${where}.png`)});
}

test("English: onboarding -> game -> results -> clips, then switch back to Lithuanian",async({page},info)=>{
  await page.goto("/?lang=en");
  await screen(page,"onb").toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.lang)).toBe("en");
  await expect(page.locator("#onbNextTxt")).toHaveText("Next");
  await expect(page.locator("#onbTitle1")).toContainText("3 minutes");
  await noLithuanian(page,"onboarding-1",info);
  await tap(page,"#onbNext","onboarding next");await noLithuanian(page,"onboarding-2",info);
  await tap(page,"#onbNext","onboarding next");
  await (await hook(page,"#onbNick","nickname input")).fill("Testas");
  await expect(page.locator("#onbNextTxt")).toHaveText("Start");
  await noLithuanian(page,"onboarding-3",info);
  await tap(page,"#onbNext","onboarding finish");
  await screen(page,"home").toBeVisible();
  await expect(page.locator("#homeTitle")).toHaveText("Hey, Testas!");
  await expect(page.locator('#tabbar [data-tab="groups"]')).toHaveText("Crews");
  await noLithuanian(page,"home",info);

  await tap(page,"#homePlay","Home play button");
  await screen(page,"start").toBeVisible();
  await expect(page.locator("#setupTitle")).toHaveText("New game");
  await tap(page,'[data-p="1"]',"1 player");await tap(page,'[data-d="60"]',"1 minute");
  await expect(page.locator("#exSummary")).toHaveText(/exercises/);
  await noLithuanian(page,"setup",info);
  await tap(page,"#go","Start");

  await screen(page,"ready").toBeVisible({timeout:120_000});
  await expect(page.locator("#readyTitle")).toContainText("Arms");
  await expect(page.locator("#hud"),"HUD turns on after the arms-up gate").toHaveClass(/\bon\b/,{timeout:60_000});
  await expect(page.locator("#roundN")).toHaveText(/^Round 1 \/ 2$/);
  await expect(page.locator("#exName")).toHaveText(/Squats|Jumping jacks|High knees/);
  await noLithuanian(page,"game",info);

  await screen(page,"end").toBeVisible({timeout:100_000});
  await expect(page.locator("#wl")).toHaveText("Your score");
  await expect(page.locator("#winner")).toHaveText(/^\d+ pts$/);
  await expect(page.locator("#endsub")).toHaveText(/reps? · Solo · 1 min$/);
  await noLithuanian(page,"results",info);

  await tap(page,"#toClips","to clips");
  await screen(page,"clips").toBeVisible();
  await expect(page.locator("#clipsTitle")).toHaveText("Best moments");
  await expect(page.locator("#previewLoad"),"highlight cut finishes").toBeHidden({timeout:120_000});
  await noLithuanian(page,"clips",info);

  await page.locator("#clips [data-home]").first().click();
  await screen(page,"home").toBeVisible();
  await page.locator('#tabbar [data-tab="profile"]').click();
  await screen(page,"profile").toBeVisible();
  await expect(page.locator("#setLbl")).toHaveText("Settings");
  await expect(page.locator('[data-lang="en"]')).toHaveAttribute("aria-checked","true");
  await noLithuanian(page,"profile",info);
  await page.locator('[data-lang="lt"]').click(); // saves novacore.lang + reloads with ?lang=lt
  await expect(page.locator("#profTitle")).toHaveText("Profilis");
  expect(await page.evaluate(()=>[document.documentElement.lang,localStorage.getItem("novacore.lang")])).toEqual(["lt","lt"]);
});
