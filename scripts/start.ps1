<#
.SYNOPSIS
    AgentCompany one-command startup script (Windows PowerShell)
.DESCRIPTION
    Start Docker(Ollama) + Orchestrator Server + GUI in one command.
.EXAMPLE
    .\scripts\start.ps1
    .\scripts\start.ps1 -SkipDocker
    .\scripts\start.ps1 -Model "codellama"
#>
param(
    [switch]$SkipDocker,
    [string]$Model = "llama3.2:1b",
    [int]$GuiPort = 3000,
    [int]$ServerPort = 3001,
    [switch]$SkipGui,
    [switch]$SkipServer
)
$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
function Write-Step { param([string]$M); Write-Host ""; Write-Host "==> $M" -ForegroundColor Cyan }
function Write-Ok { param([string]$M); Write-Host "  [OK] $M" -ForegroundColor Green }
function Write-Warn { param([string]$M); Write-Host "  [!] $M" -ForegroundColor Yellow }
function Write-Fail { param([string]$M); Write-Host "  [X] $M" -ForegroundColor Red }
$PidDir = Join-Path (Join-Path $ProjectRoot "runtime") ".pids"
if (-not (Test-Path $PidDir)) { New-Item -ItemType Directory -Path $PidDir -Force | Out-Null }
$ComposeFile = Join-Path (Join-Path (Join-Path $ProjectRoot "infra") "docker") "compose.yaml"
$GuiDir = Join-Path (Join-Path $ProjectRoot "gui") "web"
# ============================================================
# 1. Docker (Ollama)
# ============================================================
if ($SkipDocker) {
    Write-Step "Docker skip (-SkipDocker)"
    try {
        $null = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -TimeoutSec 3 -ErrorAction Stop
        Write-Ok "Local Ollama detected"
    } catch {
        Write-Warn "Local Ollama not found. Run: ollama serve"
    }
} else {
    Write-Step "Starting Docker..."
    $dockerOk = $false
    try { $null = docker info 2>&1; if ($LASTEXITCODE -eq 0) { $dockerOk = $true } } catch { }
    if (-not $dockerOk) {
        Write-Fail "Docker not found. Install Docker Desktop."
        Write-Host "  https://www.docker.com/products/docker-desktop/" -ForegroundColor Gray
        Write-Host "  Without Docker: .\scripts\start.ps1 -SkipDocker" -ForegroundColor Gray
        exit 1
    }
    docker compose -f $ComposeFile up -d ollama 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Fail "Failed to start Ollama container"; exit 1 }
    Write-Ok "Ollama container started"
    Write-Step "Waiting for Ollama..."
    $ollamaReady = $false
    for ($i = 0; $i -lt 30; $i++) {
        try {
            $null = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -TimeoutSec 2 -ErrorAction Stop
            $ollamaReady = $true
            break
        } catch { Start-Sleep -Seconds 2; Write-Host "." -NoNewline }
    }
    Write-Host ""
    if (-not $ollamaReady) { Write-Fail "Ollama timeout (60s)"; exit 1 }
    Write-Ok "Ollama ready"
    Write-Step "Checking AI model..."
    $tags = Invoke-RestMethod -Uri "http://localhost:11434/api/tags"
    $modelInstalled = $false
    foreach ($m in $tags.models) { if ($m.name -like "*$Model*") { $modelInstalled = $true; break } }
    if ($modelInstalled) {
        Write-Ok "Model '$Model' already installed"
    } else {
        Write-Step "Installing model '$Model' (first time only, may take minutes)..."
        docker exec agentcompany-ollama ollama pull $Model
        if ($LASTEXITCODE -eq 0) { Write-Ok "Model '$Model' installed" }
        else { Write-Warn "Model install failed. Manual: docker exec agentcompany-ollama ollama pull $Model" }
    }
}

# ============================================================
# 2. Dependencies
# ============================================================
Write-Step "Checking dependencies..."
$rootModules = Join-Path $ProjectRoot "node_modules"
if (-not (Test-Path $rootModules)) {
    Write-Step "Installing root dependencies..."
    Push-Location $ProjectRoot
    npm install 2>&1 | Out-Null
    Pop-Location
    Write-Ok "Root dependencies installed"
} else {
    Write-Ok "Root dependencies OK"
}
$guiModules = Join-Path $GuiDir "node_modules"
if (-not (Test-Path $guiModules)) {
    Write-Step "Installing GUI dependencies..."
    Push-Location $GuiDir
    npm install 2>&1 | Out-Null
    Pop-Location
    Write-Ok "GUI dependencies installed"
} else {
    Write-Ok "GUI dependencies OK"
}

# ============================================================
# 3. Orchestrator Server
# ============================================================
if ($SkipServer) {
    Write-Step "Orchestrator Server skip (-SkipServer)"
} else {
    Write-Step "Starting Orchestrator Server (port $ServerPort)..."
    $pidFile = Join-Path $PidDir "orchestrator.pid"
    $alreadyRunning = $false
    if (Test-Path $pidFile) {
        $savedPid = Get-Content $pidFile -ErrorAction SilentlyContinue
        if ($savedPid) {
            $proc = Get-Process -Id $savedPid -ErrorAction SilentlyContinue
            if ($proc) { Write-Ok "Orchestrator already running (PID: $savedPid)"; $alreadyRunning = $true }
        }
    }
    if (-not $alreadyRunning) {
        $outLog = Join-Path $PidDir "orchestrator.log"
        $errLog = Join-Path $PidDir "orchestrator.err.log"
        $serverArgs = "tsx tools/cli/agentcompany.ts server --port $ServerPort"
        $serverProc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c","npx $serverArgs" -WorkingDirectory $ProjectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput $outLog -RedirectStandardError $errLog
        $serverProc.Id | Out-File -FilePath $pidFile -NoNewline
        Start-Sleep -Seconds 2
        try {
            $healthUrl = "http://localhost:" + $ServerPort + "/api/health"
            $null = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 5 -ErrorAction Stop
            Write-Ok "Orchestrator Server started (PID: $($serverProc.Id))"
        } catch {
            Write-Warn "Orchestrator starting... Check log: runtime/.pids/orchestrator.log"
        }
    }
}

# ============================================================
# 4. GUI (Next.js)
# ============================================================
if ($SkipGui) {
    Write-Step "GUI skip (-SkipGui)"
} else {
    Write-Step "Starting GUI (port $GuiPort)..."
    $env:ORCHESTRATOR_API_URL = "http://localhost:" + $ServerPort
    $guiPidFile = Join-Path $PidDir "gui.pid"
    $guiRunning = $false
    if (Test-Path $guiPidFile) {
        $savedGuiPid = Get-Content $guiPidFile -ErrorAction SilentlyContinue
        if ($savedGuiPid) {
            $proc = Get-Process -Id $savedGuiPid -ErrorAction SilentlyContinue
            if ($proc) { Write-Ok "GUI already running (PID: $savedGuiPid)"; $guiRunning = $true }
        }
    }
    if (-not $guiRunning) {
        $guiOut = Join-Path $PidDir "gui.log"
        $guiErr = Join-Path $PidDir "gui.err.log"
        $guiArgs = "next dev --port $GuiPort"
        $guiProc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c","npx $guiArgs" -WorkingDirectory $GuiDir -WindowStyle Hidden -PassThru -RedirectStandardOutput $guiOut -RedirectStandardError $guiErr
        $guiProc.Id | Out-File -FilePath $guiPidFile -NoNewline
        Start-Sleep -Seconds 3
        Write-Ok "GUI started (PID: $($guiProc.Id))"
    }
}
# ============================================================
# Done
# ============================================================
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  AgentCompany Started!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
$guiUrl = "http://localhost:" + $GuiPort
$serverUrl = "http://localhost:" + $ServerPort
Write-Host "  GUI:              $guiUrl" -ForegroundColor White
Write-Host "  Orchestrator API: $serverUrl" -ForegroundColor White
Write-Host "  Ollama API:       http://localhost:11434" -ForegroundColor White
Write-Host "  AI Model:         $Model" -ForegroundColor White
Write-Host ""
Write-Host "  Stop:   npm run down" -ForegroundColor Gray
Write-Host "  Status: npm run status" -ForegroundColor Gray
Write-Host "  Logs:   runtime/.pids/*.log" -ForegroundColor Gray
Write-Host ""
