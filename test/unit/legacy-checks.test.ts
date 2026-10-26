// The existing Node checks, wrapped so one `vitest run` reports them. No logic is copied: the synthetic-pose,
// big-screen protocol (test-cast.cjs),
// stats and sprint scripts run as they are (they print OK or throw), and the real-person replay cases come from
// tools/replay-check.cjs (CASES) and run through tools/replay.cjs exactly like `node tools/replay-check.cjs`.
// Node's own require() loads them (type stripping), so they see the same module instances they always did.
import {describe,it,expect} from "vitest";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import {existsSync} from "node:fs";
import {join} from "node:path";

const root=join(import.meta.dirname,"..","..");
const req=createRequire(import.meta.url);

describe("existing node checks",()=>{
  for(const f of ["test-detect.cjs","test-stats.cjs","test-sprint.cjs","test-cast.cjs"])
    it(f,()=>{
      const out=execFileSync(process.execPath,[join(root,f)],{cwd:root,encoding:"utf8",env:{...process.env,TZ:"Europe/Vilnius"}});
      expect(out).toMatch(/^OK/m);
    });
});

describe("replay: real-person fixtures (tools/replay-check.cjs CASES)",()=>{
  const {CASES}=req(join(root,"tools","replay-check.cjs")) as {CASES:[string,string,number,number,object,string,number?][]};
  const {runFile}=req(join(root,"tools","replay.cjs"));
  it("has cases",()=>expect(CASES.length).toBeGreaterThan(10));
  for(const [fx,ex,want,tol,win,note] of CASES){
    const file=join(root,"tools","fixtures",fx+".json");
    it.skipIf(!existsSync(file))(`${fx} · ${ex} = ${want}±${tol} (${note})`,()=>{
      const r=runFile(file,ex,win);
      expect(Math.abs(r.reps-want),`${fx}/${ex}: counted ${r.reps} at [${r.times.join(" ")}], wanted ${want}±${tol}`).toBeLessThanOrEqual(tol);
    });
  }
});
