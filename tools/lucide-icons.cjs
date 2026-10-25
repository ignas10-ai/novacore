// Generates src/ui/icons.ts from lucide-react icon data (ISC). Usage: node tools/lucide-icons.cjs src/ui/icons.ts house,users,...
const fs=require("fs"),path=require("path");
// lucide-react icon data folder (any installed copy; ISC): LUCIDE=<node_modules>/lucide-react/dist/esm/icons
const dir=process.env.LUCIDE||"C:/Users/User/AppData/Roaming/npm/node_modules/omniroute/node_modules/lucide-react/dist/esm/icons";
const names=process.argv[3].split(",");
const out=[];
for(const n of names){
  let src=fs.readFileSync(path.join(dir,n+".mjs"),"utf8");for(let a;(a=src.match(/export \{ default \} from '\.\/(.+?)\.mjs'/));)src=fs.readFileSync(path.join(dir,a[1]+".mjs"),"utf8");
  const m=src.match(/const __iconData = (\{[\s\S]*?\});\s*__iconData/);if(!m)throw new Error("no data: "+n);
  const data=Function("return "+m[1])();
  const inner=data.node.map(([tag,attrs])=>`<${tag} ${Object.entries(attrs).filter(([k])=>k!=="key").map(([k,v])=>`${k}="${v}"`).join(" ")}/>`).join("");
  out.push(`  "${n}":'${inner}',`);
}
const ts=`// Inline SVG icons copied from Lucide (https://lucide.dev, ISC license, lucide-react 1.48.0 data).
// Only the icons the app uses. Markup with data-icon="name" is filled on import; icon() returns the SVG string.
// Regenerate/add: node tools/lucide-icons.cjs src/ui/icons.ts name,name,... (the full current list is the keys below).
const P:Record<string,string>={
${out.join("\n")}
};
export function icon(name:string,cls=""){
  return \`<svg class="ic\${cls?" "+cls:""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">\${P[name]||""}</svg>\`;
}
export function fillIcons(root:ParentNode=document){
  root.querySelectorAll<HTMLElement>("[data-icon]").forEach(el=>{if(!el.firstElementChild)el.innerHTML=icon(el.dataset.icon!)});
}
fillIcons();
`;
fs.writeFileSync(process.argv[2],ts);console.log("icons:",names.length);
