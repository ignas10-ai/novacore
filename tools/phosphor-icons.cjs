// Generates src/ui/icons.ts from Phosphor Icons (MIT, @phosphor-icons/core 2.1.1 on unpkg). Usage: node tools/phosphor-icons.cjs src/ui/icons.ts
// The app keeps its icon names (the old Lucide ones, used in data-icon / icon()); MAP says which Phosphor glyph and weight each one is.
const fs=require("fs");
const MAP={house:"house",users:"users",dumbbell:"barbell",user:"user",play:"play:fill","chevron-left":"caret-left","chevron-right":"caret-right",plus:"plus",
  "share-2":"share-network","log-out":"sign-out","log-in":"sign-in",trophy:"trophy",flame:"fire:fill",target:"target","volume-2":"speaker-high","volume-x":"speaker-x",
  vibrate:"vibrate","shield-check":"shield-check",info:"info",check:"check",x:"x","trash-2":"trash",pencil:"pencil-simple",swords:"sword",timer:"timer",zap:"lightning:fill",
  medal:"medal",lock:"lock-simple:fill",history:"clock-counter-clockwise",smartphone:"device-mobile",camera:"camera",award:"medal-military",star:"star:fill",crown:"crown-simple:fill",
  "rotate-ccw":"arrow-counter-clockwise",download:"download-simple","calendar-days":"calendar-dots",maximize:"corners-out",minimize:"corners-in","arrow-right":"arrow-right",
  sparkles:"sparkle",footprints:"sneaker-move",tv:"television-simple",cast:"screencast",airplay:"airplay",laptop:"laptop",clock:"clock","chevron-down":"caret-down","chevron-up":"caret-up",
  "scan-face":"scan","arrow-up":"arrow-up","arrow-down":"arrow-down",copy:"copy","external-link":"arrow-square-out",globe:"globe-simple",power:"power","layout-grid":"squares-four",
  hand:"hand","users-three":"users-three","person":"person-simple"};
(async()=>{
  const out=[];
  for(const [k,v] of Object.entries(MAP)){
    const [n,w="regular"]=v.split(":"), f=w==="regular"?n:`${n}-${w}`;
    const svg=await (await fetch(`https://unpkg.com/@phosphor-icons/core@2.1.1/assets/${w}/${f}.svg`)).text();
    const inner=svg.replace(/^<svg[^>]*>/,"").replace(/<\/svg>\s*$/,"");if(!inner.includes("<path"))throw new Error("no svg: "+v);
    out.push(`  "${k}":'${inner}',`);
  }
  fs.writeFileSync(process.argv[2],`// Inline SVG icons from Phosphor Icons (https://phosphoricons.com, MIT, @phosphor-icons/core 2.1.1), 11-03 (Martynas).
// Only the icons the app uses, under the app's own names. Markup with data-icon="name" is filled on import; icon() returns the SVG string.
// Regenerate/add: edit MAP in tools/phosphor-icons.cjs, then node tools/phosphor-icons.cjs src/ui/icons.ts
const P:Record<string,string>={
${out.join("\n")}
};
export function icon(name:string,cls=""){
  return \`<svg class="ic\${cls?" "+cls:""}" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" focusable="false">\${P[name]||""}</svg>\`;
}
export function fillIcons(root:ParentNode=document){
  root.querySelectorAll<HTMLElement>("[data-icon]").forEach(el=>{if(!el.firstElementChild)el.innerHTML=icon(el.dataset.icon!)});
}
fillIcons();
`);
})();
