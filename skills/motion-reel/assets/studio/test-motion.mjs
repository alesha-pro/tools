import assert from 'node:assert/strict';
import {spring,track,rng} from './motion.mjs';
// Compare all damping regimes against independent RK4 integration of m*x''+d*x'+k*x=k.
for(const d of [8,20,35]){
 let x=0,v=0,h=.0001;
 const f=(x,v)=>[v,100*(1-x)-d*v];
 for(let i=1;i<=10000;i++){
  const a=f(x,v),b=f(x+h*a[0]/2,v+h*a[1]/2),c=f(x+h*b[0]/2,v+h*b[1]/2),e=f(x+h*c[0],v+h*c[1]);
  x+=h*(a[0]+2*b[0]+2*c[0]+e[0])/6;v+=h*(a[1]+2*b[1]+2*c[1]+e[1])/6;
  if(i%1000===0)assert.ok(Math.abs(x-spring(i*h,100,d))<1e-7);
 }
}
const keys=[[0,0],[.2,100],[.3,-20],[.7,80]];
for(const t of [.2,.3,.7])assert.ok(Math.abs(track(t+1e-7,keys)-track(t-1e-7,keys))<.001);
const a=rng(7),b=rng(7);for(let i=0;i<100;i++)assert.equal(a(),b());
assert.throws(()=>track(1,[[1,2],[0,3]]));assert.throws(()=>spring(1,-1));
console.log('spring ODE parity, track continuity, seeded noise: PASS');
