#!/bin/bash
# 720p two-pass copy for phones and chat uploads, sized under ~30 MB for a 3-minute video.
# usage: phone-copy.sh <in.mp4> <out.mp4> [video kbps, default 1100]
set -euo pipefail
IN=$1; OUTF=$2; VB=${3:-1100}
LOG=$(mktemp -d)/pass
ffmpeg -y -loglevel error -i "$IN" -vf scale=1280:720:flags=lanczos -c:v libx264 -preset slow -b:v ${VB}k -pass 1 -passlogfile "$LOG" -an -f null /dev/null
ffmpeg -y -loglevel error -i "$IN" -vf scale=1280:720:flags=lanczos -c:v libx264 -preset slow -b:v ${VB}k -pass 2 -passlogfile "$LOG" -c:a aac -b:a 128k -movflags +faststart "$OUTF"
