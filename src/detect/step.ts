// Per-player rep counter. PURE: no DOM (imported by test-detect.cjs and tools/replay.cjs).
import {NEED,VIS,MIN_GAP} from "./exercises.ts";
import {POSE,poseClassify,CLS_ENTER,CLS_EXIT,CLS_TAU,type Lm} from "./classifier.ts";

export interface StepState{
  ex?:string;lost?:boolean;ar?:number; // ar = detection frame width/height, set by the game
  down:boolean;open:boolean;leg:boolean[];k:number|null;k3:number|null;last:number;base:number|null;baseOk:boolean;air:boolean;
  downAt:number;phase:string|null;cx0:number;closedW:number|null;stepAt:number;conf:Record<string,number>|null;in:Record<string,boolean>|null;clsAt:number|null;
}

export function ang(a:Lm,b:Lm,c:Lm){const v1=[a.x-b.x,a.y-b.y],v2=[c.x-b.x,c.y-b.y];const d=v1[0]*v2[0]+v1[1]*v2[1];const m=Math.hypot(...v1)*Math.hypot(...v2)||1;return Math.acos(Math.max(-1,Math.min(1,d/m)))*180/Math.PI}
// 3D angle using MediaPipe z (depth, same scale as x). From a FRONT camera the 2D knee angle barely moves
// in a real squat (180→150 in tools/fixtures/squat.json) while the 3D angle swings ~130→60. z is noisy and
// standing reads ~125-150, not 180, so thresholds below are tuned on real clips (tools/replay.cjs).
export function ang3(a:Lm,b:Lm,c:Lm){if(a.z==null||b.z==null||c.z==null)return ang(a,b,c);const v1=[a.x-b.x,a.y-b.y,a.z-b.z],v2=[c.x-b.x,c.y-b.y,c.z-b.z];const d=v1[0]*v2[0]+v1[1]*v2[1]+v1[2]*v2[2];const m=Math.hypot(...v1)*Math.hypot(...v2)||1;return Math.acos(Math.max(-1,Math.min(1,d/m)))*180/Math.PI}
export const knee2=(lm:Lm[])=>(ang(lm[23],lm[25],lm[27])+ang(lm[24],lm[26],lm[28]))/2;
export const knee3=(lm:Lm[])=>(ang3(lm[23],lm[25],lm[27])+ang3(lm[24],lm[26],lm[28]))/2;
// squat depth gate shared by squat / squat jump: deep when EITHER angle says so, standing when both do
const KNEE_DOWN3=95, KNEE_UP3=118, KNEE_DOWN2=110, KNEE_UP2=160;

export function visible(lm:Lm[],ex:string){return NEED[ex].every(j=>(lm[j].visibility??1)>VIS)}
// ready gate: both wrists above the nose, all key points visible
export function armsUp(lm:Lm[]){return [0,11,12,15,16].every(j=>(lm[j].visibility??1)>VIS)&&lm[15].y<lm[0].y&&lm[16].y<lm[0].y}
// core body too close to a side of the camera frame? return the direction to move
export function sideCue(lm:Lm[]):""|"left"|"right"{
  const xs:number[]=[];
  for(const j of [0,11,12,23,24]){
    const p=lm[j];
    if((p.visibility??1)>VIS)xs.push(1-p.x);
  }
  if(xs.length<2)return "";
  const min=Math.min(...xs),max=Math.max(...xs);
  if(min<.07)return "right";
  if(max>.93)return "left";
  return "";
}
// pure: mutates s, returns true when one rep completes
export function step(s:StepState,lm:Lm[],ex:string,now:number):boolean{
  if(s.ex!==ex){s.ex=ex;s.down=false;s.open=false;s.leg=[false,false];s.k=null;s.k3=null;s.last=0;s.base=null;s.baseOk=false;s.air=false;s.downAt=0;s.phase=null;s.cx0=0;s.closedW=null;s.stepAt=0;s.conf=null;s.in=null;s.clsAt=null}
  if(!visible(lm,ex)){s.lost=true;return false}
  s.lost=false;
  let rep=false;
  const cfg=POSE[ex];
  if(cfg){
    // classifier counter: a rep = entering a counted pose class (EMA votes > CLS_ENTER) and leaving it (< CLS_EXIT)
    const votes=poseClassify(lm,cfg,s.ar||1), a=1-Math.exp(-Math.min(200,now-(s.clsAt??now-33))/CLS_TAU);
    s.clsAt=now;const conf=s.conf=s.conf||{},inside=s.in=s.in||{};
    for(const c of cfg.count){
      const v=conf[c]=(conf[c]??0)+((votes[c]||0)-(conf[c]??0))*a;
      if(!inside[c])inside[c]=v>CLS_ENTER;
      else if(v<CLS_EXIT){inside[c]=false;rep=true}
    }
  }else if(ex==="squat"){
    // knee angle: hip(23/24) knee(25/26) ankle(27/28); EMA-smoothed avg of both legs, 2D + 3D
    const r2=knee2(lm),r3=knee3(lm);
    const k=s.k=s.k==null?r2:s.k*0.6+r2*0.4;
    const k3=s.k3=s.k3==null?r3:s.k3*0.6+r3*0.4;
    if((k<KNEE_DOWN2||k3<KNEE_DOWN3)&&!s.down) s.down=true;
    else if(k>KNEE_UP2&&k3>KNEE_UP3&&s.down){s.down=false;rep=true}
  }else if(ex==="jack"){
    // require both arms to swing out/up and both legs to spread, not just total width
    const sw=Math.abs(lm[11].x-lm[12].x)||0.1, aw=Math.abs(lm[27].x-lm[28].x);
    const up=lm[15].y<lm[0].y&&lm[16].y<lm[0].y;
    const down=lm[15].y>lm[11].y&&lm[16].y>lm[12].y;
    const armsOut=Math.abs(lm[15].x-lm[11].x)>sw*.35&&Math.abs(lm[16].x-lm[12].x)>sw*.35;
    const armsIn=Math.abs(lm[15].x-lm[11].x)<sw*.55&&Math.abs(lm[16].x-lm[12].x)<sw*.55;
    const legsOut=aw>sw*1.4&&Math.abs(lm[27].x-lm[23].x)>sw*.35&&Math.abs(lm[28].x-lm[24].x)>sw*.35;
    const legsIn=aw<sw*1.1&&Math.abs(lm[27].x-lm[23].x)<sw*.45&&Math.abs(lm[28].x-lm[24].x)<sw*.45;
    const open=up&&armsOut&&legsOut, closed=down&&armsIn&&legsIn;
    if(open&&!s.open) s.open=true;
    else if(closed&&s.open){s.open=false;rep=true}
  }else if(ex==="squatjump"){
    // a squat only counts as a rep when the hips actually leave the standing baseline
    const r2=knee2(lm),r3=knee3(lm);
    const k=s.k=s.k==null?r2:s.k*0.6+r2*0.4;
    const k3=s.k3=s.k3==null?r3:s.k3*0.6+r3*0.4;
    const h=Math.abs(lm[23].y-lm[11].y)||0.3; // torso length = scale
    const hipY=(lm[23].y+lm[24].y)/2;
    if(s.base==null)s.base=hipY;
    else if(!s.down&&!s.air&&k>KNEE_UP2&&k3>KNEE_UP3){s.base=s.base*0.9+hipY*0.1;s.baseOk=true}
    if(!s.air&&(k<KNEE_DOWN2+5||k3<KNEE_DOWN3)&&!s.down){s.down=true;s.downAt=now}
    if(s.baseOk){
      if(s.down&&!s.air&&hipY<s.base-h*0.12)s.air=true;
      if(s.air&&hipY>s.base-h*0.05){
        s.air=false;
        if(s.down){s.down=false;rep=true}
      }
    }
    if(s.down&&!s.air&&now-s.downAt>2600)s.down=false;
  }else if(ex==="sidestep"){
    // side step = feet CLOSED → OPEN (lead foot out) → CLOSED again with the body having travelled sideways.
    // Widths are relative to this player's narrowest stance (closedW), so a wide natural stance still works.
    // No crouch gate: on a real lateral-shuffle clip (tools/fixtures/sidestep.json) the hip/shoulder ratio
    // moved 0.60→0.58 between standing and the athletic crouch – inside landmark noise, unusable from the front.
    const hw=Math.abs(lm[23].x-lm[24].x)||0.2;
    const aw=Math.abs(lm[27].x-lm[28].x), cx=(lm[27].x+lm[28].x)/2;
    if(s.closedW==null){s.closedW=aw;s.cx0=cx;s.phase="closed"}
    if(aw<s.closedW)s.closedW=aw;
    if(s.phase==="closed"){
      s.closedW+=(aw-s.closedW)*0.01; // drift up slowly so one accidental narrow frame does not stick
      s.cx0=s.cx0*0.8+cx*0.2;
      if(aw>s.closedW+hw*1.5){s.phase="open";s.stepAt=now}
    }else{
      if(aw<s.closedW+hw*0.7){
        if(Math.abs(cx-s.cx0)>hw*0.5)rep=true; // stepping out and back to the same spot is not a step
        s.phase="closed";s.cx0=cx;
      }else if(now-s.stepAt>2500){s.phase="closed";s.cx0=cx}
    }
  }else if(ex==="lunge"){
    // hips drop + staggered knees + narrow stance separate a lunge from a squat
    const h=Math.abs(lm[23].y-lm[11].y)||0.3;
    const hipY=(lm[23].y+lm[24].y)/2;
    const hips=Math.abs(lm[23].x-lm[24].x)||0.2;
    const stance=Math.abs(lm[27].x-lm[28].x);
    const stagger=Math.abs(lm[25].y-lm[26].y)/h;
    const kRaw=knee2(lm);
    if(s.base==null)s.base=hipY;
    else if(!s.down&&kRaw>160){s.base=s.base*0.9+hipY*0.1;s.baseOk=true}
    // stance gate dropped: on a real front-view reverse-lunge clip (tools/fixtures/lunge.json) the ankles sit
    // 1.5–3.5 hip widths apart at the bottom, so `stance<1.25*hips` rejected every rep. Stagger (0.5–0.8 of
    // torso in a lunge vs 0.02–0.05 in a squat) is what separates it from a squat.
    if(s.baseOk&&!s.down&&hipY>s.base+h*0.12&&stagger>0.25&&stance<hips*4)s.down=true;
    else if(s.baseOk&&s.down&&hipY<s.base+h*0.06){s.down=false;rep=true}
  }else if(ex==="crunch"){
    // knee up + opposite elbow coming DOWN to it; the knee must lower before the next rep.
    // From the front the elbow never gets closer than ~0.8 shoulder widths to the knee in x (it is a twist),
    // but it drops to knee height: dy 0.2–0.6 torso at the crunch vs 1.6–1.9 with hands behind the head
    // (tools/fixtures/crunch.json). The old 0.6/0.6 window caught 2 of 8 reps.
    const h=Math.abs(lm[23].y-lm[11].y)||0.3;
    const sw=Math.abs(lm[11].x-lm[12].x)||0.2;
    [[24,26,13],[23,25,14]].forEach(([hip,knee,elbow],j)=>{
      const lift=(lm[hip].y-lm[knee].y)/h;
      const touch=Math.abs(lm[elbow].x-lm[knee].x)/sw<1.3&&Math.abs(lm[elbow].y-lm[knee].y)/h<0.8;
      if(lift>0.1&&touch&&!s.leg[j]){s.leg[j]=true;rep=true}
      else if(lift<0.03&&s.leg[j])s.leg[j]=false;
    });
  }else if(ex==="knees"){
    // high knees: knee rises above hip line (y grows downward), each leg separately
    const h=Math.abs(lm[23].y-lm[11].y)||0.3; // torso length = scale
    [[23,25],[24,26]].forEach(([hip,knee],j)=>{
      const lift=(lm[hip].y-lm[knee].y)/h;
      if(lift>0.05&&!s.leg[j]){s.leg[j]=true;rep=true}
      else if(lift<-0.25&&s.leg[j]) s.leg[j]=false;
    });
  }
  if(rep&&now-s.last<MIN_GAP) rep=false;
  if(rep) s.last=now;
  return rep;
}
