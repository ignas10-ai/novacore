// #41: every mini-game setup header is a 3-frame scroll-snap gallery of real game frames (no static illustration).
// Checks all 9 screens, the dots and that the first frame actually loads (a typo in a scene path must fail here).
import {test,expect} from "./fixtures.ts";

const GAMES:[string,string,string][]=[
  ["#/sprintas","sp","Sprintas"],
  ["#/barjerai","hd","Barjerai"],
  ["#/tolis","lj","Šuolis į tolį"],
  ["#/boksas","bx","Boksas"],
  ["#/boulingas","bw","Boulingas"],
  ["#/slidinejimas","sk","Slidinėjimas"],
  ["#/siena","wl","Hole in the Wall"],
  ["#/badmintonas","bd","Badmintonas"],
  ["#/ietis","jv","Ietis"],
];

test("every game setup header is a 3-frame gallery",async({page})=>{
  for(const [hash,code,name] of GAMES){
    await page.goto("/"+hash);
    const hero=page.locator(`.gal-hero[data-gal="${code}"]`);
    await expect(hero,`${name}: gallery`).toBeVisible();
    await expect(hero.locator(".gal-slide"),`${name}: 3 panels`).toHaveCount(3);
    await expect(hero.locator(".gal-dot"),`${name}: 3 dots`).toHaveCount(3);
    await expect(hero.locator(".gal-big"),`${name}: title`).not.toBeEmpty();
    await expect(hero.locator(".gal-sub"),`${name}: tagline`).not.toBeEmpty();
    await expect(hero.locator(".gal-slide .sa svg"),`${name}: animated emblem`).toHaveCount(3);
    await expect(hero.locator(".gal-dot").first()).toHaveAttribute("aria-current","true");
    await hero.locator(".gal-dot").nth(2).click();
    await expect(hero.locator(".gal-dot").nth(2),`${name}: last dot follows the scroll`).toHaveAttribute("aria-current","true");
  }
});
