"""Stamp every static/ link in the page with a hash of that file: static/app.js -> static/app.js?v=1a2b3c4d.

GitHub Pages lets browsers keep each file for 10 minutes. Without stamps, a reload right after an update can load the
new page with old cached scripts (or the reverse) and break it. With them, a new page always asks for its own versions
of the scripts and styles, and a file's stamp changes only when its contents do.

Run it after editing anything in static/, before committing:
    py tools/stamp.py            rewrite the stamps
    py tools/stamp.py --check    only report stale stamps (exit code 1 if any)
"""
import hashlib
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGES = ['belt-chain-calculator.html']
LINK = re.compile(r'''((?:src|href)=")(static/[\w.-]+?\.(?:js|css))(\?v=[0-9a-f]*)?(")''')


def stamp(path):
    # line endings don't count, so a CRLF checkout (core.autocrlf) gets the same stamps as the repository
    data = (ROOT / path).read_bytes().replace(b'\r\n', b'\n')
    return '?v=' + hashlib.sha1(data).hexdigest()[:8]


def main():
    check = '--check' in sys.argv[1:]
    stale = 0
    for name in PAGES:
        page = ROOT / name
        html = page.read_bytes().decode('utf-8')                   # bytes: the page keeps its own line endings
        links = list(LINK.finditer(html))
        old = [m for m in links if (m[3] or '') != stamp(m[2])]
        stale += len(old)
        if not old:
            print(f'{name}: {len(links)} links, all stamps current')
        elif check:
            print(f'{name}: {len(old)} stale stamp(s): ' + ', '.join(m[2] for m in old))
        else:
            page.write_bytes(LINK.sub(lambda m: m[1] + m[2] + stamp(m[2]) + m[4], html).encode('utf-8'))
            print(f'{name}: {len(links)} links, {len(old)} stamp(s) updated: ' + ', '.join(m[2] for m in old))
    return 1 if check and stale else 0


if __name__ == '__main__':
    sys.exit(main())
