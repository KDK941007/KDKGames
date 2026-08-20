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

    script_matches = [
        match for match in re.finditer(r'<script\b([^>]*)>(.*?)</script\s*>', source, re.I | re.S)
        if not re.search(r'\bsrc\s*=', match.group(1) or '', re.I)
    ]
    if not script_matches:
        raise SystemExit('RPG source inline script not found')

    css = style_match.group(1).strip() + '\n'
    js_parts = [match.group(2).strip() for match in script_matches if match.group(2).strip()]
    js = '\n\n'.join(js_parts) + '\n'
    if len(js.encode('utf-8')) < 100_000:
        raise SystemExit(f'RPG extracted JavaScript is unexpectedly small: {len(js.encode("utf-8"))} bytes')

    html = re.sub(
        r'<style\b[^>]*>.*?</style\s*>',
        '<link rel="stylesheet" href="./css/style.css">',
        source,
        count=1,
        flags=re.I | re.S,
    )

    first = True
    for match in reversed(script_matches):
        replacement = '<script src="./js/game.js"></script>' if first else ''
        html = html[:match.start()] + replacement + html[match.end():]
        first = False

    # The reversed loop puts the game script at the earliest inline-script position.
    if '<script src="./js/game.js"></script>' not in html:
        raise SystemExit('RPG external game script was not inserted')

    nav = '<script src="../../../shared/js/portal-navigation.js" data-portal-root="../../../index.html"></script>'
    html = html.replace('</body>', nav + '\n</body>', 1)

    (TARGET / 'css').mkdir(parents=True, exist_ok=True)
    (TARGET / 'js').mkdir(parents=True, exist_ok=True)
    (TARGET / 'css' / 'style.css').write_text(css, encoding='utf-8')
    (TARGET / 'js' / 'game.js').write_text(js, encoding='utf-8')
    (TARGET / 'index.html').write_text(html, encoding='utf-8')

    source_asset = TARGET / 'assets' / 'game-source.html'
    if source_asset.exists():
        source_asset.unlink()

    print('RPG split restored from origin/main:rpg/index.html')
    print(f'CSS bytes: {len(css.encode("utf-8"))}')
    print(f'JS bytes: {len(js.encode("utf-8"))}')
    print(f'HTML bytes: {len(html.encode("utf-8"))}')


if __name__ == '__main__':
    main()
