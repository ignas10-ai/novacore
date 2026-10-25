// Highlight reel planning + clip tier choice. PURE: no DOM (imported by test-detect.cjs).
import {EX,ROUND_SECS} from "../detect/exercises.ts";

export interface Segment{start:number;end:number}
// pick 4 s bins with the most points, but guarantee coverage of every selected exercise
export function highlightSegments(events:{t:number;points?:number}[],total:number,binSecs=4,targetSecs=16,exerciseCount=EX.length):Segment[]{
  total=Math.max(0,total);
  if(!total)return [];
  const count=Math.max(1,Math.ceil(total/binSecs));
  const bins=Array.from({length:count},()=>0);
  for(const e of events||[]){
    const t=+e.t;
    if(!Number.isFinite(t)||t<0||t>=total)continue;
    bins[Math.min(count-1,Math.floor(t/binSecs))]+=e.points||1;
  }
  const exCount=Math.max(1,Math.floor(exerciseCount)||1);
  const rounds=Math.ceil(total/ROUND_SECS);
  const present=[...new Set(Array.from({length:rounds},(_,r)=>r%exCount))];
  const wanted=Math.min(count,Math.max(present.length,Math.ceil(targetSecs/binSecs)));
  const chosen:number[]=[];
  const pickBest=(predicate:(i:number)=>boolean)=>{
    let best=-1,bestScore=-1;
    for(let i=0;i<count;i++){
      if(chosen.includes(i)||!predicate(i))continue;
      if(bins[i]>bestScore){bestScore=bins[i];best=i}
    }
    if(best>=0)chosen.push(best);
  };
  for(const exIndex of present){
    pickBest(i=>Math.floor(((i+0.5)*binSecs)/ROUND_SECS)%exCount===exIndex);
  }
  const ranked=bins.map((score,i)=>({score,i})).sort((a,b)=>b.score-a.score||a.i-b.i);
  for(const b of ranked){
    if(chosen.length>=wanted)break;
    if(!chosen.includes(b.i)&&b.score>0)chosen.push(b.i);
  }
  if(chosen.length<wanted){
    const pool=bins.map((_,i)=>i).filter(i=>!chosen.includes(i));
    if(chosen.length){
      pool.sort((a,b)=>{
        const da=Math.min(...chosen.map(i=>Math.abs(i-a)));
        const db=Math.min(...chosen.map(i=>Math.abs(i-b)));
        return da-db||a-b;
      });
    }
    for(const i of pool){
      if(chosen.length>=wanted)break;
      chosen.push(i);
    }
  }
  chosen.sort((a,b)=>a-b);
  const segments:Segment[]=[];
  for(const i of chosen){
    const start=Math.max(0,i*binSecs-0.5);
    const end=Math.min(total,(i+1)*binSecs+0.5);
    const prev=segments[segments.length-1];
    if(prev&&start<=prev.end+0.15)prev.end=Math.max(prev.end,end);
    else segments.push({start,end});
  }
  return segments;
}
export interface ClipProfile{w:number;h:number;fps:number;bps:number;hd:boolean;fast:boolean;hq:boolean}
// pick clip size from the camera mode the phone actually negotiated
export function clipSpec(videoW:number,videoH:number,frameRate:number,portrait:boolean):ClipProfile{
  const short=Math.min(+videoW||0,+videoH||0);
  const fps=+frameRate||30;
  const hd=short>=1080;
  const fast=fps>=50;
  const side=hd?1080:720;
  const w=portrait?side:Math.round(side*16/9);
  const h=portrait?Math.round(side*16/9):side;
  const bps=hd?(fast?8000000:5500000):(fast?4500000:3000000);
  return {w,h,fps:fast?60:30,bps,hd,fast,hq:hd&&fast};
}
