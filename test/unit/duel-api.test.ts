// Duel helpers (src/duel/api.ts): clock offset, shared exercise order, invite freshness, error messages.
// No Supabase keys in tests (vitest envDir), so `sb` is null and the RPC wrappers reject with "offline".
import {describe,it,expect} from "vitest";
import {clockOffset,seedShift,fresh,duelErr,INVITE_MS,invite,finish} from "../../src/duel/api.ts";

describe("clockOffset",()=>{
  it("no samples -> null (caller uses offset 0)",()=>expect(clockOffset([])).toBeNull());
  it("symmetric round trip gives the exact offset",()=>{
    expect(clockOffset([{t0:1000,t:6050,t1:1100}])).toEqual({off:5000,rtt:100});
  });
  it("picks the fastest round trip (least skew)",()=>{
    const r=clockOffset([{t0:0,t:900,t1:400},{t0:1000,t:1530,t1:1060},{t0:2000,t:2700,t1:2300}]);
    expect(r).toEqual({off:500,rtt:60});
  });
  it("ignores samples with negative rtt (clock jumped)",()=>{
    expect(clockOffset([{t0:500,t:0,t1:400}])).toBeNull();
    expect(clockOffset([{t0:500,t:0,t1:400},{t0:0,t:-200,t1:200}])).toEqual({off:-300,rtt:200});
  });
  it("opponent behind me = negative offset",()=>{
    expect(clockOffset([{t0:10000,t:7000,t1:10200}])!.off).toBe(-3100);
  });
});

describe("seedShift",()=>{
  it("same seed -> same start on both phones, within range",()=>{
    for(const seed of [0,1,7,123456,999999])for(const n of [1,3,7]){const k=seedShift(seed,n);expect(k).toBe(seedShift(seed,n));expect(k).toBeGreaterThanOrEqual(0);expect(k).toBeLessThan(n)}
  });
  it("no exercises -> 0 (no modulo by zero)",()=>{expect(seedShift(5,0)).toBe(0);expect(seedShift(5,-2)).toBe(0)});
  it("negative and fractional seeds stay valid indices",()=>{
    expect(seedShift(-8,3)).toBe(2);expect(seedShift(7.9,3)).toBe(1);
  });
});

describe("fresh",()=>{
  const now=Date.parse("2026-10-25T12:00:00Z");
  it("valid for 10 minutes",()=>{
    expect(fresh(new Date(now).toISOString(),now)).toBe(true);
    expect(fresh(new Date(now-INVITE_MS+1).toISOString(),now)).toBe(true);
    expect(fresh(new Date(now-INVITE_MS).toISOString(),now)).toBe(false);
  });
  it("garbage timestamp = not fresh",()=>expect(fresh("not a date",now)).toBe(false));
  it("Postgres timestamptz format with offset",()=>expect(fresh("2026-10-25 14:58:00+02",now)).toBe(true));
});

describe("duelErr",()=>{
  const general=()=>"GEN";
  it.each([
    ["duel_not_member","Draugas nebe šios kompanijos narys."],
    ["duel_closed","Šis kvietimas nebegalioja."],
    ["duel_not_found","Šis kvietimas nebegalioja."],
    ["duel_rate","Per daug kvietimų. Pabandyk po valandos."],
    ["duel_bad_score","Netinkami dvikovos nustatymai."],
  ])("%s",(code,msg)=>expect(duelErr({message:code},general)).toBe(msg));
  it("anything else falls back to the general message",()=>{
    expect(duelErr(new Error("boom"),general)).toBe("GEN");expect(duelErr(null,general)).toBe("GEN");
  });
});

describe("offline",()=>{
  it("RPC wrappers reject instead of hanging",async()=>{
    await expect(invite("g","u",60,["squat"])).rejects.toThrow("offline");
    await expect(finish("d",99999)).rejects.toThrow("offline");
  });
});
