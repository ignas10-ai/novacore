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
