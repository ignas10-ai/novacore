// ponytail: vienas self-check statistikai – `node test-stats.cjs` (serijos, savaitė, 7 d., pratimų sumos, ženkliukai)
const {streak,bestStreak,weekStart,weekGames,last7,exTotals,totals,badges}=require("./src/history/stats.ts");
const assert=require("assert");
const at=(y,m,d,h=12)=>new Date(y,m-1,d,h).getTime();
const g=(t,o={})=>({t,players:1,duration:180,ex:["squat"],score:[50,0],reps:[20,0],...o});
const now=at(2026,10,25,18); // sekmadienis

assert.strictEqual(streak([],now),0,"empty");
assert.strictEqual(streak([g(at(2026,10,25)),g(at(2026,10,24)),g(at(2026,10,23)),g(at(2026,10,21))],now),3,"today + 2 days");
assert.strictEqual(streak([g(at(2026,10,24)),g(at(2026,10,23))],now),2,"yesterday keeps it alive");
assert.strictEqual(streak([g(at(2026,10,23))],now),0,"2 days ago = broken");
assert.strictEqual(streak([g(at(2026,10,25,9)),g(at(2026,10,25,20))],now),1,"two games one day");
assert.strictEqual(bestStreak([g(at(2026,10,1)),g(at(2026,10,2)),g(at(2026,10,3)),g(at(2026,10,10))]),3,"best run");
assert.strictEqual(bestStreak([g(at(2026,3,28)),g(at(2026,3,29)),g(at(2026,3,30))]),3,"across DST");
assert.strictEqual(new Date(weekStart(now)).getDay(),1,"week starts Monday");
assert.strictEqual(new Date(weekStart(now)).getDate(),19,"Mon 10-19");
assert.strictEqual(new Date(weekStart(at(2026,10,19,0))).getDate(),19,"Monday itself");
assert.strictEqual(new Date(weekStart(at(2026,10,25,23))).getDate(),19,"Sunday belongs to the same week");
assert.strictEqual(weekGames([g(at(2026,10,19,0)+60e3),g(at(2026,10,18,23))],now),1,"Sunday before is last week");
const w=last7([g(at(2026,10,25)),g(at(2026,10,25),{players:2,reps:[10,7]}),g(at(2026,10,19))],now);
assert.strictEqual(w.length,7);assert.strictEqual(w[6].games,2);assert.strictEqual(w[6].reps,37,"2-player reps summed");assert.strictEqual(w[0].games,1);
const ex=exTotals([g(now,{exReps:[{squat:12,jack:3},{}]}),g(now,{players:2,exReps:[{squat:5},{squat:30}]}),g(now)]);
assert.deepStrictEqual(ex.squat,{total:47,best:30});assert.deepStrictEqual(ex.jack,{total:3,best:3});assert.deepStrictEqual(ex.lunge,{total:0,best:0});
const solo=g(now,{score:[50,99]});assert.strictEqual(totals([solo],now).best,50,"solo ignores P2 slot");
const b=Object.fromEntries(badges([g(now,{score:[120,0],beat:true,exReps:[{squat:100}]})]).map(x=>[x.id,x.on]));
assert.deepStrictEqual(b,{first:true,duel:false,streak3:false,squat100:true,pts100:true,beat:true,games10:false,allex:false});
console.log("OK");
