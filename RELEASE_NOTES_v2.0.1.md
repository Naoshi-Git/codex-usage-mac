# Codex Usage v2.0.1

This patch release fixes two Windows installation failures found during real-machine setup after the v2.0.0 cross-platform release.

## Windows installer fixes

### PowerShell Node.js version detection

The original v2.0.0 installer evaluated a JavaScript `node -p` expression from PowerShell. Depending on the PowerShell invocation, embedded quoting could be altered and the Node.js 22+ check could fail even when a supported Node.js version was installed.

The installer now reads `node --version` and parses the major version in PowerShell itself.

### Stable Node.js executable during PATH migration

The Windows installer migrates the old `.NET` Codex Usage PATH entry to the new unified launcher. During that operation, relying on a fresh `node` lookup later in the same process could make Node.js temporarily undiscoverable.

The installer now resolves the concrete Node.js executable path before changing PATH and reuses that path for:

- version detection
- offline self-test
- `doctor`
- the generated `codex-usage.cmd` launcher

This keeps the installation stable even while the User PATH is being migrated.

## macOS

There is no corresponding macOS installer regression in this patch. The two fixes above are specific to PowerShell and Windows PATH migration. macOS continues to use the existing Bash installer and shared application code.

## Update note

v2.0.0 remained the latest GitHub Release after the Windows fixes were merged to `main`. v2.0.1 intentionally republishes those fixes so `codex-usage update` and release-based installation cannot fall back to the pre-fix Windows installer.

## Validation

The release remains covered by the cross-platform CI matrix:

- macOS / Node.js 22
- macOS / Node.js 24
- Windows / Node.js 22
- Windows / Node.js 24
