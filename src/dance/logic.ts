// Šokių kova – šok ir sustink: PURE dance-freeze logic (no DOM; test/unit/dance.test.ts).
// Space = boxing's: mirrored frame-height units, X=(1-lm.x)*ar, Y=lm.y; body unit u from boxing bodyOf().
// DANCE: the beat plays, points flow from movement = summed speed of the limb joints in u/s (EMA-smoothed), mapped to
// 0..1 between NOISE and FULL, so detector jitter scores nothing and flailing is capped at DANCE_PPS points/s.
// FREEZE: the music cuts at a random moment (every FREEZE_MIN..FREEZE_MAX s of dancing) for FREEZE_S; after GRACE_S (reaction time + smoothing lag)
// a player whose motion goes over STILL loses MOVED_PTS once; whoever stays still gets HOLD_PTS. Every POSE_EVERY-th
// freeze asks for a pose (rankos aukštyn / lėktuvas / rankos ant klubų); held + matching at the end = +POSE_PTS.
import type {Lm} from "../detect/classifier.ts";
import {VIS} from "../detect/exercises.ts";
import {assign,bodyOf,type Body} from "../boxing/logic.ts";

export type PoseId="up"|"plane"|"hips";
export const POSES:PoseId[]=["up","plane","hips"];
export const JOINTS=[13,14,15,16,23,24,25,26,27,28]; // elbows, wrists, hips, knees, ankles
// ponytail: thresholds are calibration knobs measured on stock clips; tune on a real phone if freezes feel unfair
export const NOISE=2, FULL=10;          // u/s summed over JOINTS: below NOISE = standing, FULL = dancing hard
export const STILL=5;                   // u/s: above this during a freeze = "Pajudėjai!"
export const TAU=0.15, MAX_DT=0.5;      // s: motion smoothing; 0.5 keeps ~2 fps detections (slow software WebGL) counting, still below LOST_S
export const DANCE_PPS=20, HOLD_PTS=30, POSE_PTS=50, MOVED_PTS=-20;
export const FREEZE_S=2.5, GRACE_S=0.8, FREEZE_MIN=4, FREEZE_MAX=8, FIRST_FREEZE=5, POSE_EVERY=3, LOST_S=0.6;

export interface DPlayer{score:number;held:number;moved:number;poses:number;motion:number;energy:number;
  prev:(Lm|null)[]|null;prevT:number;body:Body|null;seenAt:number;lm:Lm[]|null;out:boolean}
export interface Dance{players:number;ar:number;dur:number;rng:()=>number;p:DPlayer[];t:number;
  phase:"dance"|"freeze";phaseAt:number;nextFreeze:number;freezes:number;pose:PoseId|null}
export type EvType="freeze"|"resume"|"moved"|"held"|"pose";
export interface Ev{type:EvType;p:number;pts:number;pose:PoseId|null}

const ok=(p:Lm|undefined)=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&(p.visibility??1)>VIS;
const player=():DPlayer=>({score:0,held:0,moved:0,poses:0,motion:0,energy:0,prev:null,prevT:0,body:null,seenAt:-1e9,lm:null,out:false});
export const energyOf=(m:number)=>Math.min(1,Math.max(0,(m-NOISE)/(FULL-NOISE)));

export function newDance(players:number,ar:number,dur:number,rng:()=>number=Math.random):Dance{
  return {players:players===2?2:1,ar:ar>0&&Number.isFinite(ar)?ar:16/9,dur,rng,p:[player(),player()],t:0,
    phase:"dance",phaseAt:0,nextFreeze:FIRST_FREEZE+rng()*(FREEZE_MAX-FIRST_FREEZE),freezes:0,pose:null};
}

// pose tests in u around the shoulders (screen-mirrored, y down)
export function poseOf(lm:Lm[]|null,ar:number):PoseId|null{
  if(!lm)return null;
  const b=bodyOf(lm,ar);if(!b)return null;
  const X=(j:number)=>(1-lm[j].x)*ar, Y=(j:number)=>lm[j].y, w=[15,16];
  if(!w.every(j=>ok(lm[j])))return null;
  if(w.every(j=>Y(j)<b.sy-0.6*b.u))return "up";
  if(w.every(j=>Math.abs(Y(j)-b.sy)<0.45*b.u)&&Math.min(X(15),X(16))<b.lx-0.6*b.u&&Math.max(X(15),X(16))>b.rx+0.6*b.u)return "plane";
  if([[15,23],[16,24]].every(([wj,hj])=>ok(lm[hj])&&Math.hypot(X(wj)-X(hj),Y(wj)-Y(hj))<0.45*b.u))return "hips";
  return null;
}

function motionStep(P:DPlayer,lm:Lm[],b:Body,ar:number,t:number){
  const cur=JOINTS.map(j=>ok(lm[j])?lm[j]:null), dt=t-P.prevT;
  if(P.prev&&dt>0&&dt<MAX_DT){
    let d=0;
    JOINTS.forEach((_,k)=>{const a=P.prev![k],c=cur[k];if(a&&c)d+=Math.hypot((a.x-c.x)*ar,a.y-c.y)});
    const inst=d/b.u/dt, k=1-Math.exp(-dt/TAU);
    P.motion+=(inst-P.motion)*k;
  }
  P.prev=cur;P.prevT=t;
}

// One step. t = seconds since the round started; poses = this camera frame's landmarks (any order) or null (no fresh frame)
export function update(g:Dance,t:number,poses:Lm[][]|null):Ev[]{
  const evs:Ev[]=[];
  if(!Number.isFinite(t))return evs;
  const dt=Math.max(0,Math.min(MAX_DT,t-g.t));g.t=t;
  if(poses){
    const as=assign(poses,g.players,g.ar);
    for(let i=0;i<g.players;i++){
      const P=g.p[i],lm=as[i],b=lm?bodyOf(lm,g.ar):null;
      if(!b){P.prev=null;continue}
      P.body=b;P.seenAt=t;P.lm=lm;
      motionStep(P,lm!,b,g.ar,t);
    }
  }
  const live=(P:DPlayer)=>t-P.seenAt<LOST_S;
  for(let i=0;i<g.players;i++){const P=g.p[i];if(!live(P))P.motion*=Math.exp(-dt/TAU);P.energy=live(P)?energyOf(P.motion):0}
  if(g.phase==="dance"){
    for(let i=0;i<g.players;i++)g.p[i].score+=g.p[i].energy*DANCE_PPS*dt;
    if(t>=g.nextFreeze&&t+FREEZE_S<g.dur-0.5){
      g.phase="freeze";g.phaseAt=t;g.freezes++;
      g.pose=g.freezes%POSE_EVERY===0?POSES[Math.floor(g.rng()*POSES.length)%POSES.length]:null;
      g.p.forEach(P=>P.out=false);
      evs.push({type:"freeze",p:-1,pts:0,pose:g.pose});
    }
  }else{
    const ft=t-g.phaseAt;
    if(ft>=GRACE_S)for(let i=0;i<g.players;i++){
      const P=g.p[i];
      if(!P.out&&live(P)&&P.motion>STILL){P.out=true;P.moved++;const b=P.score;P.score=Math.max(0,P.score+MOVED_PTS);evs.push({type:"moved",p:i,pts:P.score-b,pose:g.pose})}
    }
    if(ft>=FREEZE_S){
      for(let i=0;i<g.players;i++){
        const P=g.p[i];
        if(P.out||!live(P))continue;
        P.held++;P.score+=HOLD_PTS;evs.push({type:"held",p:i,pts:HOLD_PTS,pose:null});
        if(g.pose&&poseOf(P.lm,g.ar)===g.pose){P.poses++;P.score+=POSE_PTS;evs.push({type:"pose",p:i,pts:POSE_PTS,pose:g.pose})}
      }
      g.phase="dance";g.phaseAt=t;g.pose=null;
      g.nextFreeze=t+FREEZE_MIN+g.rng()*(FREEZE_MAX-FREEZE_MIN);
      evs.push({type:"resume",p:-1,pts:0,pose:null});
    }
  }
  return evs;
}

export const pts=(P:DPlayer)=>Math.round(P.score);
// 0 = tie / solo, 1 = P1, 2 = P2
export function winner(g:Dance):0|1|2{
  if(g.players===1)return 0;
  const a=pts(g.p[0]),b=pts(g.p[1]);
  return a===b?0:a>b?1:2;
}
