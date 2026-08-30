# v1.1.0 — Desktop runtime, Quota Buddy, readable UI & self-update

## Highlights

### ChatGPT Desktopの内蔵Codex runtimeに対応

standalone Codex CLIがPATHに無くても、macOSのChatGPTデスクトップアプリに含まれるCodex runtimeを自動検出して使用できるようになりました。

探索順:

1. `CODEX_CLI`
2. `PATH` 上の `codex`
3. ChatGPT Desktop bundled runtime
4. legacy Codex Desktop bundled runtime

`codex-usage doctor` では、実際にどのruntimeを使用しているかと実ファイルpathを表示します。

### Quota Buddy mascot

Windows版で用意していたQuota BuddyをMac版へ移植しました。

```bash
codex-usage --mascot
codex-usage --watch 60 --mascot
```

週次残量・5時間残量・均等ペースとの差から状態を切り替えます。

- cruising — 余裕あり
- active — やや先行
- ease up — 少し抑えめ
- cool down — 休ませどき

対応Terminalではtrue color + Unicode half-blockで表示し、plain/redirect時はテキスト顔へfallbackします。watch時のアニメーションはローカル描画のみで、Codex APIへのpolling頻度は増えません。

### Terminal UI readability

PR #1 by `hharushi-bot` を取り込みました。

- 残り枠・実使用・リセット時刻の情報階層を整理
- リセットを独立して読みやすく表示
- `●` / `▲` / `░` の凡例を追加
- Terminal上のコントラストを改善
- 横幅依存の詰まりを軽減

### Self-update

v1.1.0以降は次だけで更新できます。

```bash
codex-usage update
```

最新GitHub ReleaseがあればReleaseを優先し、Release未作成時のみmainへfallbackします。

v1.0.0からは一度だけbootstrapを再実行してください。

```bash
curl -fsSL https://raw.githubusercontent.com/Naoshi-Git/codex-usage-mac/main/bootstrap.sh | bash
```

### One-command install

新規導入も1コマンドで可能になりました。

```bash
curl -fsSL https://raw.githubusercontent.com/Naoshi-Git/codex-usage-mac/main/bootstrap.sh | bash
```

## Other changes

- `codex-usage --version` / `-v` を追加
- `doctor` を `Codex CLI` ではなく `Codex runtime` ベースへ更新
- installerがChatGPT Desktop内蔵runtimeも診断
- Node.js 22+ / macOS CIを継続
- `CODEX_CLI` overrideをDesktop runtimeのfallbackとして明文化

## Upgrade notes

既存の履歴ファイルはそのまま引き継ぎます。

```text
~/Library/Application Support/codex-usage/history.jsonl
```

設定移行や履歴変換は不要です。
