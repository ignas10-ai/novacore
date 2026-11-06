// src/camera/sizes.ts: the preview canvas and the pose-inference copy keep the camera aspect but cap the long side.
// The old pipeline drew the full 1920x1080 frame and a 1280 px inference copy on the main thread every camera frame.
import {describe,it,expect} from "vitest";
import {DISPLAY_MAX,DETECT_MAX,fitLongSide,displaySize,detectSize} from "../../src/camera/sizes.ts";

describe("camera size math",()=>{
  it("caps a landscape 1080p preview at 1280x720",()=>{
    expect(displaySize(1920,1080)).toEqual([1280,720]);
  });
  it("caps a portrait 1080p preview at 720x1280",()=>{
    expect(displaySize(1080,1920)).toEqual([720,1280]);
  });
  it("caps inference at 640 on the long side",()=>{
    expect(detectSize(1920,1080)).toEqual([640,360]);
    expect(detectSize(1080,1920)).toEqual([360,640]);
    expect(detectSize(1280,720)).toEqual([640,360]);
  });
  it("never upscales a small camera",()=>{
    expect(displaySize(640,360)).toEqual([640,360]);
    expect(detectSize(640,360)).toEqual([640,360]);
    expect(detectSize(320,240)).toEqual([320,240]);
  });
  it("keeps the aspect ratio within a pixel on odd sizes",()=>{
    for(const [w,h] of [[1919,1079],[1001,777],[853,480]]){
      const [dw,dh]=displaySize(w,h);
      expect(Math.abs(dw/dh-w/h)).toBeLessThan(0.01);
      const [pw,ph]=detectSize(w,h);
      expect(Math.abs(pw/ph-w/h)).toBeLessThan(0.02);
    }
  });
  it("falls back to a drawable 2x2 frame for broken input",()=>{
    expect(fitLongSide(0,0,DISPLAY_MAX)).toEqual([2,2]);
    expect(fitLongSide(NaN,1080,DETECT_MAX)).toEqual([2,2]);
    expect(fitLongSide(1920,1080,0)).toEqual([2,2]);
  });
  it("the caps leave room for the exercise model (256 px input) and the TV stream (720 px)",()=>{
    expect(DETECT_MAX).toBeGreaterThanOrEqual(256);
    expect(DISPLAY_MAX).toBeGreaterThanOrEqual(720);
  });
});
