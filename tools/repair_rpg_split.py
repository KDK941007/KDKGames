from __future__ import annotations

import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'games' / 'rpg' / 'rpg'


def git_show(spec: str) -> str:
    return subprocess.check_output(['git', 'show', spec], cwd=ROOT, text=True, encoding='utf-8')


def main() -> None:
    source = git_show('origin/main:rpg/index.html')

    style_match = re.search(r'<style\b[^>]*>(.*?)</style\s*>', source, re.I | re.S)
    if not style_match:
        raise SystemExit('RPG source style block not found')

    script_matches = list(re.finditer(r'<script\b([^>]*)>(.*?)</script\s*>', source, re.I | re.S))
    inline_scripts = []
    for match in script_matches:
        attrs = match.group(1) or ''
        if re.search(r'\bsrc\s*=', attrs, re.I):
            continue
        inline_scripts.append(match.group(2))
    if not inline_scripts:
        raise SystemExit('RPG source inline script not found')

    css = style_match.group(1).strip() + '\n'
    js = '\n\n'.join(part.strip() for part in inline_scripts if part.strip()) + '\n'
    if len(js.encode('utf-8')) < 100_000:
        raise SystemExit(f'RPG extracted JavaScript is unexpectedly small: {len(js.encode("utf-8"))} bytes')

    html = source
    html = re.sub(r'<style\b[^>]*>.*?</style\s*>', '<link rel="stylesheet" href="./css/style.css">', html, count=1, flags=re.I | re.S)
    for match in reversed(script_matches):
        attrs = match.group(1) or ''
        if re.search(r'\bsrc\s*=', attrs, re.I):
            continue
        html = html[:match.start()] + '<script src="./js/game.js"></script>' + html[match.end():]
    html = html.replace('</body>', '<script src="../../../shared/js/player-store.js"></script>\n<script src="../../../shared/js/portal-navigation.js" data-portal-root="../../../index.html"></script>\n</body>', 1)

    (TARGET / 'css').mkdir(parents=True, exist_ok=True)
    (TARGET / 'js').mkdir(parents=True, exist_ok=True)
    (TARGET / 'css' / 'style.css').write_text(css, encoding='utf-8')
    (TARGET / 'js' / 'game.js').write_text(js, encoding='utf-8')
    (TARGET / 'index.html').write_text(html, encoding='utf-8')

    print('RPG restored from origin/main:rpg/index.html')
    print(f'CSS bytes: {len(css.encode("utf-8"))}')
    print(f'JS bytes: {len(js.encode("utf-8"))}')
    print(f'HTML bytes: {len(html.encode("utf-8"))}')


if __name__ == '__main__':
    main()
