// keep the screen awake from readiness through gameplay
let wakeLock:WakeLockSentinel|null=null, wakeWanted=false, wakePending=false;
async function acquireWakeLock(){
  if(!wakeWanted||document.visibilityState!=="visible"||!("wakeLock" in navigator)||wakePending)return;
  if(wakeLock&&!wakeLock.released)return;
  wakePending=true;
  try{
    const lock=await navigator.wakeLock.request("screen");
    if(!wakeWanted){try{lock.release().catch(()=>{})}catch(e){}return}
    wakeLock=lock;
    lock.addEventListener("release",()=>{if(wakeLock===lock)wakeLock=null});
  }catch(e){/* unsupported, denied, or page not visible */}
  finally{wakePending=false}
}
export function keepScreenAwake(){
  wakeWanted=true;
  acquireWakeLock();
}
export function releaseWakeLock(){
  wakeWanted=false;
  if(wakeLock){
    const lock=wakeLock;wakeLock=null;
    try{lock.release().catch(()=>{})}catch(e){}
  }
}
document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState==="visible"&&wakeWanted)acquireWakeLock();
});
window.addEventListener("pagehide",releaseWakeLock);
