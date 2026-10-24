import { trimRange, outputSize, videoName, watchOAuthPopup } from './media-utils.js';
const API = 'https://shorty-ai-backend.onrender.com';
const $ = id => document.getElementById(id);
const LIMIT = 100 * 1024 * 1024;
let db, entries=[], active, activeURL, session=null, popup=null, cursor=null, exporting=false, cancelExport=null, previewing=false;
let stopOAuthWatch=null;
const urls=new Map();
function notice(message){$('notice').textContent=message;$('notice').hidden=false;}
function humanSize(n){return n>=1024**3?(n/1024**3).toFixed(1)+' GB':(n/1024**2).toFixed(1)+' MB';}
function time(n){n=Math.floor(n||0);return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;}
function button(text,fn,cls='secondary'){const b=document.createElement('button');b.type='button';b.className='button '+cls;b.textContent=text;b.onclick=fn;return b;}
function empty(target,title,text){target.replaceChildren();const div=document.createElement('div');div.className='empty-state';const icon=document.createElement('span');icon.textContent='▦';const h=document.createElement('h3');h.textContent=title;const p=document.createElement('p');p.textContent=text;div.append(icon,h,p);target.append(div);}
function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open('shorty-studio',1);req.onupgradeneeded=()=>req.result.createObjectStore('videos',{keyPath:'id'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
function store(mode,fn){return new Promise((resolve,reject)=>{const tx=db.transaction('videos',mode);const req=fn(tx.objectStore('videos'));tx.oncomplete=()=>resolve(req?.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Device storage is full or unavailable.'));});}
async function reload(){entries=await store('readonly',s=>s.getAll());entries.sort((a,b)=>b.added-a.added);render();}
async function inspect(blob){
 const url=URL.createObjectURL(blob),v=document.createElement('video');v.preload='auto';v.muted=true;v.playsInline=true;
 try{return await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>done(new Error('This video could not be read. Try another format.')),15000);function done(error,data){clearTimeout(timeout);error?reject(error):resolve(data);}v.onerror=()=>done(new Error('Your browser cannot read this video format.'));v.onloadeddata=()=>{if(!Number.isFinite(v.duration)||v.duration<=0)return done(new Error('This video does not have a valid duration.'));const c=document.createElement('canvas');c.width=320;c.height=Math.round(320*v.videoHeight/v.videoWidth)||180;const ctx=c.getContext('2d');ctx.drawImage(v,0,0,c.width,c.height);done(null,{duration:v.duration,width:v.videoWidth,height:v.videoHeight,thumbnail:c.toDataURL('image/jpeg',.65)});};v.src=url;});}finally{v.removeAttribute('src');v.load();URL.revokeObjectURL(url);}
}
async function add(blob,name,source='upload',extra={}){
 if(!db)throw new Error('Device storage is unavailable. Please enable site storage.');
 if(!blob.size||blob.size>LIMIT)throw new Error('Choose a video between 1 byte and 100 MB.');
 if(!blob.type.startsWith('video/'))throw new Error('Please choose a video file.');
 const metadata=await inspect(blob);const entry={id:[...crypto.getRandomValues(new Uint8Array(16))].map(b=>b.toString(16).padStart(2,'0')).join(''),name:videoName(name),blob,source,added:Date.now(),...metadata,...extra};
 await store('readwrite',s=>s.put(entry));await reload();notice('Added to your video library: '+entry.name);return entry;
}
async function importFiles(files){for(const file of files){try{await add(file,file.name);}catch(e){notice(e.message);}}$('files').value='';}
$('files').onchange=e=>importFiles(e.target.files);
for(const event of ['dragenter','dragover'])$('dropzone').addEventListener(event,e=>{e.preventDefault();$('dropzone').classList.add('dragging');});
for(const event of ['dragleave','drop'])$('dropzone').addEventListener(event,e=>{e.preventDefault();$('dropzone').classList.remove('dragging');if(event==='drop')importFiles(e.dataTransfer.files);});
function urlFor(entry){if(!urls.has(entry.id))urls.set(entry.id,URL.createObjectURL(entry.blob));return urls.get(entry.id);}
function download(entry){const a=document.createElement('a');a.href=urlFor(entry);a.download=entry.name;document.body.append(a);a.click();a.remove();}
async function remove(entry){
 if(exporting){notice('Finish or cancel the export before removing videos.');return;}
 // Keep a recoverable copy in memory for one-step undo; no bulk delete.
 await store('readwrite',s=>s.delete(entry.id));if(active?.id===entry.id){active=null;$('player').pause();$('player').removeAttribute('src');$('player').load();$('player-placeholder').hidden=false;$('edit-fields').disabled=true;$('selected-name').textContent='No video selected';}
 if(urls.has(entry.id)){URL.revokeObjectURL(urls.get(entry.id));urls.delete(entry.id);}await reload();notice('Removed from this device.');const undo=button('Undo',async()=>{try{await store('readwrite',s=>s.put(entry));await reload();notice('Video restored.');}catch(e){notice(e.message);}});$('notice').append(' ',undo);
}
function render(){
 $('video-count').textContent=entries.length;$('library-count').textContent=entries.length;$('duration-total').textContent=time(entries.reduce((n,e)=>n+e.duration,0));$('storage-total').textContent=humanSize(entries.reduce((n,e)=>n+e.blob.size,0));
 const query=$('search').value.toLowerCase(),filter=$('filter').value;const list=entries.filter(e=>e.name.toLowerCase().includes(query)&&(filter==='all'||e.source===filter));
 if(!list.length){empty($('library'),entries.length?'No matching videos':'A clean slate. A new story.','Import a video above or connect your Facebook Page to begin.');return;}
 $('library').replaceChildren();for(const entry of list){const card=document.createElement('article');card.className='video-card';const thumb=document.createElement('div');thumb.className='thumb';if(entry.thumbnail){const img=document.createElement('img');img.alt='';img.src=entry.thumbnail;thumb.append(img);}const duration=document.createElement('span');duration.className='duration';duration.textContent=time(entry.duration);thumb.append(duration);const body=document.createElement('div');body.className='video-body';const h=document.createElement('h3');h.textContent=entry.name;h.title=entry.name;const meta=document.createElement('div');meta.className='video-meta';const source=document.createElement('span');source.textContent=entry.source==='facebook'?'Facebook Page':entry.source==='export'?'Edited export':'Uploaded video';const size=document.createElement('span');size.textContent=humanSize(entry.blob.size);meta.append(source,size);const actions=document.createElement('div');actions.className='card-actions';actions.append(button('✂ Edit',()=>select(entry)),button('Save',()=>download(entry)),button('Remove',()=>remove(entry).catch(e=>notice(e.message)),'remove'));body.append(h,meta,actions);card.append(thumb,body);$('library').append(card);}
}
$('search').oninput=render;$('filter').onchange=render;
function select(entry){if(exporting){notice('Finish or cancel the current export first.');return;}previewing=false;active=entry;activeURL=urlFor(entry);$('player').src=activeURL;$('player-placeholder').hidden=true;$('selected-name').textContent=entry.name;$('edit-fields').disabled=false;$('start').value=0;$('end').value=entry.duration.toFixed(2);$('export-status').textContent='';$('editor-section').scrollIntoView({behavior:'smooth'});}
function range(){if(!active)throw new Error('Select a video first.');return trimRange($('start').value,$('end').value,active.duration);}
$('set-start').onclick=()=>{$('start').value=$('player').currentTime.toFixed(2);};$('set-end').onclick=()=>{$('end').value=$('player').currentTime.toFixed(2);};
$('preview').onclick=async()=>{try{const r=range();$('player').currentTime=r.start;previewing=true;await $('player').play();}catch(e){notice(e.message);}};
$('player').ontimeupdate=()=>{if(previewing&&$('player').currentTime>=Number($('end').value)){$('player').pause();previewing=false;}};
async function api(path,{binary=false}={}){
 const r=await fetch(API+path,{headers:session?{Authorization:'Bearer '+session}:{},credentials:'omit',signal:AbortSignal.timeout(binary?120000:30000)});
 if(!r.ok){let error='The server could not complete this request.';try{error=(await r.json()).error||error;}catch{}if(r.status===401){session=null;disconnected();}throw new Error(error);}
 return binary?r.blob():r.json();
}
function disconnected(){$('disconnect').hidden=true;$('connect').hidden=false;$('page-tools').hidden=true;$('page-videos').replaceChildren();$('more-videos').hidden=true;$('facebook-status').textContent='Connect to view videos from Pages you manage.';cursor=null;}
function finishOAuthWatch(){stopOAuthWatch?.();stopOAuthWatch=null;$('connect').disabled=false;}
$('connect').onclick=async()=>{
 if(stopOAuthWatch){popup?.focus();return;}
 popup=window.open('about:blank','shorty-facebook','width=620,height=760');
 if(!popup){notice('Allow a popup for Shorty to connect Facebook.');return;}
 const currentPopup=popup;$('connect').disabled=true;
 stopOAuthWatch=watchOAuthPopup(currentPopup,reason=>{
  const message=reason==='closed'?'Facebook connection was closed. Select Connect Facebook to try again.':'Facebook login expired. Select Connect Facebook to start a fresh login.';
  finishOAuthWatch();popup=null;$('facebook-status').textContent=message;notice(message);
 });
 try{const s=await api('/api/facebook/status');if(!s.configured)throw new Error('Facebook setup is pending on the backend. Your library and local editing are available now.');if(popup!==currentPopup)return;currentPopup.location=API+'/auth/facebook/start';$('facebook-status').textContent='Complete authorization in the Facebook window.';}catch(e){currentPopup.close();finishOAuthWatch();popup=null;disconnected();notice(e.message);}
};
window.addEventListener('message',async e=>{
 if(e.origin!==new URL(API).origin||e.source!==popup||e.data?.type!=='shorty-facebook-connected'||!/^[A-Za-z0-9_-]{43}$/.test(e.data.session||''))return;
 session=e.data.session;finishOAuthWatch();popup=null;$('disconnect').hidden=false;$('connect').hidden=true;try{await loadPages();}catch(error){notice(error.message);}
});
$('disconnect').onclick=async()=>{try{await api('/api/facebook/disconnect');}catch{}finally{session=null;disconnected();notice('Disconnected from Facebook. Imported device copies remain in your library.');}};
async function loadPages(){const data=await api('/api/facebook/pages');$('pages').replaceChildren();for(const p of data.pages){const o=document.createElement('option');o.value=p.id;o.textContent=p.name;$('pages').append(o);}$('page-tools').hidden=!data.pages.length;$('facebook-status').textContent=data.pages.length?'Connected. Choose a Page to browse its videos.':'No authorized Pages found. Reconnect and select a Page you manage.';if(data.pages.length)await loadVideos();}
async function loadVideos(more=false){if(!more){$('page-videos').replaceChildren();cursor=null;}const pageId=$('pages').value;if(!pageId)return;const data=await api(`/api/facebook/pages/${pageId}/videos${more&&cursor?'?after='+encodeURIComponent(cursor):''}`);if(pageId!==$('pages').value)return;
 if(!more&&!data.videos.length)empty($('page-videos'),'No videos returned','This Page may have no available videos or may need additional authorization.');
 for(const v of data.videos){const card=document.createElement('article');card.className='video-card';const thumb=document.createElement('div');thumb.className='thumb';thumb.textContent='▶';const body=document.createElement('div');body.className='video-body';const h=document.createElement('h3');h.textContent=v.title||v.description?.slice(0,70)||'Page video';const p=document.createElement('p');p.className='footnote';p.textContent=v.created_time?new Date(v.created_time).toLocaleDateString():'';const b=button('Import to library',async()=>{if(!$('rights').checked){notice('Confirm that you have permission to use these videos first.');return;}b.disabled=true;b.textContent='Importing…';try{const blob=await api(`/api/facebook/pages/${pageId}/import?video=${encodeURIComponent(v.id)}&authorized=yes`,{binary:true});await add(blob,`facebook-${v.id}.mp4`,'facebook',{pageId,videoId:v.id});}catch(e){notice(e.message);}finally{b.disabled=false;b.textContent='Import to library';}});body.append(h,p,b);card.append(thumb,body);$('page-videos').append(card);}
 cursor=data.after;$('more-videos').hidden=!cursor;
}
$('pages').onchange=()=>loadVideos().catch(e=>notice(e.message));$('refresh-pages').onclick=()=>loadPages().catch(e=>notice(e.message));$('more-videos').onclick=()=>loadVideos(true).catch(e=>notice(e.message));
$('direct-form').onsubmit=async e=>{e.preventDefault();try{const u=new URL($('direct-url').value);if(u.protocol!=='https:'||u.username||u.password||!u.pathname.toLowerCase().endsWith('.mp4'))throw new Error('Enter a direct HTTPS MP4 file URL.');if(!$('direct-rights').checked)throw new Error('Please confirm your permission.');const blob=await api('/api/download?authorized=yes&url='+encodeURIComponent(u.href),{binary:true});await add(blob,decodeURIComponent(u.pathname.split('/').pop()));}catch(error){notice(error.message);}};
$('export').onclick=async()=>{
 if(exporting)return;
 let worker,watchdog;
 try{
  const r=range(),entry=active,size=outputSize(entry.width,entry.height,$('resolution').value);
  if(!window.WebAssembly||!window.Worker)throw new Error('This browser cannot run local video export. Please use a current desktop browser.');
  exporting=true;$('player').pause();$('edit-fields').disabled=true;$('cancel-export').hidden=false;$('export-progress').hidden=false;$('export-progress').value=0;
  $('export-status').textContent='Loading local MP4 editor (about 32 MB on first use)…';
  const input=await entry.blob.arrayBuffer();
  worker=new Worker(new URL('./vendor/ffmpeg/export-worker.js',import.meta.url));
  const output=await new Promise((resolve,reject)=>{
   cancelExport=()=>{worker.terminate();reject(new Error('Export cancelled. Your original is unchanged.'));};$('cancel-export').onclick=cancelExport;
   watchdog=setTimeout(()=>{worker.terminate();reject(new Error('Export timed out. Try a shorter clip or smaller resolution.'));},330000);
   worker.onerror=()=>reject(new Error('The local editor could not load. Check your connection or try a smaller video.'));
   worker.onmessage=({data})=>{if(data.error)reject(new Error(data.error));else if(data.output)resolve(data.output);else{$('export-progress').value=data.progress;$('export-status').textContent='Encoding your MP4 on this device… '+Math.round(data.progress)+'%';}};
   worker.postMessage({input,start:r.start,duration:r.end-r.start,width:size.width,height:size.height,mute:$('mute').checked},[input]);
  });
  const blob=new Blob([output],{type:'video/mp4'});const exported=await add(blob,entry.name.replace(/\.[^.]+$/,'')+'-trimmed.mp4','export');download(exported);$('export-progress').value=100;$('export-status').textContent='MP4 export saved to your library and downloaded.';
 }catch(e){$('export-status').textContent=e.message;notice(e.message);}finally{clearTimeout(watchdog);worker?.terminate();exporting=false;cancelExport=null;$('edit-fields').disabled=!active;$('cancel-export').hidden=true;}
};
window.addEventListener('beforeunload',e=>{if(exporting){e.preventDefault();e.returnValue='';}});
try{db=await openDB();await reload();}catch(e){notice('Device storage is unavailable. Enable site storage or use a regular browser window.');empty($('library'),'Storage unavailable','Your existing website and original files are unchanged.');}
