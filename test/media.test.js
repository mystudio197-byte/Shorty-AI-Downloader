import {test} from 'node:test';import assert from 'node:assert/strict';import {trimRange,outputSize,videoName,watchOAuthPopup} from '../media-utils.js';
test('rejects empty, inverted, negative and out-of-bounds trim ranges',()=>{for(const [s,e] of [['',5],[5,2],[-1,4],[0,11],[0,.01]])assert.throws(()=>trimRange(s,e,10));assert.deepEqual(trimRange('1','5',10),{start:1,end:5});});
test('resolution preserves portrait and landscape aspect ratio without upscaling',()=>{assert.deepEqual(outputSize(1920,1080,'720'),{width:1280,height:720});assert.deepEqual(outputSize(1080,1920,'720'),{width:720,height:1280});assert.deepEqual(outputSize(640,360,'1080'),{width:640,height:360});});
test('filenames cannot include path separators or control characters',()=>{assert.equal(videoName('../hello\u0000.mp4'),'.._hello_.mp4');});

function popupWatchFixture(){
 let clock=0,tick,cancelled=0;const ended=[],popup={closed:false};
 const stop=watchOAuthPopup(popup,r=>ended.push(r),{now:()=>clock,schedule:fn=>{tick=fn;return 42;},cancel:id=>{assert.equal(id,42);cancelled++;}});
 return {popup,ended,stop,tick:()=>tick(),advance:ms=>clock+=ms,cancelled:()=>cancelled};
}
test('popup closure reports once and cancels polling',()=>{
 const f=popupWatchFixture();f.tick();assert.deepEqual(f.ended,[]);
 f.popup.closed=true;f.tick();f.tick();assert.deepEqual(f.ended,['closed']);assert.equal(f.cancelled(),1);
});
test('OAuth expires at ten minutes rather than leaving a stale pending message',()=>{
 const f=popupWatchFixture();f.advance(599999);f.tick();assert.deepEqual(f.ended,[]);
 f.advance(1);f.tick();assert.deepEqual(f.ended,['expired']);assert.equal(f.cancelled(),1);
});
test('successful connection can stop polling without a later false expiry',()=>{
 const f=popupWatchFixture();f.stop();f.stop();f.advance(600000);f.popup.closed=true;f.tick();
 assert.deepEqual(f.ended,[]);assert.equal(f.cancelled(),1);
});
