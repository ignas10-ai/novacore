// Entry: wires the UI modules (each sets up its own DOM on import) and loads the k-NN sample poses.
import {POSE} from "./detect/classifier.ts";
import "./ui/start.ts";
import "./audio/sound.ts";
import "./history/history.ts";
import "./ui/social.ts";
import "./ui/fullscreen.ts";
import "./ui/wakelock.ts";
import "./clips/clips.ts";
import "./game/game.ts";

if("serviceWorker" in navigator&&(location.protocol==="https:"||location.hostname==="localhost"))addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
// k-NN sample poses (tools/samples.cjs); until loaded, or if the fetch fails, step() uses the hand-written branches
fetch("pose-samples.json").then(r=>r.ok?r.json():{}).then(d=>Object.assign(POSE,d)).catch(()=>{});
