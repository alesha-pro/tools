// Browser regressions. Run from any directory; artifacts go to --out or a temp dir.
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outIndex = process.argv.indexOf('--out');
const out = outIndex >= 0 ? path.resolve(process.argv[outIndex + 1]) : fs.mkdtempSync(path.join(os.tmpdir(), 'canvas-verify-'));
fs.mkdirSync(out,{recursive:true});
const chrome = process.env.CHROME || (fs.existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome') ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : execFileSync('which',['chromium']).toString().trim());
const browser = await puppeteer.launch({executablePath:chrome,headless:true});
const checks=[];
const check = async (name, run) => { const result = await run(); checks.push({name,status:'passed',result}); console.log('PASS',name); };
async function load(file, params='w=360') {
 const p=await browser.newPage(), errors=[];p.on('pageerror',e=>errors.push(String(e)));
 await p.goto(pathToFileURL(file).href+'?bare=1&'+params);
 await p.waitForFunction('window.__ready === true || window.__error',{timeout:60000});
 const error=await p.evaluate(()=>window.__error);assert.equal(error,undefined);assert.deepEqual(errors,[]);
 return {p,errors};
}
try {
 const {p}=await load(path.join(root,'examples/weight-study.html'));
 await check('exposures change cadence and hold at authored frames',async()=>{
  const r=await p.evaluate(()=>{const e=exposureTrack([{at:0,on:2},{at:1,on:1},{at:2,on:3},{at:3,hold:true}]);return [0,1,2,23,24,25,48,49,50,51,80].map(f=>Math.round(e(f/24)*24));});
  assert.deepEqual(r,[0,0,2,22,24,25,48,48,48,51,72]);return r;
 });
 await check('IK preserves lengths and clamps unreachable targets',async()=>{
  const r=await p.evaluate(()=>[[5,5],[100,50],[0,0]].map(target=>{const s=solveLimb([0,0],target,10,7);return {a:Math.hypot(...s.joint),b:Math.hypot(s.end[0]-s.joint[0],s.end[1]-s.joint[1]),error:s.error};}));
  for(const s of r){assert.ok(Math.abs(s.a-10)<1e-8);assert.ok(Math.abs(s.b-7)<1e-8);}assert.ok(r[1].error>0);return r;
 });
 await check('equal arc-length samples across uneven segments',async()=>{
  const r=await p.evaluate(()=>{const q=motionPath([[0,0],[2,0],[10,0]],{smooth:false});return [0,.25,.5,.75,1].map(u=>q.at(u).p);});assert.deepEqual(r,[[0,0],[2.5,0],[5,0],[7.5,0],[10,0]]);return r;
 });
 await check('study hands stay on the prop throughout grip and lift',async()=>{
  const r=await p.evaluate(()=>{let max=0;for(let f=36;f<168;f++){const {arms,grips}=actor(ctx,f/24);for(let i=0;i<2;i++)max=Math.max(max,Math.hypot(arms[i].end[0]-grips[i][0],arms[i].end[1]-grips[i][1]));}return max;});assert.ok(r<1e-6,`contact error ${r}`);return {maxContactError:r};
 });
 await check('stable stroke is invariant under repeat rendering',async()=>{
  const r=await p.evaluate(()=>{const cv=document.createElement('canvas');cv.width=cv.height=200;const c=cv.getContext('2d'),s=makeStroke([[10,20],[60,100],[180,70]],{id:'qa/curve',width:8});const draw=()=>{c.clearRect(0,0,200,200);drawStroke(c,s,{material:'pencil',map:p=>[p[0],p[1]*.8]});return cv.toDataURL();};const a=draw();draw();return a===draw();});assert.equal(r,true);return r;
 });
 await p.close();
 await check('cel exposure sheets cover boundaries and reject invalid entries',async()=>{
  const {p}=await load(path.join(root,'examples/sketchbook-bird.html'));
  const r=await p.evaluate(()=>{
   const d={a:{},b:{}},sheet=exposureSheet([{id:'a',frames:2},{id:'b',frames:3}],d);
   const ids=[-1,0,1,2,4,5].map(f=>sheet.atFrame(f).id);
   let rejected=0;for(const row of [{id:'missing',frames:1},{id:'a',frames:0},{id:'a',frames:1.5}])try{exposureSheet([row],d);}catch{rejected++;}
   return {ids,rejected,frames:SHEET.frames,entries:SHEET.rows.length,drawings:Object.keys(D).length};
  });assert.deepEqual(r.ids,['a','a','a','b','b','b']);assert.equal(r.rejected,3);assert.equal(r.frames,144);await p.close();return r;
 });
 await check('cel inbetweens preserve endpoints and reject changed topology',async()=>{
  const {p}=await load(path.join(root,'examples/sketchbook-bird.html'));
  const r=await p.evaluate(()=>{
   const a=keyRaw.rest,b=keyRaw.lean;
   const same=(u,k)=>inbetweenCel(a,b,u).strokes.every((s,i)=>s.points.every((q,j)=>q.every((v,n)=>Math.abs(v-k.strokes[i].points[j][n])<1e-9)));
   const changes=[q=>q.strokes.reverse(),q=>q.strokes[0].points.pop(),q=>q.strokes[0].close=true,q=>q.strokes[0].color='#f00'];let rejected=0;
   for(const change of changes){const q=structuredClone(b);change(q);try{inbetweenCel(a,q,.5);}catch{rejected++;}}
   return {start:same(0,a),end:same(1,b),rejected};
  });assert.equal(r.start,true);assert.equal(r.end,true);assert.equal(r.rejected,4);await p.close();return r;
 });
 await check('held drawings hold every mark and reproduce after seeking',async()=>{
  const {p}=await load(path.join(root,'examples/sketchbook-bird.html'),'w=960');
  const r=await p.evaluate(()=>{
   const frame=f=>{drawFrame(f);return cv.toDataURL();};const a=frame(0),held=frame(15),next=frame(16);frame(143);const again=frame(0);
   const blink=SHEET.rows.find(r=>r.id==='blink');
   return {held:a===held,changed:a!==next,seek:a===again,blinkDifferent:frame(blink.start)!==frame(blink.start-1),png:frame(0)};
  });assert.equal(r.held,true);assert.equal(r.changed,true);assert.equal(r.seek,true);assert.equal(r.blinkDifferent,true);
  fs.writeFileSync(path.join(out,'sketchbook-pencil.png'),Buffer.from(r.png.split(',')[1],'base64'));delete r.png;await p.close();
  const {p:q,errors}=await load(path.join(root,'examples/sketchbook-bird.html'),'w=960&look=ink');
  const png=await q.evaluate(()=>window.__frame(67));fs.writeFileSync(path.join(out,'sketchbook-ink.png'),Buffer.from(png.split(',')[1],'base64'));assert.deepEqual(errors,[]);await q.close();return r;
 });
 await check('whole bird drawings preserve planted toe landmarks before and after flight',async()=>{
  const {p}=await load(path.join(root,'examples/sketchbook-bird.html'));
  const r=await p.evaluate(()=>{
   let max=0;for(let f=0;f<144;f++){
    if(f>=64&&f<76)continue;const q=SHEET.atFrame(f),place=placements[q.id],offset=f<64?0:118;
    for(const id of ['footA','footB']){
     const points=q.drawing.strokes.find(s=>s.id===id).points;
     for(let j=0;j<points.length;j++)max=Math.max(max,Math.hypot(points[j][0]+place[0]-K.rest[id][j][0]-offset,points[j][1]+place[1]-K.rest[id][j][1]));
    }
   }return {maxContactDrift:max};
  });assert.ok(r.maxContactDrift<1e-8);await p.close();return r;
 });
 await check('blank and transparent plates do not print at three resolutions',async()=>{
  const {p}=await load(path.join(root,'assets/film-template.html'));
  const r=await p.evaluate(()=>[540,1080,2160].map(width=>{setFormat({ar:'1:1',width});const P=plate(),g=P.getContext('2d'),corner=Array.from(g.getImageData(P.width-1,P.height-1,1,1).data);const cv=document.createElement('canvas');cv.width=OUT_W;cv.height=OUT_H;const c=cv.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,cv.width,cv.height);printPlate(c,P);g.clearRect(0,0,W,H);printPlate(c,P);const d=c.getImageData(0,0,cv.width,cv.height).data;let dirty=0;for(let i=0;i<d.length;i+=4)if(d[i]!==255||d[i+1]!==255||d[i+2]!==255)dirty++;return {width,corner,dirty,scale:g.getTransform().a};}));
  for(const q of r){assert.deepEqual(q.corner,[255,255,255,255]);assert.equal(q.dirty,0);assert.equal(q.scale,q.width/1080);}await p.close();return r;
 });
 await check('all examples load and support late/backward frame evaluation',async()=>{
  const results=[];
  // Interactive pages (workshop.html) drive the engine without defineFilm and never set window.__ready.
  const examples=fs.readdirSync(path.join(root,'examples')).filter(f=>f.endsWith('.html')&&fs.readFileSync(path.join(root,'examples',f),'utf8').includes('defineFilm('));
  examples.push('becoming-phoenix/phoenix.html');
  for(const file of examples){
   const {p,errors}=await load(path.join(root,'examples',file));
   const result=await p.evaluate(()=>{const n=window.__NDRAW,f=Math.floor(n*.31);const a=window.__frame(f);window.__frame(n-1);const b=window.__frame(f);return {fps:window.__fps,frames:n,repeat:a===b};});
   assert.deepEqual(errors,[],file);assert.equal(result.fps,24,file);assert.equal(result.repeat,true,file+' seek mismatch');results.push({file,...result});await p.close();
  }return results;
 });
 await check('phoenix paper unfolds above a fixed attachment and seeks reproducibly',async()=>{
  const {p,errors}=await load(path.join(root,'examples/becoming-phoenix/phoenix.html'),'w=480');
  const r=await p.evaluate(()=>{
   const bounds=t=>{unfoldPhoenix(t);const c=cutPhoenix.cv,d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let x0=c.width,x1=0,y0=c.height,y1=0;
    for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(d[(y*c.width+x)*4+3]>100){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
    return {time:t,width:x1-x0,height:y1-y0,bottom:y1};};
   const phases=[3,3.7,4.5,5.4,6.2].map(bounds);drawFrame(946);const first=cv.toDataURL();drawFrame(1439);drawFrame(901);drawFrame(946);
   return {phases,repeat:cv.toDataURL()===first,frames:window.__NDRAW,duration:FILM.DUR};
  });assert.equal(r.frames,1440);assert.equal(r.duration,60);assert.equal(r.repeat,true);
  assert.ok(r.phases.at(-1).width>r.phases[0].width*5);assert.ok(r.phases.every(p=>p.bottom===r.phases[0].bottom));assert.deepEqual(errors,[]);await p.close();return r;
 });
 await check('phoenix storm moves its background and preserves the same frame after seeking',async()=>{
  const {p}=await load(path.join(root,'examples/becoming-phoenix/phoenix.html'),'w=480');
  const r=await p.evaluate(()=>{
   const sample=f=>{drawFrame(f);return ctx.getImageData(0,0,cv.width,85).data.slice();};
   const samples=[192,216,240,264,288,312].map(sample),changes=[];
   for(let j=1;j<samples.length;j++){let n=0;for(let i=0;i<samples[j].length;i+=4){let d=0;for(let k=0;k<3;k++)d+=Math.abs(samples[j][i+k]-samples[j-1][i+k]);if(d>30)n++;}changes.push(n/(samples[j].length/4));}
   drawFrame(279);const first=cv.toDataURL();drawFrame(1439);drawFrame(180);drawFrame(279);return {changes,repeat:cv.toDataURL()===first};
  });assert.ok(r.changes.every(v=>v>.05));assert.equal(r.repeat,true);await p.close();return r;
 });
 await check('five materials render the study without page errors',async()=>{
  for(const look of ['ink','pencil','riso','screen','doodle']){
   const {p,errors}=await load(path.join(root,'examples/weight-study.html'),'w=960&look='+look);
   const png=await p.evaluate(()=>window.__frame(96));fs.writeFileSync(path.join(out,look+'.png'),Buffer.from(png.split(',')[1],'base64'));
   assert.deepEqual(errors,[],look);if(look==='doodle'){const err=await p.evaluate(()=>{let max=0;for(let f=36;f<168;f++){const {arms,grips}=actor(ctx,f/24);for(let i=0;i<2;i++)max=Math.max(max,Math.hypot(arms[i].end[0]-grips[i][0],arms[i].end[1]-grips[i][1]));}return max;});assert.ok(err<1e-6,'Photo grip unreachable: '+err);}await p.close();
  }return ['ink','pencil','riso','screen','doodle'];
 });
 await check('rotoscope uses source cadence and draws silhouette-only clips',async()=>{
  const {p}=await load(path.join(root,'examples/gallop.html'));
  const r=await p.evaluate(()=>{
   registerClip('qa-silhouette',{fps:10,h:40,frames:[{outer:[[[0,-40],[30,0],[-30,0]]],lines:[]},{outer:[[[25,-40],[55,0],[-5,0]]],lines:[]}]});
   const cv=document.createElement('canvas');cv.width=200;cv.height=100;const c=cv.getContext('2d'),o={x:70,y:80,h:60,fill:null,ink:'#121212'};
   const sample=fn=>{c.clearRect(0,0,200,100);fn();return cv.toDataURL();};
   const a=sample(()=>rotoAt(c,'qa-silhouette',.1,o)),b=sample(()=>roto(c,'qa-silhouette',1,o)),first=sample(()=>roto(c,'qa-silhouette',0,o));
   const d=c.getImageData(0,0,200,100).data;let visible=0;for(let i=3;i<d.length;i+=4)if(d[i])visible++;
   return {matchesSource:a===b,differentPose:a!==first,visible};
  });assert.equal(r.matchesSource,true);assert.equal(r.differentPose,true);assert.ok(r.visible>20);await p.close();return r;
 });
 await check('sand hand clears the entire fractional-size landscape shadow buffer',async()=>{
  const {p}=await load(path.join(root,'examples/one-year.html'));
  const result=await p.evaluate(()=>{
   const native=HTMLCanvasElement.prototype.getContext;
   HTMLCanvasElement.prototype.getContext=function(type,options){return native.call(this,type,type==='2d'?{...options,willReadFrequently:true}:options);};
   setFormat({ar:'16:9',width:480});_handCv=null;
   sandFilm({N:48,world:1920,gestures:[G.finger(.1,5.8,[[500,600],[1300,1100]],{r:32})]});
   const cv=document.createElement('canvas');cv.width=OUT_W;cv.height=OUT_H;const g=cv.getContext('2d');
   const frame=t=>{g.setTransform(1,0,0,1,0,0);g.fillStyle='#fff';g.fillRect(0,0,cv.width,cv.height);resetT(g);sandHand(g,t);return cv.toDataURL();};
   const before=frame(2.75);for(let f=0;f<144;f++)frame(f/24);const after=frame(2.75);
   return {repeat:before===after,logicalWidth:W,shadowWidth:_handCv.width};
  });assert.equal(result.repeat,true);assert.equal(result.logicalWidth,1920);assert.equal(result.shadowWidth,214);await p.close();return result;
 });
 await check('sand wipe conserves mass and checkpoint seek reproduces state',async()=>{
  const {p}=await load(path.join(root,'examples/one-year.html'));
  const result=await p.evaluate(()=>{
   sandFilm({N:48,world:1080,hand:false,init:h=>h.fill(.9),gestures:[]});const sum=()=>SAND.h.reduce((a,b)=>a+b,0),before=sum();_wipe(24,24,5,1,0,1,.4,1);const after=sum();
   sandFilm({N:48,world:1080,hand:false,gestures:[G.pour(0,8,[[150,200],[900,900]],{r:40})]});sandAdvance(7);const a=Array.from(SAND.h);sandAdvance(2.5);sandAdvance(7);return {before,after,repeat:a.every((v,i)=>v===SAND.h[i]),checkpoints:_sandCheckpoints.size};
  });assert.ok(Math.abs(result.before-result.after)/result.before<1e-6);assert.equal(result.repeat,true);assert.ok(result.checkpoints>0);await p.close();return result;
 });
} finally {await browser.close();}
await check('renderer preserves film format, replaces stale frames and supports 12 fps',async()=>{
 const fixture=path.join(out,'revision.html'),dest=path.join(out,'revision-output');
 const write=(fps,dur,audio)=>fs.writeFileSync(fixture,`<canvas id="c"></canvas><script src="${pathToFileURL(path.join(root,'assets/core.js')).href}"></script><script>defineFilm({format:{ar:'16:9',width:160},fps:${fps},timeline:[{name:'test',dur:${dur},fn(c,t){paper(c);c.fillStyle=PAL.ink;c.fillRect(20+t*40,20,40,40)}}]${audio?',score:(ac,t0,dest)=>note(ac,dest,220,t0,0,.1)':''}});</script>`);
 const run=()=>execFileSync(process.execPath,[path.join(root,'scripts/render.mjs'),fixture,'--out',dest],{stdio:'pipe',env:{...process.env,CHROME:chrome}});
 write(24,.75,true);run();assert.ok(fs.existsSync(path.join(dest,'revision-final.mp4')));
 write(12,.5,false);run();
 const meta=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','stream=width,height,nb_frames,r_frame_rate','-show_entries','format=duration','-of','json',path.join(dest,'revision.mp4')]).toString());
 assert.equal(meta.streams[0].width,160);assert.equal(meta.streams[0].height,90);assert.equal(meta.streams[0].nb_frames,'12');assert.equal(Number(meta.format.duration),.5);
 assert.equal(fs.readdirSync(path.join(dest,'revision-frames')).length,6);assert.equal(fs.existsSync(path.join(dest,'revision-final.mp4')),false);assert.equal(fs.existsSync(path.join(dest,'revision-score.wav')),false);
 execFileSync('ffmpeg',['-v','error','-i',path.join(dest,'revision.mp4'),'-f','null','-'],{stdio:'pipe'});return meta;
});
fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({checks},null,2)+'\n');
console.log(`${checks.length} checks passed. Evidence: ${out}`);
