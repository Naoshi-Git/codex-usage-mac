param(
    [switch]$NoPath
)

$ErrorActionPreference = "Stop"
$repo = if ($env:CODEX_USAGE_REPO) { $env:CODEX_USAGE_REPO } else { "Naoshi-Git/codex-usage" }
$temp = Join-Path ([System.IO.Path]::GetTempPath()) ("codex-usage-bootstrap-" + [Guid]::NewGuid().ToString("N"))
$archive = Join-Path $temp "source.zip"

try {
    New-Item -ItemType Directory -Force -Path $temp | Out-Null
    Write-Host "Downloading Codex Usage..."
    $url = "https://github.com/$repo/archive/refs/heads/main.zip"
    Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $archive
    Expand-Archive -LiteralPath $archive -DestinationPath $temp -Force

    $source = Get-ChildItem $temp -Directory |
        Where-Object { Test-Path (Join-Path $_.FullName "install.ps1") } |
        Select-Object -First 1
    if (-not $source) {
        throw "Downloaded archive did not contain install.ps1."
    }

    $arguments = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $source.FullName "install.ps1"))
    if ($NoPath) { $arguments += "-NoPath" }
    & powershell.exe @arguments
    exit $LASTEXITCODE
}
finally {
    Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue
}
