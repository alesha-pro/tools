import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname,extname,sep} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
const opts={width:1080,height:1920,fps:60,duration:15,start:0,sub:1,out:'out/silent.mp4'};
for(let i=2;i<process.argv.length;i+=2){let k=process.argv[i].replace(/^--/,'');if(!(k in opts)||process.argv[i+1]===undefined)throw Error(`Unknown/missing argument ${k}`);opts[k]=k==='out'?process.argv[i+1]:Number(process.argv[i+1]);}
for(const k of ['width','height','fps','duration','sub'])if(!Number.isFinite(opts[k])||opts[k]<=0)throw Error(`Invalid ${k}`);
for(const k of ['width','height','sub'])if(!Number.isInteger(opts[k]))throw Error(`${k} must be integer`);
if(opts.width%2||opts.height%2||!Number.isFinite(opts.start)||opts.start<0)throw Error('Even dimensions and nonnegative start required');
const count=Math.round(opts.duration*opts.fps);if(count<1||Math.abs(count-opts.duration*opts.fps)>1e-6)throw Error('duration * fps must be an integer');
const root=process.cwd(),out=resolve(opts.out),errors=[];
await mkdir(dirname(out),{recursive:true});
const server=createServer(async(req,res)=>{try{const p=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(p!==root&&!p.startsWith(root+sep)){res.writeHead(403);res.end();return;}
 const path=p===root?resolve(root,'index.html'):p;
 const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2','.svg':'image/svg+xml'};
 res.setHeader('Content-Type',types[extname(path)]||'application/octet-stream');res.end(await readFile(path));}catch{res.writeHead(404);res.end();}});
server.listen(0,'127.0.0.1');await once(server,'listening');let browser,ff;
try{
 browser=await chromium.launch();const page=await browser.newPage({viewport:{width:opts.width,height:opts.height},deviceScaleFactor:1});
 page.on('pageerror',e=>errors.push(e.message));
 const url=`http://127.0.0.1:${server.address().port}/?render=1&w=${opts.width}&h=${opts.height}`;
 async function ready(){await page.goto(url);await page.evaluate(async()=>{await window.ready;await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));if(typeof window.seek!=='function')throw Error('window.seek missing');});}
 await ready();
 const seek=async t=>{await page.evaluate(async t=>{await window.seek(t);},t);if(errors.length)throw Error(errors.join('\n'));};
 async function hash(t){await seek(t);return page.evaluate(async()=>{const c=document.querySelector('#c'),v=c.getContext('2d').getImageData(0,0,c.width,c.height).data;return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',v))).map(b=>b.toString(16).padStart(2,'0')).join('');});}
 const ts=[opts.start,opts.start+opts.duration*.31,opts.start+opts.duration*.79],checks=[];
 for(const t of ts){const a=await hash(t);await seek(opts.start+opts.duration*.91);const b=await hash(t);checks.push({t,hash:a,repeat:a===b});}
 await ready();for(const c of checks)c.reload=c.hash===await hash(c.t);
 await writeFile(out+'.determinism.json',JSON.stringify(checks,null,2));
 if(checks.some(c=>!c.repeat||!c.reload))throw Error('Non-deterministic frame pixels');
 const vf=opts.sub>1?`tmix=frames=${opts.sub},select=eq(mod(n\\,${opts.sub})\\,${opts.sub-1}),setpts=N/${opts.fps}/TB`:'null';
 ff=spawn('ffmpeg',['-y','-v','error','-f','image2pipe','-framerate',String(opts.fps*opts.sub),'-i','pipe:0','-vf',vf,'-r',String(opts.fps),'-frames:v',String(count),'-c:v','libx264','-crf','16','-pix_fmt','yuv420p','-movflags','+faststart',out],{stdio:['pipe','inherit','inherit']});
 let fail;ff.on('error',e=>{fail=e;});ff.stdin.on('error',e=>{fail=e;});
 const closed=new Promise((res,rej)=>{ff.on('error',rej);ff.on('close',code=>code===0?res():rej(Error(`ffmpeg exit ${code}`)));});closed.catch(()=>{});
 for(let i=0;i<count*opts.sub;i++){
   if(fail)throw fail;
   await seek(opts.start+i/(opts.fps*opts.sub));
   const png=Buffer.from(await page.evaluate(()=>document.querySelector('#c').toDataURL('image/png').split(',')[1]),'base64');
   await new Promise((res,rej)=>ff.stdin.write(png,e=>e?rej(e):res()));
   if(i%(Math.max(1,Math.round(opts.fps))*opts.sub)===0)console.log(`${(i/(opts.fps*opts.sub)).toFixed(1)} / ${opts.duration}s`);
 }
 ff.stdin.end();await closed;
 await writeFile(out+'.render.json',JSON.stringify({...opts,frames:count,command:process.argv,browser:browser.version()},null,2));
 console.log(out);
}finally{if(ff&&ff.exitCode===null)ff.kill('SIGTERM');if(browser)await browser.close();server.close();}
