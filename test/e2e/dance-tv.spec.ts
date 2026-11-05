// Šokių kova on the big screen (#69): the dance setup's cast icon opens a room, the TV follows the round and shows
// the live movement energy under the scores plus the STOP! overlay while the music is off. The pure protocol fields
// are checked by test-cast.cjs; this is the real BroadcastChannel + dance-screen path in a browser.
import {test,expect,tap,screen,watchErrors,mockSocial} from "./fixtures.ts";

test.setTimeout(5*60_000);
test.use({trace:"off"}); // the camera specs compete with MediaPipe for the software GPU

test("dance on the TV: ready -> live energy -> STOP overlay -> done",async({page,context})=>{
  await page.goto("/#/sokiai");
  await screen(page,"dance").toBeVisible();
  await tap(page,"#dance [data-tv]","TV icon in the dance setup header");
  await expect(page.locator("#screenSheet")).toBeVisible();
  await tap(page,"#castOn","Įjungti didelį ekraną");
  await expect(page.locator("#castCode")).toHaveText(/^[A-Z2-9]{6}$/);
  const code=(await page.locator("#castCode").textContent())!.trim();
  await tap(page,"#screenClose","close the cast sheet");

  const tv=await context.newPage();
  const tvErrors=watchErrors(tv,"TV: ");
  await mockSocial(tv);
  await tv.setViewportSize({width:844,height:390});
  await tv.goto(`/#/ekranas/${code}`);
  await expect(tv.locator("#screen")).toHaveAttribute("data-phase","idle");
  await expect(tv.locator("#bsLive"),"TV receives the phone state").toHaveAttribute("data-on","1");
  await expect(page.locator("#castLive"),"phone sees the TV hello").toHaveAttribute("data-on","1",{timeout:12_000});
  await page.bringToFront();

  await tap(page,'[data-dc="1"]',"solo");
  await tap(page,'[data-dcd="30"]',"30 s");
  await tap(page,"#dcGo","Į šokių aikštelę");
  await screen(page,"ready").toBeVisible({timeout:120_000});
  await expect(tv.locator("#screen"),"TV shows the arms-up gate").toHaveAttribute("data-phase","ready",{timeout:15_000});
  await screen(page,"danceRun").toBeVisible({timeout:90_000});
  await expect.poll(()=>page.evaluate(()=>(window as any).__danceState()?.phase),{timeout:30_000}).toBe("play");
  await expect(tv.locator("#screen")).toHaveAttribute("data-phase","play",{timeout:15_000});
  await expect(tv.locator("#screen"),"dance mode on the board").toHaveAttribute("data-dance","1");
  await expect(tv.locator("#bsEx")).toHaveText("Šokių kova");
  await expect(tv.locator("#bsRound")).toContainText("Sustingimų");

  // the fake camera is still for its first 20 s, then lifts knees / jacks: wait for the energy to reach the TV
  await expect.poll(async()=>{
    const s=await page.evaluate(()=>(window as any).__danceState());
    return s?.p?.[0]?.energy??0;
  },{timeout:25_000,intervals:[300,600,1000]}).toBeGreaterThan(0.25);
  await expect.poll(async()=>tv.locator("#bsE1").evaluate(e=>{
    const m=getComputedStyle(e as HTMLElement).transform.match(/matrix\(([^,]+)/);
    return m?Number(m[1]):0;
  }),{timeout:5000}).toBeGreaterThan(0.2);

  // a freeze must cover the board with STOP!
  await expect.poll(()=>page.evaluate(()=>(window as any).__danceState()?.dance),{timeout:30_000,intervals:[150,250,500]}).toBe("freeze");
  await expect(tv.locator("#bsStop"),"STOP overlay on the TV").toBeVisible({timeout:2500});
  await expect(tv.locator("#bsStopWord")).toHaveText(/STOP/);
  await expect(tv.locator("#bsStopSub")).toHaveText(/Sustink|Freeze/);
  await expect(tv.locator("#bsStop"),"overlay clears when the music resumes").toBeHidden({timeout:6000});

  await screen(page,"danceEnd").toBeVisible({timeout:60_000});
  const end=await page.evaluate(()=>(window as any).__danceState());
  await expect(tv.locator("#screen")).toHaveAttribute("data-phase","done",{timeout:15_000});
  await expect(tv.locator("#bsS1")).toHaveText(String(end.p[0].score));
  await expect(tv.locator("#bsStop")).toBeHidden();
  await expect(tv.locator("#bsReps")).toContainText("Išlaikyta sustingimų");
  expect(tvErrors,"TV browser errors").toEqual([]);
});
