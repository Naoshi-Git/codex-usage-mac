# Codex Usage for Mac

macOS Terminal で Codex の **5時間枠 / 週次枠** を一目で確認するためのCLIです。

Windows版 `Codex_Usage_CLI` の取得・計算・情報設計をベースに、Mac専用リポジトリとして作り直しています。Mac版では .NET を必須にせず、**Node.js標準機能だけで動くゼロ依存実装**にしています。

## 主な機能

- 週次枠: 残り / 使用済み / リセット時刻 / 時間経過ベースの使用目安
- 5時間枠: 残り / 使用済み / リセット時刻 / 使用目安
- 週次レール上に `●` 現在、`▲` 実使用、夜間帯を重ねて表示
- 使用ペースが先行している場合、追加利用しなければいつ目安へ戻るかを表示
- `--watch` によるライブ更新
- `--json` による自動化向け出力
- ローカル履歴と時間帯別ヒートマップ
- `doctor` による macOS / Node.js / Codex CLI / アカウント接続の診断
- 日本語 / 英語UI

## 必要環境

- **macOS**（Apple Silicon / Intel）
- **Node.js 22以上**（Node.js 24 LTS 推奨）
- **Codex CLI**
- Codex CLIで利用可能なChatGPTアカウントまたは設定済みのCodex環境

このツール自身はAPIキーを読みません。ローカルの `codex app-server --stdio` を起動し、`account/rateLimits/read` から使用量を取得します。

## 最短セットアップ

```bash
git clone https://github.com/Naoshi-Git/codex-usage-mac.git
cd codex-usage-mac
bash install.sh
codex-usage doctor
codex-usage
```

installerは以下へ配置します。

```text
~/.local/share/codex-usage-mac
~/.local/bin/codex-usage
```

`~/.local/bin` が `PATH` に入っていない場合は、追加すべき `~/.zshrc` の設定をその場で表示します。

インストール時には、コピー後のファイルに対してoffline self-testを実行します。self-testが失敗した場合はインストールを中断します。

## Node.js がない / 古い場合

Homebrewを使う場合:

```bash
brew install node
```

既に古いNode.jsがある場合:

```bash
brew upgrade node
```

**Node.js 22以上**が必要です。2026年8月時点では Node.js 24 が推奨LTSです。

## Codex CLI がない場合

Codex公式のMac/Linux向けstandalone installer:

```bash
curl -fsSL https://chatgpt.com/codex/install.sh | sh
```

Homebrewでも導入できます。

```bash
brew install --cask codex
```

npmの場合:

```bash
npm install -g @openai/codex
```

導入後、一度Codexを起動します。

```bash
codex
```

**Sign in with ChatGPT** を選んでログインした後、診断します。

```bash
codex-usage doctor
```

通常起動時にCodex CLIが見つからない場合も、同じ導入コマンドをその場で表示します。

## 使い方

```bash
# 1回だけ表示
codex-usage

# 英語UI
codex-usage --en

# 60秒ごとに更新
codex-usage --watch 60

# JSON
codex-usage --json

# ANSI装飾なし
codex-usage --plain

# 履歴
codex-usage history

# 30日履歴
codex-usage history --30d

# 環境診断
codex-usage doctor
```

### オプション

| オプション | 内容 |
|---|---|
| `status` | 現在値を表示。省略時の既定動作 |
| `history` | ローカル履歴 / ヒートマップ |
| `doctor` | macOS / Node / Codex CLI / rate-limit接続を診断 |
| `--watch [sec]` | 同じ画面を更新。既定60秒、最小10秒 |
| `--days N` | 履歴範囲 1〜30日 |
| `--30d` | `history --days 30` の短縮形 |
| `--night HH:MM-HH:MM` | 週次レールの夜間帯。既定 `00:00-06:00` |
| `--width N` | レール幅 28〜72。既定56 |
| `--json` | 構造化JSON |
| `--plain` / `--no-color` | ANSI装飾を無効化 |
| `--en` / `--ja` | 英語 / 日本語 |
| `--lang en\|ja` | 言語を明示指定 |
| `--self-test` | 通信なしのself-test |

## 週次レールの読み方

```text
● 7日間のうち現在どこまで時間が経過したか
▲ 週次quotaを何%使ったかを同じ0–100%軸へ配置
━ すでに消費した領域
░ 設定した夜間帯
```

時間の進み方とquota消費の進み方を同じ軸に置くため、**今の使い方が均等ペースより速いか遅いか**を算数なしで判断できます。

使用が時間経過より先行している場合は、追加利用しなければ時間側が追いつく推定時刻も表示します。

## 履歴

成功した通常実行・watch更新時に小さなJSONLサンプルをローカルへ保存します。

```text
~/Library/Application Support/codex-usage/history.jsonl
```

履歴はこのツールから外部へ送信しません。

ヒートマップは、3時間を超える観測空白を勝手に補間しません。また週次リセットをまたいだ差分を消費量として加算しません。

## `doctor` について

うまく動かない場合は最初に実行してください。

```bash
codex-usage doctor
```

以下を確認します。

1. macOSか
2. Node.js 22以上か
3. Codex CLIが `PATH` から見つかるか
4. Codex app-serverへ接続しrate limitを取得できるか
5. 履歴保存先

Codex CLIがなければ導入コマンドを表示します。Codexは見つかるがアカウント接続に失敗する場合は、`codex` を起動してChatGPTログインを行うよう案内します。

## Codexが入っているのに見つからない場合

Codex実行ファイルのフルパスを指定できます。

```bash
CODEX_CLI=/full/path/to/codex codex-usage
```

必要なら `~/.zshrc` に設定してください。

## 開発 / 確認

外部npm packageは使っていないため `npm install` は不要です。

```bash
node ./bin/codex-usage.mjs --self-test
node ./bin/codex-usage.mjs --help
```

GitHub Actionsでは macOS runner 上で Node.js 22 / 24 のself-testとシェルスクリプト構文チェックを行います。

## アンインストール

```bash
bash uninstall.sh
```

コマンド本体は削除しますが、履歴は意図的に残します。履歴も消す場合:

```bash
rm -rf "$HOME/Library/Application Support/codex-usage"
```

## 注意

- このリポジトリは **Mac専用** です。
- Codexの `app-server` / rate-limitレスポンスは将来変更される可能性があります。Codex更新後に動かなくなった場合は、まず `codex-usage doctor` を実行してください。
- 現行の `rateLimitsByLimitId.codex` と旧 `rateLimits` の両レスポンス形状に対応しています。

## License

MIT
