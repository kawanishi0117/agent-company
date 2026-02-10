<#
.SYNOPSIS
    AgentCompany 起動状態確認スクリプト
#>

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "=== AgentCompany Status ===" -ForegroundColor Cyan
Write-Host ""

# Ollama
Write-Host "[Ollama]"
try {
    $null = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -TimeoutSec 2 -ErrorAction Stop
    Write-Host "  ✓ Running (http://localhost:11434)" -ForegroundColor Green
    # モデル一覧
    $tags = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -TimeoutSec 2
    if ($tags.models -and $tags.models.Count -gt 0) {
        $modelNames = ($tags.models | ForEach-Object { $_.name }) -join ", "
        Write-Host "    モデル: $modelNames" -ForegroundColor Gray
    }
} catch {
    Write-Host "  ✗ Not running" -ForegroundColor Red
}

Write-Host ""

# Orchestrator Server
Write-Host "[Orchestrator Server]"
try {
    $null = Invoke-RestMethod -Uri "http://localhost:3001/api/health" -TimeoutSec 2 -ErrorAction Stop
    Write-Host "  ✓ Running (http://localhost:3001)" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Not running" -ForegroundColor Red
}

Write-Host ""

# GUI
Write-Host "[GUI]"
try {
    $null = Invoke-WebRequest -Uri "http://localhost:3000" -TimeoutSec 2 -ErrorAction Stop -UseBasicParsing
    Write-Host "  ✓ Running (http://localhost:3000)" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Not running" -ForegroundColor Red
}

Write-Host ""
