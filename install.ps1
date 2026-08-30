param(
    [string]$Destination = $(if ($env:CODEX_USAGE_HOME) { $env:CODEX_USAGE_HOME } else { Join-Path $env:LOCALAPPDATA "CodexUsage\app" }),
    [string]$BinDir = $(if ($env:CODEX_USAGE_BIN) { $env:CODEX_USAGE_BIN } else { Join-Path $env:LOCALAPPDATA "CodexUsage\bin" }),
    [switch]$NoPath,
    [switch]$SkipDoctor
)

$ErrorActionPreference = "Stop"

if ($env:OS -ne "Windows_NT") {
    throw "This installer is for Windows. Use bash install.sh on macOS."
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Host "Node.js 22+ is required and was not found." -ForegroundColor Red
    Write-Host ""
    Write-Host "Recommended:"
    Write-Host "  winget install OpenJS.NodeJS.LTS"
    Write-Host ""
    Write-Host "Or install the current LTS release from https://nodejs.org/ and rerun this installer."
    exit 1
}

$nodeVersion = (& node --version).Trim()
$nodeMajor = [int](($nodeVersion -replace '^v', '').Split('.')[0])
if ($LASTEXITCODE -ne 0 -or $nodeMajor -lt 22) {
    throw "Node.js 22+ is required (found $nodeVersion). Update Node.js and retry."
}

$sourceRoot = $PSScriptRoot
$stateRoot = Split-Path $Destination -Parent
$legacyRoot = Join-Path $env:LOCALAPPDATA "CodexUsageCli"
$legacyHistory = Join-Path $legacyRoot "history.jsonl"
$newHistory = Join-Path $stateRoot "history.jsonl"

Write-Host "Installing Codex Usage"
Write-Host "  source:  $sourceRoot"
Write-Host "  app:     $Destination"
Write-Host "  command: $(Join-Path $BinDir 'codex-usage.cmd')"

if (Test-Path $Destination) {
    Remove-Item $Destination -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $Destination, $BinDir, $stateRoot | Out-Null
Copy-Item (Join-Path $sourceRoot "bin") $Destination -Recurse -Force
Copy-Item (Join-Path $sourceRoot "src") $Destination -Recurse -Force
Copy-Item (Join-Path $sourceRoot "package.json") $Destination -Force

& node (Join-Path $Destination "bin\codex-usage.mjs") --self-test | Out-Host
if ($LASTEXITCODE -ne 0) {
    Remove-Item $Destination -Recurse -Force -ErrorAction SilentlyContinue
    throw "Installed files failed the offline self-test."
}

if ((Test-Path $legacyHistory) -and -not (Test-Path $newHistory)) {
    Copy-Item $legacyHistory $newHistory -Force
    Write-Host "Migrated history from the previous Windows version."
}

$entry = Join-Path $Destination "bin\codex-usage.mjs"
$shimPath = Join-Path $BinDir "codex-usage.cmd"
$shim = "@echo off`r`nnode `"$entry`" %*`r`n"
[System.IO.File]::WriteAllText($shimPath, $shim, (New-Object System.Text.UTF8Encoding($false)))

function Same-Path([string]$A, [string]$B) {
    if (-not $A -or -not $B) { return $false }
    try {
        return [System.IO.Path]::GetFullPath($A).TrimEnd('\') -ieq [System.IO.Path]::GetFullPath($B).TrimEnd('\')
    } catch {
        return $A.TrimEnd('\') -ieq $B.TrimEnd('\')
    }
}

if (-not $NoPath) {
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $parts = @($userPath -split ';' | Where-Object { $_ -and -not (Same-Path $_ $legacyRoot) -and -not (Same-Path $_ $BinDir) })
    $newUserPath = (($parts + $BinDir) -join ';')
    [Environment]::SetEnvironmentVariable("Path", $newUserPath, "User")

    $currentParts = @($env:Path -split ';' | Where-Object { $_ -and -not (Same-Path $_ $legacyRoot) -and -not (Same-Path $_ $BinDir) })
    $env:Path = (($BinDir + $currentParts) -join ';')
}

Write-Host ""
Write-Host "✓ codex-usage installed and self-test passed" -ForegroundColor Green
if (-not $NoPath) {
    Write-Host "✓ User PATH now points to the unified launcher"
}

if (-not $SkipDoctor) {
    Write-Host ""
    & node $entry doctor
    $doctorExit = $LASTEXITCODE
    if ($doctorExit -ne 0) {
        Write-Host ""
        Write-Host "Codex Usage is installed; the doctor output above shows any remaining Codex/Node setup."
    }
}

Write-Host ""
Write-Host "Next:"
Write-Host "  codex-usage"
Write-Host "  codex-usage live --mascot"
Write-Host "  codex-usage history"
Write-Host ""
Write-Host "Future updates:"
Write-Host "  codex-usage update"
Write-Host ""
Write-Host "Open a new terminal if 'codex-usage' is not immediately visible in the parent shell."
