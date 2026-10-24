export function trimRange(start,end,duration){
 if(start===''||end==='')throw new Error('Enter both start and end times.');
 start=Number(start);end=Number(end);
 if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>duration+0.01||end<=start||end-start<0.1)throw new Error('Choose a valid range of at least 0.1 seconds within the video.');
 return {start,end:Math.min(end,duration)};
}
export function outputSize(width,height,resolution){
 if(!width||!height)throw new Error('Invalid source dimensions.');
 const scale=resolution==='original'?1:Math.min(1,Number(resolution)/Math.min(width,height));
 return {width:Math.max(2,Math.round(width*scale/2)*2),height:Math.max(2,Math.round(height*scale/2)*2)};
}
export function videoName(name){return String(name||'video.mp4').replace(/[\u0000-\u001f/\\]/g,'_').slice(0,180);}
export function watchOAuthPopup(popup,onEnd,{now=Date.now,schedule=setInterval,cancel=clearInterval}={}){
 const started=now();let stopped=false;
 const stop=()=>{if(!stopped){stopped=true;cancel(timer);}};
 const timer=schedule(()=>{
  if(stopped)return;
  const reason=popup.closed?'closed':now()-started>=600000?'expired':null;
  if(reason){stop();onEnd(reason);}
 },750);
 return stop;
}
