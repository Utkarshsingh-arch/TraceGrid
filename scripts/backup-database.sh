#!/usr/bin/env bash
# ==============================================================================
# TraceGrid PostgreSQL Safe Database Backup Script
# Creates a consistent custom-format pg_dump archive without credential leakage.
#
# Requirements:
# - Docker engine running container: tracegrid_postgres
# - PostgreSQL user and database (defaults to tracegrid_user / tracegrid_db)
# ==============================================================================

set -euo pipefail

CONTAINER_NAME="${TRACEGRID_PG_CONTAINER:-tracegrid_postgres}"
DB_USER="${POSTGRES_USER:-tracegrid_user}"
DB_NAME="${POSTGRES_DB:-tracegrid_db}"
BACKUP_DIR="${TRACEGRID_BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/tracegrid_${DB_NAME}_${TIMESTAMP}.dump"

echo "===================================================="
echo "  TraceGrid Database Backup Procedure"
echo "  Container: ${CONTAINER_NAME}"
echo "  Database:  ${DB_NAME}"
echo "  Target:    ${BACKUP_FILE}"
echo "===================================================="

# Ensure local backup directory exists
mkdir -p "${BACKUP_DIR}"

# 1. Execute dump inside the container to avoid network streaming errors
CONTAINER_TEMP="/tmp/tracegrid_backup_${TIMESTAMP}.dump"
echo "[1/3] Generating consistent pg_dump archive in container..."
docker exec "${CONTAINER_NAME}" pg_dump \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  --format=custom \
  --file="${CONTAINER_TEMP}"

# 2. Copy the binary archive to host backup directory
echo "[2/3] Transferring archive to host storage..."
docker cp "${CONTAINER_NAME}:${CONTAINER_TEMP}" "${BACKUP_FILE}"

# 3. Clean up container temporary dump
echo "[3/3] Cleaning up container temporary archive..."
docker exec "${CONTAINER_NAME}" rm -f "${CONTAINER_TEMP}"

# Verify backup existence and file size
if [ -f "${BACKUP_FILE}" ] && [ -s "${BACKUP_FILE}" ]; then
  FILE_SIZE=$(wc -c <"${BACKUP_FILE}")
  echo "✅ Backup completed successfully!"
  echo "   File: ${BACKUP_FILE}"
  echo "   Size: ${FILE_SIZE} bytes"
else
  echo "❌ Error: Backup file is empty or was not created." >&2
  exit 1
fi
