#!/bin/bash
# Download the display fonts the world kit uses (OFL / Apache, from github.com/google/fonts) into <dir>.
# usage: fetch-fonts.sh app/public/fonts/kit
set -euo pipefail
DIR=${1:?usage: fetch-fonts.sh <dir>}
mkdir -p "$DIR"
G=https://raw.githubusercontent.com/google/fonts/main
get() { curl -fsSL "$G/$1" -o "$DIR/$2"; echo "  $2"; }
get ofl/bangers/Bangers-Regular.ttf Bangers-Regular.ttf
get "ofl/caveat/Caveat%5Bwght%5D.ttf" Caveat.ttf
get ofl/comicneue/ComicNeue-Bold.ttf ComicNeue-Bold.ttf
get ofl/gochihand/GochiHand-Regular.ttf GochiHand-Regular.ttf
get "ofl/inter/Inter%5Bopsz,wght%5D.ttf" Inter.ttf
get apache/luckiestguy/LuckiestGuy-Regular.ttf LuckiestGuy-Regular.ttf
get apache/permanentmarker/PermanentMarker-Regular.ttf PermanentMarker-Regular.ttf
get ofl/rubikbubbles/RubikBubbles-Regular.ttf RubikBubbles-Regular.ttf
