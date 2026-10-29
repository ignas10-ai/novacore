// Entry: wires the UI modules (each sets up its own DOM on import), then shows the first screen
// (onboarding on the very first visit, else the screen of the URL hash) and loads the k-NN sample poses.
import "./i18n/dom.ts"; // first: translates index.html before any module reads or copies its text
import {POSE} from "./detect/classifier.ts";
import "./ui/icons.ts";
import {fillTpl} from "./ui/dom.ts";
import {paintArt} from "./ui/avatar.ts";
fillTpl(document);paintArt(); // template copies (onboarding phone placement) carry mascot placeholders too
import {render,parse} from "./ui/router.ts";
import {firstRun} from "./ui/onboarding.ts";
import "./ui/start.ts";
import "./audio/sound.ts";
import "./history/history.ts";
import "./ui/coach.ts";
import "./ui/social.ts";
import "./cast/cast.ts";
import "./cast/screen.ts";
import "./ui/home.ts";
import "./ui/library.ts";
import "./ui/profile.ts";
import "./ui/fullscreen.ts";
import "./ui/wakelock.ts";
import "./clips/clips.ts";
import "./game/game.ts";
import "./duel/duel.ts"; // remote duels (optional, online only)
import {Capacitor} from "@capacitor/core";
import {App} from "@capacitor/app";
import "./sprint/sprint.ts";
import "./boxing/boxing.ts"; // after sprint: its Pradžia tile goes right below the sprint tile
import "./longjump/longjump.ts"; // Šuolis į tolį: its tile goes below the boxing tile
import "./hurdles/hurdles.ts"; // Barjerinis bėgimas: its tile goes below the long jump tile
import "./bowling/bowling.ts"; // Boulingas: its tile goes below the hurdles tile
import "./ski/ski.ts"; // Slidinėjimas: its tile goes below the bowling tile
import "./wall/wall.ts"; // Siena: its tile goes below the skiing tile
import "./javelin/javelin.ts"; // Iečio metimas: its tile goes below the Siena tile
import "./badminton/badminton.ts"; // Badmintonas: inserted after Siena too, so it sits before Iečio metimas
import {initGalleries} from "./ui/gallery.ts"; // #41: setup heroes are 3-frame scroll-snap galleries
import "./styles/glass.css"; // #38 glass look – last, so it wins over every game's own CSS

initGalleries(); // all game setup modules above have built their .gal-hero markup

// the TV/laptop scoreboard never shows the first-run onboarding (a fresh browser there has no nickname/history)
if(parse(location.hash).v==="screen")render();
else if(!firstRun())render();
// Android back = the same history.back() as the on-screen back (router.ts handles it); nothing left to go back to = close the app
if(Capacitor.isNativePlatform())App.addListener("backButton",e=>e.canGoBack?history.back():App.exitApp());
// no service worker in the Android app: the files are already on the phone (and a SW would serve stale builds after an update)
if(!Capacitor.isNativePlatform()&&"serviceWorker" in navigator&&(location.protocol==="https:"||location.hostname==="localhost"))addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
// k-NN sample poses (tools/samples.cjs); until loaded, or if the fetch fails, step() uses the hand-written branches
fetch("pose-samples.json").then(r=>r.ok?r.json():{}).then(d=>Object.assign(POSE,d)).catch(()=>{});
