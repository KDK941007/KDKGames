# KDKGames

スマホ向けミニゲーム集とポータルサイトです。

## ディレクトリ構成

```text
/
├─ index.html                  # ポータル入口
├─ portal/
│  ├─ css/portal.css
│  ├─ js/portal.js
│  ├─ js/player-summary.js
│  ├─ games.json               # game.json から自動生成（Web / Service Worker用）
│  └─ games.js                 # game.json から自動生成（file:// ローカル起動用）
├─ shared/
│  ├─ js/player-store.js       # 共通プレイヤープロフィール／戦績保存
│  └─ js/portal-navigation.js  # 各ゲーム・PLAYER PROFILEからポータルへ戻る共通処理
├─ games/
│  ├─ casino/
│  ├─ board/
│  ├─ action/
│  └─ other/
├─ player/                     # PLAYER PROFILE
├─ tools/
│  ├─ build_game_manifest.py
│  └─ validate_structure.py
└─ sw.js
```

各プレイ可能ゲームは原則として次の構成にします。

```text
games/{category}/{game-id}/
├─ index.html
├─ game.json
├─ icon.svg
├─ css/
│  └─ style.css
├─ js/
│  └─ game.js
└─ assets/                     # 必要な場合のみ
```

ゲーム規模が大きく、責務が明確に分かれる場合は `js/` や `css/` をさらに分割して構いません。ファイル数を増やすこと自体は目的にせず、ゲーム進行・ルール・UIなど意味のある責務単位で分割します。

## ゲーム追加ルール

ゲームを追加するときは、ポータルの `index.html` や `sw.js` にゲームを個別追記しません。

1. `games/{category}/{game-id}/` を作成する。
2. `index.html` / CSS / JavaScript / 必要なアセットを配置する。
3. `game.json` を追加する。
4. Gitへ反映する。

`game.json` の例:

```json
{
  "schemaVersion": 1,
  "id": "sample-game",
  "name": "SAMPLE GAME",
  "category": "action",
  "categoryLabel": "ACTION",
  "description": "ゲーム説明。",
  "searchTerms": ["sample", "サンプル"],
  "icon": "./icon.svg",
  "entry": "./index.html",
  "available": true
}
```

`available: true` のゲームは、ポータル上で最終的に次の契約を満たすリンクとして生成されます。

```html
<a class="gameTile available" href="./games/{category}/{game-id}/">
```

未実装ゲームは `available: false` とし、`available` クラスを付けません。

## ポータル自動生成

`.github/workflows/portal-manifest.yml` が `games/**` の変更を検知し、`tools/build_game_manifest.py` を実行します。

各ゲームの `game.json` と実ファイルを走査して、次の2ファイルを同時生成します。

- `portal/games.json`：GitHub Pages / Service Worker用
- `portal/games.js`：PC・スマホで `index.html` を直接開く `file://` 動作確認用

ポータルはこれらから以下を自動生成します。

- ゲーム一覧
- カテゴリ
- アイコン
- 説明
- 検索用キーワード
- PLAYABLE / SOON
- ゲームフォルダへのリンク
- オフラインキャッシュ対象ファイル

カテゴリの基本表示順は `CASINO → ボードゲーム → ACTION → RPG → OTHER` とします。現在ゲームが存在しないカテゴリはポータルに表示されません。

## ローカル動作確認

PCやスマホでルートの `index.html` を直接開く `file://` 起動にも対応します。

- ゲーム一覧は `portal/games.js` を使用するため、ローカルJSONへの `fetch()` は行いません。
- ゲームタイルのHTMLは規約どおりゲームフォルダへの相対パスを保持し、`file://` 起動時だけ `index.html` へ補正して遷移します。
- 各ゲームと `player/` からポータルへ戻る際は `shared/js/portal-navigation.js` でルート `index.html` へ直接戻ります。

## Service Worker

`sw.js` へゲームパスを個別追加しません。

ポータルが `available: true` のゲームだけをService Workerへ通知し、Service Workerは通知されたゲームフォルダと、そのゲーム配下のHTML / CSS / JavaScript / 画像などをキャッシュします。

このため、新しいゲームを追加するときに `sw.js` の修正は不要です。

## 共通化方針

複数ゲームで同じ仕様・同じ責務を持つ処理だけを `shared/` へ配置します。

現在は次を共通化しています。

- PLAYER PROFILEの保存キー／スキーマ
- 登録ユーザー名の取得
- ゲーム別プレイ回数・戦績レコードの保存
- ポータル側のPLAYERサマリー表示で使用する保存処理
- 各ゲーム・PLAYER PROFILEからポータルへ戻る処理

ゲーム固有のルール、レイアウト、フォント、演出は無理に共通化しません。

## 構造チェック

`.github/workflows/validate-structure.yml` で次を自動チェックします。

- `game.json` のカテゴリとフォルダ配置の一致
- `id` とゲームフォルダ名の一致
- プレイ可能ゲームの `index.html` 存在確認
- ゲームHTMLにインラインCSS / JavaScriptが残っていないこと
- HTMLから参照するCSS / JavaScriptの存在確認
- `portal/games.json` と `portal/games.js` の一致
- `game.json` と自動生成マニフェストの整合
- ローカル起動用 `localEntry` の整合
- ポータル戻り先の整合
- `sw.js` にゲームパスがハードコードされていないこと
- JavaScript構文エラー

## PLAYER PROFILE

`player/` はゲームではないため `games/` 配下には配置しません。ポータル共通機能としてルート配下で管理します。
