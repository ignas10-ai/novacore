import {join} from "node:path";
export const ROOT=join(import.meta.dirname,"..","..");
export const CAM=join(ROOT,"test","e2e",".cache","cam.mjpeg");
export const CAM2=join(ROOT,"test","e2e",".cache","cam2.mjpeg"); // two people (two poses), for the 2-player race
export const camArgs=(cam:string)=>[
  "--use-fake-device-for-media-stream","--use-fake-ui-for-media-stream",`--use-file-for-fake-video-capture=${cam}`,
  "--autoplay-policy=no-user-gesture-required","--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader",
  // 2D canvases (race scene, camera preview, recorder) on the CPU: otherwise they queue on the same software GPU as
  // MediaPipe and its ReadPixels stalls the main thread for seconds (seen in sprint: "frame" stuck in detectForVideo)
  "--disable-accelerated-2d-canvas",
];
