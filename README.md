# TraceGrid — Investigation Operations Dashboard

TraceGrid is an independent, prototype investigation operations workspace designed to coordinate case management, operational tasks, leads and sightings, evidence items, and geospatial search hypotheses in a unified, audit-logged environment.

---

## 1. Project Overview

- **Independent Repository:** Located at `C:\Users\gagan\TraceGrid` (sibling of `NexuxEdu`). Does not share code, services, dependencies, or databases with any other project.
- **Architecture:** Modular Monolith using npm workspaces (`apps/web` and `apps/api`).
- **Core Stacks:**
  - **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Lucide React, React Router DOM.
  - **Backend:** Node.js (v24), Express, TypeScript, Zod schema validation, Helmet security headers.
  - **Database:** PostgreSQL (Docker container on `127.0.0.1:5432`) with Prisma ORM.

---

## 2. Windows Quickstart Guide

### Prerequisites
- Node.js (v20+ or v24+ recommended; tested on v24.18.0)
- npm (v10+ or v12+ recommended; tested on v12.0.1)
- Docker Desktop (for isolated PostgreSQL container)
- Windows PowerShell or cmd

### Installation & Database Setup
From the root repository directory (`C:\Users\gagan\TraceGrid`):

```powershell
# 1. Install all dependencies across the monorepo workspace
npm install

# 2. Setup local environment files
Copy-Item .env.example .env
Copy-Item .env.example apps\api\.env

# 3. Start isolated PostgreSQL database in Docker
npm run db:up

# 4. Apply Prisma migrations and generate Prisma Client
npm run db:migrate

# 5. Seed deterministic synthetic dataset (35 cases, 124 leads, 71 tasks)
npm run db:seed

# 6. Run database integrity and constraint verification suite
npm run test:db
```

### Running the Services

You can start the frontend and backend services independently or concurrently:

#### Option A: Independent Terminals (Recommended for development)

**Terminal 1 — Backend API Server (Port 5000):**
```powershell
npm run dev:api
```
Health endpoint: [http://localhost:5000/api/health](http://localhost:5000/api/health)

**Terminal 2 — Frontend Web Client (Port 5173):**
```powershell
npm run dev:web
```
Web Application: [http://localhost:5173](http://localhost:5173)

#### Option B: Build Verification
```powershell
# Compile and bundle both web and api packages
npm run build
```

#### Option C: Automated Verification Scripts
```powershell
# Verify backend API availability and health metrics
npm run test:health

# Verify PostgreSQL schema, invariants, and KPI consistency
npm run test:db

# Run full checkpoint verification suites
npm run test:checkpoint7c
```

### Staging Deployment & Containerization
For complete staging environment orchestration, Docker Compose stacks, container builds, environment configuration, migration policies, and smoke testing checklists, refer to the [Staging & Deployment Guide](file:///C:/Users/gagan/TraceGrid/docs/DEPLOYMENT.md).

```powershell
# Deploy staging stack with isolated network, non-conflicting ports, and volumes
docker compose -f docker-compose.staging.yml up -d --build

# Run database migrations non-destructively in staging
npm run db:deploy
```

---

## 3. Directory Structure

```
TraceGrid/
├── apps/
│   ├── web/                         # React + Vite frontend client
│   │   ├── src/
│   │   │   ├── app/                 # Application root & routing
│   │   │   ├── components/          # Navigation, layout, UI primitives
│   │   │   ├── features/            # Cases, leads, tasks, evidence, geospatial, analytics
│   │   │   ├── lib/                 # Typed API client & auth session handling
│   │   │   └── styles/              # Tailwind CSS styles
│   │   ├── Dockerfile               # Multi-stage production/staging build (Nginx unprivileged)
│   │   ├── nginx.conf               # Security headers, SPA fallback, /api/ reverse proxy
│   │   └── package.json
│   └── api/                         # Express + TypeScript REST API
│       ├── src/
│       │   ├── config/              # Strict environment configuration (staging/prod safeguards)
│       │   ├── database/            # Prisma client singleton (src/database/prisma.ts)
│       │   ├── middleware/          # JWT auth, RBAC, jurisdiction scoping, error & log middleware
│       │   ├── modules/             # Health, auth, cases, leads, tasks, evidence, geo, analytics
│       │   ├── utils/               # Structured logging, token blacklist, audit log helper
│       │   ├── app.ts               # Express configuration, rate limiting, helmet, 1MB payload limits
│       │   └── server.ts            # Fast-failing startup check & graceful shutdown
│       ├── prisma/
│       │   ├── schema.prisma        # Canonical Prisma schema (13 models, token blacklist, audit)
│       │   ├── migrations/          # Version-controlled migrations
│       │   └── seed.ts              # Deterministic synthetic seeder (35 cases, 183 leads, 127 tasks)
│       ├── Dockerfile               # Multi-stage build, Node 22 LTS Alpine, unprivileged node user
│       └── package.json
├── docs/                            # Architecture, operations, and checkpoint records
│   ├── ARCHITECTURE.md              # Subsystem architecture & component diagram
│   ├── DATA_MODEL.md                # Canonical data model & state machines
│   ├── API_CONTRACTS.md             # /api/v1 REST endpoints catalog
│   ├── SECURITY.md                  # RBAC matrix, storage & geospatial contracts
│   ├── OPERATIONS.md                # Runbooks for backups, token revocation, logging, troubleshooting
│   ├── DEPLOYMENT.md                # Staging deployment guide, security guidelines, smoke tests
│   └── CHECKPOINTS.md               # Progressive checkpoint roadmap & status
├── scripts/
│   ├── backup-database.ps1          # Automated PostgreSQL backup script (PowerShell)
│   ├── backup-database.sh           # Automated PostgreSQL backup script (Bash)
│   ├── verify-backup-restore.ts     # Backup archive validation & dry-run test
│   ├── test-checkpoint3b.ts         # Checkpoint 3B authentication & case registry tests
│   ├── test-checkpoint4a.ts         # Checkpoint 4A backend workflow test suite
│   ├── test-checkpoint4b.ts         # Checkpoint 4B frontend operational workflow test suite
│   ├── test-checkpoint5a.ts         # Checkpoint 5A geospatial backend test suite
│   ├── test-checkpoint5b.ts         # Checkpoint 5B geospatial frontend test suite
│   ├── test-checkpoint6a.ts         # Checkpoint 6A cross-case pattern analysis test suite
│   ├── test-checkpoint6b.ts         # Checkpoint 6B operations analytics & reporting test suite
│   ├── test-checkpoint6c.ts         # Checkpoint 6C operations dashboard & CSV export test suite
│   ├── test-checkpoint7a.ts         # Checkpoint 7A security & privacy audit test suite
│   ├── test-checkpoint7b.ts         # Checkpoint 7B reliability & performance hardening test suite
│   ├── test-checkpoint7c.ts         # Checkpoint 7C staging deployment readiness test suite
│   ├── verify-database.ts           # Database integrity and invariant test suite
│   └── verify-health.js             # Basic API availability ping script
├── docker-compose.yml               # Local development PostgreSQL service (localhost:5432)
├── docker-compose.staging.yml       # Staging stack (isolated network, non-conflicting ports 5433/8080)
├── .env.example                     # Environment template with strict separation of server/client vars
├── .gitignore                       # Ignore rules for node_modules, dist, .env, backups/
├── package.json                     # Monorepo root manifest
└── README.md
```

---

## 4. Current Status: Checkpoint 7C Completed

- [x] **Checkpoint 0:** Independent repository initialized, monorepo skeleton, build and health check verified.
- [x] **Checkpoint 1:** Canonical data model (13 entities), REST API contracts (`/api/v1`), state machines, and security matrix formalized.
- [x] **Checkpoint 2:** Isolated PostgreSQL container configured via Docker Compose, canonical Prisma schema implemented, synthetic seeder populated, and 21 automated database integrity tests passing.
- [x] **Checkpoint 3A & 3B:** Authentication, RBAC, jurisdiction-scoped access control, case register, case creation, and case workspace frontend.
- [x] **Checkpoint 4A & 4B:** Operational workflows for leads/sightings, investigation tasks, evidence chain-of-custody, private attachments, and audit history.
- [x] **Checkpoint 5A & 5B:** Geospatial intelligence backend and interactive Leaflet map frontend with speed-of-travel contradictions, candidate search zones, and hypothesis generation.
- [x] **Checkpoint 6A, 6B & 6C:** Cross-case pattern analysis, operational reporting, CSV download with formula injection prevention, and operations overview dashboard.
- [x] **Checkpoint 7A:** Comprehensive security & privacy audit, constant-time comparisons, token revocation, strict ID validation, and path traversal defenses.
- [x] **Checkpoint 7B:** Reliability hardening, database backup/restore procedures, structured JSON logging, and frontend bundle chunking optimization.
- [x] **Checkpoint 7C:** Deployment readiness, multi-stage unprivileged Docker containers, Nginx reverse proxy, staging compose orchestration, strict staging/production environment safeguards, and deployment documentation.
