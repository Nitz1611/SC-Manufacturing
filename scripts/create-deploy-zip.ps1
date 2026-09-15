# Create SC-Manufacturing-Databricks-Deploy.zip from the deploy folder (run from repo root).
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Deploy = Join-Path $Root "SC-Manufacturing-Databricks-Deploy"
$Out = Join-Path $Root "SC-Manufacturing-Databricks-Deploy.zip"

if (-not (Test-Path $Deploy)) { throw "Missing $Deploy" }
Set-Location $Deploy
& "$Deploy\verify-upload.ps1"

if (Test-Path $Out) { Remove-Item $Out -Force }
Compress-Archive -Path $Deploy -DestinationPath $Out -Force
Get-Item $Out | Format-List Name, Length, FullName
Write-Host "Created: $Out"
Write-Host "Expected size: about 250-300 KB (not 17 KB)"
