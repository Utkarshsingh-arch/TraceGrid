# TraceGrid — Development Checkpoints Roadmap

Development progresses strictly through sequential checkpoints. Each checkpoint must be verified and approved before proceeding to the next.

| Checkpoint | Title | Scope & Deliverables | Status |
|---|---|---|---|
| **0** | **Repository Creation & Architecture Bootstrap** | Create independent Git repo `TraceGrid`, monorepo workspace skeleton (`apps/web`, `apps/api`), base configurations, TypeScript setup, Express health endpoint `/api/health`, minimal operational frontend UI, Windows startup verification. | **COMPLETED & VERIFIED** |
| **1** | **Data Model, API Contracts & System Design** | Formalize canonical entity models (13 entities), PostgreSQL/Prisma relational schema design, state machine transitions, REST API endpoints specification (`/api/v1`), RBAC permissions matrix (5 roles), private storage abstraction interface, geospatial analysis contract, and synthetic dataset evaluation design. | **COMPLETED & VERIFIED** |
| **2** | **Database, Prisma Schema & Synthetic Data** | Configure isolated PostgreSQL container via Docker Compose (localhost-only, named volume), canonical Prisma schema (`schema.prisma`), initial migration `init_tracegrid_schema`, deterministic synthetic seeder (35 cases, 124 leads, 71 tasks, 46 evidence records), and 21-point automated verification suite. | **COMPLETED & VERIFIED** |
| **3A**| **Auth, RBAC & Case Management API (Backend)** | Implement JWT authentication, actual token revocation on logout, role-based access control (5 roles), strict jurisdiction scoping, full case management API (`POST /cases`, `GET /cases`, `GET /cases/:id`, `PATCH /cases/:id`, `POST /cases/:id/transition-state`, `POST /cases/:id/reopen`, `POST /cases/:id/assignments`), closure task preconditions, atomic events/audit logging, and 34-point API automated test suite. | **COMPLETED & VERIFIED** |
| **3B**| **Frontend Case Management & Geospatial Prototype** | React Case Register with search/filters/pagination, Case Workspace aggregate view, state transition modal, assignment management, Leaflet geospatial visualization, deterministic search radius calculation, and demo role-switcher. | **COMPLETED & VERIFIED** |
| **4A**| **Leads, Evidence, Tasks & Audit (Backend)** | Backend operational workflows: lead lodgement and vetting (with invariant that disproving leads leaves parent case OPEN), task queue with dynamic overdue metrics, evidence cataloging with private attachment streaming and SHA-256 verification, and supervisory audit isolation. 55-point test suite. | **COMPLETED & VERIFIED** |
| **4B**| **Operational Workflows Frontend** | Frontend interactive tabs: Leads Ledger, Tasks Queue, Evidence Catalogue with private attachment viewer, Case Activity Timeline, Supervisory Audit Trail with tamper logs, and persona-driven action gates. 48-point test suite. | **COMPLETED & VERIFIED** |
| **5A**| **Geospatial Intelligence & Investigation Coordination Backend** | Multi-observation velocity contradiction analysis with spatial uncertainty subtraction and classification, analyst observation exclusion & reconsideration records (original records NEVER deleted), search-zone refinement with competing cluster alternate hypotheses, and automated task recommendations requiring human review. 64-point test suite. | **COMPLETED & VERIFIED** |
| **5B**| **Geospatial & Investigation Coordination Frontend** | Interactive map workspace enhancements: velocity contradiction overlays, visual observation exclusion/reconsideration controls, alternate hypothesis toggling, and investigation task recommendation review drawer. | **COMPLETED & VERIFIED** |
| **6A**| **Backend Cross-Case Pattern Analysis** | Secure, explainable pattern evaluation across authorized cases: recurring/nearby locations with uncertainty subtraction, temporal window overlaps, narrow landmark descriptor matching, multi-signal candidate associations, strict pre-query jurisdiction scoping, and audit-logged investigator review decisions. | **COMPLETED & VERIFIED** |
| **6B**| **Operations Analytics & Caseload Reporting** | System-wide performance and triage dashboard APIs, aggregate KPI metrics across jurisdictions, task queue backlog, cross-case pattern review queue, and RFC-4180 CSV reports. | **COMPLETED & VERIFIED** |
| **7A**| **Security & Privacy Audit** | Comprehensive security and privacy audit, persistent token revocation across restarts, login rate limiting, cross-jurisdiction assignee validation, path traversal defense, RFC 6266 headers, 79-point verification suite. | **COMPLETED & VERIFIED** |
| **7B**| **Reliability & Performance Hardening** | Disk-persisted atomic token revocation with corrupted fail-safe defense, isolated database backup & restore runbook + test suite, structured logging with correlation IDs, route-level frontend code splitting (entry chunk reduced >95%), dependency risk assessment, and 53-point verification suite. | **COMPLETED & VERIFIED** |
| **7C**| **Deployment Readiness & Staging Preparation** | Staging containerization (multi-stage Dockerfiles, unprivileged Nginx reverse proxy, isolated docker-compose.staging.yml), non-default secret enforcement, migration runbook, and 48-point verification suite. | **COMPLETED & VERIFIED** |

---

## Checkpoint 6C Completion Summary

- **Operations Overview Dashboard (`/operations`):**
  - KPI summary metric cards (Total accessible cases, active open, under review, closed, critical priority, open tasks, overdue tasks, unverified patterns).
  - Proportional lifecycle state partition bar and priority tier breakdown with zero drift from authoritative database state.
  - Task queue backlog metrics and assigned officer queue breakdown with unassigned open task monitoring.
  - Multi-window time-series trends (7D, 30D, 90D presets) with daily/weekly/monthly granularity and UTC timezone basis attribution.

- **Cross-Case Pattern Review Queue (`/patterns`):**
  - Deduplicated pattern triage table displaying canonical pattern IDs, primary signal category, review priority tier, associated case references, corroborating signal counts, and current review status.
  - Interactive multi-criteria filters: text search, review priority (`HIGH`, `MEDIUM`, `LOW`), category, and review status.
  - Prominent mandatory decision-support disclaimer emphasizing non-identity, non-causation, and mandatory human verification.

- **Pattern Detail & Human Review Action Workflow (`PatternDetailModal`):**
  - Side-by-side comparison of Initiating Case Record vs. Candidate Case Record (record types, descriptions, timestamps, spatial coordinates, and uncertainty meters).
  - Telemetry breakdown of all corroborating signals (distance, delta time, matched landmark descriptor phrases, analytical rationale, and model limitations).
  - Sworn review decision form (`RELEVANT_FOR_FOLLOWUP`, `UNDER_REVIEW`, `NOT_RELEVANT`) with mandatory 5+ character rationale requirement.
  - Role-based action gates permitting `CASE_OFFICER`, `SUPERVISOR`, and `SYSTEM_ADMIN` while providing clean read-only advisory notices to `READ_ONLY_REVIEWER` and `DATA_CLERK`.
  - Transactional persistence in PostgreSQL `AuditLog` and `CaseEvent` with instant optimistic reload across the review queue.

- **Operational Reporting & Hardened CSV Export (`/reports`):**
  - Configurable reporting windows (7, 30, 60, 90, 180, 365 days).
  - Structured JSON report preview with caseload, task backlog, pattern review summary, and statutory governance disclaimers.
  - Direct authenticated CSV download via blob mechanism with server-provided filename preservation and automatic object URL revocation (`URL.revokeObjectURL`).
  - **CSV Formula Injection Defense (CWE-1236):** Server-side `sanitizeCsvCell` neutralizes malicious formula triggers (`=`, `+`, `-`, `@`, `\t`, `\r`, and leading whitespace) by prefixing a single quote (`'`) and escaping quotes per RFC-4180.

- **Checkpoint 3B Test Count Discrepancy Resolution:**
  - Root cause verified: Non-deterministic query ordering in `findFirstOrThrow` caused `caseWithObs` to alternate between a case with 1 observation (34 tests) and a case with multiple observations (38 tests) where 4 contradiction analysis assertions executed.
  - Corrected `scripts/test-checkpoint3b.ts` to deterministically query cases with $\ge 2$ observations (`findMany` with `orderBy`), locking execution count deterministically at 38 / 38 on every run.

- **Automated Verification:**
  - Dedicated 69-assertion integration test suite in `scripts/test-checkpoint6c.ts`.
  - 100% pass rate across the full 12-command workspace regression suite (including `test:checkpoint3b` at 38/38 and `test:checkpoint6b` at 108/108).


---

## Checkpoint 5A Completion Summary

- **Multi-Observation Contradiction Engine:**
  - Haversine distance with spatial uncertainty subtraction: $d_{\text{min}} = \max(0, d_{\text{raw}} - (u_A + u_B))$.
  - Analytical classifications: `NO_CONFLICT_DETECTED`, `POTENTIAL_VELOCITY_CONTRADICTION`, `INSUFFICIENT_INFORMATION`, `INVALID_OBSERVATION`, `DUPLICATE_CANDIDATE`.
  - Realistic travel profiles: Pedestrian ($4.5\text{ km/h}$, max $12\text{ km/h}$), Transit ($25\text{ km/h}$, max $80\text{ km/h}$), Vehicular ($45\text{ km/h}$, max $120\text{ km/h}$).
  - All-pairs comparison matrix, chronological sequential path analysis, and competing anchor detection.
  - Transparent calculation rationale and advisory decision-support disclaimer.

- **Observation Exclusion and Review Model:**
  - Non-destructive migration `add_observation_exclusions` added `observation_exclusions` table.
  - Rule enforced: Excluding an observation **NEVER** deletes the original record from the database.
  - Retains: observation, hypothesis or case-level scope (`isCaseLevel`), reason, actor, timestamp, and active state.
  - Reconsideration restores observation to active analysis pool and captures justification.
  - Every exclusion and reconsideration transactionally creates `AuditLog` and `CaseEvent` records.

- **Search-Zone Refinement & Competing Hypotheses:**
  - Bounded candidate search radius: $r = \min(150000, (v_{\text{max}} \times \Delta t) + u_{\text{anchor}})$.
  - GeoJSON polygon generation with full parameter attribution.
  - Competing location patterns generate distinct **alternate hypotheses** rather than falsely averaging contradictory observations into a misleading central point.
  - Non-guaranteed decision-support warning explicitly attached to all hypotheses.

- **Investigation Coordination & Task Recommendations:**
  - Evaluates current case clues to draft structured follow-up recommendations:
    - `UNASSIGNED_LEAD_VERIFICATION`: Recent sightings in `NEW` state without an assigned officer.
    - `CONTRADICTORY_OBSERVATION_CLARIFICATION`: Potential velocity conflicts requiring source review.
    - `STALE_LEAD_TRIAGE`: Clues pending for > 48 hours without task resolution.
    - `UNCHECKED_SEARCH_AREA_CANVASS`: Formulated search zones without active canvass tasks.
  - **CRITICAL SAFETY INVARIANT:** Every recommendation item enforces `humanReviewRequired: true`. Automated systems strictly never auto-dispatch officers or contact witnesses.
  - Authorized acceptance command creates real `InvestigationTask` (`TSK-YYYY-XXXX`) transactionally with audit history.

- **Automated Verification:**
  - Dedicated 64-assertion test suite in `scripts/test-checkpoint5a.ts`.
  - Full backward compatibility maintained for existing Checkpoint 3B and 4A/4B suites.

---

## Checkpoint 6A Completion Summary

- **Algorithmic Proximity & Heuristic Mechanics:**
  - Spatial proximity with spatial uncertainty subtraction ($d_{\text{effective}} = \max(0, d_{\text{raw}} - (u_A + u_B))$).
  - Configurable geographic horizon (default $5\text{ km}$, bounds $0.1$ to $25\text{ km}$).
  - Chronological delta and recurring daily time-window classification (e.g., `EVENING_TRANSIT_WINDOW`, `MORNING_COMMUTE_WINDOW`).
  - Narrow, explainable descriptor matching for documented landmark terms and transit facilities; exclusions for generic terms and zero identity inference.
  - Multi-signal candidate association synthesizing $\ge 2$ independent heuristic signals.
  - Deterministic ordinal review priority ranking (`HIGH`, `MEDIUM`, `LOW`) based on multi-signal counts and spatial/temporal closeness.
  - Invariant pattern identifiers derived deterministically via SHA-256 hash (`PAT-<category>-<hash>`).

- **Security Safeguards & Access-Control Guarantees:**
  - Strict pre-query scoping at the database level (`jurisdictionId = actorUser.jurisdictionId`).
  - Zero information leakage: out-of-jurisdiction cases, sightings, identifiers, or counts are never returned or computed.
  - Platform-wide cross-jurisdiction analysis granted exclusively to `SYSTEM_ADMIN`.
  - Review decisions restricted to `CASE_OFFICER`, `SUPERVISOR`, and `SYSTEM_ADMIN` (`DATA_CLERK` and `READ_ONLY_REVIEWER` denied).

- **Traceable Human Review Workflow:**
  - Every candidate pattern is initialized as `UNVERIFIED_CANDIDATE` with mandatory human review disclaimer.
  - Review actions (`RELEVANT_FOR_FOLLOWUP`, `NOT_RELEVANT`, `UNDER_REVIEW`) recorded in `AuditLog` (`action: CROSS_CASE_PATTERN_REVIEWED`) and `CaseEvent` (`eventType: NOTE_ADDED`).
  - Underlying cases, leads, and observations remain strictly unmutated (cases never automatically merged or closed).

- **Automated Verification:**
  - Dedicated 73-assertion test suite in `scripts/test-checkpoint6a.ts`.
  - 100% pass rate across the full workspace regression suite.

---

## Checkpoint 6B Completion Summary

- **Caseload Breakdown & Triage Summary (`GET /api/v1/analytics/caseload`):**
  - Native PostgreSQL `GROUP BY` aggregates partitioned strictly by actual `CaseState` enum (`REPORTED`, `UNDER_REVIEW`, `OPEN`, `CLOSED`). Zero hardcoded KPI drift.
  - Case priority breakdown (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`) and tracing outcome metrics (`TRACED_VERIFIED`, etc.).
  - Bounded interval filtering (`startDate`, `endDate`) reporting new cases and formal closures within selected periods.
  - Multi-jurisdiction breakdown for `SYSTEM_ADMIN` vs strictly scoped single jurisdiction breakdown for local district personnel.

- **Case Activity & Resolution Trends (`GET /api/v1/analytics/trends`):**
  - Contiguous non-overlapping time-series bucketing across daily, weekly, or monthly intervals in UTC.
  - Per-bucket reporting of case filings, closures, leads registered, and tasks completed.
  - Deterministic mean and median duration to resolution (days between `reportedAt` and `closedAt` for cases closed in period).
  - Explicit denominator, timezone, and reopened-case handling documentation.

- **Task Backlog & Overdue Metrics (`GET /api/v1/analytics/tasks`):**
  - Partitioned counts across `TaskStatus` (`PENDING`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`).
  - Active open tasks total (`PENDING` + `IN_PROGRESS`).
  - Strict dynamic overdue rule: only active tasks with `dueDate < now()` are overdue; completed/cancelled tasks are NEVER counted as overdue.
  - Open tasks by priority and assignee, plus unassigned open task counter.
  - Completion duration metrics: average and median hours from task creation to completion.

- **Cross-Case Pattern Review Backlog (`GET /api/v1/analytics/patterns`):**
  - Synthesizes with Checkpoint 6A engine to gather distinct, deduplicated canonical pattern IDs across all accessible cases.
  - Current review status breakdown: `UNVERIFIED_CANDIDATE`, `RELEVANT_FOR_FOLLOWUP`, `UNDER_REVIEW`, `NOT_RELEVANT`.
  - Exactly one count per canonical pattern association; audit logs and repeated decisions do not inflate count.
  - Strict database-level jurisdiction pre-scoping preventing any cross-jurisdiction leakage in counts or queue items.

- **Operational Reporting & Export (`GET /api/v1/analytics/reports/operational`):**
  - Structured JSON format and RFC-4180 compliant CSV export (`?format=csv`).
  - Automatic download header triggering browser export.
  - Complete report metadata, scope, and operational governance disclaimers.

- **Security & Non-Destructive Invariants:**
  - Strict RBAC: All authenticated personas access analytics scoped strictly to their assigned `actorUser.jurisdictionId`. Cross-jurisdiction queries by non-admins fail closed with `403 Forbidden`.
  - Zero database mutations: analytics queries are 100% read-only and preserve exact database counts.
  - 100-assertion automated test suite in `scripts/test-checkpoint6b.ts`.
