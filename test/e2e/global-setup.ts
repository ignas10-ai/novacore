// Fake camera for every e2e browser (Chrome --use-file-for-fake-video-capture), same recipe as tools/duel-ui.cjs:
// the brand character on a plain wall, 0-20 s both arms up (passes the ready gate), then a 2 s cycle of
// knee lift left / arms-up jack / knee lift right / jack, which scores in some exercises and moves the sprinter.
// CAM2 = two copies of the mascot side by side, both arms up, for the 2-player skiing race (MediaPipe must return
// two poses and both arms must pass the shared ready gate). Made once with ffmpeg (FFMPEG env or PATH) into
// test/e2e/.cache/ (git-ignored).
import {execFileSync} from "node:child_process";
import {existsSync,mkdirSync} from "node:fs";
import {CAM,CAM2,ROOT} from "./paths.ts";
import {dirname,join} from "node:path";

export default function(){
  mkdirSync(dirname(CAM),{recursive:true});
  if(!existsSync(CAM)){
    const J=join(ROOT,"src","art","melynas-jack@2x.webp"),H=join(ROOT,"src","art","melynas-hero@2x.webp");
    const cycle=2,q=cycle/4,ph=`mod(t-20,${cycle})`;
    ffmpeg(["-f","lavfi","-i","color=c=0xd8d4cc:s=640x360:r=30","-loop","1","-i",J,"-loop","1","-i",H,"-filter_complex",
      `[1]scale=-1:330[j];[2]scale=-1:330,split[h][h2];[h2]hflip[hm];`+
      `[0][j]overlay=(W-w)/2:15:enable='lt(t,20)+between(${ph},${q},${2*q})+between(${ph},${3*q},${4*q})'[x];`+
      `[x][h]overlay=(W-w)/2:15:enable='gte(t,20)*lt(${ph},${q})'[y];[y][hm]overlay=(W-w)/2:15:enable='gte(t,20)*between(${ph},${2*q},${3*q})'`,
      "-t","110","-q:v","6","-f","mjpeg",CAM]);
  }
  if(!existsSync(CAM2)){
    const J=join(ROOT,"src","art","melynas-jack@2x.webp"); // arms up: both wrists above the nose
    ffmpeg(["-f","lavfi","-i","color=c=0xd8d4cc:s=640x360:r=30","-loop","1","-i",J,
      "-filter_complex","[1]scale=-1:300,split[a][b];[0][a]overlay=40:30[x];[x][b]overlay=W-w-40:30",
      "-t","110","-q:v","6","-f","mjpeg",CAM2]);
  }
}
function ffmpeg(args:string[]){
  try{execFileSync(process.env.FFMPEG||"ffmpeg",["-y","-loglevel","error",...args],{stdio:"inherit"})}
  catch(e){throw new Error(`e2e needs ffmpeg to make the fake cameras (${CAM}, ${CAM2}). Install it (winget install Gyan.FFmpeg / apt-get install ffmpeg) or set FFMPEG=<path>. ${(e as Error).message}`)}
}
