import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as media from '../media-utils.js';

const entry=()=>({name:'qa.mp4',blob:new Blob(['synthetic-test-data'],{type:'video/mp4'})});
test('browser download is requested, never reported saved without confirmation',async()=>{
 let calls=0;const states=[];
 const result=await media.saveVideoFile(entry(),{requestDownload:()=>calls++,onState:s=>states.push(s.state)});
 assert.equal(calls,1);assert.equal(result.state,'requested');assert.deepEqual(states,['requested']);
 assert.match(result.message,/cannot confirm completion or cancellation/);
});
test('download request exceptions produce a safe failure message',async()=>{
 const result=await media.saveVideoFile(entry(),{requestDownload:()=>{throw Error('private-native-error');}});
 assert.equal(result.state,'failed');assert.ok(!result.message.includes('private-native-error'));
});
test('missing save methods fail instead of claiming a saved file',async()=>{
 assert.equal((await media.saveVideoFile(entry())).state,'failed');
});
test('native save is only confirmed after the writable stream closes',async()=>{
 let finishClose,reachedClose,written,pickerCalled=false;
 const atClose=new Promise(r=>reachedClose=r),closed=new Promise(r=>finishClose=r),states=[];
 const item=entry();
 const pending=media.saveVideoFile(item,{pickFile:options=>{
  pickerCalled=true;assert.equal(options.suggestedName,'qa.mp4');
  return Promise.resolve({createWritable:async()=>({write:async b=>written=b,close:()=>{reachedClose();return closed;}})});
 },onState:s=>states.push(s.state)});
 assert.equal(pickerCalled,true);await atClose;
 assert.equal(written,item.blob);assert.deepEqual(states,['choosing','saving']);
 finishClose();assert.equal((await pending).state,'saved');assert.deepEqual(states,['choosing','saving','saved']);
});
test('picker abort reports no completed save and does not start a fallback download',async()=>{
 let requests=0;const error=Object.assign(Error('native message'),{name:'AbortError'});
 const result=await media.saveVideoFile(entry(),{pickFile:()=>Promise.reject(error),requestDownload:()=>requests++});
 assert.equal(result.state,'cancelled');assert.equal(requests,0);assert.match(result.message,/No completed file save/);
});
for(const stage of ['picker','create','write','close'])test(`${stage} failure never confirms a save or mutates the source`,async()=>{
 const item=entry(),before=await item.blob.text(),states=[];let aborted=0,requests=0;
 const fail=()=>{throw Error('private-native-error');};
 const result=await media.saveVideoFile(item,{pickFile:async()=>{
  if(stage==='picker')fail();
  return {createWritable:async()=>{
   if(stage==='create')fail();
   return {write:async()=>{if(stage==='write')fail();},close:async()=>{if(stage==='close')fail();},abort:async()=>aborted++};
  }};
 },requestDownload:()=>requests++,onState:s=>states.push(s.state)});
 assert.equal(result.state,'failed');assert.ok(!states.includes('saved'));assert.equal(requests,0);
 assert.equal(aborted,['write','close'].includes(stage)?1:0);assert.equal(await item.blob.text(),before);
 assert.ok(!result.message.includes('private-native-error'));
});
test('cleanup errors cannot turn a failed save into success',async()=>{
 const result=await media.saveVideoFile(entry(),{pickFile:async()=>({createWritable:async()=>({write:async()=>{throw Error('write');},abort:async()=>{throw Error('cleanup');}})})});
 assert.equal(result.state,'failed');
});

// Exercise actual app handler wiring with simulated DOM, worker output and storage.
// This verifies sequencing; it does not certify a browser's filesystem behavior.
async function appFixture({persistFails=false,clickFails=false,pickFile}={}){
 const elements=new Map();let clicks=0,stored=0;
 const element=id=>{if(!elements.has(id))elements.set(id,{value:'',hidden:true,disabled:false,dataset:{},children:[],textContent:'',addEventListener(){},append(...nodes){this.children.push(...nodes);},replaceChildren(){},scrollIntoView(){},pause(){},load(){},removeAttribute(){}});return elements.get(id);};
 element('start').value='1';element('end').value='3';element('resolution').value='480';
 class Worker{postMessage(){queueMicrotask(()=>this.onmessage({data:{output:new Uint8Array([1,2,3]).buffer}}));}terminate(){}}
 const context=vm.createContext({...media,Blob,URL,Uint8Array,ArrayBuffer,AbortSignal,setTimeout,clearTimeout,setInterval,clearInterval,queueMicrotask,
  Worker,window:{WebAssembly,Worker,isSecureContext:!!pickFile,showSaveFilePicker:pickFile,addEventListener(){}},
  document:{getElementById:element,body:{append(){}},createElement:tag=>tag==='a'?{click(){clicks++;if(clickFails)throw Error('blocked');},remove(){}}:{append(){}}},
  fixtureInput:entry(),persistFails,storeExport:()=>stored++});
 let source=await readFile(new URL('../app.js',import.meta.url),'utf8');
 source=source.replace(/^import .*\n/,'').replaceAll('import.meta.url',JSON.stringify('https://shorty-ai-staging.onrender.com/app.js'));
 source=source.slice(0,source.indexOf('try{db=await openDB()'));
 const setup=`\nactive={...fixtureInput,duration:5,width:1280,height:720};urlFor=()=> 'blob:local-test';
 add=async(blob,name)=>{if(persistFails)throw Error('Device storage unavailable.');storeExport();return {id:'exported',blob,name};};
 globalThis.handlers={exportVideo:()=>$('export').onclick(),save:()=>$('save-export').onclick()};`;
 vm.runInContext(source+setup,context);
 return {elements,element,handlers:context.handlers,clicks:()=>clicks,stored:()=>stored};
}
test('app completes export into the library without triggering an automatic download',async()=>{
 const f=await appFixture();await f.handlers.exportVideo();
 assert.equal(f.stored(),1);assert.equal(f.clicks(),0);assert.equal(f.element('export-status').dataset.state,'completed');
 assert.equal(f.element('save-export').hidden,false);assert.ok(!f.element('export-status').textContent.includes('downloaded'));
 await f.handlers.save();assert.equal(f.clicks(),1);assert.equal(f.element('download-status').dataset.state,'requested');
 assert.equal(f.element('export-status').dataset.state,'completed');
});
test('app does not report a completed export when library storage fails',async()=>{
 const f=await appFixture({persistFails:true});await f.handlers.exportVideo();
 assert.equal(f.stored(),0);assert.equal(f.clicks(),0);assert.equal(f.element('export-status').dataset.state,'failed');
 assert.equal(f.element('save-export').hidden,true);
});
test('app download failure preserves the completed library export and retry control',async()=>{
 const f=await appFixture({clickFails:true});await f.handlers.exportVideo();await f.handlers.save();
 assert.equal(f.stored(),1);assert.equal(f.element('export-status').dataset.state,'completed');
 assert.equal(f.element('download-status').dataset.state,'failed');assert.equal(f.element('save-export').hidden,false);
 assert.equal(f.element('save-export').disabled,false);
});
test('app reports native file saved separately from the completed export',async()=>{
 let writes=0,closes=0;
 const f=await appFixture({pickFile:async()=>({createWritable:async()=>({write:async()=>writes++,close:async()=>closes++})})});
 await f.handlers.exportVideo();await f.handlers.save();
 assert.equal(writes,1);assert.equal(closes,1);assert.equal(f.clicks(),0);
 assert.equal(f.element('export-status').dataset.state,'completed');assert.equal(f.element('download-status').dataset.state,'saved');
});
test('native save failure offers browser recovery only after another explicit click',async()=>{
 const f=await appFixture({pickFile:async()=>{throw Error('native blocked');}});
 await f.handlers.exportVideo();await f.handlers.save();
 assert.equal(f.clicks(),0);assert.equal(f.element('download-status').dataset.state,'failed');
 const retry=f.element('notice').children.find(n=>n?.textContent==='Try browser download');assert.ok(retry);
 await retry.onclick();assert.equal(f.clicks(),1);assert.equal(f.element('download-status').dataset.state,'requested');
});
test('a pending save prevents duplicate pickers and keeps its completed export',async()=>{
 let finishPicker,calls=0;
 const picked=new Promise(r=>finishPicker=r);
 const f=await appFixture({pickFile:()=>{calls++;return picked;}});
 await f.handlers.exportVideo();const saving=f.handlers.save();await f.handlers.save();
 assert.equal(calls,1);assert.equal(f.element('save-export').disabled,true);
 finishPicker({createWritable:async()=>({write:async()=>{},close:async()=>{}})});await saving;
 assert.equal(f.element('download-status').dataset.state,'saved');assert.equal(f.stored(),1);assert.equal(f.element('save-export').disabled,false);
});
