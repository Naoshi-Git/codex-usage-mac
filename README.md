# Codex Usage

Codex の **5時間枠 / 週次枠** をターミナルで一目で確認するためのクロスプラットフォームCLIです。

同じ `codex-usage` コマンド、同じ表示・計算ロジックを **macOS / Windows** で共有します。旧Windows版 `Codex_Usage_CLI` の情報設計と、旧Mac版 `codex-usage-mac` のNode.js実装を単一コードベースへ統合しています。

## Features

- 週次 / 5時間枠の残量・実使用・リセット時刻
- 時間経過ベースの使用目安と実使用の差
- `●` 現在/時間ペース、`▲` 実使用、`░` 夜間帯を同じレールで表示
- 使わなければいつ使用目安へ戻るかを推定
- `live` / `--watch` の対話型TUI
- `/` コマンドパレット + Tab補完
- Terminal resizeを検知して安全に全面再描画
- `Ctrl+L` / `/redraw` による表示リセット
- `--mascot` の animated Quota Buddy
- `history` のローカル履歴 / ヒートマップ
- `--json` の自動化向け出力
- `doctor` のOS / Node / Codex runtime / アカウント診断
- `update` の自己更新
- 日本語 / 英語UI

## Supported platforms

| OS | Support | Installer |
|---|---|---|
| macOS Apple Silicon / Intel | ✅ | `bootstrap.sh` / `install.sh` |
| Windows 10 / 11 x64 | ✅ | `bootstrap.ps1` / `install.ps1` |
| Linux | 現時点では対象外 | — |

## Requirements

- macOS または Windows
- **Node.js 22以上**（Node.js 24 LTS 推奨）
- Codexを利用できるChatGPTアカウント
- 利用可能なCodex runtime

外部npm packageは使いません。

### Codex runtime discovery

`codex-usage` は概ね次の順でruntimeを探します。

1. `CODEX_CLI`
2. `CODEX_CLI_PATH`（Codex Desktop互換）
3. `PATH` 上の `codex`
4. OSごとのDesktop runtime

macOSでは既知のDesktop bundle pathを確認します。

```text
/Applications/ChatGPT.app/Contents/Resources/codex
~/Applications/ChatGPT.app/Contents/Resources/codex
/Applications/Codex.app/Contents/Resources/codex
~/Applications/Codex.app/Contents/Resources/codex
```

WindowsではCodex Desktopがユーザー領域へ配置したruntimeを探索します。

```text
%LOCALAPPDATA%\OpenAI\Codex\bin\...\codex.exe
%LOCALAPPDATA%\Programs\OpenAI\Codex\bin\codex.exe
```

Desktop runtimeが利用できない場合はstandalone Codex CLIを使えます。

このツール自身はAPIキーを読みません。検出した `codex app-server --stdio` を起動し、`account/rateLimits/read` から使用量を取得します。

---

# Install

## macOS — one command

```bash
curl -fsSL https://raw.githubusercontent.com/Naoshi-Git/codex-usage/main/bootstrap.sh | bash
```

配置先:

```text
~/.local/share/codex-usage
~/.local/bin/codex-usage
```

`~/.local/bin` がPATHにない場合はinstallerが設定方法を表示します。

## Windows — one command

PowerShellで:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -c "irm https://raw.githubusercontent.com/Naoshi-Git/codex-usage/main/bootstrap.ps1 | iex"
```

配置先:

```text
%LOCALAPPDATA%\CodexUsage\app
%LOCALAPPDATA%\CodexUsage\bin\codex-usage.cmd
```

installerがUser PATHを更新します。親Shellでまだコマンドが見えない場合は、新しいTerminalを開いてください。

## Git clone

macOS:

```bash
git clone https://github.com/Naoshi-Git/codex-usage.git
cd codex-usage
bash install.sh
```

Windows:

```powershell
git clone https://github.com/Naoshi-Git/codex-usage.git
cd codex-usage
.\install.ps1
```

## Node.js がない / 古い場合

macOS:

```bash
brew install node
```

Windows:

```powershell
winget install OpenJS.NodeJS.LTS
```

Node.js 22以上が必要です。

## Codex runtime が見つからない場合

まず:

```text
codex-usage doctor
```

standalone Codex CLIを導入する場合:

macOS:

```bash
curl -fsSL https://chatgpt.com/codex/install.sh | sh
```

または:

```bash
brew install --cask codex
```

Windows:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -c "irm https://chatgpt.com/codex/install.ps1 | iex"
```

その後 `codex` を起動し、ChatGPTでサインインしてください。

---

# Usage

```text
# 現在値を1回表示
codex-usage

# 対話型TUI
codex-usage live --mascot

# 従来形式も同じinteractive live view
codex-usage --watch 60 --mascot

# English UI
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

## Commands / options

| コマンド / オプション | 内容 |
|---|---|
| `status` | 現在値を1回表示。省略時の既定動作 |
| `live` | 対話型TUI。既定60秒周期 |
| `history` | ローカル履歴 / ヒートマップ |
| `doctor` | OS / Node / Codex runtime / rate-limit接続を診断 |
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

起動後に `/` を押すとコマンドパレットが開きます。

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

Tabでコマンド名・一部の固定引数を補完できます。

```text
/mas<Tab>       → /mascot
/lan<Tab>       → /lang
/lang e<Tab>    → /lang en
/mascot of<Tab> → /mascot off
/ref<Tab>       → /refresh
```

Terminalサイズ変更時は全面再描画します。68列未満では壊れたカードを描画せず、幅不足メッセージへ切り替えます。`Ctrl+L` または `/redraw` でhard redrawできます。

下部status:

```text
● RUNNING   next check 59s · / commands · Tab complete · Ctrl+L redraw · Ctrl+C exit
✦ UPDATED   quota / reset値が実際に変化した直後だけ数秒表示
Ⅱ PAUSED    /watch off のとき
```

## Quota Buddy

Quota Buddyは次の3軸から最も厳しい状態を採用します。

1. 週次の使用目安との差
2. 5時間枠の使用目安との差
3. 週次 / 5時間枠のうち低い方の残量

| 状態 | 週次先行 | 5h先行 | 最低残量 |
|---|---:|---:|---:|
| cruising | `<4pt` | `<12pt` | `>50%` |
| active | `≥4pt` | `≥12pt` | `≤50%` |
| ease up | `≥10pt` | `≥24pt` | `≤25%` |
| cool down | `≥18pt` | `≥40pt` | `≤10%` |

アニメーションはローカル描画だけです。Codexへの問い合わせ頻度は増えません。

## History

成功した通常実行・live更新時にJSONLサンプルを保存します。

macOS:

```text
~/Library/Application Support/codex-usage/history.jsonl
```

Windows:

```text
%LOCALAPPDATA%\CodexUsage\history.jsonl
```

3時間を超える観測空白は補間せず、週次resetをまたいだ差分も消費量へ加算しません。

---

# Existing installs / migration

## 旧Mac版 `codex-usage-mac`

新installerは `~/.local/bin/codex-usage` を新しい共通実装へ張り替え、旧アプリ配置 `~/.local/share/codex-usage-mac` を整理します。履歴は従来から別ディレクトリなので維持されます。

## 旧Windows版 `Codex_Usage_CLI`

旧版は `%LOCALAPPDATA%\CodexUsageCli` に `.NET` 実行ファイルと履歴を置いていました。

新installerは:

1. 旧 `history.jsonl` があれば新しいstateへコピー
2. User PATHから旧 `%LOCALAPPDATA%\CodexUsageCli` を除去
3. 新しい `%LOCALAPPDATA%\CodexUsage\bin` をPATHへ追加
4. 同じ `codex-usage` コマンドをNode共通実装へ切り替え

という順で移行します。

---

# Updating

```text
codex-usage update
```

OSに応じて自動的に:

- macOS: release tarball → `install.sh`
- Windows: release zipball → `install.ps1`

を利用します。

`CODEX_USAGE_REPO=owner/repo` を設定すると、開発・fork用途で更新元をoverrideできます。

# Development / CI

外部npm packageはないため `npm install` は不要です。

```text
node ./bin/codex-usage.mjs --self-test
node ./bin/codex-usage.mjs --help
node ./bin/codex-usage.mjs --version
node ./bin/codex-usage.mjs live --mascot --en
```

GitHub Actionsでは以下をmatrix testします。

```text
macOS  × Node.js 22 / 24
Windows × Node.js 22 / 24
```

各OSでoffline self-test、CLI smoke test、実installer smoke testを実行します。

# Uninstall

macOS:

```bash
bash uninstall.sh
```

Windows:

```powershell
.\uninstall.ps1
```

履歴は意図的に残します。

# Notes

- Codex Desktop内部のruntime pathは公開された固定APIではなく、将来変更される可能性があります。`doctor`、PATH、`CODEX_CLI` overrideをfallbackとして用意しています。
- Codexの `app-server` / rate-limitレスポンスも将来変更される可能性があります。
- 現行 `rateLimitsByLimitId.codex` と旧 `rateLimits` の両形状に対応しています。

# License

MIT
