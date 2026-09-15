# Run before uploading to Databricks — fails fast if the bundle is incomplete or misconfigured.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

function Fail($msg) { Write-Error "FAIL: $msg" }

if (-not (Test-Path "package.json")) { Fail "missing package.json" }
$pkg = Get-Content package.json -Raw | ConvertFrom-Json
if ($null -ne $pkg.scripts.build) {
    Fail 'root package.json still defines "build" — use the latest deploy ZIP'
}
Write-Host "OK: root package.json has no build script"

$required = @(
    "server/dist/server/server.js",
    "server/dist/server/lib/config.js",
    "server/dist/server/lib/env.js",
    "server/dist/server/lib/databricksSql.js",
    "client/dist/index.html",
    "config/queries/dashboard_dt_kpis.obo.sql",
    "app.yaml",
    "BUNDLE_VERSION.txt"
)
foreach ($f in $required) {
    if (-not (Test-Path $f)) { Fail "missing $f" }
}
Write-Host "OK: critical files present"

$serverPkg = Get-Content server/package.json -Raw
if ($serverPkg -notmatch "dist/server/server.js") {
    Fail "server/package.json start must use dist/server/server.js"
}
Write-Host "OK: server start path correct"
Write-Host ""
Write-Host "Bundle verified. Upload this entire folder to Databricks."
Get-Content BUNDLE_VERSION.txt
