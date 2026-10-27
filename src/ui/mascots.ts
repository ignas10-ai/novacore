// Vector mascots (Claude Design, 2026-10-26): Raudonas (P1, red, yellow headband) and Mėlynas (P2, blue, white headband),
// round-headed boxer blobs with floating gloves and a thick navy outline. PURE: returns SVG strings, no DOM, so the
// same art works in index.html, the UI modules and Node previews. Colours are fixed brand values (the art must not
// follow the camera-flow token remap). Animation = CSS on the part classes (.m-fig .m-up .m-leg .m-glove ...), see
// "mascots" in main.css; every animated part is an inner <g> so CSS transform never fights the pose transform attribute.
// Units: viewBox 0 0 200 230, head centre (100,84) r 60, ground at y 216.

export type Who="r"|"b"|"y"|"g"; // y / g = Geltonas, Žalias (Šuolis į tolį party mode, src/longjump)
export type Mood="fierce"|"smirk"|"happy"|"sad";
export type ExId="squat"|"jack"|"knees"|"squatjump"|"sidestep"|"lunge"|"crunch";
export type Pose="idle"|"vs"|"win"|"lose"|"guard"|"punch"|"ski"|"javelin"|ExId; // guard / punch = Boksas (src/boxing), ski = Slidinėjimas (src/ski), javelin = Iečio metimas (src/javelin)

const INK="#14183A";
const C={r:{body:"#FF3B3B",band:"#FFC61A"},b:{body:"#2F6BFF",band:"#FFFFFF"},y:{body:"#FFC61A",band:"#FF3B3B"},g:{body:"#16B67A",band:"#FFC61A"}};
const RIGHT=(w:Who)=>w==="r"||w==="y"; // faces right + the fierce default face; b / g face left with the smirk
const SW=6; // outline width in viewBox units

// headband = the slice of the head circle between two curved edges; computed, so no clipPath ids (they break in
// display:none subtrees and collide between copies)
function band(fill:string){
  const cx=100,cy=84,r=60,y1=55,y2=82,x=(y:number)=>Math.sqrt(r*r-(y-cy)**2);
  const a=x(y1),b=x(y2);
  return `<path d="M${cx-a} ${y1}Q${cx} ${y1+11} ${cx+a} ${y1}A${r} ${r} 0 0 1 ${cx+b} ${y2}Q${cx} ${y2+13} ${cx-b} ${y2}A${r} ${r} 0 0 1 ${cx-a} ${y1}Z" fill="${fill}" stroke="${INK}" stroke-width="${SW-1}" stroke-linejoin="round"/>`;
}
// knot tails stick out on the side the mascot faces
const tails=(fill:string,face:number)=>`<g${face<0?' transform="translate(200 0) scale(-1 1)"':""} stroke="${INK}" stroke-width="${SW-1}" stroke-linejoin="round" fill="${fill}"><path d="M150 64 L188 52 L180 72Z"/><path d="M151 73 L184 87 L170 93Z"/></g>`;

function face(who:Who,mood:Mood,dx:number){
  const e=(x:number,y:number,ry=12.5)=>`<ellipse cx="${x+dx}" cy="${y}" rx="9.5" ry="${ry}" fill="${INK}"/><circle cx="${x+dx+2.8}" cy="${y-ry*.4}" r="3.6" fill="#fff"/>`;
  const s=(d:string,w=7)=>`<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const X=(n:number)=>n+dx;
  if(mood==="happy")return s(`M${X(72)} 106Q${X(82)} 94 ${X(92)} 106`)+s(`M${X(108)} 106Q${X(118)} 94 ${X(128)} 106`)
    +`<path d="M${X(80)} 117Q${X(100)} 148 ${X(120)} 117Z" fill="${INK}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/><path d="M${X(90)} 130Q${X(100)} 124 ${X(110)} 130Q${X(100)} 141 ${X(90)} 130Z" fill="#FF8FA3"/>`;
  if(mood==="sad")return s(`M${X(68)} 94L${X(90)} 87`,6)+s(`M${X(132)} 94L${X(110)} 87`,6)
    +`<ellipse cx="${X(82)}" cy="${108}" rx="8" ry="6.5" fill="${INK}"/><ellipse cx="${X(118)}" cy="${108}" rx="8" ry="6.5" fill="${INK}"/>`
    +s(`M${X(72)} 102.5L${X(92)} 102.5`,5)+s(`M${X(108)} 102.5L${X(128)} 102.5`,5)
    +s(`M${X(86)} 130Q${X(93)} 123 ${X(100)} 128Q${X(107)} 133 ${X(114)} 126`,5);
  if(mood==="smirk")return s(`M${X(66)} 90Q${X(78)} 79 ${X(92)} 88`)+s(`M${X(108)} 92L${X(132)} 89`)
    +e(82,106)+e(118,107,10)+s(`M${X(84)} 124Q${X(102)} 133 ${X(117)} 119`,6)+s(`M${X(114)} 116L${X(120)} 121`,5);
  // fierce
  return s(`M${X(66)} 87L${X(92)} 95`)+s(`M${X(134)} 87L${X(108)} 95`)+e(82,107)+e(118,107)
    +`<path d="M${X(84)} 119Q${X(100)} 137 ${X(116)} 119Q${X(100)} 124 ${X(84)} 119Z" fill="${INK}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/><path d="M${X(89)} 121.5Q${X(100)} 125 ${X(111)} 121.5L${X(110)} 125Q${X(100)} 128 ${X(90)} 125Z" fill="#fff"/>`;
}
export const crown=(x=100,y=6,w=64)=>{const s=w/64;return `<g transform="translate(${x-w/2} ${y}) scale(${s})"><path d="M4 42 L8 8 L22 24 L32 2 L42 24 L56 8 L60 42Z" fill="#FFC61A" stroke="${INK}" stroke-width="5.5" stroke-linejoin="round"/><circle cx="32" cy="31" r="4.5" fill="#FF3B3B" stroke="${INK}" stroke-width="3"/></g>`};
const sweat=`<path d="M38 66 C30 80 30 88 38 90 C46 88 46 80 38 66Z" fill="#A8D8FF" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`;
const spark=(x:number,y:number,s=1)=>`<path transform="translate(${x} ${y}) scale(${s})" d="M0 -16 C2 -5 5 -2 16 0 C5 2 2 5 0 16 C-2 5 -5 2 -16 0 C-5 -2 -2 -5 0 -16Z" fill="#FFC61A" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>`;

function head(who:Who,mood:Mood,f:number){
  const c=C[who];
  return `<g class="m-head">${tails(c.band,f)}<circle cx="100" cy="84" r="60" fill="${c.body}"/>${band(c.band)}`
    +`<ellipse cx="72" cy="38" rx="15" ry="8" transform="rotate(-28 72 38)" fill="#fff" opacity=".45"/>`
    +`<g transform="translate(0 6)">`+face(who,mood,f*5)+`</g>`+`<circle cx="100" cy="84" r="60" fill="none" stroke="${INK}" stroke-width="${SW}"/>`
    +(mood==="sad"?sweat:"")+`</g>`;
}
const glove=(fill:string,cls:string,x:number,y:number,cuff=false)=>`<g class="m-glove ${cls}" transform="translate(${x} ${y})"><g class="m-gl">`
  +(cuff?`<rect x="-15" y="20" width="30" height="14" rx="6" fill="#fff" stroke="${INK}" stroke-width="5"/>`:"")
  +`<circle r="27" fill="${fill}" stroke="${INK}" stroke-width="${SW}"/><path d="M-16 -9Q-12 -19 -2 -21" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".85"/></g></g>`;
const leg=(cls:string,x:number,t="")=>`<g class="m-leg ${cls}"${t?` transform="${t}"`:""}><g class="m-lg"><rect x="${x}" y="184" width="24" height="34" rx="12" fill="${INK}"/></g></g>`;

// static layout per pose: glove centres, leg transforms, upper-body offset, mood
interface P{gl:[number,number];gr:[number,number];ll?:string;lr?:string;up?:string;mood?:Mood;cuff?:boolean}
const POSES:Record<Pose,P>={
  idle:{gl:[46,152],gr:[154,152]},
  vs:{gl:[40,158],gr:[160,158]},
  win:{gl:[30,50],gr:[170,50],mood:"happy",cuff:true},
  lose:{gl:[50,196],gr:[150,196],up:"translate(0 16)",mood:"sad",ll:"translate(0 109) scale(1 .5)",lr:"translate(0 109) scale(1 .5)"},
  squat:{gl:[46,152],gr:[154,152]},
  jack:{gl:[46,152],gr:[154,152]},
  knees:{gl:[50,146],gr:[150,146]},
  squatjump:{gl:[46,152],gr:[154,152]},
  sidestep:{gl:[50,146],gr:[150,146]},
  lunge:{gl:[50,146],gr:[150,146]},
  crunch:{gl:[56,128],gr:[144,128]},
  guard:{gl:[52,136],gr:[148,136]},
  punch:{gl:[58,138],gr:[186,98]}, // front glove jabs toward the side the mascot faces (mirrored for Mėlynas)
  ski:{gl:[48,132],gr:[152,132]}, // gloves hold the poles at chest height (Slidinėjimas)
  javelin:{gl:[44,154],gr:[156,96]}, // throwing glove above the shoulder, the other hand at the chest
};
export const EX_IDS:ExId[]=["squat","jack","knees","squatjump","sidestep","lunge","crunch"];

// full-body mascot. anim=true adds the looping exercise / idle animation (CSS, transform-only)
export function mascot(who:Who,pose:Pose="idle",o:{face?:number;anim?:boolean;mood?:Mood;label?:string;cls?:string}={}){
  const f=o.face??(RIGHT(who)?1:-1), c=C[who];
  let p=POSES[pose];
  if((pose==="punch"||pose==="javelin")&&f<0)p={...p,gl:[200-p.gr[0],p.gr[1]],gr:[200-p.gl[0],p.gl[1]]};
  const mood=o.mood||p.mood||(RIGHT(who)?"fierce":"smirk");
  const up=p.up?` transform="${p.up}"`:"";
  const a11y=o.label?`role="img" aria-label="${o.label}"`:`aria-hidden="true"`;
  const skis=pose==="ski"?`<g class="m-skis">${[66,134].map((x,k)=>`<g transform="translate(${x} 216) rotate(${k?-4:4})"><rect x="-26" y="-4" width="52" height="9" rx="4.5" fill="${c.body}" stroke="${INK}" stroke-width="4"/><rect x="-18" y="-1" width="36" height="3" rx="1.5" fill="#fff" opacity=".8"/></g>`).join("")}</g>`:"";
  const javelin=pose==="javelin"?(()=>{const g=f>0?p.gr:p.gl,x=g[0],y=g[1],tx=x+f*54,ty=y-48;
    return `<g class="m-spear"><line x1="${x}" y1="${y}" x2="${tx}" y2="${ty}" stroke="${INK}" stroke-width="8" stroke-linecap="round"/><line x1="${x}" y1="${y}" x2="${tx}" y2="${ty}" stroke="${c.band}" stroke-width="4" stroke-linecap="round"/><path d="M${tx} ${ty}l${f*14} -9l-3 ${f*10}Z" fill="${INK}"/></g>`})():"";
  return `<svg class="mascot m-${who} mp-${pose}${o.anim?" anim":""}${o.cls?" "+o.cls:""}" viewBox="0 0 200 230" ${a11y} focusable="false">`
    +`<ellipse class="m-shadow" cx="100" cy="221" rx="54" ry="7" fill="${INK}" opacity=".14"/>`
    +skis
    +`<g class="m-fig"><g class="m-fi">`
    +`<g class="m-up"${up}><g class="m-ui"><rect class="m-body" x="66" y="126" width="68" height="66" rx="30" fill="${c.body}" stroke="${INK}" stroke-width="${SW}"/></g></g>`
    +`<g class="m-legs">${leg("l",76,p.ll)}${leg("r",100,p.lr)}</g>` // over the body: a lifted knee reads in front of it
    +`<g class="m-up"${up}><g class="m-ui">`
    +javelin
    +head(who,mood,f)
    +(pose==="win"?crown(100,-14,58):"")
    +glove(c.body,"l",...p.gl,p.cuff)+glove(c.body,"r",...p.gr,p.cuff)
    +`</g></g></g></g>`
    +(pose==="win"?`<g class="m-sparks">${spark(14,130,1)}${spark(186,112,.8)}${spark(178,176,.6)}</g>`:"")
    +`</svg>`;
}
// head-only avatar (HUD, profile, setup chips): the head fills the box, tails cropped
export function avatar(who:Who,mood?:Mood,o:{crown?:boolean;label?:string}={}){
  const m=mood||(RIGHT(who)?"fierce":"smirk");
  return `<svg class="m-avatar m-${who}" viewBox="${o.crown?"34 -2 132 152":"34 18 132 132"}" ${o.label?`role="img" aria-label="${o.label}"`:'aria-hidden="true"'} focusable="false">${head(who,m,RIGHT(who)?1:-1)}${o.crown?crown(100,-12,50):""}</svg>`;
}
// VS face-off (home hero, onboarding): both mascots in guard + the yellow VS badge sits in the markup between them
export const vsPair=()=>mascot("r","vs",{anim:true,cls:"m-vs-l"})+mascot("b","vs",{anim:true,cls:"m-vs-r"});

// small exercise pose icons (list rows, picker tiles, chips): chunky navy figures on a 24x24 grid, Lucide-like weight
const ICON:Record<ExId,string>={
  squat:`<circle cx="11" cy="4" r="2.4"/><path d="M11 7.5 9 13h6l-1 7M9 13l-3 1.5M10.5 9H17"/>`,
  jack:`<circle cx="12" cy="4" r="2.4"/><path d="M12 7v7M12 9 6 3.5M12 9l6-5.5M12 14l-4.5 7M12 14l4.5 7"/>`,
  knees:`<circle cx="11" cy="4" r="2.4"/><path d="M11 7v7l-1 7M11 14l5-1 .5 5M11 9.5 7 12M11 9.5l4-2"/>`,
  squatjump:`<circle cx="12" cy="3.5" r="2.4"/><path d="M12 7v6M12 9 8 5M12 9l4-4M12 13l-3 3 1 3M12 13l3 3-1 3M7 22h3M14 22h3"/>`,
  sidestep:`<circle cx="13" cy="4" r="2.4"/><path d="M13 7.5 12 13M12 13l-5 3 1 4M12 13l3 7M12.5 9.5 8 12M12.5 9.5l4.5 2M3 17l2-2M3 17l2 2"/>`,
  lunge:`<circle cx="11" cy="4" r="2.4"/><path d="M11 7v7M11 14l4 2v5M11 14l-5 6M11 9.5l-4 3M11 9.5l4 3"/>`,
  crunch:`<circle cx="11" cy="4" r="2.4"/><path d="M11 7.5 12 14l-1 7M12 14l4 1 .5-4M11.5 9.5l4 2.5M11 9.5 7 7.5"/>`,
};
export const exIcon=(id:string)=>`<svg class="ex-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${(ICON as Record<string,string>)[id]||ICON.squat}</svg>`.replace(/<circle /g,'<circle fill="currentColor" stroke="none" ');
// exercise illustration: alternate red/blue like the picker order (squat red, jack blue, ...)
export const exWho=(id:string):Who=>EX_IDS.indexOf(id as ExId)%2?"b":"r";
export const exArt=(id:string,anim=true)=>mascot(exWho(id),(EX_IDS.includes(id as ExId)?id:id==="boxing"?"punch":id==="bowling"?"guard":id==="ski"?"ski":id==="javelin"?"javelin":id==="wall"?"sidestep":id==="sprint"||id==="hurdles"?"knees":"idle") as Pose,{anim});
