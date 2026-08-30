# Codex Usage v2.0.0

Codex Usage is now one cross-platform CLI for **Windows and macOS**.

This release merges the former Windows `.NET` implementation and the macOS Node.js implementation into a single Node.js codebase so UI, quota calculations, history, diagnostics, and future fixes can be maintained once and shipped to both platforms.

## Highlights

- One repository and one product name: `codex-usage`
- Windows + macOS support from the same Node.js 22+ codebase
- Shared status UI, live TUI, history, Quota Buddy, JSON output, and quota calculations
- Platform-aware Codex runtime discovery
- Native install / uninstall / bootstrap flows for both operating systems
- Cross-platform self-update via `codex-usage update`
- CI coverage for macOS and Windows on Node.js 22 and 24

## Codex runtime discovery

`codex-usage` now checks, in order:

1. `CODEX_CLI`
2. `CODEX_CLI_PATH`
3. `codex` on `PATH`
4. known desktop-bundled Codex runtimes for the current OS

A standalone Codex CLI is therefore not required when a compatible desktop-bundled runtime is available.

Run:

```text
codex-usage doctor
```

to see which runtime was selected and whether the rate-limit endpoint is available.

## Install

### macOS

```bash
curl -fsSL https://raw.githubusercontent.com/Naoshi-Git/codex-usage/main/bootstrap.sh | bash
```

### Windows PowerShell

```powershell
irm https://raw.githubusercontent.com/Naoshi-Git/codex-usage/main/bootstrap.ps1 | iex
```

Both platforms expose the same command:

```text
codex-usage
codex-usage live --mascot
codex-usage history --30d
codex-usage doctor
codex-usage update
```

## Migration from previous versions

### Existing macOS users

The application payload moves from:

```text
~/.local/share/codex-usage-mac
```

to:

```text
~/.local/share/codex-usage
```

The installer handles the transition while preserving usage history.

### Existing Windows `.NET` users

The new installer replaces the previous `.NET` launcher with the unified Node.js launcher. It removes the old `CodexUsageCli` install directory from the User `PATH` when present and preserves/migrates the existing history from:

```text
%LOCALAPPDATA%\CodexUsageCli\history.jsonl
```

Users continue to invoke the same command: `codex-usage`.

## Requirements

- macOS or Windows
- Node.js 22 or newer; Node.js 24 LTS recommended
- a ChatGPT account with Codex access
- either a discoverable Codex desktop runtime or standalone Codex CLI

## Validation

The unified implementation is validated in GitHub Actions against:

- macOS / Node.js 22
- macOS / Node.js 24
- Windows / Node.js 22
- Windows / Node.js 24

Each matrix entry runs offline self-tests, CLI smoke tests, platform checks, and an installer smoke test.

## Notes

This is a major-version release because the internal implementation and installation layout are unified across operating systems. The user-facing command and core quota display model remain compatible.
