# Codex Usage for Mac

macOS Terminal で Codex の **5時間枠 / 週次枠** を一目で確認するためのCLIです。

Windows版 `Codex_Usage_CLI` の取得・計算・情報設計をベースに、Mac専用として作り直しています。外部npm packageは使わず、Node.js標準機能だけで動きます。

## Features

- 週次 / 5時間枠の残量・実使用・リセット時刻
- 時間経過ベースの使用目安と実使用の差
- `●` 現在/時間ペース、`▲` 実使用、`░` 夜間帯を同じレールで表示
- 使わなければいつ使用目安へ戻るかを推定
- `--watch` によるflicker-freeライブ表示
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

アプリbundleの内部構造は将来変わる可能性があるため、見つからない場合は `CODEX_CLI` で上書きできます。

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

インストール時にはコピー後のファイルでoffline self-testを実行します。失敗した場合はインストールを中断します。

最後に `doctor` 相当の診断を表示するため、standalone CLIがなくてもChatGPT Desktop内蔵runtimeが見つかればそのまま使えます。

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

ChatGPTデスクトップアプリでCodexを利用している場合は、まず:

```bash
codex-usage doctor
```

内蔵runtimeが検出されればstandalone CLIは不要です。

standalone Codex CLIを使う場合、公式installer:

```bash
curl -fsSL https://chatgpt.com/codex/install.sh | sh
```

または:

```bash
brew install --cask codex
```

CLI導入後は `codex` を起動し、**Sign in with ChatGPT** でログインします。

## Usage

```bash
# 現在値
codex-usage

# Quota Buddy
codex-usage --mascot

# Mascot + live view
codex-usage --watch 60 --mascot

# 英語UI
codex-usage --en

# JSON
codex-usage --json

# 履歴
codex-usage history
codex-usage history --30d

# 環境診断
codex-usage doctor

# バージョン
codex-usage --version

# 更新
codex-usage update
```

### Commands / options

| コマンド / オプション | 内容 |
|---|---|
| `status` | 現在値。省略時の既定動作 |
| `history` | ローカル履歴 / ヒートマップ |
| `doctor` | macOS / Node / Codex runtime / rate-limit接続を診断 |
| `update` | 最新GitHub Releaseへ更新。Release未作成時はmainへfallback |
| `--watch [sec]` | 同じ画面を更新。既定60秒、最小10秒 |
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

## Quota Buddy

```bash
codex-usage --mascot
codex-usage --watch 60 --mascot
```

Quota Buddyは週次残量・5時間残量・週次の使用目安との差から状態を選びます。

- `cruising` / 余裕あり
- `active` / やや先行
- `ease up` / 少し抑えめ
- `cool down` / 休ませどき

対応TerminalではANSI true colorとUnicode half-blockを使います。`--plain` やredirect時はテキスト顔にfallbackします。

watch中のmascotアニメーションはローカル描画だけです。Codexへの問い合わせ頻度は `--watch` の指定値から増えません。

## 週次レールの読み方

```text
● 7日間のうち現在どこまで時間が経過したか
▲ 週次quotaを何%使ったか
━ すでに消費した領域
░ 設定した夜間帯
```

時間の進み方とquota消費を同じ0–100%軸へ置き、均等ペースより速いか遅いかを視覚化します。

## History

成功した通常実行・watch更新時にJSONLサンプルをローカル保存します。

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

### v1.1.0以降

```bash
codex-usage update
```

GitHub Releaseが存在する場合は最新Releaseを優先し、Releaseがない場合のみmainへfallbackします。

### v1.0.0からの初回移行

v1.0.0には `update` コマンドがないため、一度だけbootstrapを再実行してください。

```bash
curl -fsSL https://raw.githubusercontent.com/Naoshi-Git/codex-usage-mac/main/bootstrap.sh | bash
```

以後は `codex-usage update` で更新できます。

## Development / CI

外部npm packageはないため `npm install` は不要です。

```bash
node ./bin/codex-usage.mjs --self-test
node ./bin/codex-usage.mjs --help
node ./bin/codex-usage.mjs --version
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
