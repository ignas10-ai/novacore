// Sound + vibration: synthesized with Web Audio, no files. AudioContext is created only after the Start gesture.
// Every [data-snd] / [data-vibe] switch (setup screen, profile settings) mirrors the same setting.
let ac:AudioContext|null=null, soundOn=true, vibeOn=true;
try{soundOn=localStorage.getItem("novacore.sound")!=="0";vibeOn=localStorage.getItem("novacore.vibe")!=="0"}catch(e){}
function sync(){
  document.querySelectorAll("[data-snd]").forEach(b=>b.setAttribute("aria-checked",String(soundOn)));
  document.querySelectorAll("[data-vibe]").forEach(b=>b.setAttribute("aria-checked",String(vibeOn)));
}
export function ensureAudio(){
  if(!ac){try{ac=new (window.AudioContext||(window as any).webkitAudioContext)()}catch(e){return null}}
  if(ac!.state==="suspended")ac!.resume().catch(()=>{});
  return ac;
}
function tone(freq:number,dur:number,gain=.2,type:OscillatorType="square",when=0){
  if(!soundOn||!ac)return;
  const t=ac.currentTime+when,o=ac.createOscillator(),g=ac.createGain();
  o.type=type;o.frequency.value=freq;
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(gain,t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+dur);
  o.connect(g).connect(ac.destination);o.start(t);o.stop(t+dur+.02);
}
// short white-noise burst (start gun crack)
function noise(dur:number,gain:number){
  if(!soundOn||!ac)return;
  const n=Math.floor(ac.sampleRate*dur),b=ac.createBuffer(1,n,ac.sampleRate),d=b.getChannelData(0);
  for(let k=0;k<n;k++)d[k]=(Math.random()*2-1)*(1-k/n)**3;
  const s=ac.createBufferSource(),g=ac.createGain();g.gain.value=gain;s.buffer=b;s.connect(g).connect(ac.destination);s.start();
}
const buzz=(ms:number)=>{if(vibeOn)try{navigator.vibrate?.(ms)}catch(e){}};
export const sfx={
  rep:(i:number)=>{tone(i?1046:784,.07,.16);buzz(30)},
  round:()=>{tone(659,.12,.2,"triangle");tone(988,.2,.2,"triangle",.12)},
  tick:()=>tone(1200,.035,.07,"sine"),
  step:(i:number)=>tone(i?150:120,.045,.09,"sine"), // sprint footfall
  gun:()=>{noise(.32,.5);tone(90,.18,.3,"sine");buzz(80)}, // sprint start
  finish:()=>[523,659,784,1046].forEach((f,k)=>tone(f,k===3?.55:.14,.2,"triangle",k*.13)),
  // Boksas (src/boxing)
  punch:(i:number)=>{noise(.07,.32);tone(i?200:160,.09,.22);buzz(28)},
  gold:()=>{noise(.06,.25);[1046,1318,1568].forEach((f,k)=>tone(f,.12,.14,"triangle",k*.06));buzz(45)},
  bomb:()=>{noise(.35,.55);tone(70,.3,.32,"sawtooth");buzz(160)},
  miss:()=>tone(196,.12,.06,"sine"),
  bell:()=>{tone(1318,.9,.18,"sine");tone(1976,.6,.08,"sine");tone(1318,.6,.12,"sine",.22)},
  // Šuolis į tolį (src/longjump)
  whistle:()=>{tone(2093,.16,.14,"sine");tone(2349,.16,.1,"sine");tone(2093,.32,.14,"sine",.2);tone(2349,.32,.1,"sine",.2);buzz(60)},
  leap:()=>{noise(.18,.18);tone(330,.22,.14,"triangle");tone(660,.18,.1,"triangle",.06);buzz(35)},
  land:()=>{noise(.28,.42);tone(110,.2,.26,"sine");buzz(90)},
  horn:()=>{tone(185,.5,.2,"sawtooth");tone(139,.5,.16,"sawtooth",.04);buzz(220)},
};
const save=(k:string,on:boolean)=>{try{localStorage.setItem(k,on?"1":"0")}catch(e){}};
document.addEventListener("click",e=>{
  const b=(e.target as Element).closest("[data-snd],[data-vibe]");
  if(!b)return;
  if(b.hasAttribute("data-snd")){soundOn=!soundOn;save("novacore.sound",soundOn);if(soundOn){ensureAudio();tone(880,.08,.16)}}
  else{vibeOn=!vibeOn;save("novacore.vibe",vibeOn);buzz(40)}
  sync();
});
sync();
