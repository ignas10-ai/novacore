// Mutable state shared between modules (settings + the running game). Module-private state stays in its module.
import {EX,type Exercise} from "../detect/exercises.ts";
import type {StepState} from "../detect/step.ts";

export interface ScoreEvent{t:number;points:number;player:number;ex:string}
export const S={
  players:2, duration:180,
  activeEX:EX.filter(e=>!e.beta) as Exercise[], // start-screen picker keeps this non-empty
  score:[0,0],
  scoreEvents:[] as ScoreEvent[],
  lastPointAt:[0,0],
  st:[{},{}] as StepState[], // per-player state machine
  running:false, t0:0, curMult:1,
  fl:[0,0], // last +N flash per player (skeleton glows for 250 ms)
  camFps:30,
  rec:null as MediaRecorder|null, recFrameMs:28, lastRecDrawAt:0,
};
