// highlightSegments / clipSpec edge cases (test-detect.cjs covers the main tiers and coverage rule).
import {describe,it,expect} from "vitest";
import {highlightSegments,clipSpec} from "../../src/clips/highlight.ts";
import {ROUND_SECS} from "../../src/detect/exercises.ts";

const len=(s:{start:number;end:number}[])=>s.reduce((n,x)=>n+x.end-x.start,0);
const valid=(s:{start:number;end:number}[],total:number)=>s.every((x,i)=>x.start>=0&&x.end<=total&&x.start<x.end&&(!i||x.start>s[i-1].end));

describe("highlightSegments",()=>{
  it("negative / NaN total -> no segments",()=>{
    expect(highlightSegments([{t:1}],-5)).toEqual([]);
    expect(highlightSegments([{t:1}],NaN)).toEqual([]);
  });
  it("game shorter than one bin = the whole game",()=>{
    expect(highlightSegments([{t:1}],3)).toEqual([{start:0,end:3}]);
  });
  it("ignores NaN, negative and out-of-range event times",()=>{
    const s=highlightSegments([{t:NaN,points:99},{t:-3,points:99},{t:500,points:99},{t:"x" as any,points:99}],180);
    expect(valid(s,180)).toBe(true);expect(len(s)).toBeGreaterThanOrEqual(15);
  });
  it("events = null does not throw",()=>{
    expect(highlightSegments(null as any,60).length).toBeGreaterThan(0);
  });
  it("exerciseCount 0 / NaN behaves like 1",()=>{
    expect(highlightSegments([],180,4,16,0)).toEqual(highlightSegments([],180,4,16,1));
    expect(highlightSegments([],180,4,16,NaN)).toEqual(highlightSegments([],180,4,16,1));
  });
  it("adjacent bins merge into one segment, never overlapping",()=>{
    const ev=Array.from({length:20},(_,i)=>({t:40+i*0.5,points:5}));
    const s=highlightSegments(ev,180,4,16,1);
    expect(valid(s,180)).toBe(true);
    expect(s.some(x=>x.start<=40&&x.end>=49)).toBe(true);
  });
  it("7 exercises in a 3-min game: every round's exercise is in the reel",()=>{
    const s=highlightSegments([{t:5,points:50}],180,4,16,7);
    const rounds=new Set<number>();
    for(const x of s)for(let t=Math.ceil(x.start);t<x.end;t++)rounds.add(Math.floor(t/ROUND_SECS));
    expect(rounds.size).toBe(6); // 6 rounds -> 6 of the 7 exercises are played
    expect(valid(s,180)).toBe(true);
  });
  it("length stays within the 15-30 s preview window for 1 and 3 min games",()=>{
    for(const total of [60,180])for(const ex of [1,2,3]){const n=len(highlightSegments([{t:10,points:3}],total,4,16,ex));expect(n,`${total}s/${ex}ex`).toBeGreaterThanOrEqual(15);expect(n).toBeLessThanOrEqual(30)}
  });
});

describe("clipSpec",()=>{
  it("missing / NaN camera info -> 720p30 standard tier",()=>{
    for(const c of [clipSpec(0,0,0,true),clipSpec(NaN,NaN,NaN,true),clipSpec(undefined as any,undefined as any,undefined as any,true)])
      expect([c.w,c.h,c.fps,c.hd,c.hq]).toEqual([720,1280,30,false,false]);
  });
  it("4K camera is capped at 1080p",()=>{
    const c=clipSpec(3840,2160,60,false);expect([c.w,c.h,c.hq]).toEqual([1920,1080,true]);
  });
  it("portrait camera (h>w) uses the short side",()=>{
    const c=clipSpec(1080,1920,30,true);expect([c.w,c.h,c.hd]).toEqual([1080,1920,true]);
  });
  it("fps 50 counts as fast, 49 does not",()=>{
    expect(clipSpec(1280,720,50,false).fps).toBe(60);expect(clipSpec(1280,720,49,false).fps).toBe(30);
  });
  it("bitrate grows with each tier",()=>{
    const b=[clipSpec(1280,720,30,true),clipSpec(1280,720,60,true),clipSpec(1920,1080,30,true),clipSpec(1920,1080,60,true)].map(c=>c.bps);
    expect([...b].sort((x,y)=>x-y)).toEqual(b);expect(new Set(b).size).toBe(4);
  });
  it("sizes are even (H.264 encoders need even dimensions)",()=>{
    for(const p of [true,false])for(const [w,h] of [[1280,720],[1920,1080]]){const c=clipSpec(w,h,30,p);expect(c.w%2+c.h%2).toBe(0)}
  });
});
