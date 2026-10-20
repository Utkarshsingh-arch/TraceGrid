# TraceGrid — Security Architecture, RBAC & Service Contracts

## 1. Role-Based Access Control (RBAC) Permissions Matrix

TraceGrid defines five configurable prototype roles. Authorisation is enforced strictly on the server by the API router and domain service layers.

### 1.1 Prototype Roles
- **`CASE_OFFICER`:** Frontline investigator responsible for gathering facts, interviewing witnesses, vetting leads, completing assigned tasks, and uploading evidence.
- **`SUPERVISOR`:** Investigative leader responsible for triage, case state transitions, assigning officers, approving case closures, and monitoring overdue actions.
- **`DATA_CLERK`:** Operational support staff authorized to lodge new cases and ingest citizen tips/leads.
- **`SYSTEM_ADMIN`:** Platform administrator managing user provisioning, system configuration, jurisdictions, and auditing.
- **`READ_ONLY_REVIEWER`:** External auditor, inspector, or legal reviewer with read-only visibility into cases and aggregate reports.

---

### 1.2 Permissions Matrix

| Domain Operation | `CASE_OFFICER` | `SUPERVISOR` | `DATA_CLERK` | `SYSTEM_ADMIN` | `READ_ONLY_REVIEWER` |
|---|:---:|:---:|:---:|:---:|:---:|
| **Cases: Register / Create** | Allowed | Allowed | Allowed | Allowed | Denied |
| **Cases: View Scoped Case List** | Allowed | Allowed | Allowed | Allowed | Allowed |
| **Cases: View Full Workspace** | Allowed | Allowed | Denied | Allowed | Allowed |
| **Cases: Update Metadata** | Allowed (Assigned) | Allowed | Denied | Allowed | Denied |
| **Cases: State Transitions (Open/Close)**| Denied | Allowed | Denied | Allowed | Denied |
| **Cases: Reopen Closed Case** | Denied | Allowed | Denied | Allowed | Denied |
| **Cases: Update Tracing Outcome** | Allowed | Allowed | Denied | Allowed | Denied |
| **Assignments: Assign / Reassign Officer**| Denied | Allowed | Denied | Allowed | Denied |
| **Leads: Ingest / Log Tip** | Allowed | Allowed | Allowed | Allowed | Denied |
| **Leads: Assign Investigator** | Denied | Allowed | Denied | Allowed | Denied |
| **Leads: Record Outcome (Verify/Disprove)**| Allowed | Allowed | Denied | Allowed | Denied |
| **Tasks: Create Task** | Allowed | Allowed | Denied | Allowed | Denied |
| **Tasks: Assign / Reassign** | Allowed (Scoped) | Allowed | Denied | Allowed | Denied |
| **Tasks: Execute & Complete** | Allowed (Owner) | Allowed | Denied | Allowed | Denied |
| **Tasks: Cancel Task** | Allowed (Scoped) | Allowed | Denied | Allowed | Denied |
| **Evidence: Log Metadata** | Allowed | Allowed | Denied | Allowed | Denied |
| **Evidence: Upload Attachment** | Allowed | Allowed | Denied | Allowed | Denied |
| **Evidence: Stream Regular Files** | Allowed | Allowed | Denied | Allowed | Allowed |
| **Evidence: Stream CONFIDENTIAL Files** | Denied (Need Clearance)| Allowed | Denied | Allowed | Denied |
| **Geospatial: View Map & Observations** | Allowed | Allowed | Denied | Allowed | Allowed |
| **Geospatial: Log Location Observation**| Allowed | Allowed | Denied | Allowed | Denied |
| **Geospatial: Generate Search Hypothesis**| Allowed | Allowed | Denied | Allowed | Denied |
| **Patterns: Analyze Cross-Case Patterns** | Allowed | Allowed | Denied | Allowed | Allowed |
| **Patterns: Record Review Decision** | Allowed | Allowed | Denied | Allowed | Denied |
| **Reports: View Operations Dashboard**| Allowed | Allowed | Allowed | Allowed | Allowed |
| **Reports: View Caseload Reports** | Allowed | Allowed | Denied | Allowed | Allowed |
| **Admin: Manage Users & Accounts** | Denied | Denied | Denied | Allowed | Denied |
| **Admin: Manage Jurisdictions** | Denied | Denied | Denied | Allowed | Denied |
| **Audit: Query Audit Logs** | Denied | Allowed (Scoped)| Denied | Allowed (Global)| Denied |

---

## 2. Jurisdiction Scoping Mechanism

1. **User Scoping:** Every user account (except global `SYSTEM_ADMIN`) is linked to a `jurisdiction_id`.
2. **Query Enforcement:** In all list, search, and dashboard queries, the API repository automatically injects a jurisdictional filter:
   ```sql
   WHERE jurisdiction_id = :authenticated_user_jurisdiction_id
   ```
3. **Mutation Guards:** When mutating an existing case, lead, task, or evidence record, the domain service verifies that the target case's `jurisdiction_id` matches the actor's scope.
4. **Cross-Jurisdiction Access:** If an investigation requires multi-agency cooperation, records remain governed by the primary registering jurisdiction, and supervisor override or reassignment is required.

---

## 3. Evidence Storage Provider Contract

Binary file storage is completely decoupled from relational metadata using the `StorageProvider` abstraction.

### 3.1 Interface Specification
```typescript
export interface StorageSaveResult {
  storageKey: string;      // Opaque UUIDv4 filename on disk
  fileSizeBytes: bigint;    // Validated file size
  sha256Checksum: string;  // Hex-encoded SHA-256 cryptographic digest
}

export interface StorageRetrievalResult {
  stream: NodeJS.ReadableStream;
  mimeType: string;
  fileSizeBytes: bigint;
}

export interface StorageProvider {
  /**
   * Validates and streams an uploaded file to secure local disk.
   */
  saveFile(
    fileStream: NodeJS.ReadableStream,
    metadata: { originalName: string; mimeType: string }
  ): Promise<StorageSaveResult>;

  /**
   * Retrieves an authorized file stream by opaque storage key.
   */
  getFileStream(storageKey: string): Promise<StorageRetrievalResult>;

  /**
   * Verifies whether an attachment file exists and is readable.
   */
  hasFile(storageKey: string): Promise<boolean>;

  /**
   * Securely purges file bytes according to data retention policy.
   */
  deleteFile(storageKey: string): Promise<boolean>;
}
```

### 3.2 Storage Security Rules
- **Opaque Storage Keys:** Files are saved on disk using purely random UUIDs (`storage/evidence/f47ac10b-58cc-4372-a567-0e02b2c3d479.dat`). Attackers cannot traverse directories or guess filenames.
- **Checksum Verification:** The SHA-256 hash is computed in-stream during upload and compared against the database record during integrity checks.
- **Access Gating:** Files are streamed strictly through `/api/v1/attachments/:id/content` after verifying authentication, jurisdiction access, and evidence clearance. Static file directory serving is disabled.
- **Upload Restrictions:** 
  - Maximum upload size: 10 MB (`MAX_FILE_SIZE_BYTES = 10485760`).
  - Allowed MIME types: `image/jpeg`, `image/png`, `application/pdf`, `video/mp4`. Executable formats (`.exe`, `.sh`, `.bat`) and script types (`.js`, `.html`) are strictly rejected.

---

## 4. Geospatial Analysis Contract & Decision-Support Principles

The geospatial engine is a **decision-support tool** that produces explainable search zone hypotheses. It is strictly forbidden from claiming definitive predictive certainty.

### 4.1 Interface Specification
```typescript
export interface LocationObservationDTO {
  id: string;
  latitude: number;
  longitude: number;
  uncertaintyMeters: number;
  observedAt: Date;
  observationType: string;
  sourceDescription: string;
}

export interface GeospatialHypothesisRequest {
  caseId: string;
  candidateObservationIds: string[];
  parameters: {
    assumedTravelMode: 'PEDESTRIAN' | 'VEHICULAR' | 'TRANSIT';
    maxSpeedKmh?: number;
    temporalDecayHours?: number;
  };
}

export interface GeospatialHypothesisResult {
  caseId: string;
  geometry: {
    type: 'Feature';
    geometry: {
      type: 'Polygon' | 'MultiPolygon';
      coordinates: number[][][] | number[][][][];
    };
    properties: Record<string, unknown>;
  };
  calculationMethod: string;
  assumptions: string[];
  includedObservationIds: string[];
  excludedObservations: Array<{ observationId: string; reason: string }>;
  uncertaintyRepresentation: string;
  limitationsWarning: string;
}
```

### 4.2 Geospatial Investigation Axioms
1. **Financial Clues ≠ Physical Presence:** A bank card transaction or POS terminal observation indicates account activity at a location, **not** verified physical presence of the missing person. The system must explicitly document this distinction in generated hypotheses.
2. **Cell Tower Radiuses are Approximate:** Synthetic mobile-network observations represent broad coverage sectors (often 500m to 3,000m radius), not precision GPS coordinates. The uncertainty radius must be visually rendered on the map.
3. **Search Zones are Hypotheses:** A generated search zone polygon is an investigative triage hypothesis intended to direct foot patrols or canvassing, not proof of location.
4. **Deterministic Math:** Calculations use deterministic geometric operations via Turf.js (bounding buffers, convex hulls, time-distance intersections).

---

## 5. Synthetic Dataset & Evaluation Design

TraceGrid uses a reproducible synthetic dataset for development, testing, and operational demonstrations.

### 5.1 Target Development Caseload
- **Cases:** 30–50 fictional missing-person investigations.
- **Leads & Sightings:** 100–200 fictional leads.
- **Tasks:** 50–100 operational tasks.
- **Evidence & Attachments:** 40–80 cataloged items.
- **Jurisdictions:** 4 distinct regional divisions (e.g., North Division, Central Zone, Eastern Metro, South Suburbs).

### 5.2 Real-World Edge Scenarios Included in Synthetic Data
1. **Incomplete Case Lodgement:** Cases reported with minimal initial details (missing birth dates or unclear last-seen timestamps) requiring triage.
2. **Duplicate Public Sightings:** Multiple independent citizen tips describing the exact same event at a railway terminal.
3. **Contradictory Observations:** Sighting A placing the subject downtown at 14:00, while synthetic telecom observation B places the phone 25 km away at 14:15.
4. **Stale Clues:** Sightings reported days after occurrence with high location uncertainty.
5. **Overdue Critical Tasks:** Time-sensitive CCTV canvassing tasks exceeding scheduled deadlines.
6. **Disproved Leads under Open Cases:** Leads investigated, disproved, and archived while parent investigation remains active and urgent.
7. **Located Awaiting Verification:** Subject located at a community facility but awaiting formal identity verification by family/officers.
8. **Case Closure and Authorised Reopening:** Case closed upon false identification, then reopened when authentic evidence surfaces.

### 5.3 Automated Verification of KPI Aggregations
All dashboard metrics must be provably verified by executing direct PostgreSQL count queries:
```sql
-- Open Cases Check
SELECT COUNT(*) FROM "InvestigationCase" WHERE "case_state" = 'OPEN';

-- Overdue Tasks Check
SELECT COUNT(*) FROM "InvestigationTask" 
WHERE "status" NOT IN ('COMPLETED', 'CANCELLED') AND "due_date" < NOW();

-- Unassigned Investigations Check
SELECT COUNT(*) FROM "InvestigationCase" c
WHERE NOT EXISTS (
  SELECT 1 FROM "CaseAssignment" a 
  WHERE a."case_id" = c."id" AND a."is_active" = true
);
```

---

## 6. Security and Validation Implementation Plan

1. **Credential Protection:** Passwords will be salted and hashed using Argon2id with strict computational cost parameters. Plaintext passwords are never logged or stored.
2. **Token Security:** JWT access tokens with short lifetimes (e.g. 8 hours) signed using HMAC-SHA256 with secrets configured via environment variables.
3. **Boundary Validation:** Every incoming request body and query parameter is parsed against strict Zod schemas before touching service logic.
4. **Parameterised Persistence:** Prisma ORM guarantees parameterised database queries, preventing SQL injection vulnerabilities.
5. **Audit Trail Immutability:** The `AuditLog` table will have no API routes for `UPDATE` or `DELETE`, and database triggers will be evaluated in future checkpoints to restrict manual tampering.
6. **Ethical Separation:** Explicit banner indicators in the UI confirming that all records, names, phone numbers, and coordinates are synthetic test data.

---

## 7. Token Revocation & Single-Node Storage Boundaries

### 7.1 Revocation Store Mechanics
TraceGrid enforces server-side logout for stateless JWTs via `TokenRevocationStore`.
- **Fast-Lookup Cache:** In-memory `Map<string, RevokedTokenEntry>` ensures zero-overhead authentication checks.
- **Atomic Disk Persistence:** Revoked tokens are persisted to `<projectRoot>/storage/revoked_tokens.json` using an atomic write pattern (writing to `.tmp.<id>` before atomic filesystem rename) to prevent file truncation or corruption during power loss.
- **Fail-Safe Integrity Invariant:** If `storage/revoked_tokens.json` is corrupted, unreadable, or modified with invalid syntax, the store enters fail-safe mode (`isCorrupted = true`). Any call to `isRevoked(token)` immediately fails closed by throwing an HTTP 503 error. Revoked tokens **never** silently become valid under failure conditions.
- **Pruning & Cleanup:** Expired revocation records are automatically pruned when their natural JWT `exp` timestamp has passed.

### 7.2 Single-Instance Deployment Limitation & Distributed Scaling
The JSON file store and in-memory rate limiter are single-instance primitives.
- **Current Limitation:** In a horizontally scaled cluster with multiple container replicas behind a load balancer, instances will not share local disk or in-memory state. A token revoked on Node 1 would not be known on Node 2 until tokens naturally expire.
- **Distributed Migration Requirement:** When scaling horizontally across multiple nodes, replace the local JSON store and in-memory rate limiter with a shared **Redis** or KeyDB cluster:
  - Revocations stored with `SETEX <token_hash> <remaining_seconds> "1"`.
  - Rate limiting using atomic Redis sliding windows.

---

## 8. Dependency Vulnerability Assessment & Exploitability Analysis

TraceGrid continuously audits its dependency graph using `npm audit`. The 12 identified advisories (4 moderate, 8 high) were evaluated for runtime exploitability:

| Package | Severity | Category | TraceGrid Exploitability Assessment |
| :--- | :---: | :--- | :--- |
| `react-router` / `react-router-dom` | Moderate | Runtime (Routing) | **Non-exploitable.** Advisories GHSA-wrjc-x8rr-h8h6 (open redirect via backslash) and GHSA-337j-9hxr-rhxg (SSR hydration deserialization) do not affect TraceGrid. TraceGrid is a client-side SPA (`<BrowserRouter>`) without SSR hydration, and all `<Link>` routes in `Navbar.tsx` are hardcoded internal paths (`/`, `/cases`, etc.). No user input reaches navigation targets. |
| `deepmerge-ts` / `@prisma/config` / `prisma` | High | Build / Dev Tooling | **Non-exploitable.** Stack exhaustion when merging recursive object graphs in config files. TraceGrid uses static Prisma schema and config files without dynamic user merging. |
| `tailwindcss` / `chokidar` / `micromatch` / `braces` / `postcss-selector-parser` | High / Mod | Build / Dev Tooling | **Non-exploitable at runtime.** These are build-time devDependencies used exclusively by Vite and PostCSS to compile Tailwind CSS v3 utility classes during development and `npm run build`. They never execute in production or process untrusted user input. |

### Major Version Breaking Change Policy
Running `npm audit fix --force` was explicitly rejected because it forces breaking framework migrations (`tailwindcss@4` and `react-router-dom@7`) that dismantle working application styling and routing. The advisories pose zero runtime risk in TraceGrid's architecture.

