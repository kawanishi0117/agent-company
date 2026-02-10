<#
.SYNOPSIS
    AgentCompany stop script (Windows PowerShell)
.DESCRIPTION
    Stop all processes and Docker containers started by start.ps1.
.EXAMPLE
    .\scripts\stop.ps1
    .\scripts\stop.ps1 -KeepDocker
#>
param(
    [switch]$KeepDocker
)
$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$PidDir = Join-Path (Join-Path $ProjectRoot "runtime") ".pids"
function Write-Step { param([string]$M); Write-Host ""; Write-Host "==> $M" -ForegroundColor Cyan }
function Write-Ok { param([string]$M); Write-Host "  [OK] $M" -ForegroundColor Green }
# ============================================================
# 1. GUI
# ============================================================
Write-Step "Stopping GUI..."
$guiPidFile = Join-Path $PidDir "gui.pid"
if (Test-Path $guiPidFile) {
    $guiPid = Get-Content $guiPidFile -ErrorAction SilentlyContinue
    if ($guiPid) {
        $proc = Get-Process -Id $guiPid -ErrorAction SilentlyContinue
        if ($proc) {
            Stop-Process -Id $guiPid -Force -ErrorAction SilentlyContinue
            Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq "" } | ForEach-Object {
                try {
                    $cmdLine = (Get-CimInstance Win32_Process -Filter "ProcessId = $($_.Id)" -ErrorAction SilentlyContinue).CommandLine
                    if ($cmdLine -and $cmdLine -match "next") { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }
                } catch { }
            }
            Write-Ok "GUI stopped (PID: $guiPid)"
        } else {
            Write-Ok "GUI already stopped"
        }
    }
    Remove-Item $guiPidFile -Force -ErrorAction SilentlyContinue
} else {
    Write-Ok "GUI not running"
}
# ============================================================
# 2. Orchestrator Server
# ============================================================
Write-Step "Stopping Orchestrator Server..."
$serverPidFile = Join-Path $PidDir "orchestrator.pid"
if (Test-Path $serverPidFile) {
    $serverPid = Get-Content $serverPidFile -ErrorAction SilentlyContinue
    if ($serverPid) {
        $proc = Get-Process -Id $serverPid -ErrorAction SilentlyContinue
        if ($proc) {
            Stop-Process -Id $serverPid -Force -ErrorAction SilentlyContinue
            Write-Ok "Orchestrator Server stopped (PID: $serverPid)"
        } else {
            Write-Ok "Orchestrator Server already stopped"
        }
    }
    Remove-Item $serverPidFile -Force -ErrorAction SilentlyContinue
} else {
    Write-Ok "Orchestrator Server not running"
}
# ============================================================
# 3. Docker
# ============================================================
if ($KeepDocker) {
    Write-Step "Docker skip (-KeepDocker)"
    Write-Host "  Ollama container remains running" -ForegroundColor Gray
} else {
    Write-Step "Stopping Docker containers..."
    $ComposeFile = Join-Path (Join-Path (Join-Path $ProjectRoot "infra") "docker") "compose.yaml"
    try {
        docker compose -f $ComposeFile down 2>&1 | Out-Null
        Write-Ok "Docker containers stopped"
    } catch {
        Write-Ok "No Docker containers running"
    }
}
# ============================================================
# Cleanup
# ============================================================
Write-Step "Cleaning up logs..."
if (Test-Path $PidDir) {
    Get-ChildItem -Path $PidDir -Filter "*.log" | Remove-Item -Force -ErrorAction SilentlyContinue
    Write-Ok "Log files removed"
}
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  AgentCompany Stopped" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
