# ==============================================================================
# TraceGrid PostgreSQL Safe Database Backup Script (PowerShell)
# Creates a consistent custom-format pg_dump archive without credential leakage.
# ==============================================================================

[CmdletBinding()]
param(
  [string]$ContainerName = $(if ($env:TRACEGRID_PG_CONTAINER) { $env:TRACEGRID_PG_CONTAINER } else { "tracegrid_postgres" }),
  [string]$DbUser = $(if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "tracegrid_user" }),
  [string]$DbName = $(if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { "tracegrid_db" }),
  [string]$BackupDir = $(if ($env:TRACEGRID_BACKUP_DIR) { $env:TRACEGRID_BACKUP_DIR } else { ".\backups" })
)

$ErrorActionPreference = "Stop"
$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$BackupFile = Join-Path $BackupDir "tracegrid_${DbName}_${Timestamp}.dump"
$ContainerTemp = "/tmp/tracegrid_backup_${Timestamp}.dump"

Write-Host "===================================================="
Write-Host "  TraceGrid Database Backup Procedure (PowerShell)"
Write-Host "  Container: $ContainerName"
Write-Host "  Database:  $DbName"
Write-Host "  Target:    $BackupFile"
Write-Host "===================================================="

if (-not (Test-Path $BackupDir)) {
  New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

Write-Host "[1/3] Generating pg_dump archive inside container..."
docker exec $ContainerName pg_dump -U $DbUser -d $DbName --format=custom --file=$ContainerTemp
if ($LASTEXITCODE -ne 0) {
  Write-Error "pg_dump failed inside container $ContainerName"
}

Write-Host "[2/3] Transferring archive from container to host..."
docker cp "${ContainerName}:${ContainerTemp}" $BackupFile
if ($LASTEXITCODE -ne 0) {
  Write-Error "docker cp failed to copy backup archive"
}

Write-Host "[3/3] Removing container temporary file..."
docker exec $ContainerName rm -f $ContainerTemp

if (Test-Path $BackupFile) {
  $fileInfo = Get-Item $BackupFile
  if ($fileInfo.Length -gt 0) {
    Write-Host "✅ Backup completed successfully!" -ForegroundColor Green
    Write-Host "   File: $($fileInfo.FullName)"
    Write-Host "   Size: $($fileInfo.Length) bytes"
  } else {
    Write-Error "Backup file exists but is 0 bytes."
  }
} else {
  Write-Error "Backup file was not created."
}
