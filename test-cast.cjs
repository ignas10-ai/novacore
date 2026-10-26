// Big-screen room/protocol self-check: `node test-cast.cjs` (needs Node >= 22.18 like the other checks).
const assert=require("assert");
const {SCREEN_ALPHABET,makeCode,normCode,isCode,channelName,leftAt,readState}=require("./src/cast/room.ts");

// deterministic alphabet walk: every generated code is 6 safe chars, even with a lazy/odd random source
let i=0;
const seq=[0,.03,.12,.24,.36,.49,.61,.73,.86,.99];
const code=makeCode(()=>seq[i++%seq.length]);
assert.strictEqual(code.length,6);
assert.ok([...code].every(c=>SCREEN_ALPHABET.includes(c)),"code uses the safe alphabet");
assert.ok(!/[01OI]/.test(code),"no characters a TV remote confuses");
assert.strictEqual(makeCode(()=>1),SCREEN_ALPHABET[SCREEN_ALPHABET.length-1].repeat(6),"rand()=1 stays in range");

assert.strictEqual(normCode(" ab-cd 23 "),"ABCD23","dashes/spaces/lowercase");
assert.strictEqual(normCode("abcdefgh"),"ABCDEF","truncated to 6");
assert.ok(isCode("ABC234"));assert.ok(!isCode("ABC23"));assert.ok(!isCode("ABC-23"));
assert.strictEqual(channelName("ABC234"),"novacore-screen-ABC234");

assert.strictEqual(leftAt(30,1000,1000),30);
assert.strictEqual(leftAt(30,1000,4000),27,"counts down with the receiver clock");
assert.strictEqual(leftAt(30,1000,99000),0,"never negative");
assert.strictEqual(leftAt(30,1000,500),30,"a clock that jumps backwards does not add time");

const base={v:1,code:"ABC234",phase:"play",players:2,duration:180,left:92.4,round:2,mult:3,ex:{id:"squat",name:"Pritūpimai"},score:[21,17],reps:19,winner:0,sent:1};
const ok=readState(base);
assert.ok(ok);
assert.strictEqual(ok.left,92.4);assert.strictEqual(ok.mult,3);assert.strictEqual(ok.ex.name,"Pritūpimai");
assert.strictEqual(readState({...base,phase:"hack"}),null,"unknown phase rejected");
assert.strictEqual(readState({...base,v:2}),null,"unknown protocol version rejected");
assert.strictEqual(readState({...base,score:[-5,1e9]}).score[0],0);
assert.strictEqual(readState({...base,score:[-5,1e9]}).score[1],9999);
assert.strictEqual(readState({...base,players:7}).players,2,"players is 1 or 2");
assert.strictEqual(readState({...base,duration:60,left:60}).duration,60,"1-minute games survive");
assert.strictEqual(readState({...base,left:999}).left,180,"left is clamped to the duration");
assert.strictEqual(readState({...base,ex:{id:"x",name:"a".repeat(80)}}).ex.name.length,40,"long names truncated");
assert.strictEqual(readState({...base,ex:{id:'x"]',name:"y"}}).ex,null,"selector-unsafe exercise id rejected");
assert.strictEqual(readState({...base,winner:9}).winner,0);
console.log("OK");
