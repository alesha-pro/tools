#!/usr/bin/env python3
"""Deterministic original score/SFX (stdlib); optional librosa analysis."""
import argparse,json,math,random,wave,array,sys
from pathlib import Path
SR=48000

def positive(x):
 x=float(x)
 if not math.isfinite(x) or x<=0: raise argparse.ArgumentTypeError('must be positive and finite')
 return x

def save(path,b):
 peak=max((abs(x) for x in b),default=0); gain=min(1,.92/peak) if peak else 1
 data=array.array('h',(round(max(-1,min(1,x*gain))*32767) for x in b))
 if sys.byteorder!='little':data.byteswap()
 Path(path).parent.mkdir(parents=True,exist_ok=True)
 with wave.open(str(path),'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(SR);w.writeframes(data.tobytes())

def tone(b,start,length,fn):
 base=round(start*SR)
 for i in range(min(round(length*SR),len(b)-base)):
  if base+i>=0:b[base+i]+=fn(i/SR)

def main():
 p=argparse.ArgumentParser(description=__doc__);sp=p.add_subparsers(dest='mode',required=True)
 sy=sp.add_parser('synth');sy.add_argument('--duration',type=positive,required=True);sy.add_argument('--bpm',type=positive,default=120);sy.add_argument('--out',required=True);sy.add_argument('--beats',default='beats.json')
 fx=sp.add_parser('sfx');fx.add_argument('--duration',type=positive,required=True);fx.add_argument('--cues',required=True);fx.add_argument('--out',required=True)
 an=sp.add_parser('analyze');an.add_argument('track');an.add_argument('--out',default='beats.json');an.add_argument('--first-downbeat',type=float)
 a=p.parse_args()
 if a.mode=='analyze':
  try:import numpy as np;import librosa
  except ImportError:p.error('Analyze needs numpy/librosa/soundfile in a project venv; synth and sfx need no packages')
  y,sr=librosa.load(a.track,sr=None,mono=True);tempo,frames=librosa.beat.beat_track(y=y,sr=sr)
  beats=librosa.frames_to_time(frames,sr=sr).tolist();hits=librosa.onset.onset_detect(y=y,sr=sr,units='time').tolist()
  first=a.first_downbeat
  if first is not None and (not math.isfinite(first) or first<0 or not beats):p.error('first downbeat must be finite, nonnegative; detected beats required')
  idx=min(range(len(beats)),key=lambda i:abs(beats[i]-first)) if first is not None else None
  result={'bpm':float(np.atleast_1d(tempo)[0]),'beats':beats,'hits':hits,'downbeats':beats[idx::4] if idx is not None else [],'downbeat_status':'user_anchor_assuming_4_4' if idx is not None else 'unknown','source':a.track}
  Path(a.out).parent.mkdir(parents=True,exist_ok=True);Path(a.out).write_text(json.dumps(result,indent=2));return
 b=array.array('f',[0])*round(a.duration*SR)
 if a.mode=='synth':
  beat=60/a.bpm; beats=[i*beat for i in range(math.ceil(a.duration/beat)) if i*beat<a.duration]
  randomizer=random.Random(17)
  roots=[130.8128,103.8262,155.5635,116.5409]
  for i,t in enumerate(beats):
   f=roots[(i//8)%4]*[1,1.25,1.5,2][i%4]
   tone(b,t,min(beat*.9,.8),lambda x,f=f:.18*math.sin(2*math.pi*f*x)*math.exp(-x*7)*min(1,x/.005))
   if i%2==0:tone(b,t,.22,lambda x:.32*math.sin(2*math.pi*(60*x+35*.025*(1-math.exp(-x/.025))))*math.exp(-x*22)*min(1,x/.003))
   tone(b,t,.035,lambda x:.07*randomizer.uniform(-1,1)*math.exp(-x*100)*min(1,x/.002))
  fade=min(.04,a.duration/4)
  for i in range(len(b)):b[i]*=min(1,i/(SR*fade),(len(b)-1-i)/(SR*fade))
  Path(a.beats).parent.mkdir(parents=True,exist_ok=True)
  Path(a.beats).write_text(json.dumps({'bpm':a.bpm,'beats':beats,'downbeats':beats[::4],'downbeat_status':'composed_4_4','hits':beats,'source':'original_synthesis'},indent=2))
 else:
  cues=json.loads(Path(a.cues).read_text())
  if not isinstance(cues,list):p.error('cues must be a JSON array')
  for j,c in enumerate(cues):
   if not isinstance(c,dict):p.error('cue must be an object')
   t=c.get('t');kind=c.get('type');gain=c.get('gain',1)
   if not isinstance(t,(int,float)) or not math.isfinite(t) or t<0 or t>=a.duration:p.error(f'cue {j}: time outside duration')
   if not isinstance(gain,(int,float)) or not math.isfinite(gain) or gain<0:p.error(f'cue {j}: invalid gain')
   r=random.Random(j+42)
   voices={'click':(.05,lambda x:.4*math.sin(2*math.pi*1800*x)*math.exp(-90*x)), 'pop':(.15,lambda x:.4*math.sin(2*math.pi*(600*x+450*x*x))*math.exp(-30*x)), 'thump':(.5,lambda x:.7*math.sin(2*math.pi*(90*x-30*x*x))*math.exp(-9*x)), 'whoosh':(.35,lambda x:.2*r.uniform(-1,1)*math.sin(math.pi*x/.35))}
   if kind not in voices:p.error(f'cue {j}: unknown type {kind}')
   length,fn=voices[kind];tone(b,t,length,lambda x:gain*fn(x)*min(1,x/.001))
 save(a.out,b)
if __name__=='__main__':main()
