// Big-screen ("Didelis ekranas") room + wire protocol. PURE: no DOM, no storage, no network.
// The phone is the camera and the source of truth; the TV/laptop only renders the state it receives.
// Tested by test-cast.cjs (part of `npm test`).

export const SCREEN_CODE_LEN=6;
// No 0/O/1/I: the code may be typed on a TV remote.
export const SCREEN_ALPHABET="23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const SCREEN_BC="novacore-screen"; // BroadcastChannel between tabs of the same browser (offline second screen)
export const SCREEN_CHANNEL="novacore-screen-"; // Supabase Realtime topic for a room (across devices)

export type ScreenPhase="idle"|"ready"|"play"|"done";
export interface ScreenState{
  v:1;
  code:string;
  phase:ScreenPhase;
  players:1|2;
  duration:number; // seconds (60/180)
  left:number; // seconds left when this message was sent
  round:number; // 0-based round
  mult:number; // 1+round
  ex:{id:string;name:string}|null;
  score:[number,number];
  reps:number; // total counted reps this game
  winner:0|1|2; // 1=P1, 2=P2, 0=tie or solo
  cam:boolean; // the phone's camera-per-TV option (the video itself goes over WebRTC)
  sent:number; // Date.now() on the phone (debug only; receivers use their own clock)
  lang:"lt"|"en"; // the phone's language: the TV board follows it (older phones send none -> "lt")
}

export function makeCode(rand:()=>number=Math.random){
  let s="";
  for(let i=0;i<SCREEN_CODE_LEN;i++)s+=SCREEN_ALPHABET[Math.floor(Math.min(.999999,Math.max(0,rand()))*SCREEN_ALPHABET.length)];
  return s;
}
// Accepts what a person types ("ab-cd 23") and returns the canonical code shape.
export function normCode(v:string){
  return v.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,SCREEN_CODE_LEN);
}
export const isCode=(v:string)=>new RegExp(`^[A-Z0-9]{${SCREEN_CODE_LEN}}$`).test(v);
export const channelName=(code:string)=>SCREEN_CHANNEL+code;

// A receiver only knows the last message. It ticks with its own clock, so a phone/TV clock difference cannot make
// the timer jump: each message restarts the local countdown from `left`.
export function leftAt(left:number,baseAt:number,now:number){
  return Math.max(0,left-Math.max(0,now-baseAt)/1000);
}

const int=(v:unknown,min=0,max=99999)=>{
  const n=Math.floor(Number(v));
  return Number.isFinite(n)?Math.min(max,Math.max(min,n)):min;
};
// Never trust a broadcast payload: clamp everything the scoreboard renders.
export function readState(raw:any):ScreenState|null{
  if(!raw||raw.v!==1||typeof raw.code!=="string")return null;
  const phase=raw.phase;
  if(phase!=="idle"&&phase!=="ready"&&phase!=="play"&&phase!=="done")return null;
  const players:1|2=raw.players===1?1:2;
  const duration=int(raw.duration,1,1800);
  const score:[number,number]=[int(raw.score?.[0],0,9999),int(raw.score?.[1],0,9999)];
  // exercise ids end up in a CSS selector (coachSvg): only the app's own a-Z0-9-_ shape is accepted
  const exId=raw.ex&&typeof raw.ex.id==="string"&&/^[a-z0-9_-]{1,24}$/i.test(raw.ex.id)?raw.ex.id:null;
  const ex=exId&&typeof raw.ex.name==="string"?{id:exId,name:raw.ex.name.slice(0,40)}:null;
  return {
    v:1,
    code:raw.code.slice(0,8),
    phase,
    players,
    duration,
    left:Math.min(duration,Math.max(0,Number(raw.left)||0)),
    round:int(raw.round,0,999),
    mult:int(raw.mult,1,99),
    ex,
    score,
    reps:int(raw.reps,0,99999),
    winner:raw.winner===1?1:raw.winner===2?2:0,
    cam:!!raw.cam,
    sent:Number(raw.sent)||0,
    lang:raw.lang==="en"?"en":"lt",
  };
}
