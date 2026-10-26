// Fake camera for every e2e browser (Chrome --use-file-for-fake-video-capture), same recipe as tools/duel-ui.cjs:
// the brand character on a plain wall, 0-20 s both arms up (passes the ready gate), then a 2 s cycle of
// knee lift left / arms-up jack / knee lift right / jack, which scores in some exercises and moves the sprinter.
// Made once with ffmpeg (FFMPEG env or PATH) into test/e2e/.cache/ (git-ignored).
import {execFileSync} from "node:child_process";
import {existsSync,mkdirSync} from "node:fs";
import {CAM,ROOT} from "./paths.ts";
import {dirname,join} from "node:path";

export default function(){
  if(existsSync(CAM))return;
  mkdirSync(dirname(CAM),{recursive:true});
  const art=join(ROOT,"src","art"),J=join(art,"melynas-jack@2x.webp"),H=join(art,"melynas-hero@2x.webp");
  const cycle=2,q=cycle/4,ph=`mod(t-20,${cycle})`;
  try{
    execFileSync(process.env.FFMPEG||"ffmpeg",["-y","-loglevel","error","-f","lavfi","-i","color=c=0xd8d4cc:s=640x360:r=30","-loop","1","-i",J,"-loop","1","-i",H,"-filter_complex",
      `[1]scale=-1:330[j];[2]scale=-1:330,split[h][h2];[h2]hflip[hm];`+
      `[0][j]overlay=(W-w)/2:15:enable='lt(t,20)+between(${ph},${q},${2*q})+between(${ph},${3*q},${4*q})'[x];`+
      `[x][h]overlay=(W-w)/2:15:enable='gte(t,20)*lt(${ph},${q})'[y];[y][hm]overlay=(W-w)/2:15:enable='gte(t,20)*between(${ph},${2*q},${3*q})'`,
      "-t","110","-q:v","6","-f","mjpeg",CAM],{stdio:"inherit"});
  }catch(e){
    throw new Error(`e2e needs ffmpeg to make the fake camera (${CAM}). Install it (winget install Gyan.FFmpeg / apt-get install ffmpeg) or set FFMPEG=<path>. ${(e as Error).message}`);
  }
}
