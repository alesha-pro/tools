#!/usr/bin/env python3
"""Copy the runnable studio into a new or empty project directory."""
import argparse, shutil
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('destination',type=Path)
a=p.parse_args(); dst=a.destination.expanduser().resolve()
if dst.exists() and any(dst.iterdir()): p.error(f'Refusing to overwrite nonempty directory: {dst}')
src=Path(__file__).resolve().parents[1]/'assets'/'studio'
shutil.copytree(src,dst,dirs_exist_ok=True)
for name in ('docs','refs','assets','out'): (dst/name).mkdir(exist_ok=True)
print(f'Created {dst}\nNext: cd into it; npm install; npx playwright install chromium')
