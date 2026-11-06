// Pure size math for the camera pipeline (no DOM; test/unit/camera-sizes.test.ts).
// The visible #cv canvas is only a preview: 1280 px on the long side is more than any phone screen shows and matches
// the TV camera stream (portrait 720x1280). MediaPipe's model input is 256x256, so the pose copy only needs 640 px -
// the old 1280 px copy cost four times the pixels for no accuracy gain.
export const DISPLAY_MAX=1280;
export const DETECT_MAX=640;

export function fitLongSide(w:number,h:number,max:number):[number,number]{
  if(!(w>0)||!(h>0)||!(max>0))return [2,2];
  const s=Math.min(1,max/Math.max(w,h));
  return [Math.max(2,Math.round(w*s)),Math.max(2,Math.round(h*s))];
}

/** Visible canvas: camera aspect kept, longest side <= DISPLAY_MAX. */
export const displaySize=(w:number,h:number)=>fitLongSide(w,h,DISPLAY_MAX);
/** Pose inference copy: camera aspect kept, longest side <= DETECT_MAX. */
export const detectSize=(w:number,h:number)=>fitLongSide(w,h,DETECT_MAX);
