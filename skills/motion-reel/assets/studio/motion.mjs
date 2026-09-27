export const clamp = (x,a=0,b=1) => Math.min(b,Math.max(a,x));
export function spring(t,k=170,d=26,m=1) {
  if (![t,k,d,m].every(Number.isFinite) || k<=0 || d<0 || m<=0) throw Error('Invalid spring parameters');
  if(t<=0) return 0;
  const w=Math.sqrt(k/m), z=d/(2*Math.sqrt(k*m));
  if(Math.abs(z-1)<1e-7) return 1-Math.exp(-w*t)*(1+w*t);
  if(z<1){ const wd=w*Math.sqrt(1-z*z); return 1-Math.exp(-z*w*t)*(Math.cos(wd*t)+z*w/wd*Math.sin(wd*t)); }
  const r1=-w/(z+Math.sqrt(z*z-1)),r2=-w*(z+Math.sqrt(z*z-1));
  return 1+(r2*Math.exp(r1*t)-r1*Math.exp(r2*t))/(r1-r2);
}
export function track(t,keys,k=170,d=26){
  if(!keys.length || keys.some((v,i)=>v.length!==2 || !v.every(Number.isFinite) || (i && v[0]<keys[i-1][0]))) throw Error('Invalid track keys');
  let v=keys[0][1];
  for(let i=1;i<keys.length;i++) v+=(keys[i][1]-keys[i-1][1])*spring(t-keys[i][0],k,d);
  return v;
}
export const swapAlpha=(t,start,end)=>Math.min(clamp((t-start-.08)/.12),clamp((end-.1-t)/.1));
export function rng(seed){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
export const loopT=(t,dur)=>((t%dur)+dur)%dur;
