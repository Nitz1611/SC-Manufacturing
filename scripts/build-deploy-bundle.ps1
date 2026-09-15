# Build from source and refresh SC-Manufacturing-Databricks-Deploy for Databricks upload.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Deploy = Join-Path $Root "SC-Manufacturing-Databricks-Deploy"

Set-Location $Root
Write-Host "==> Building client + server from source..."
npm run build

Write-Host "==> Copying build artifacts into deploy bundle..."
$dirs = @(
    @{ From = "client\dist"; To = "client\dist" },
    @{ From = "server\dist"; To = "server\dist" },
    @{ From = "config\queries"; To = "config\queries" }
)
foreach ($d in $dirs) {
    $dest = Join-Path $Deploy $d.To
    if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
    New-Item -ItemType Directory -Path (Split-Path $dest -Parent) -Force | Out-Null
    Copy-Item (Join-Path $Root $d.From) $dest -Recurse
}

Write-Host "==> Deploy bundle refreshed at: $Deploy"
Write-Host "    Next: npm run test:deploy"
