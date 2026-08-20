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

    refs = re.findall(r"<(?:script|link)\b[^>]*(?:src|href)\s*=\s*([\"'])(.*?)\1", html, re.I | re.S)
    for _, value in refs:
        if value.startswith(("http://", "https://", "data:", "blob:", "#")):
            continue
        target = (game_dir / value).resolve()
        try:
            target.relative_to(ROOT.resolve())
        except ValueError:
            fail(f"{index_path}: referenced file escapes repository: {value}")
        if not target.is_file():
            fail(f"{index_path}: referenced file does not exist: {value}")
        if target.suffix.lower() == ".js" and target.stat().st_size == 0:
            fail(f"{index_path}: referenced JavaScript is empty: {value}")


def load_games_js() -> list[dict]:
    games_js_path = ROOT / "portal" / "games.js"
    if not games_js_path.is_file():
        fail("portal/games.js is missing")
    text = games_js_path.read_text(encoding="utf-8").strip()
    match = re.fullmatch(r"globalThis\.MINI_GAME_PORTAL_GAMES\s*=\s*(\[.*\]);?", text, re.S)
    if not match:
        fail("portal/games.js format is invalid")
    try:
        return json.loads(match.group(1))
    except json.JSONDecodeError as exc:
        fail(f"portal/games.js contains invalid JSON: {exc}")


def validate_manifest() -> None:
    manifest_path = ROOT / "portal" / "games.json"
    if not manifest_path.is_file():
        fail("portal/games.json is missing")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    local_manifest = load_games_js()
    if manifest != local_manifest:
        fail("portal/games.json and portal/games.js are out of sync")

    metadata_files = sorted(GAMES_ROOT.glob("*/*/game.json"))
    if len(manifest) != len(metadata_files):
        fail("portal/games.json count does not match game.json count")

    by_id = {item.get("id"): item for item in manifest}
    if len(by_id) != len(manifest):
        fail("duplicate game id exists in manifest")

    for path in metadata_files:
        data = json.loads(path.read_text(encoding="utf-8"))
        item = by_id.get(data["id"])
        if not item:
            fail(f"manifest missing {data['id']}")
        expected_path = "./" + path.parent.relative_to(ROOT).as_posix() + "/"
        expected_entry = expected_path + "index.html"
        if item.get("path") != expected_path:
            fail(f"manifest path mismatch for {data['id']}")
        if item.get("localEntry") != expected_entry:
            fail(f"manifest localEntry mismatch for {data['id']}")
        for asset in item.get("assets", []):
            target = ROOT / asset.removeprefix("./")
            if not target.is_file():
                fail(f"manifest asset missing for {data['id']}: {asset}")


def validate_portal_contract() -> None:
    portal_js = (ROOT / "portal" / "js" / "portal.js").read_text(encoding="utf-8")
    if 'class="gameTile available"' not in portal_js:
        fail("portal.js must render playable games with class=\"gameTile available\"")
    if "game.path" not in portal_js:
        fail("portal.js must use manifest folder paths")
    if "location.protocol === 'file:'" not in portal_js:
        fail("portal.js must support file:// local launch")

    index_html = (ROOT / "index.html").read_text(encoding="utf-8")
    for required in (
        './portal/games.js',
        './portal/js/portal.js',
        './shared/js/player-store.js',
        './player/index.html',
    ):
        if required not in index_html:
            fail(f"index.html missing required local-compatible reference: {required}")

    sw = (ROOT / "sw.js").read_text(encoding="utf-8")
    for required in (
        "'./portal/games.js'",
        "'./shared/js/portal-navigation.js'",
    ):
        if required not in sw:
            fail(f"sw.js missing required core cache asset: {required}")

    for game_json_path in GAMES_ROOT.glob("*/*/game.json"):
        game_id = json.loads(game_json_path.read_text(encoding="utf-8"))["id"]
        if f"games/{game_json_path.parent.parent.name}/{game_id}" in sw:
            fail(f"sw.js contains hard-coded game path: {game_id}")

    for old in ("blackjack", "baccarat", "flash-rush", "laser-escape", "marubatsu", "rpg"):
        if (ROOT / old).exists():
            fail(f"legacy root game folder remains: {old}")


def validate_portal_navigation() -> None:
    shared_nav = ROOT / "shared" / "js" / "portal-navigation.js"
    if not shared_nav.is_file():
        fail("shared/js/portal-navigation.js is missing")

    for game_json_path in sorted(GAMES_ROOT.glob("*/*/game.json")):
        data = json.loads(game_json_path.read_text(encoding="utf-8"))
        if not data.get("available"):
            continue
        index_path = game_json_path.parent / "index.html"
        html = index_path.read_text(encoding="utf-8")
        if '../../../shared/js/portal-navigation.js' not in html:
            fail(f"{index_path}: shared portal navigation script is missing")
        if 'data-portal-root="../../../index.html"' not in html:
            fail(f"{index_path}: portal root must point to repository index.html")

    player_html = (ROOT / "player" / "index.html").read_text(encoding="utf-8")
    if '../shared/js/portal-navigation.js' not in player_html:
        fail("player/index.html: shared portal navigation script is missing")
    if 'data-portal-root="../index.html"' not in player_html:
        fail("player/index.html: portal root must point to repository index.html")


def main() -> None:
    metadata_files = sorted(GAMES_ROOT.glob("*/*/game.json"))
    if not metadata_files:
        fail("no game.json files found")
    for path in metadata_files:
        validate_game(path)
    validate_manifest()
    validate_portal_contract()
    validate_portal_navigation()
    print(f"OK: validated {len(metadata_files)} game definitions")


if __name__ == "__main__":
    main()
