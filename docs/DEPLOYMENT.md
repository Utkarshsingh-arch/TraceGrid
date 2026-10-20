# TraceGrid — Staging & Production Deployment Runbook

## 1. Architectural Topology & Overview

TraceGrid is an independent investigation operations prototype built with:
- **Web Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Leaflet mapping.
- **Backend API:** Express, TypeScript, Zod schema validation, Helmet security headers.
- **Database:** PostgreSQL 16 managed via Prisma ORM with parameterized queries.
- **Reverse Proxy / Ingress:** Nginx unprivileged container providing static asset delivery, SPA routing fallback, security headers, and upstream `/api` forwarding.
- **Private Storage:** Decoupled filesystem volume for binary evidence attachments and persistent JWT revocation state.

```
                     +---------------------------------------+
                     |         Client Browser / TLS          |
                     +---------------------------------------+
                                         |
                                         v
                     +---------------------------------------+
                     |         Nginx Reverse Proxy           |
                     |         (Port 8080 / 443)             |
                     +---------------------------------------+
                            /                         \
            (Static SPA Assets)                 (/api Reverse Proxy)
                           v                             v
           +-----------------------------+   +-----------------------------+
           | TraceGrid Web (Nginx HTML)  |   | TraceGrid API (Node.js 22)  |
           | /usr/share/nginx/html       |   | Port 5000 (Internal)        |
           +-----------------------------+   +-----------------------------+
                                                            |
                                             (Prisma / Parameterized SQL)
                                                            v
                                             +-----------------------------+
                                             | PostgreSQL 16 Database      |
                                             | Port 5432 (Internal only)   |
                                             +-----------------------------+
                                                            |
                                             (Named Persistent Volume)
                                                            v
                                             +-----------------------------+
                                             | tracegrid_staging_pgdata    |
                                             +-----------------------------+
```

---

## 2. Prerequisites & Software Requirements

- **Operating System:** Linux (Ubuntu 22.04 LTS recommended for remote hosts) or Windows 11 with Docker Desktop.
- **Docker Engine:** Version 24.0+ and Docker Compose v2.20+.
- **Node.js:** v20.x or v22.x LTS (for local administration, builds, or running test suites).
- **Package Manager:** npm v10.x.

---

## 3. Environment Isolation: Development vs. Staging

To strictly protect ongoing development and avoid any cross-environment data corruption, TraceGrid provides separate, fully isolated container definitions:

| Configuration Item | Local Development | Isolated Staging Environment |
| :--- | :--- | :--- |
| **Compose File** | `docker-compose.yml` | `docker-compose.staging.yml` |
| **Database Container** | `tracegrid_postgres` | `tracegrid_staging_postgres` |
| **PostgreSQL Port** | `127.0.0.1:5432` | `127.0.0.1:5433` (isolated port) |
| **Database Name** | `tracegrid_db` | `tracegrid_staging_db` |
| **Database Volume** | `tracegrid_pgdata` | `tracegrid_staging_pgdata` |
| **Storage Volume** | Local `./storage` directory | `tracegrid_staging_storage` volume |
| **Web Service Port** | `5173` (Vite dev server) | `8080` (Nginx container + API proxy) |
| **Network** | Default bridge | `tracegrid_staging_net` |
| **Working DB Impact** | Active working database | **Zero impact (Completely isolated)** |

---

## 4. Environment Configuration & Secret Management

### 4.1 Server-Side vs. Client-Side Variables
TraceGrid strictly segregates server-side secrets from client-side parameters:

| Variable | Scope | Purpose | Staging / Production Rule |
| :--- | :---: | :--- | :--- |
| `NODE_ENV` | Server | Runtime environment mode | Must be `staging` or `production`. |
| `PORT` | Server | Internal HTTP listener port | Default `5000`. |
| `DATABASE_URL` | Server | PostgreSQL connection string | Must specify staging database credentials. |
| `JWT_SECRET` | Server | Cryptographic JWT signing key | **Mandatory:** Minimum 32 characters; default keys rejected. |
| `JWT_EXPIRES_IN` | Server | Token lifetime | Default `8h`. |
| `CORS_ORIGIN` | Server | Allowed CORS browser origins | Set to the exact staging domain (e.g. `http://localhost:8080`). |
| `TRUST_PROXY` | Server | Reverse proxy trust header mode | Set to `true` when behind Nginx / ALB. |
| `STORAGE_LOCAL_PATH` | Server | Attachment file directory | Path inside container (`/app/storage/evidence`). |
| `STORAGE_REVOCATION_PATH` | Server | Revoked token persistence file | Path inside container (`/app/storage/revoked_tokens.json`). |
| `MAX_FILE_SIZE_BYTES` | Server | Attachment size ceiling | Default `10485760` (10 MB). |
| `VITE_API_BASE_URL` | Client | Frontend API endpoint path | Default `/api` (uses relative path via Nginx proxy). |

### 4.2 Secure Secret Generation
Generate a cryptographically secure JWT secret before launching staging:
```bash
openssl rand -hex 32
```
Example valid secret format: `7f9b8c3d1e2a4f6b8c0d2e4f6a8b0c2d4e6f8a0b2c4d6e8f0a2b4c6d8e0f2a4b`

---

## 5. Staging Database Initialisation & Migrations

### 5.1 The Golden Rule of Deployment Migrations
> [!CAUTION]
> **NEVER** run `prisma migrate dev` or `prisma migrate reset` in staging or production.
> - `prisma migrate reset` drops all tables and permanently destroys data.
> - `prisma migrate dev` attempts to create new schema migrations interactively.
> 
> Always execute `prisma migrate deploy` (or `npm run db:deploy`).

### 5.2 Initialising a Fresh Staging Database
1. Launch the staging PostgreSQL container:
   ```bash
   docker compose -f docker-compose.staging.yml up -d postgres
   ```
2. Wait for PostgreSQL health check to report healthy:
   ```bash
   docker compose -f docker-compose.staging.yml ps
   ```
3. Apply all committed Prisma migrations:
   ```bash
   # Using root npm script targeting staging DATABASE_URL
   DATABASE_URL="postgresql://tracegrid_staging_user:tracegrid_staging_password_secure123@127.0.0.1:5433/tracegrid_staging_db?schema=public" npm run db:deploy
   ```
4. Optional: Populate initial synthetic dataset for staging manual evaluation:
   ```bash
   DATABASE_URL="postgresql://tracegrid_staging_user:tracegrid_staging_password_secure123@127.0.0.1:5433/tracegrid_staging_db?schema=public" npm run db:seed
   ```

---

## 6. Container Orchestration & Startup

### 6.1 Building and Starting Staging Containers
Launch the complete isolated staging stack:
```bash
docker compose -f docker-compose.staging.yml up -d --build
```

### 6.2 Verifying Service Health
Inspect container status and health checks:
```bash
docker compose -f docker-compose.staging.yml ps
```
Expected output:
- `tracegrid_staging_postgres`: Up (healthy)
- `tracegrid_staging_api`: Up (healthy)
- `tracegrid_staging_web`: Up (healthy)

### 6.3 Checking Container Logs
Follow aggregated operational logs with correlation tracking:
```bash
# View API service logs
docker compose -f docker-compose.staging.yml logs -f api

# View Web reverse-proxy logs
docker compose -f docker-compose.staging.yml logs -f web
```

---

## 7. HTTPS Termination & Network Boundaries

### 7.1 Staging Reverse Proxy (Nginx)
The included `apps/web/nginx.conf` handles:
- **Port 8080:** Non-root HTTP listener (mapped to `127.0.0.1:8080` on host).
- **Security Headers:** Enforces `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.
- **API Forwarding:** Passes `/api/*` directly to `http://api:5000/api/*` while preserving `X-Request-Id`, `X-Forwarded-For`, and client IP.
- **Upload Limit:** Configured with `client_max_body_size 12M` to accommodate 10 MB evidence attachments.

### 7.2 Remote Staging & Production HTTPS (TLS)
For any deployment accessible over an external or corporate network:
1. Terminate TLS at an ingress load balancer (AWS ALB, Cloudflare, Traefik) or upstream Nginx gateway.
2. Obtain a valid certificate using Let's Encrypt (Certbot) or organizational PKI:
   ```bash
   certbot certonly --standalone -d staging.tracegrid.example.com
   ```
3. Forward HTTPS traffic to the internal Nginx container port `8080` with header:
   ```nginx
   proxy_set_header X-Forwarded-Proto https;
   ```
4. Confirm `TRUST_PROXY=true` is set in the API environment so Express accurately recognizes secure HTTPS requests.

---

## 8. Staging Smoke Test Verification Checklist

Before inviting investigative personnel or evaluators to test staging, perform this 8-step smoke test:

| # | Workflow / Feature | Verification Method | Expected Outcome |
| :---: | :--- | :--- | :--- |
| **1** | **API Health** | `curl -f http://127.0.0.1:8080/api/health` | HTTP 200 OK, `status: "ok"`, `subsystems.tokenRevocation: "healthy"`. |
| **2** | **SPA Loading** | Visit `http://127.0.0.1:8080/` in browser | Case Register loads with layout and navigation navbar. |
| **3** | **Authentication** | Log in with `officer.sharma@tracegrid.local` / `Password123!` | Successfully authenticates, receives JWT, displays officer persona. |
| **4** | **RBAC Boundary** | Log in as `clerk.verma@tracegrid.local`, try to change case state | Button is hidden or returns HTTP 403 Forbidden. |
| **5** | **Case Workspace & Map** | Open case `CAS-2026-0001` -> Map tab | Leaflet map renders with location observations and candidate search zones. |
| **6** | **Evidence Attachment** | Upload sample image file to evidence item | Upload succeeds (HTTP 201), SHA-256 generated, authenticated download streams file. |
| **7** | **Operations Dashboard** | Visit `/operations` tab | Caseload KPIs, state distribution, task backlog, and trends render accurately. |
| **8** | **Pattern Review & Export**| Visit `/patterns` and `/reports` tabs | Pattern associations display; CSV report downloads with RFC-4180 escaping. |

---

## 9. Graceful Shutdown & Maintenance

### Stopping Staging without Data Loss
To stop staging containers while preserving all persistent database records and uploaded files:
```bash
docker compose -f docker-compose.staging.yml down
```
*Note:* This leaves `tracegrid_staging_pgdata` and `tracegrid_staging_storage` volumes intact.

### Completely Tearing Down Staging
To destroy the isolated staging environment including all staging data:
```bash
docker compose -f docker-compose.staging.yml down -v
```
*(This will NEVER touch the development `tracegrid_pgdata` volume).*
