# Codex Usage for Mac

macOS Terminal で Codex の **5時間枠 / 週次枠** を一目で確認するためのCLIです。

Windows版 `Codex_Usage_CLI` の取得・計算・情報設計をベースに、Mac専用として作り直しています。外部npm packageは使わず、Node.js標準機能だけで動きます。

## Features

- 週次 / 5時間枠の残量・実使用・リセット時刻
- 時間経過ベースの使用目安と実使用の差
- `●` 現在/時間ペース、`▲` 実使用、`░` 夜間帯を同じレールで表示
- 使わなければいつ使用目安へ戻るかを推定
- `live` / `--watch` の対話型TUI
- `/` コマンドパレット + **Tab補完**
- Terminal resizeを検知して安全に全面再描画
- `Ctrl+L` / `/redraw` による表示リセット
- `--mascot` の animated **Quota Buddy**
- `history` のローカル履歴 / ヒートマップ
- `--json` の自動化向け出力
- `doctor` の環境・Codex runtime・アカウント診断
- `update` の自己更新
- 日本語 / 英語UI

## Requirements

- **macOS**（Apple Silicon / Intel）
- **Node.js 22以上**（Node.js 24 LTS 推奨）
- Codexを利用できるChatGPTアカウント
- 次のいずれかのCodex runtime
  - ChatGPTデスクトップアプリ内のCodex
  - standalone Codex CLI

**standalone Codex CLIは必須ではありません。**

`codex-usage` は次の順でCodex runtimeを探します。

1. `CODEX_CLI` 環境変数
2. `PATH` 上の `codex`
3. ChatGPTデスクトップアプリ内蔵runtime
4. 旧Codex Desktopアプリ内蔵runtime

既知のmacOS bundle pathも自動検出します。

```text
/Applications/ChatGPT.app/Contents/Resources/codex
~/Applications/ChatGPT.app/Contents/Resources/codex
/Applications/Codex.app/Contents/Resources/codex        # legacy
~/Applications/Codex.app/Contents/Resources/codex       # legacy
```

このツール自身はAPIキーを読みません。検出した `codex app-server --stdio` を起動し、`account/rateLimits/read` から使用量を取得します。

## Install

### One command

```bash
curl -fsSL https://raw.githubusercontent.com/Naoshi-Git/codex-usage-mac/main/bootstrap.sh | bash
```

### Git clone

```bash
git clone https://github.com/Naoshi-Git/codex-usage-mac.git
cd codex-usage-mac
bash install.sh
```

配置先:

```text
~/.local/share/codex-usage-mac
~/.local/bin/codex-usage
```

`~/.local/bin` が `PATH` にない場合、installerが `~/.zshrc` に追加すべき設定を表示します。

## Node.js がない / 古い場合

```bash
brew install node
```

既に古いNode.jsがある場合:

```bash
brew upgrade node
```

Node.js 22以上が必要です。

## Codex runtime が見つからない場合

まず:

```bash
codex-usage doctor
```

ChatGPT Desktop内蔵runtimeが検出されればstandalone CLIは不要です。

standalone Codex CLIを使う場合:

```bash
curl -fsSL https://chatgpt.com/codex/install.sh | sh
```

または:

```bash
brew install --cask codex
```

## Usage

```bash
# 現在値を1回表示
codex-usage

# 対話型TUI（推奨）
codex-usage live --mascot

# 従来の指定方法も同じinteractive live viewになる
codex-usage --watch 60 --mascot

# 英語UI
codex-usage live --mascot --en

# 履歴
codex-usage history
codex-usage history --30d

# JSON
codex-usage --json

# 診断 / 更新
codex-usage doctor
codex-usage update
```

### Commands / options

| コマンド / オプション | 内容 |
|---|---|
| `status` | 現在値を1回表示。省略時の既定動作 |
| `live` | 対話型TUI。既定60秒周期 |
| `history` | ローカル履歴 / ヒートマップ |
| `doctor` | macOS / Node / Codex runtime / rate-limit接続を診断 |
| `update` | 最新GitHub Releaseへ更新。Release未作成時はmainへfallback |
| `--watch [sec]` | interactive live view。既定60秒、最小10秒 |
| `--mascot` | animated Quota Buddyを表示 |
| `--days N` | 履歴範囲 1〜30日 |
| `--30d` | `history --days 30` |
| `--night HH:MM-HH:MM` | 週次レールの夜間帯。既定 `00:00-06:00` |
| `--width N` | レール幅 28〜72。既定56 |
| `--json` | 構造化JSON |
| `--plain` / `--no-color` | ANSI装飾を無効化 |
| `--en` / `--ja` | 英語 / 日本語 |
| `--lang en\|ja` | 言語指定 |
| `--version` / `-v` | バージョン表示 |
| `--self-test` | 通信なしのself-test |

## Interactive live TUI

```bash
codex-usage live --mascot
```

起動後に `/` を押すと、Codex CLI風のコマンドパレットが開きます。

```text
/watch <sec|off>       確認周期を変更
/mascot [on|off]       マスコット切替
/lang <en|ja>          表示言語を変更
/refresh               今すぐ再取得
/redraw                表示を完全に再描画
/width <28-72>         タイムライン幅を変更
/night <00:00-06:00>   夜間帯を変更
/help                  コマンド一覧
/quit                  終了
```

### Tab completion

コマンド名・一部の固定引数は途中まで入力して `Tab` で補完できます。

```text
/mas<Tab>       → /mascot 
/lan<Tab>       → /lang 
/lang e<Tab>    → /lang en
/mascot of<Tab> → /mascot off
/ref<Tab>       → /refresh
```

候補が複数ある場合は共通prefixまで補完します。

### Redraw / resize

- Terminalサイズ変更を検知すると画面を全面再構築します。
- 横幅に合わせてレール幅も自動的に縮めます。
- 68列未満では壊れたカードを無理に描画せず、幅不足メッセージへ切り替えます。
- `Ctrl+L` または `/redraw` でいつでもhard redrawできます。
- `/mascot`、`/lang`、`/width`、`/night` の変更後は自動的にhard redrawします。

下部status:

```text
● RUNNING   next check 59s · / commands · Tab complete · Ctrl+L redraw · Ctrl+C exit
✦ UPDATED   quota / reset値が実際に変化した直後だけ数秒表示
Ⅱ PAUSED    /watch off のとき
```

## Quota Buddy

```bash
codex-usage --mascot
codex-usage live --mascot
```

Quota Buddyは単純な残量だけではなく、次の3軸から最も厳しい状態を採用します。

1. **週次の使用目安との差**
2. **5時間枠の使用目安との差**
3. **週次 / 5時間枠のうち低い方の残量**

5時間枠は短時間のバースト利用が普通なので、週次より判定閾値を緩くしています。

| 状態 | 週次先行 | 5h先行 | 最低残量 |
|---|---:|---:|---:|
| cruising | `<4pt` | `<12pt` | `>50%` |
| active | `≥4pt` | `≥12pt` | `≤50%` |
| ease up | `≥10pt` | `≥24pt` | `≤25%` |
| cool down | `≥18pt` | `≥40pt` | `≤10%` |

マスコット横には実際の判定根拠も表示します。

```text
pace W 3.2pt room · 5h 18.4pt room · floor 73% left
basis: pace + remaining quota
```

対応TerminalではANSI true colorとUnicode half-blockを使います。`--plain` やredirect時はテキスト顔にfallbackします。

アニメーションはローカル描画だけです。Codexへの問い合わせ頻度は `--watch` の指定値から増えません。

## 週次レールの読み方

```text
● 7日間のうち現在どこまで時間が経過したか
▲ 週次quotaを何%使ったか
━ すでに消費した領域
░ 設定した夜間帯
```

時間の進み方とquota消費を同じ0–100%軸へ置き、均等ペースより速いか遅いかを視覚化します。

## History

成功した通常実行・live更新時にJSONLサンプルをローカル保存します。

```text
~/Library/Application Support/codex-usage/history.jsonl
```

履歴は外部へ送信しません。3時間を超える観測空白は補間せず、週次リセットをまたいだ差分も消費量へ加算しません。

## Doctor

```bash
codex-usage doctor
```

確認項目:

1. macOS
2. Node.js 22+
3. Codex runtimeの検出元と実ファイルpath
4. `app-server` / rate-limit endpoint
5. ChatGPTアカウント接続
6. 履歴保存先

ChatGPT Desktop内蔵runtimeを利用している場合、`Codex runtime` 行に `ChatGPT Desktop` と表示されます。

## `CODEX_CLI` override

自動検出で見つからない場合:

```bash
CODEX_CLI="/Applications/ChatGPT.app/Contents/Resources/codex" codex-usage doctor
```

恒久設定する場合は `~/.zshrc` などに設定できます。

## Updating

```bash
codex-usage update
```

GitHub Releaseが存在する場合は最新Releaseを優先し、Releaseがない場合のみmainへfallbackします。

v1.0.0から初めて更新する場合のみ、一度bootstrapを再実行してください。

```bash
curl -fsSL https://raw.githubusercontent.com/Naoshi-Git/codex-usage-mac/main/bootstrap.sh | bash
```

## Development / CI

外部npm packageはないため `npm install` は不要です。

```bash
node ./bin/codex-usage.mjs --self-test
node ./bin/codex-usage.mjs --help
node ./bin/codex-usage.mjs --version
node ./bin/codex-usage.mjs live --mascot --en
```

GitHub ActionsではmacOS runnerでNode.js 22 / 24を検証します。

## Uninstall

```bash
bash uninstall.sh
```

履歴は意図的に残します。履歴も削除する場合:

```bash
rm -rf "$HOME/Library/Application Support/codex-usage"
```

## Notes

- **Mac専用**です。
- ChatGPT/Codex Desktopのbundle内部pathは公開APIではないため、将来変わる可能性があります。`doctor` と `CODEX_CLI` overrideをfallbackとして用意しています。
- Codexの `app-server` / rate-limitレスポンスも将来変更される可能性があります。
- 現行 `rateLimitsByLimitId.codex` と旧 `rateLimits` の両形状に対応しています。

## License

MIT
