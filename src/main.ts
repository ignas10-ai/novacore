// Entry: wires the UI modules (each sets up its own DOM on import), then shows the first screen
// (onboarding on the very first visit, else the screen of the URL hash) and loads the k-NN sample poses.
import {POSE} from "./detect/classifier.ts";
import "./ui/icons.ts";
import {fillTpl} from "./ui/dom.ts";
fillTpl(document);
import {render} from "./ui/router.ts";
import {firstRun} from "./ui/onboarding.ts";
import "./ui/start.ts";
import "./audio/sound.ts";
import "./history/history.ts";
import "./ui/coach.ts";
import "./ui/social.ts";
import "./ui/home.ts";
import "./ui/library.ts";
import "./ui/profile.ts";
import "./ui/fullscreen.ts";
import "./ui/wakelock.ts";
import "./clips/clips.ts";
import "./game/game.ts";
import "./sprint/sprint.ts";

if(!firstRun())render();
if("serviceWorker" in navigator&&(location.protocol==="https:"||location.hostname==="localhost"))addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
// k-NN sample poses (tools/samples.cjs); until loaded, or if the fetch fails, step() uses the hand-written branches
fetch("pose-samples.json").then(r=>r.ok?r.json():{}).then(d=>Object.assign(POSE,d)).catch(()=>{});
