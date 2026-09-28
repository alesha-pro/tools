#!/bin/bash
# Set up a new lyric-video project: the pdoom-video engine (MIT) + this skill's patch, kit, fonts and folders.
# usage: new-project.sh <project-dir>
# Afterwards: put the song in <project-dir>/engine/audio/, align it (references/engine.md), write timeline.ts.
set -euo pipefail
DIR=${1:?usage: new-project.sh <project-dir>}
SK=$(cd "$(dirname "$0")/.." && pwd)
UPSTREAM=https://github.com/mexicat/pdoom-video
BASE=bdbad53                                   # the upstream commit engine.patch is made against
mkdir -p "$DIR"; DIR=$(cd "$DIR" && pwd)
git clone -q "$UPSTREAM" "$DIR/engine"
cd "$DIR/engine"
git checkout -q "$BASE"
git apply "$SK/assets/engine.patch"
cp "$SK"/assets/lib/*.ts app/src/lib/ 2>/dev/null || { mkdir -p app/src/lib; cp "$SK"/assets/lib/*.ts app/src/lib/; }
cp "$SK/assets/scenes/credits.ts" "$SK/assets/scenes/synctest.ts" app/src/scenes/
bash "$SK/scripts/fetch-fonts.sh" app/public/fonts/kit
mkdir -p app/public/fonts/pop && cp "$SK"/assets/fonts/pop/*.ttf app/public/fonts/pop/   # Bricolage, Instrument Serif (OFL)
mkdir -p "$DIR"/{assets,styleframes,renders,references}
ln -sfn ../../../assets app/public/art          # art/<world>/<name>.png is served from <project>/assets
# an upstream bun.lock from a newer bun is rejected by older ones: fall back to a fresh resolve
(cd app && { bun install --silent 2>/dev/null || { rm -f bun.lock; bun install --silent; }; })
echo
echo "ready: $DIR"
echo "  engine/app        renderer (bunx vite for the preview)"
echo "  assets/<world>/   generated art, loaded with loadArt(['<world>/<name>'])"
echo "  styleframes/      style exploration frames"
echo "  renders/          output"
