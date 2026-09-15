# Copy deploy bundle to a short Windows path (fixes Error 0x80010135: Path too long).
# Usage: .\prepare-short-path.ps1
#        .\prepare-short-path.ps1 -Target C:\scm
$ErrorActionPreference = "Stop"

param(
    [string]$Target = "C:\scm-deploy"
)

$Source = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Source: $Source"
Write-Host "Target: $Target"
Write-Host ""

if ($Target.Length -gt 80) {
    Write-Warning "Target path is long ($($Target.Length) chars). Use something like C:\scm-deploy"
}

if (Test-Path $Target) {
    Write-Host "Removing existing $Target ..."
    Remove-Item $Target -Recurse -Force
}

New-Item -ItemType Directory -Path $Target -Force | Out-Null
Copy-Item -Path "$Source\*" -Destination $Target -Recurse -Force -Exclude node_modules

Set-Location $Target
& "$Target\verify-upload.ps1"

Write-Host ""
Write-Host "Deploy from this short path (not OneDrive):"
Write-Host "  cd $Target"
Write-Host "  .\import-with-cli.ps1 -WorkspacePath \"/Workspace/Users/<your-email>/SC-Manufacturing\""
Write-Host ""
Write-Host "Or open in Explorer and upload via Databricks CLI sync from here."
