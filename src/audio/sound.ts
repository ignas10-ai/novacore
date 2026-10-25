// Sound: synthesized with Web Audio, no files. AudioContext is created only after the Start gesture.
import {$} from "../ui/dom.ts";

let ac:AudioContext|null=null, soundOn=true;
try{soundOn=localStorage.getItem("novacore.sound")!=="0"}catch(e){}
const sndBtn=$("#snd"), sndTxt=$("#sndTxt");
function syncSnd(){sndBtn.dataset.on=soundOn?"1":"0";sndBtn.setAttribute("aria-pressed",String(soundOn));sndTxt.textContent=soundOn?"įj.":"išj."}
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
export const sfx={
  rep:(i:number)=>{tone(i?1046:784,.07,.16);try{navigator.vibrate?.(30)}catch(e){}},
  round:()=>{tone(659,.12,.2,"triangle");tone(988,.2,.2,"triangle",.12)},
  tick:()=>tone(1200,.035,.07,"sine"),
  finish:()=>[523,659,784,1046].forEach((f,k)=>tone(f,k===3?.55:.14,.2,"triangle",k*.13)),
};
sndBtn.onclick=()=>{soundOn=!soundOn;try{localStorage.setItem("novacore.sound",soundOn?"1":"0")}catch(e){}syncSnd();if(soundOn){ensureAudio();tone(880,.08,.16)}};
syncSnd();
