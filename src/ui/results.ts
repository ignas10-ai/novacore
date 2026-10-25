// #end results screen: winner, score bars, per-exercise breakdown, record badge.
import {EX} from "../detect/exercises.ts";
import {S} from "../game/state.ts";
import {recordGame} from "../history/history.ts";
import {$,setDigits} from "./dom.ts";

export function renderResults(){
  const {players,score,scoreEvents,duration}=S;
  setDigits($("#r1"),String(score[0]));setDigits($("#r2"),String(score[1]));
  const top=Math.max(score[0],score[1],1);
  requestAnimationFrame(()=>{$("#b1").style.width=`${score[0]/top*100}%`;$("#b2").style.width=`${score[1]/top*100}%`});
  const w=$("#winner"),end=$("#end");
  if(players===1){$("#wl").textContent="Tavo rezultatas";w.textContent=`${score[0]} tšk.`;end.dataset.w="1"}
  else if(score[0]===score[1]){$("#wl").textContent="Rezultatas";w.textContent="Lygiosios!";end.dataset.w="0"}
  else{const k=score[0]>score[1]?1:2;$("#wl").textContent="Laimėjo";w.textContent=`Žaidėjas ${k}`;end.dataset.w=String(k)}
  const repsAll=scoreEvents.length;
  $("#endsub").textContent=`${repsAll} judesi${repsAll%10===1&&repsAll%100!==11?"s":repsAll%10>=2&&repsAll%10<=9&&(repsAll%100<10||repsAll%100>=20)?"ai":"ų"} · ${score[0]+score[1]} tšk. per ${duration/60} min`;
  // per-exercise breakdown (reps, not points) in the order the rounds were played
  const brk=$("#brk"),brkList=$("#brkList");
  const order=[...new Set(scoreEvents.map(e=>e.ex).filter(Boolean))]; // e.ex = exercise id
  brkList.replaceChildren(...order.map(id=>{
    const ex=EX.find(e=>e.id===id);
    const li=document.createElement("li");
    const name=document.createElement("span");name.className="brk-name";name.textContent=ex?ex.name:id;
    const n1=document.createElement("b");n1.className="d brk-n p1";n1.textContent=String(scoreEvents.filter(e=>e.player===0&&e.ex===id).length);
    const n2=document.createElement("b");n2.className="d brk-n p2";n2.textContent=String(scoreEvents.filter(e=>e.player===1&&e.ex===id).length);
    li.append(name,n1,n2);return li;
  }));
  brk.hidden=!order.length;
  $("#recBadge").hidden=!recordGame();
  return end;
}
