# SC Manufacturing — local folder cleanup (Windows / OneDrive)
#
# Fixes:
#   - Nested SC-Manufacturing\SC-Manufacturing duplicate folders
#   - Leftover Flask/Python files (static/, templates/, supervisor_old.py, …)
#   - Drift from the cursor/vr-architecture-shift-e63a branch
#
# Usage (dry run — shows what would happen):
#   cd "...\SC Manufacturing\SC-Manufacturing"
#   powershell -ExecutionPolicy Bypass -File .\scripts\clean-local.ps1
#
# Apply changes:
#   powershell -ExecutionPolicy Bypass -File .\scripts\clean-local.ps1 -Execute

param(
    [switch]$Execute
)

$ErrorActionPreference = "Stop"
$Branch = "cursor/vr-architecture-shift-e63a"

function Write-Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Remove-IfExists([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return }
    if ($Execute) {
        Remove-Item -LiteralPath $Path -Recurse -Force
        Write-Host "  removed: $Path" -ForegroundColor Yellow
    } else {
        Write-Host "  would remove: $Path" -ForegroundColor DarkYellow
    }
}

function Get-WorkspaceRoot([string]$Start) {
    $dir = (Resolve-Path -LiteralPath $Start).Path
    for ($i = 0; $i -lt 8; $i++) {
        $pkg = Join-Path $dir "package.json"
        if (Test-Path -LiteralPath $pkg) {
            try {
                $json = Get-Content -LiteralPath $pkg -Raw | ConvertFrom-Json
                if ($json.workspaces) { return $dir }
            } catch {
                # keep walking
            }
        }
        $parent = Split-Path $dir -Parent
        if ($parent -eq $dir) { break }
        $dir = $parent
    }
    return (Resolve-Path -LiteralPath $Start).Path
}

$Root = Get-WorkspaceRoot (Get-Location).Path
if ($Root -ne (Resolve-Path -LiteralPath (Get-Location).Path).Path) {
    Write-Host "Detected workspace root: $Root" -ForegroundColor Yellow
    Set-Location -LiteralPath $Root
}

# ── 1. Back up .env ──────────────────────────────────────────────────────────
$envPath = Join-Path $Root ".env"
$envBackup = Join-Path $env:TEMP "sc-manufacturing-env-backup.txt"
if (Test-Path -LiteralPath $envPath) {
    Copy-Item -LiteralPath $envPath -Destination $envBackup -Force
    Write-Host "  .env backed up to $envBackup"
} else {
    Write-Host "  no .env in repo root (you will need to create one after cleanup)" -ForegroundColor DarkYellow
}

# ── 2. Remove nested duplicate repo folder ───────────────────────────────────
Write-Step "Nested SC-Manufacturing folders"
$nested = Join-Path $Root "SC-Manufacturing"
if (Test-Path -LiteralPath $nested) {
    Write-Host "  found nested clone/copy: $nested"
    Remove-IfExists $nested
} else {
    Write-Host "  none found (OK)"
}

# ── 3. Remove legacy files not in the Node/React layout ─────────────────────
Write-Step "Legacy Flask / prototype files"
$legacyPaths = @(
    "static",
    "templates",
    "__pycache__",
    "supervisor_old.py",
    "supervisor.py",
    "app.py",
    "app (58).py",
    "metrics.py",
    "cache.py",
    "cache.json",
    "requirements.txt",
    "index (4).html",
    "Vr Dashboard.html",
    "manufacturing-console-design-approval.html",
    "client\src\legacy"
)
foreach ($rel in $legacyPaths) {
    Remove-IfExists (Join-Path $Root $rel)
}

# ── 4. Sync git to remote branch ─────────────────────────────────────────────
Write-Step "Git sync to origin/$Branch"
if ($Execute) {
    git fetch origin $Branch
    git checkout $Branch 2>$null
    if ($LASTEXITCODE -ne 0) { git checkout -b $Branch "origin/$Branch" }
    git reset --hard "origin/$Branch"
    git clean -fd
    Write-Host "  git reset --hard origin/$Branch" -ForegroundColor Yellow
    Write-Host "  git clean -fd (ignored files like .env are kept)" -ForegroundColor Yellow
} else {
    Write-Host "  would run: git fetch origin $Branch"
    Write-Host "  would run: git reset --hard origin/$Branch"
    Write-Host "  would run: git clean -fd"
}

# ── 5. Restore .env if git clean removed a copy elsewhere ────────────────────
if ((Test-Path -LiteralPath $envBackup) -and -not (Test-Path -LiteralPath $envPath)) {
    if ($Execute) {
        Copy-Item -LiteralPath $envBackup -Destination $envPath -Force
        Write-Host "  restored .env from backup"
    } else {
        Write-Host "  would restore .env from backup if missing"
    }
}

# ── 6. Verify layout ─────────────────────────────────────────────────────────
Write-Step "Expected layout check"
$expected = @("client", "server", "config", "shared", "docs", "package.json", ".env.example")
foreach ($name in $expected) {
    $ok = Test-Path -LiteralPath (Join-Path $Root $name)
    $flag = if ($ok) { "OK" } else { "MISSING" }
    $color = if ($ok) { "Green" } else { "Red" }
    Write-Host "  [$flag] $name" -ForegroundColor $color
}

Write-Step "Done"
if (-not $Execute) {
    Write-Host "Dry run only. Re-run with -Execute to apply changes." -ForegroundColor Magenta
} else {
    Write-Host "Next steps:"
    Write-Host "  1. Confirm .env is in this folder: $Root"
    Write-Host "  2. npm install"
    Write-Host "  3. npm run dev"
    Write-Host "  4. Open http://localhost:8000/api/status — expect mode: live-sql-metric-view"
}
