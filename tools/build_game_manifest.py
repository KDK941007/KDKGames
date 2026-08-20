from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GAMES_ROOT = ROOT / "games"
OUTPUT = ROOT / "portal" / "games.json"


def main() -> None:
    games = []
    for game_json_path in sorted(GAMES_ROOT.glob("*/*/game.json")):
        data = json.loads(game_json_path.read_text(encoding="utf-8"))
        game_dir = game_json_path.parent
        rel_dir = game_dir.relative_to(ROOT).as_posix()

        assets = []
        for path in sorted(game_dir.rglob("*")):
            if path.is_file() and path.name != "game.json":
                assets.append("./" + path.relative_to(ROOT).as_posix())

        data["path"] = f"./{rel_dir}/"
        icon = str(data.get("icon", "./icon.svg"))
        data["icon"] = f"./{rel_dir}/{icon.removeprefix('./')}"
        data["assets"] = assets
        games.append(data)

    games.sort(key=lambda game: (str(game.get("name", "")).casefold(), str(game.get("id", ""))))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(games, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"generated {OUTPUT.relative_to(ROOT)} ({len(games)} games)")


if __name__ == "__main__":
    main()
