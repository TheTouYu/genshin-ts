#!/usr/bin/env python3
"""montage.py — 把一堆帧拼成带序号的联络表（用于**人眼分族**，不是标注）。"""
import argparse, glob, os, sys
from PIL import Image, ImageDraw, ImageFont

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('frames', nargs='+')
    ap.add_argument('--out', required=True)
    ap.add_argument('--cols', type=int, default=9)
    ap.add_argument('--thumb', default='284x160')
    ap.add_argument('--start', type=int, default=0)
    ap.add_argument('--end', type=int, default=10**9)
    a=ap.parse_args()
    tw,th=[int(v) for v in a.thumb.split('x')]
    files=[]
    for p in a.frames:
        files += sorted(glob.glob(os.path.join(p,'*.jpg'))) if os.path.isdir(p) else ([p] if os.path.exists(p) else [])
    files = files[a.start:a.end]
    if not files: print('no frames', file=sys.stderr); return 2
    rows=(len(files)+a.cols-1)//a.cols
    sheet=Image.new('RGB',(a.cols*tw, rows*th),(20,20,20))
    d=ImageDraw.Draw(sheet)
    try: f=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',22)
    except OSError: f=ImageFont.load_default()
    for i,p in enumerate(files):
        im=Image.open(p).convert('RGB').resize((tw-4,th-22), Image.LANCZOS)
        x=(i%a.cols)*tw; y=(i//a.cols)*th
        sheet.paste(im,(x+2,y+20))
        d.text((x+4,y), '%d %s' % (a.start+i, os.path.basename(p)[:12]), fill=(255,255,0), font=f)
    sheet.save(a.out)
    print('%s %dx%d frames=%d' % (a.out, sheet.width, sheet.height, len(files)))
    return 0

if __name__=='__main__':
    sys.exit(main())
