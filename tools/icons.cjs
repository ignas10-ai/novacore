// PWA ikonos (public/icons/*.png) iš vieno SVG ženklo: „N." (Inter 900) ant beveik juodo fono, volt taškas – kaip .wordmark.
// Naudojimas: node tools/icons.cjs  (reikia interneto Inter šriftui). Spalvos = src/styles/main.css :root (--bg, --fg, --accent).
const path=require("path");
const PUP=process.env.PUPPETEER_CORE||"c:/Users/User/.claude/projects/EA/tmp/laimos-qa/node_modules/puppeteer-core";
const CHROME=process.env.CHROME||"C:/Program Files/Google/Chrome/Application/chrome.exe";
const BG="#0b0b0f",FG="#f6f6f1",ACC="#d4ff3a";
// scale: share of the canvas the mark may use (maskable icons keep it inside the 80% safe circle)
const mark=(size,scale)=>`<html><head><link href="https://fonts.googleapis.com/css2?family=Inter:wght@900&display=block" rel="stylesheet">
<style>html,body{margin:0;width:${size}px;height:${size}px;background:${BG};display:grid;place-items:center;overflow:hidden}
b{font:900 ${Math.round(size*scale)}px/1 Inter;letter-spacing:-.06em;color:${FG};display:inline-flex;align-items:flex-end;translate:${Math.round(size*scale*.06)}px ${Math.round(size*scale*.02)}px}
b::after{content:"";width:.26em;height:.26em;margin:0 0 .08em .06em;border-radius:50%;background:${ACC}}</style></head><body><b>N</b></body></html>`;
(async()=>{
  const b=await require(PUP).launch({executablePath:CHROME,headless:"new"});
  const p=await b.newPage();
  for(const [file,size,scale] of [["icon-192.png",192,.62],["icon-512.png",512,.62],["maskable-512.png",512,.46]]){
    await p.setViewport({width:size,height:size,deviceScaleFactor:1});
    await p.setContent(mark(size,scale),{waitUntil:"load"});
    await p.evaluate(()=>document.fonts.load("900 100px Inter").then(()=>document.fonts.ready));
    await p.screenshot({path:path.join(__dirname,"..","public","icons",file)});console.log("•",file);
  }
  await b.close();
})();
