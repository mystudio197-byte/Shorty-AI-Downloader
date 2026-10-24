/* Local-only single-thread FFmpeg export. No video data leaves this worker. */
importScripts('ffmpeg-core.js');
self.onmessage=async({data})=>{
 try{
  const response=await fetch('ffmpeg-core.wasm.gz');
  if(!response.ok)throw new Error('The local editing engine could not load.');
  const wasmBinary=new Uint8Array(await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  const core=await createFFmpegCore({wasmBinary});
  core.setTimeout(300000);
  core.setProgress(({time})=>self.postMessage({progress:Math.min(99,Math.max(0,time/1000000/data.duration*100))}));
  core.FS.writeFile('input',new Uint8Array(data.input));
  const args=['-i','input','-ss',String(data.start),'-t',String(data.duration),'-map','0:v:0'];
  if(data.mute)args.push('-an');else args.push('-map','0:a:0?','-c:a','aac');
  args.push('-vf',`scale=${data.width}:${data.height}`,'-c:v','libx264','-preset','ultrafast','-crf','23','-pix_fmt','yuv420p','-movflags','+faststart','output.mp4');
  const code=core.exec(...args);
  if(code!==0)throw new Error('This video could not be exported. Try a shorter clip or a smaller resolution.');
  const output=core.FS.readFile('output.mp4');
  if(output.byteLength>100*1024*1024)throw new Error('The export exceeds 100 MB. Choose a shorter clip or smaller resolution.');
  self.postMessage({output:output.buffer},[output.buffer]);
 }catch(error){self.postMessage({error:error.message||'Export failed. Try a smaller video.'});}
};
