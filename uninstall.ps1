param(
    [string]$Destination = $(if ($env:CODEX_USAGE_HOME) { $env:CODEX_USAGE_HOME } else { Join-Path $env:LOCALAPPDATA "CodexUsage\app" }),
    [string]$BinDir = $(if ($env:CODEX_USAGE_BIN) { $env:CODEX_USAGE_BIN } else { Join-Path $env:LOCALAPPDATA "CodexUsage\bin" }),
    [switch]$KeepPath
)

$ErrorActionPreference = "Stop"
$legacyRoot = Join-Path $env:LOCALAPPDATA "CodexUsageCli"

function Same-Path([string]$A, [string]$B) {
    if (-not $A -or -not $B) { return $false }
    try {
        return [System.IO.Path]::GetFullPath($A).TrimEnd('\') -ieq [System.IO.Path]::GetFullPath($B).TrimEnd('\')
    } catch {
        return $A.TrimEnd('\') -ieq $B.TrimEnd('\')
    }
}

Remove-Item $Destination -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $BinDir "codex-usage.cmd") -Force -ErrorAction SilentlyContinue
if ((Test-Path $BinDir) -and -not (Get-ChildItem $BinDir -Force | Select-Object -First 1)) {
    Remove-Item $BinDir -Force -ErrorAction SilentlyContinue
}

if (-not $KeepPath) {
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $parts = @($userPath -split ';' | Where-Object { $_ -and -not (Same-Path $_ $BinDir) -and -not (Same-Path $_ $legacyRoot) })
    [Environment]::SetEnvironmentVariable("Path", ($parts -join ';'), "User")
}

Write-Host "Codex Usage application files removed."
Write-Host "Usage history was intentionally kept under %LOCALAPPDATA%\CodexUsage."
