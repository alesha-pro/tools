#!/bin/bash
# Render the full video in chunks with P parallel headless Chromes, then concat and add the audio (+ a phone copy).
# Works locally (macOS, Metal) and on a Linux GPU box (Chrome + ANGLE/Vulkan beside other GPU jobs, ~300 MB VRAM).
#
# usage: render-chunks.sh <project-dir> <name>
# env:   FPS=60 SAMPLES=4 CRF=16 PRESET=slow TUNE=grain   final quality (defaults)
#        FPS=30 SAMPLES=1 CRF=22 PRESET=medium TUNE=none  quick draft
#        CALMV=0.65     lighter variant           P=2        parallel Chromes (keep 1-2 on one GPU)
#        CARD=3.2       end-card seconds after the song (0 if none)
#        RENDER_ANGLE=vulkan CHROME_PATH=...                 Linux GPU; RENDER_CPU=1 = SwiftShader (very slow)
set -u
PROJ=$(cd "${1:?usage: render-chunks.sh <project-dir> <name>}" && pwd); NAME=${2:?name}
APP=$PROJ/engine/app; OUT=$PROJ/renders/chunks-$NAME; R=$PROJ/renders
FPS=${FPS:-60}; SAMPLES=${SAMPLES:-4}; CRF=${CRF:-16}; PRESET=${PRESET:-slow}; TUNE=${TUNE:-grain}; P=${P:-2}; CARD=${CARD:-3.2}
AUDIO=$(ls "$PROJ"/engine/audio/*.{wav,mp3,m4a} 2>/dev/null | head -1)
SONG=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$AUDIO")
DUR=${DUR:-$(python3 -c "print(round($SONG + $CARD, 3))")}
TOTAL=$(python3 -c "print(round($DUR*$FPS))")
PORT=${PORT:-$((5600 + RANDOM % 300))}
export PDOOM_NO_HMR=1                                   # a file saved mid-render must not reload the pages
rm -rf "$OUT"; mkdir -p "$OUT"; cd "$APP"
bunx vite --port $PORT --strictPort > "$OUT/vite.log" 2>&1 &
VITE=$!
trap 'kill $VITE 2>/dev/null' EXIT
until curl -sf http://localhost:$PORT >/dev/null; do sleep 0.5; done
echo "render $NAME: $DUR s, $TOTAL frames @ $FPS fps, samples $SAMPLES, calm ${CALMV:-1}, $P workers"
per=$(( (TOTAL + P - 1) / P ))
export FPS SAMPLES CRF PRESET TUNE DUR OUT PORT CALMV
for i in $(seq 0 $((P-1))); do a=$((i*per)); b=$(( (i+1)*per )); [ $b -gt $TOTAL ] && b=$TOTAL; echo "$i $a $b"; done |
xargs -P $P -L 1 bash -c '
  i=$(printf %02d $0)
  f=$(python3 -c "print($1/$FPS)"); t=$(python3 -c "print(min($2/$FPS, $DUR))")    # never past the timeline end
  for try in 1 2; do
    bun scripts/render.ts video --from $f --to $t --fps $FPS --samples $SAMPLES --crf $CRF --preset $PRESET --tune $TUNE \
      --noaudio ${CALMV:+--calm $CALMV} --url http://localhost:$PORT --out $OUT/c$i.mp4 > $OUT/c$i.log 2>&1 \
      && { touch $OUT/c$i.done; echo "chunk $i ok"; exit 0; }
    echo "chunk $i failed (try $try), see $OUT/c$i.log"
  done'
n=$(ls "$OUT"/*.done 2>/dev/null | wc -l | tr -d " ")
[ "$n" -eq "$P" ] || { echo "only $n/$P chunks done"; exit 1; }
ls "$OUT"/c*.mp4 | sort | sed "s/^/file '/;s/$/'/" > "$OUT/list.txt"
ffmpeg -y -loglevel error -f concat -safe 0 -i "$OUT/list.txt" -i "$AUDIO" -map 0:v -map 1:a -c:v copy \
  -af apad -c:a aac -b:a 256k -shortest -movflags +faststart "$R/$NAME.mp4" || exit 1
bash "$(dirname "$0")/phone-copy.sh" "$R/$NAME.mp4" "$R/$NAME-phone.mp4"
echo "done: $R/$NAME.mp4 ($(du -h "$R/$NAME.mp4" | cut -f1)), $R/$NAME-phone.mp4"
