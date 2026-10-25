// Pozų partija: node --env-file=<.env.local su GEMINI_API_KEY> tools/art/batch.mjs <jobs.json> [vardas ...]
// jobs.json: [{name, who:"r"|"b"|"rb"|"-", aspect, pose}] -> tools/art/raw/v4/<name>-<n>.png (n = kelintas bandymas).
// Kiekvienas personažo kadras generuojamas SU patvirtintu personažo lapu (sheet-r3 / sheet-b3) kaip nuoroda.
import fs from 'fs';
import {execFile} from 'child_process';
const R='tools/art/raw/', txt=f=>fs.readFileSync(R+f,'utf8').trim();
const [jobsFile,...only]=process.argv.slice(2);
const jobs=JSON.parse(fs.readFileSync(jobsFile,'utf8')).filter(j=>!only.length||only.includes(j.name));
const STICKER='Full body, the whole figure inside the frame with a comfortable margin. Render it as a die-cut sticker: a thick clean pure-white outline around the whole silhouette. Background: perfectly flat pure chroma green #00FF00, no gradient, no floor, no cast shadow on the background, nothing else in the image. Match the reference character sheet(s) EXACTLY: same face, hair, skin tone, outfit, colours and proportions.';
const who={r:['r.txt',['sheet-r3.png']],b:['b.txt',['sheet-b3.png']],rb:[['r.txt','b.txt'],['sheet-r3.png','sheet-b3.png']]};
async function one(j){
  let n=1;while(fs.existsSync(`${R}v4/${j.name}-${n}.png`))n++;
  const out=`${R}v4/${j.name}-${n}.png`;
  const w=who[j.who];
  const desc=w?[w[0]].flat().map(txt).join(' '):'';
  const prompt=j.who==='-'?`${j.pose} Style: premium stylized 3D render like a high-end mobile game UI, soft matte clay and glossy vinyl materials, bright clean studio lighting with a gentle rim light, vivid saturated colours.`:`${txt('style.txt')} ${desc} Pose: ${j.pose} ${j.extra||STICKER}`;
  const refs=w?w[1].map(f=>R+f):[];
  await new Promise((res)=>{
    execFile(process.execPath,[...process.execArgv,'tools/art/gen.mjs',out,prompt,j.aspect||'1:1',...refs],{env:process.env,maxBuffer:1e7},(e,so,se)=>{console.log(j.name,e?'FAIL '+se.slice(0,300):so.trim().slice(0,80));res()});
  });
}
const pool=4;let k=0;
await Promise.all(Array.from({length:pool},async()=>{while(k<jobs.length)await one(jobs[k++])}));
