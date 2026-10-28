// "Didelis ekranas" (TV scoreboard): the phone turns a room on in the setup, a second page in the same browser
// opens #/ekranas/<code> and the state travels over BroadcastChannel (no Supabase needed). Same path as
// tools/cast-check.cjs, in Playwright; the game states are posted on the channel like the phone would.
import {test,expect,tap,screen,watchErrors,mockSocial,a11y} from "./fixtures.ts";

test("phone room -> TV board: idle, hello back, live scores, winner, code entry, off switch",async({page,context},info)=>{
  await page.goto("/#/zaisti");
  await screen(page,"start").toBeVisible();
  await tap(page,"#castOpen","Rodyti per TV row in the setup");
  await expect(page.locator("#castOff"),"sheet offers to turn the big screen on").toBeVisible();
  await tap(page,"#castOn","Įjungti didelį ekraną");
  await expect(page.locator("#castCode")).toHaveText(/^[A-Z2-9]{6}$/);
  const code=(await page.locator("#castCode").textContent())!.trim();
  await expect(page.locator("#castOnBox")).toBeVisible();

  const tv=await context.newPage();
  const tvErrors=watchErrors(tv,"TV: ");
  await mockSocial(tv);
  await tv.setViewportSize({width:844,height:390});
  await tv.goto(`/#/ekranas/${code}`);
  await expect(tv.locator("#bsLive"),"TV receives the phone state").toHaveAttribute("data-on","1");
  await expect(tv.locator("#screen")).toHaveAttribute("data-phase","idle");
  await expect(tv.locator("#bsWaitCode")).toHaveText(code);
  await expect(page.locator("#castLive"),"phone sees the TV hello").toHaveAttribute("data-on","1",{timeout:12_000});
  await a11y(tv,"tv-wait",info);
  // The phone publishes idle every 2 s. Turn the room off before injecting fake states, otherwise a real idle
  // message can land while the TV assertions poll and reset scores/verdict (a slow-runner CI flake).
  await page.bringToFront();
  await tap(page,"#castOffBtn","Išjungti didelį ekraną");
  await expect(page.locator("#castOff")).toBeVisible();
  await expect(page.locator("#castCode")).toHaveText("------");
  await expect(page.locator("#homeCast")).toHaveAttribute("data-on","0");

  const state=(o:object)=>({v:1,code,players:2,duration:180,round:0,mult:1,sent:Date.now(),ex:null,score:[0,0],reps:0,winner:0,...o});
  const post=(s:object)=>tv.evaluate(({code,s})=>{const c=new BroadcastChannel("novacore-screen");c.postMessage({code,state:s});c.close()},{code,s});
  await post(state({phase:"play",left:92,round:2,mult:3,ex:{id:"squat",name:"Pritūpimai"},score:[148,131],reps:98}));
  await expect(tv.locator("#screen")).toHaveAttribute("data-phase","play");
  await expect(tv.locator("#bsS1")).toHaveText("148");await expect(tv.locator("#bsS2")).toHaveText("131");
  await expect(tv.locator("#bsEx")).toHaveText("Pritūpimai");await expect(tv.locator("#bsMult")).toHaveText("×3");
  await expect(tv.locator("#bsTimer")).toHaveText(/^\d:\d\d$/);
  await expect(tv.locator("#bsDemo .mascot, #bsDemo .demo-svg").first(),"exercise demo on the TV").toBeAttached();
  await a11y(tv,"tv-live",info);
  // a hostile / broken payload is clamped, not rendered raw
  await post(state({phase:"play",left:50,score:[-5,1e9],ex:{id:'x"]',name:"y"}}));
  await expect(tv.locator("#bsS1")).toHaveText("0");await expect(tv.locator("#bsS2")).toHaveText("9999");

  await post(state({phase:"done",left:0,score:[148,131],reps:98,winner:1}));
  await expect(tv.locator("#screen")).toHaveAttribute("data-phase","done");
  await expect(tv.locator("#bsVerdictTxt")).toHaveText("Žaidėjas 1 laimi!");
  await expect(tv.locator("#bsReps")).toContainText("98");

  await tv.goto("/#/ekranas");
  await tv.locator("#bsCodeIn").fill("ZZ");await tv.locator("#bsConnect .go").click();
  await expect(tv.locator("#bsErr"),"short code rejected").not.toBeEmpty();
  await tv.locator("#bsCodeIn").fill(code.toLowerCase());await tv.locator("#bsConnect .go").click();
  await expect(tv).toHaveURL(new RegExp(`#/ekranas/${code}$`));
  await expect(tv.locator("#screen")).toHaveAttribute("data-phase","idle");
  expect(tvErrors,"TV browser errors").toEqual([]);
});
