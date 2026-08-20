from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

GAME_SCRIPT = '<script src="../../../shared/js/portal-navigation.js" data-portal-root="../../../index.html"></script>'
PLAYER_SCRIPT = '<script src="../shared/js/portal-navigation.js" data-portal-root="../index.html"></script>'


def inject(path: Path, script: str) -> bool:
    text = path.read_text(encoding='utf-8')
    if 'portal-navigation.js' in text:
        return False
    marker = '</body>'
    if marker not in text:
        raise SystemExit(f'missing </body>: {path}')
    text = text.replace(marker, script + '\n' + marker, 1)
    path.write_text(text, encoding='utf-8')
    print(f'updated {path.relative_to(ROOT)}')
    return True


def main():
    changed = False
    for game_json in sorted((ROOT / 'games').glob('*/*/game.json')):
        import json
        data = json.loads(game_json.read_text(encoding='utf-8'))
        if not data.get('available'):
            continue
        changed |= inject(game_json.parent / 'index.html', GAME_SCRIPT)

    changed |= inject(ROOT / 'player' / 'index.html', PLAYER_SCRIPT)
    if not changed:
        print('no changes')


if __name__ == '__main__':
    main()
