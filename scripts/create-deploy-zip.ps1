# Create scm-deploy.zip with a SHORT internal folder name (avoids Windows path-too-long errors).
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Deploy = Join-Path $Root "SC-Manufacturing-Databricks-Deploy"
$Out = Join-Path $Root "scm-deploy.zip"
$Short = Join-Path $env:TEMP "scm-deploy"

if (-not (Test-Path $Deploy)) { throw "Missing $Deploy" }
Set-Location $Deploy
& "$Deploy\verify-upload.ps1"

if (Test-Path $Short) { Remove-Item $Short -Recurse -Force }
New-Item -ItemType Directory -Path $Short -Force | Out-Null
Copy-Item -Path "$Deploy\*" -Destination $Short -Recurse -Force -Exclude node_modules

if (Test-Path $Out) { Remove-Item $Out -Force }
Compress-Archive -Path $Short -DestinationPath $Out -Force
Remove-Item $Short -Recurse -Force

Get-Item $Out | Format-List Name, Length, FullName
Write-Host "Created: $Out"
Write-Host "Expected size: about 250-300 KB (not 17 KB)"
Write-Host ""
Write-Host "WINDOWS — extract to a SHORT path to avoid Error 0x80010135:"
Write-Host "  Expand-Archive scm-deploy.zip -DestinationPath C:\scm -Force"
Write-Host "  cd C:\scm\scm-deploy"
Write-Host "  .\import-with-cli.ps1 -WorkspacePath \"/Workspace/Users/<you>/SC-Manufacturing\""
