# Upload deploy bundle to Databricks Workspace (avoids UI import errors on .js / package.json)
# Prerequisites: Databricks CLI v0.205+ and `databricks auth login`
#
# Usage:
#   .\import-with-cli.ps1 -WorkspacePath "/Workspace/Users/you@company.com/SC-Manufacturing"

param(
    [Parameter(Mandatory = $true)]
    [string]$WorkspacePath
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Uploading from: $Root"
Write-Host "Target:         $WorkspacePath"
Write-Host ""

# Prefer sync (keeps folder structure). Fall back to import-dir on older CLI.
$sync = Get-Command databricks -ErrorAction SilentlyContinue
if (-not $sync) {
    Write-Error "Databricks CLI not found. Install: https://docs.databricks.com/en/dev-tools/cli/index.html"
}

databricks sync $Root $WorkspacePath --full --overwrite

Write-Host ""
Write-Host "Done. Next in Databricks terminal on that path:"
Write-Host "  chmod +x setup.sh && ./setup.sh"
Write-Host "  npm start"
