#!/usr/bin/env python3
"""Mix/normalize audio and create verified, paginated review artifacts."""
import argparse,json,math,re,subprocess,tempfile
from pathlib import Path

def run(args):
 result=subprocess.run(args,capture_output=True,text=True)
 if result.returncode:raise RuntimeError(f'Command failed ({result.returncode}): {args[0]}\n{result.stderr[-6000:]}')
 return result
def ff(args):return run(['ffmpeg','-y','-v','error',*map(str,args)])
def probe(p):return json.loads(run(['ffprobe','-v','error','-count_frames','-show_streams','-show_format','-of','json',str(p)]).stdout)
def main():
 p=argparse.ArgumentParser(description=__doc__);sp=p.add_subparsers(dest='mode',required=True)
 m=sp.add_parser('mix');m.add_argument('--video',required=True);m.add_argument('--music');m.add_argument('--sfx');m.add_argument('--out',required=True);m.add_argument('--music-gain',type=float,default=.75);m.add_argument('--sfx-gain',type=float,default=.65)
 q=sp.add_parser('qa');q.add_argument('--video',required=True);q.add_argument('--out',required=True);q.add_argument('--expected-duration',type=float);q.add_argument('--expected-width',type=int);q.add_argument('--expected-height',type=int);q.add_argument('--expected-fps',type=float);q.add_argument('--require-audio',action='store_true');q.add_argument('--loop',action='store_true');q.add_argument('--action-time',type=float,default=0)
 a=p.parse_args();meta=probe(a.video);v=next(s for s in meta['streams'] if s['codec_type']=='video');dur=float(v.get('duration',meta['format']['duration']));fps=eval_ratio(v['avg_frame_rate'])
 if a.mode=='mix':
  tracks=[(path,gain) for path,gain in [(a.music,a.music_gain),(a.sfx,a.sfx_gain)] if path]
  if not tracks:p.error('At least one music or SFX track required')
  if any(not math.isfinite(gain) or gain<0 for _,gain in tracks):p.error('Gains must be finite and nonnegative')
  target=Path(a.out);target.parent.mkdir(parents=True,exist_ok=True)
  if target.resolve()==Path(a.video).resolve():p.error('Output must differ from input')
  with tempfile.TemporaryDirectory(prefix='motion-audio-') as td:
   mixed=Path(td)/'mixed.wav';inp=[];filters=[]
   for i,(path,gain) in enumerate(tracks):inp+=['-i',path];filters.append(f'[{i}:a]volume={gain},apad,atrim=duration={dur},asetpts=PTS-STARTPTS[a{i}]')
   filters.append(''.join(f'[a{i}]' for i in range(len(tracks)))+f'amix=inputs={len(tracks)}:normalize=0:duration=longest[out]')
   ff([*inp,'-filter_complex',';'.join(filters),'-map','[out]','-t',dur,'-ar','48000','-c:a','pcm_f32le',mixed])
   stats=run(['ffmpeg','-hide_banner','-i',str(mixed),'-af','loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json','-f','null','-']).stderr
   match=re.findall(r'\{[^{}]*"input_i"[^{}]*\}',stats,re.S)
   if not match:raise RuntimeError('No loudness measurement')
   data=json.loads(match[-1]);finite=all(math.isfinite(float(data[k])) for k in ['input_i','input_tp','input_lra','input_thresh','target_offset'])
   # Silence needs no normalization; preserve it honestly rather than passing infinities.
   norm=(f"loudnorm=I=-14:TP=-1.5:LRA=11:measured_I={data['input_i']}:measured_TP={data['input_tp']}:measured_LRA={data['input_lra']}:measured_thresh={data['input_thresh']}:offset={data['target_offset']}:linear=true" if finite else 'anull')
   ff(['-i',a.video,'-i',mixed,'-map','0:v:0','-map','1:a:0','-af',norm,'-t',dur,'-c:v','copy','-c:a','aac','-b:a','192k','-ar','48000','-movflags','+faststart',target])
   Path(str(target)+'.loudness.json').write_text(json.dumps({'input_measurement':data,'normalized':finite,'target_lufs':-14,'note':'Verify output loudness; silence cannot meet target.'},indent=2))
  return
 out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
 failures=[]
 for key,actual in [('width',v['width']),('height',v['height'])]:
  expected=getattr(a,'expected_'+key)
  if expected is not None and actual!=expected:failures.append(f'{key}: {actual} != {expected}')
 if a.expected_fps is not None and abs(fps-a.expected_fps)>.001:failures.append('fps mismatch')
 if a.expected_duration is not None:
  if abs(dur-a.expected_duration)>1/fps+.005:failures.append('duration mismatch')
  if int(v.get('nb_read_frames',-1))!=round(a.expected_duration*fps):failures.append('frame count mismatch')
 has_audio=any(s['codec_type']=='audio' for s in meta['streams'])
 if a.require_audio and not has_audio:failures.append('missing audio')
 ff(['-xerror','-i',a.video,'-f','null','-'])
 for tag,rate,width,cols,rows in [('contact',2,270,6,5),('phone',1,360,3,3)]:
  page_seconds=cols*rows/rate
  for i in range(math.ceil(dur/page_seconds)):
   start=i*page_seconds;length=min(page_seconds,dur-start)
   samples=max(1,math.ceil(length*rate));page_cols=min(cols,samples);page_rows=min(rows,math.ceil(samples/page_cols))
   ff(['-ss',start,'-i',a.video,'-t',length,'-vf',f'fps={rate},scale={width}:-1,tile={page_cols}x{page_rows}:padding=4:color=0x202020','-frames:v','1',out/f'{tag}-{i+1:03d}.png'])
 t=max(0,min(a.action_time,dur-1/fps))
 ff(['-ss',t,'-i',a.video,'-vf','scale=320:-1,tile=12x1:padding=2','-frames:v','1',out/'strip.png'])
 ff(['-ss',min(.5,dur/2),'-i',a.video,'-frames:v','1',out/'poster.png'])
 if a.loop:ff(['-stream_loop','1','-i',a.video,'-map','0','-c','copy',out/'loop-check.mp4'])
 loudness=None
 if has_audio:
  log=run(['ffmpeg','-hide_banner','-i',a.video,'-vn','-af','loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json','-f','null','-']).stderr
  vals=re.findall(r'\{[^{}]*"input_i"[^{}]*\}',log,re.S)
  if vals:loudness=json.loads(vals[-1])
 warnings=[]
 if loudness:
  measured_i=float(loudness['input_i']);measured_tp=float(loudness['input_tp'])
  if not math.isfinite(measured_i) or abs(measured_i+14)>1: warnings.append('Encoded loudness misses -14 LUFS by more than 1 LU; review mix dynamics')
  if measured_tp>-1: warnings.append('Encoded true peak exceeds -1 dBTP; reduce level and re-encode')
 report={'warnings':warnings,'video':str(Path(a.video).resolve()),'duration':dur,'fps':fps,'frames':v.get('nb_read_frames'),'width':v['width'],'height':v['height'],'audio':has_audio,'decode':'passed','loudness':loudness,'failures':failures,'visual_review':'pending; inspect generated images and playback','metadata':meta}
 (out/'verification.json').write_text(json.dumps(report,indent=2));print(json.dumps({k:report[k] for k in ['duration','fps','frames','width','height','audio','decode','failures']}))
 if failures:raise SystemExit(1)
def eval_ratio(x):
 a,b=x.split('/');return float(a)/float(b)
if __name__=='__main__':main()
