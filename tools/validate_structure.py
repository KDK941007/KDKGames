from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GAMES_ROOT = ROOT / "games"


def fail(message: str) -> None:
    raise SystemExit(f"ERROR: {message}")


def validate_game(game_json_path: Path) -> None:
    data = json.loads(game_json_path.read_text(encoding="utf-8"))
    game_dir = game_json_path.parent
    expected_category = game_dir.parent.name
    expected_id = game_dir.name

    if data.get("category") != expected_category:
        fail(f"{game_json_path}: category must match folder ({expected_category})")
    if data.get("id") != expected_id:
        fail(f"{game_json_path}: id must match folder ({expected_id})")
    if not isinstance(data.get("available"), bool):
        fail(f"{game_json_path}: available must be boolean")
    if not data.get("name") or not data.get("description"):
        fail(f"{game_json_path}: name/description are required")

    icon = game_dir / str(data.get("icon", "./icon.svg")).removeprefix("./")
    if not icon.is_file():
        fail(f"{game_json_path}: icon does not exist: {icon}")

    if not data["available"]:
        return

    index_path = game_dir / "index.html"
    if not index_path.is_file():
        fail(f"{game_json_path}: available game requires index.html")

    html = index_path.read_text(encoding="utf-8")
    if re.search(r"<style\b", html, re.I):
        fail(f"{index_path}: inline <style> remains")

    for match in re.finditer(r"<script\b([^>]*)>(.*?)</script\s*>", html, re.I | re.S):
        attrs = match.group(1) or ""
        if re.search(r"\bsrc\s*=", attrs, re.I):
            continue
        type_match = re.search(r"\btype\s*=\s*([\"'])(.*?)\1", attrs, re.I | re.S)
        script_type = type_match.group(2).strip().lower() if type_match else ""
        if script_type in {"", "text/javascript", "application/javascript", "module"}:
            fail(f"{index_path}: inline JavaScript remains")

    hrefs = re.findall(r"<(?:script|link)\b[^>]*(?:src|href)\s*=\s*([\"'])(.*?)\1", html, re.I | re.S)
    for _, value in hrefs:
        if not value.startswith("./"):
            continue
        target = game_dir / value.removeprefix("./")
        if not target.is_file():
            fail(f"{index_path}: referenced file does not exist: {value}")


def validate_manifest() -> None:
    manifest_path = ROOT / "portal" / "games.json"
    if not manifest_path.is_file():
        fail("portal/games.json is missing")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    metadata_files = sorted(GAMES_ROOT.glob("*/*/game.json"))
    if len(manifest) != len(metadata_files):
        fail("portal/games.json count does not match game.json count")

    by_id = {item.get("id"): item for item in manifest}
    for path in metadata_files:
        data = json.loads(path.read_text(encoding="utf-8"))
        item = by_id.get(data["id"])
        if not item:
            fail(f"manifest missing {data['id']}")
        expected_path = "./" + path.parent.relative_to(ROOT).as_posix() + "/"
        if item.get("path") != expected_path:
            fail(f"manifest path mismatch for {data['id']}")
        if data["available"] and expected_path not in (ROOT / "portal" / "js" / "portal.js").read_text(encoding="utf-8"):
            # Dynamic paths intentionally live in the manifest rather than hard-coded portal JS.
            pass


def validate_portal_contract() -> None:
    portal_js = (ROOT / "portal" / "js" / "portal.js").read_text(encoding="utf-8")
    if 'class="gameTile available"' not in portal_js:
        fail("portal.js must render playable games with class=\"gameTile available\"")
    if "game.path" not in portal_js:
        fail("portal.js must use manifest folder paths")

    sw = (ROOT / "sw.js").read_text(encoding="utf-8")
    for game_json_path in GAMES_ROOT.glob("*/*/game.json"):
        game_id = json.loads(game_json_path.read_text(encoding="utf-8"))["id"]
        if f"games/{game_json_path.parent.parent.name}/{game_id}" in sw:
            fail(f"sw.js contains hard-coded game path: {game_id}")

    for old in ("blackjack", "baccarat", "flash-rush", "laser-escape", "marubatsu", "rpg"):
        if (ROOT / old).exists():
            fail(f"legacy root game folder remains: {old}")


def main() -> None:
    metadata_files = sorted(GAMES_ROOT.glob("*/*/game.json"))
    if not metadata_files:
        fail("no game.json files found")
    for path in metadata_files:
        validate_game(path)
    validate_manifest()
    validate_portal_contract()
    print(f"OK: validated {len(metadata_files)} game definitions")


if __name__ == "__main__":
    main()
