# TraceGrid — Operational Runbook & Reliability Guide

## 1. Overview & Operational Principles

TraceGrid is an investigation operations prototype designed for law-enforcement and investigative decision support.
This document details standard operational procedures for database backups, disaster recovery, token revocation persistence, monitoring, and horizontal scaling considerations.

---

## 2. PostgreSQL Backup & Disaster Recovery

### 2.1 Database & Container Identification
TraceGrid runs an isolated PostgreSQL 16 container via Docker Compose:
- **Container Name:** `tracegrid_postgres` (or as defined by `$TRACEGRID_PG_CONTAINER`)
- **Default Database:** `tracegrid_db` (configured via `POSTGRES_DB` in `.env`)
- **Database User:** `tracegrid_user` (configured via `POSTGRES_USER` in `.env`)
- **Container Port:** `127.0.0.1:5432` (strictly bound to localhost)

### 2.2 Docker Volume vs. Independent Backup
> [!IMPORTANT]
> A Docker Volume (`tracegrid_pgdata`) is **persistent storage**, NOT a backup.
> While a Docker volume survives container restarts and recreations (`docker compose down && docker compose up -d`), it remains vulnerable to host filesystem corruption, accidental volume pruning (`docker volume prune`), disk failure, or catastrophic administrator error.
> 
> Production backups **must** be extracted out of the container and stored independently (e.g. encrypted off-site cloud storage, network-attached storage, or dedicated archival volumes) with immutable retention policies.

### 2.3 Performing a Consistent Backup

#### Option A: Automated Script (Recommended)
- **Linux / macOS (Bash):**
  ```bash
  chmod +x scripts/backup-database.sh
  ./scripts/backup-database.sh
  ```
- **Windows (PowerShell):**
  ```powershell
  .\scripts\backup-database.ps1
  ```

#### Option B: Manual Command (Standard PostgreSQL Tooling)
Execute `pg_dump` directly inside the container to avoid network stream corruption:
```bash
# 1. Create compressed custom archive inside container
docker exec tracegrid_postgres pg_dump -U tracegrid_user -d tracegrid_db --format=custom --file=/tmp/tracegrid_backup.dump

# 2. Extract the archive to host backup directory
docker cp tracegrid_postgres:/tmp/tracegrid_backup.dump ./backups/tracegrid_db_$(date +%Y%m%d_%H%M%S).dump

# 3. Clean up the container temporary file
docker exec tracegrid_postgres rm -f /tmp/tracegrid_backup.dump
```

*Credential Safety:* Notice that no password is passed on the command line or stored in shell history. `docker exec` leverages PostgreSQL's internal trust/peer authentication within the container boundary.

### 2.4 Restoration Procedure

#### Step 1: Verification of Target Database
Never restore directly over an active database without a verified snapshot. When recovering from disaster or restoring to a new database instance:

```bash
# 1. Ensure target database exists
docker exec tracegrid_postgres psql -U tracegrid_user -d postgres -c "CREATE DATABASE tracegrid_db;"

# 2. Transfer the backup file into the container
docker cp ./backups/tracegrid_db_20261021_000000.dump tracegrid_postgres:/tmp/restore.dump

# 3. Restore the schema, constraints, and data
docker exec tracegrid_postgres pg_restore -U tracegrid_user -d tracegrid_db --clean --if-exists --no-owner --no-acl /tmp/restore.dump

# 4. Clean up temporary container file
docker exec tracegrid_postgres rm -f /tmp/restore.dump
```

### 2.5 Automated Backup & Restore Verification
TraceGrid includes an automated test script that verifies the full backup and restore lifecycle without modifying the active working database:
```bash
npx tsx scripts/verify-backup-restore.ts
```
This script dumps the live database, provisions a temporary disposable database (`tracegrid_restore_test`), restores the dump, verifies that all 13 core entities and foreign key graphs match 1:1, and cleans up the disposable database.

---

## 3. Token Revocation Store & Multi-Instance Architecture

### 3.1 Single-Node Persistence Implementation
TraceGrid uses stateless JWTs with explicit server-side logout enforcement. When an investigator logs out, the token is recorded in `TokenRevocationStore`.
- **In-Memory Cache:** Revoked tokens are held in a `Map<string, RevokedTokenEntry>` for zero-latency authentication verification.
- **Atomic Disk Persistence:** The store persists active revocations to `<projectRoot>/storage/revoked_tokens.json` using an atomic write pattern (writing to `.tmp.<id>` before `renameSync`) to prevent file corruption during sudden power loss.
- **Fail-Safe Invariant:** If `storage/revoked_tokens.json` is corrupted or unreadable, the store enters fail-safe mode (`isCorrupted = true`). Any authentication attempt using `isRevoked()` throws an HTTP 503 error, preventing revoked tokens from silently becoming valid.
- **Pruning:** Expired entries are pruned automatically upon logout or startup.

### 3.2 Single-Node Limitations & Multi-Node Cluster Scaling
> [!WARNING]
> The current JSON file-based revocation store and in-memory IP rate limiter are strictly designed for **single-instance** deployments.
> 
> In a horizontally scaled production deployment with multiple API containers behind a load balancer (e.g. AWS ECS, Kubernetes, Nginx):
> 1. Each node maintains its own local filesystem and memory; token revocation on Node A will not immediately propagate to Node B.
> 2. Rate limiting counters on Node A will not track attempts reaching Node B.
> 
> **Production Migration Requirement:**
> When deploying TraceGrid in a multi-instance cluster, replace `TokenRevocationStore` and `rateLimiter` with a distributed **Redis** or **KeyDB** cache:
> - Store revoked tokens as Redis keys with `EXPIREAT <jwt_exp_timestamp>`.
> - Store rate limiting buckets using atomic Redis sliding windows (`INCR` with `EXPIRE`).

---

## 4. Structured Operational Logging & Error Envelope

### 4.1 Request Correlation Tracking
Every incoming HTTP request is assigned a unique correlation ID via `requestIdMiddleware`:
- Header: `X-Request-Id` (propagated from upstream gateway or generated as UUIDv4).
- Injected into Express `req.id` and returned in all response headers.
- Included in all error responses and operational log entries.

### 4.2 Standard Error Envelope
All API errors return a standardized response structure:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR | RESOURCE_NOT_FOUND | CONFLICT_DUPLICATE_KEY | INTERNAL_SERVER_ERROR",
    "message": "Human-readable operational description",
    "details": null,
    "timestamp": "2026-10-21T00:55:00.000Z",
    "requestId": "d8e3b0a2-..."
  }
}
```
In production (`NODE_ENV=production`), database internals, Prisma codes, and internal stack traces are suppressed from client responses and logged solely to the server log stream.

---

## 5. Health Monitoring & Subsystems

Check operational status via `GET /api/health`:
```json
{
  "status": "ok",
  "service": "tracegrid-api",
  "version": "0.1.0",
  "environment": "development",
  "timestamp": "2026-10-21T00:55:00.000Z",
  "uptimeSeconds": 1420,
  "system": {
    "nodeVersion": "v24.18.0",
    "platform": "win32",
    "memoryRssMb": 74.2,
    "memoryHeapUsedMb": 18.5
  },
  "subsystems": {
    "tokenRevocation": "healthy",
    "database": "connected"
  }
}
```
If the token revocation store experiences file corruption or permission errors, `tokenRevocation` reports `"degraded"` and the endpoint returns HTTP 503.
