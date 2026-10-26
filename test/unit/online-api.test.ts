// @vitest-environment jsdom
// src/online/api.ts: gameRow (pure), errText, and the offline games queue (novacore.pending) against a FAKE
// Supabase client (vi.mock) - never the real project.
import {describe,it,expect,vi,beforeEach} from "vitest";

const insert=vi.fn<(row:any)=>Promise<{error:any}>>();
vi.mock("@supabase/supabase-js",()=>({
  createClient:()=>({
    auth:{getSession:async()=>({data:{session:{user:{id:"u1"}}}}),signInAnonymously:async()=>({data:{user:{id:"u1"}},error:null})},
    from:()=>({insert}),
  }),
}));

async function load(online:boolean){
  vi.resetModules();vi.unstubAllEnvs();
  if(online){vi.stubEnv("VITE_SUPABASE_URL","https://unit-test.supabase.co");vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY","sb_publishable_test")}
  return import("../../src/online/api.ts");
}
const row=(id:string)=>({id,players:1,duration:180,score:10,reps:{},exercises:["squat"],created_at:"2026-10-25T10:00:00.000Z"});
const queue=()=>JSON.parse(localStorage.getItem("novacore.pending")||"[]").map((r:any)=>r.id);
beforeEach(()=>{localStorage.clear();insert.mockReset();vi.restoreAllMocks()});

describe("gameRow (pure)",async()=>{
  const {gameRow}=await load(false);
  const at=new Date("2026-10-25T10:00:00Z");
  const ev=[{player:0,ex:"squat"},{player:1,ex:"squat"},{player:1,ex:"jack"},{player:1,ex:"jack"}];
  it("solo = P1 even if the P2 slot has a higher number",()=>{
    const r=gameRow(1,180,[5,50],ev,["squat"],"id",at);expect([r.score,r.reps]).toEqual([5,{squat:1}]);
  });
  it("2 players = the higher score and THAT player's reps",()=>{
    const r=gameRow(2,60,[5,50],ev,["squat","jack"],"id",at);expect([r.score,r.reps]).toEqual([50,{squat:1,jack:2}]);
  });
  it("tie -> P1",()=>expect(gameRow(2,60,[7,7],ev,[],"id",at).reps).toEqual({squat:1}));
  it("score clamped to the DB check 0..2000 and truncated to an integer",()=>{
    expect(gameRow(1,60,[99999,0],[],[],"i",at).score).toBe(2000);
    expect(gameRow(1,60,[-4,0],[],[],"i",at).score).toBe(0);
    expect(gameRow(1,60,[12.9,0],[],[],"i",at).score).toBe(12);
    expect(gameRow(1,60,[NaN,0],[],[],"i",at).score).toBe(0);
  });
  it("created_at is the game time in ISO",()=>expect(gameRow(1,60,[1,0],[],[],"i",at).created_at).toBe("2026-10-25T10:00:00.000Z"));
});

describe("errText",()=>{
  it("offline build (no env): server-side codes still get specific messages",async()=>{
    const {errText,sb}=await load(false);
    expect(sb).toBeNull();
    expect(errText({code:"anonymous_provider_disabled"})).toMatch(/neįjungtas/);
    expect(errText({message:"group_not_found"})).toMatch(/kodą/);
    expect(errText({code:"PGRST202"})).toMatch(/neparuoštas/);
    expect(errText(new Error("x"))).toBe("Internetinės funkcijos išjungtos.");
  });
  it("online: network vs generic",async()=>{
    const {errText}=await load(true);
    expect(errText(new TypeError("Failed to fetch"))).toMatch(/Nėra ryšio/);
    expect(errText("weird")).toBe("Nepavyko. Bandyk vėliau.");
  });
});

describe("games queue (novacore.pending)",()=>{
  it("saved row leaves the queue",async()=>{
    const api=await load(true);insert.mockResolvedValue({error:null});
    expect(await api.saveGame(row("a"))).toBe(true);expect(queue()).toEqual([]);
  });
  it("duplicate id (23505, lost response retried) counts as saved",async()=>{
    const api=await load(true);insert.mockResolvedValue({error:{code:"23505"}});
    expect(await api.saveGame(row("a"))).toBe(true);expect(queue()).toEqual([]);
  });
  it("data error (22xxx/23xxx) drops the row so it cannot block the queue",async()=>{
    const api=await load(true);insert.mockResolvedValueOnce({error:{code:"23514"}}).mockResolvedValue({error:null});
    localStorage.setItem("novacore.pending",JSON.stringify([row("bad")]));
    expect(await api.saveGame(row("good"))).toBe(true);expect(queue()).toEqual([]);
  });
  it("network error keeps the row for the next start",async()=>{
    const api=await load(true);insert.mockResolvedValue({error:{code:"",message:"Failed to fetch"}});
    await expect(api.saveGame(row("a"))).rejects.toBeTruthy();
    expect(queue()).toEqual(["a"]);
    insert.mockResolvedValue({error:null});await api.flushGames();expect(queue()).toEqual([]);
  });
  it("queue keeps only the newest 20",async()=>{
    const api=await load(true);insert.mockResolvedValue({error:{message:"Failed to fetch"}});
    for(let i=0;i<25;i++)await api.saveGame(row("r"+i)).catch(()=>{});
    expect(queue()).toHaveLength(20);expect(queue()[0]).toBe("r5");expect(queue().at(-1)).toBe("r24");
  });
  it("corrupt queue JSON is treated as empty",async()=>{
    const api=await load(true);insert.mockResolvedValue({error:null});
    localStorage.setItem("novacore.pending","{not json");
    expect(await api.saveGame(row("a"))).toBe(true);
  });
  it("without Supabase nothing is sent and nothing throws",async()=>{
    const api=await load(false);
    expect(await api.saveGame(row("a"))).toBe(false);expect(queue()).toEqual(["a"]);expect(insert).not.toHaveBeenCalled();
  });
  // BUG (found by this suite): with localStorage blocked (setItem throws) the row is never queued, so flushGames()
  // sends nothing, yet saveGame() resolves true ("row is on the server") and "Mesti iššūkį" then shares a
  // /?c=<id> link to a game that does not exist. Remove `.fails` once saveGame inserts directly when storage fails.
  it.fails("blocked localStorage: saveGame does not claim a row it never sent",async()=>{
    const api=await load(true);insert.mockResolvedValue({error:null});
    vi.spyOn(Storage.prototype,"setItem").mockImplementation(()=>{throw new DOMException("blocked","SecurityError")});
    const saved=await api.saveGame(row("a"));
    expect(saved&&insert.mock.calls.length===0).toBe(false);
  });
  it("blocked localStorage: the nickname helpers do not throw",async()=>{
    const api=await load(false);
    vi.spyOn(Storage.prototype,"getItem").mockImplementation(()=>{throw new DOMException("blocked","SecurityError")});
    vi.spyOn(Storage.prototype,"setItem").mockImplementation(()=>{throw new DOMException("blocked","SecurityError")});
    expect(api.cachedNick()).toBeNull();expect(()=>api.setCachedNick("Ignas")).not.toThrow();
  });
});
