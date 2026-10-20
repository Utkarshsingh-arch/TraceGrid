# TraceGrid — REST API Specification & Contracts

## 1. Global API Conventions

- **Base Namespace:** `/api/v1`
- **Data Exchange Format:** `application/json` (except binary attachment uploads and streams)
- **Authentication Scheme:** HTTP Bearer token via `Authorization: Bearer <JWT_TOKEN>`
- **Character Encoding:** UTF-8
- **Date/Time Standard:** ISO-8601 UTC strings (`YYYY-MM-DDTHH:mm:ss.sssZ`)
- **Pagination Strategy:** Zero-based or standard 1-based offset pagination with query parameters `?page=1&limit=25` (max limit: 100)
- **Sorting Strategy:** Query parameter `?sortBy=reported_at&sortOrder=desc`

### 1.1 Standardized Success Envelope
Single item:
```json
{
  "success": true,
  "data": { ... }
}
```

Paginated collection:
```json
{
  "success": true,
  "data": [ ... ],
  "meta": {
    "page": 1,
    "limit": 25,
    "total": 48,
    "totalPages": 2
  }
}
```

### 1.2 Standardized Error Envelope
```json
{
  "success": false,
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Investigation case with reference CAS-2026-0044 was not found.",
    "details": null,
    "timestamp": "2026-10-20T09:40:00.000Z"
  }
}
```

Standard Error Codes:
- `VALIDATION_ERROR` (400) — Request payload failed Zod schema parsing.
- `UNAUTHENTICATED` (401) — Bearer token missing, expired, or invalid.
- `FORBIDDEN` (403) — Insufficient role privileges or cross-jurisdiction violation.
- `RESOURCE_NOT_FOUND` (404) — Entity ID does not exist in database.
- `INVALID_STATE_TRANSITION` (409) — Domain state machine transition is prohibited.
- `INTERNAL_SERVER_ERROR` (500) — Unhandled exception.

---

## 2. API Endpoints Catalog

### Group 1: Authentication & Identity

#### `POST /api/v1/auth/login`
- **Purpose:** Authenticate user and issue JWT bearer token.
- **Access:** Public
- **Request Body:**
  ```json
  {
    "email": "sarah.connor@tracegrid.local",
    "password": "Password123!"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "user": {
        "id": "e4b2d180-2a8b-4a57-827c-3f4a9b5f0012",
        "displayName": "Sarah Connor",
        "email": "sarah.connor@tracegrid.local",
        "role": "SUPERVISOR",
        "jurisdictionId": "a1c2e3f4-0000-4000-8000-000000000001",
        "jurisdictionName": "North Division HQ"
      }
    }
  }
  ```
- **Errors:** 400 (Validation), 401 (Invalid credentials / Inactive account).

#### `POST /api/v1/auth/logout`
- **Purpose:** Invalidate client session token / trigger client cleanup.
- **Access:** Authenticated
- **Response (200 OK):** `{"success": true, "message": "Logged out successfully"}`

#### `GET /api/v1/auth/me`
- **Purpose:** Retrieve the currently authenticated user profile and jurisdiction scope.
- **Access:** Authenticated

---

### Group 2: Operations Dashboard & Metrics

#### `GET /api/v1/dashboard/kpi-summary`
- **Purpose:** Live aggregation query returning real-time operational counts.
- **Access:** All roles (scoped to user's assigned jurisdiction).
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "totalCases": 42,
      "openCases": 28,
      "underReviewCases": 6,
      "closedCases": 8,
      "casesAwaitingAttention": 5,
      "unassignedCases": 3,
      "unresolvedLeads": 19,
      "overdueTasks": 7,
      "lastUpdated": "2026-10-20T09:40:00.000Z"
    }
  }
  ```
- **Query Logic:** Computed dynamically from database queries; zero hardcoded statistics.

#### `GET /api/v1/dashboard/attention-queues`
- **Purpose:** Fetch queues of cases and tasks needing urgent officer action.
- **Query Params:** `?queueType=OVERDUE_TASKS|UNASSIGNED_CASES|CRITICAL_UNVERIFIED_LEADS`
- **Response (200 OK):** Array of prioritized records with days pending and priority tags.

#### `GET /api/v1/dashboard/recent-activity`
- **Purpose:** Chronological stream of recent system-wide actions within the user's jurisdiction.
- **Response (200 OK):** Array of recent `CaseEvent` records.

---

### Group 3: Investigation Case Management

#### `GET /api/v1/cases`
- **Purpose:** Search, filter, and paginate through the case register.
- **Access:** All roles (scoped by jurisdiction).
- **Query Params:**
  - `page` (number, default: 1)
  - `limit` (number, default: 25)
  - `search` (string, searches case reference, subject name, summary)
  - `caseState` (`REPORTED`, `UNDER_REVIEW`, `OPEN`, `CLOSED`)
  - `tracingOutcome` (`NOT_TRACED`, `LOCATION_REPORTED`, etc.)
  - `priority` (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`)
  - `assignedUserId` (UUID)
  - `jurisdictionId` (UUID)
- **Response (200 OK):** Paginated collection of cases with subject profiles and active officer summary.

#### `POST /api/v1/cases`
- **Purpose:** Formally lodge a new missing-person investigation and person profile.
- **Access:** `DATA_CLERK`, `CASE_OFFICER`, `SUPERVISOR`, `SYSTEM_ADMIN`
- **Request Body:**
  ```json
  {
    "personProfile": {
      "fullName": "Aarav Sharma",
      "aliases": ["Sunny"],
      "estimatedAge": 24,
      "biologicalSex": "MALE",
      "identifyingFeatures": "Small scar over left eyebrow, dark blue hoodie"
    },
    "case": {
      "jurisdictionId": "a1c2e3f4-0000-4000-8000-000000000001",
      "reportedAt": "2026-10-19T14:30:00.000Z",
      "missingSince": "2026-10-18T20:00:00.000Z",
      "priority": "HIGH",
      "incidentSummary": "Last seen leaving university campus library on foot."
    }
  }
  ```
- **Response (201 Created):** Created `InvestigationCase` and `PersonProfile` objects.
- **Side Effects:** Automatically generates unique `case_reference` (e.g. `CAS-2026-0045`), initial `CaseEvent` (`CASE_CREATED`), and `AuditLog`.

#### `GET /api/v1/cases/:id`
- **Purpose:** Retrieve complete case workspace aggregate (profile, current assignments, lead tally, task summary, latest hypothesis, events).
- **Access:** Authenticated (jurisdiction-scoped).

#### `PATCH /api/v1/cases/:id`
- **Purpose:** Update editable case metadata (priority, incident summary, missingSince).
- **Access:** `CASE_OFFICER`, `SUPERVISOR`, `SYSTEM_ADMIN`
- **Rule:** **Forbidden to alter `case_state` or `tracing_outcome` via this route.**

#### `POST /api/v1/cases/:id/transition-state`
- **Purpose:** Explicit command to execute a validated case state transition.
- **Access:** `SUPERVISOR`, `SYSTEM_ADMIN`
- **Request Body:**
  ```json
  {
    "targetState": "CLOSED",
    "reason": "Subject traced and safely reunited with family in Lucknow."
  }
  ```
- **Response (200 OK):** Updated case.
- **Side Effects:** Validates state machine rules; records `AuditLog` and `CaseEvent`.

#### `POST /api/v1/cases/:id/reopen`
- **Purpose:** Formally reopen a previously closed case upon new credible information.
- **Access:** `SUPERVISOR`, `SYSTEM_ADMIN`
- **Request Body:**
  ```json
  {
    "reason": "New confirmed sighting reported with CCTV evidence; case reopened for verification."
  }
  ```

#### `POST /api/v1/cases/:id/update-outcome`
- **Purpose:** Explicit command to record changes in physical tracing outcome.
- **Access:** `CASE_OFFICER`, `SUPERVISOR`, `SYSTEM_ADMIN`
- **Request Body:**
  ```json
  {
    "outcome": "LOCATED_VERIFICATION_PENDING",
    "verificationNotes": "Hospital in Sector 18 reports patient matching physical description."
  }
  ```

#### `POST /api/v1/cases/:id/assignments`
- **Purpose:** Assign or reassign primary / assisting investigative officer.
- **Access:** `SUPERVISOR`, `SYSTEM_ADMIN`
- **Request Body:**
  ```json
  {
    "userId": "b2c3d4e5-0000-4000-8000-000000000002",
    "role": "PRIMARY_OFFICER",
    "reassignmentReason": "Previous officer reassigned to emergency taskforce."
  }
  ```

#### `GET /api/v1/cases/:id/events`
- **Purpose:** Retrieve chronological timeline of human-readable case milestones.

---

### Group 4: Leads & Sightings Management

#### `GET /api/v1/cases/:caseId/leads`
- **Purpose:** List all leads and sightings associated with a case.
- **Query Params:** `?verificationStatus=NEW,ASSIGNED`

#### `POST /api/v1/cases/:caseId/leads`
- **Purpose:** Ingest a new lead or sighting.
- **Access:** `DATA_CLERK`, `CASE_OFFICER`, `SUPERVISOR`, `SYSTEM_ADMIN`
- **Request Body:**
  ```json
  {
    "sourceType": "CITIZEN_TIP",
    "narrative": "Witness saw individual matching description at bus depot ticket counter.",
    "observedAt": "2026-10-19T08:15:00.000Z",
    "latitude": 28.6139,
    "longitude": 77.2090,
    "locationUncertaintyMeters": 250.0,
    "locationDescription": "Kashmere Gate ISBT Counter 4"
  }
  ```
- **Side Effects:** Ingests lead with status `NEW`; optionally seeds a `LocationObservation`; updates case `last_activity_at`.

#### `POST /api/v1/leads/:id/assign`
- **Purpose:** Assign an investigator to vet a specific lead.
- **Access:** `SUPERVISOR`, `SYSTEM_ADMIN`
- **Request Body:** `{"assignedUserId": "UUID"}`

#### `POST /api/v1/leads/:id/record-outcome`
- **Purpose:** Formally record findings and transition lead status.
- **Access:** `CASE_OFFICER`, `SUPERVISOR`, `SYSTEM_ADMIN`
- **Request Body:**
  ```json
  {
    "status": "DISPROVED",
    "findings": "CCTV review at bus counter confirms ticket purchaser was not the subject."
  }
  ```
- **Rule:** **Marking a lead `DISPROVED` has ZERO automatic closing effect on the parent case.**

---

### Group 5: Evidence & Controlled Attachments

#### `GET /api/v1/cases/:caseId/evidence`
- **Purpose:** List cataloged evidence records for a case.

#### `POST /api/v1/cases/:caseId/evidence`
- **Purpose:** Register new evidence metadata.
- **Access:** `CASE_OFFICER`, `SUPERVISOR`, `SYSTEM_ADMIN`
- **Request Body:**
  ```json
  {
    "leadId": "UUID (optional)",
    "evidenceType": "CCTV_FOOTAGE",
    "title": "Platform 2 Surveillance Recording",
    "description": "Footage recorded between 08:00 and 08:30 on date of sighting.",
    "sourceProvenance": "Obtained from Metro Rail Security Officer via USB",
    "eventTimestamp": "2026-10-19T08:05:00.000Z",
    "accessClassification": "RESTRICTED"
  }
  ```

#### `POST /api/v1/evidence/:id/attachments`
- **Purpose:** Upload binary attachment for an evidence record.
- **Access:** `CASE_OFFICER`, `SUPERVISOR`, `SYSTEM_ADMIN`
- **Content-Type:** `multipart/form-data` (single file field `file`)
- **Validation:** Max file size 10MB; validated against MIME allowlist (`image/jpeg`, `image/png`, `application/pdf`, `video/mp4`).
- **Response (201 Created):** Created `Attachment` metadata with SHA-256 hash.

#### `GET /api/v1/attachments/:id/metadata`
- **Purpose:** Retrieve file metadata, MIME type, size, and checksum.

#### `GET /api/v1/attachments/:id/content`
- **Purpose:** Stream authorized binary file bytes.
- **Access:** Authenticated (checks user role and jurisdiction; blocked if user has insufficient clearance for `CONFIDENTIAL` evidence).
- **Response (200 OK):** Binary octet-stream with `Content-Type`, `Content-Disposition: inline`.
- **Rule:** **No public static directory exposure.**

---

### Group 6: Investigation Tasks & Deadlines

#### `GET /api/v1/tasks`
- **Purpose:** List, search, and filter tasks across cases or assigned officer.
- **Query Params:** `?caseId=UUID&assignedUserId=UUID&status=PENDING&isOverdue=true`

#### `POST /api/v1/cases/:caseId/tasks`
- **Purpose:** Schedule an investigation task.
- **Access:** `CASE_OFFICER`, `SUPERVISOR`, `SYSTEM_ADMIN`
- **Request Body:**
  ```json
  {
    "leadId": "UUID (optional)",
    "assignedUserId": "UUID",
    "title": "Interview Convenience Store Clerk",
    "description": "Show photograph of subject to night-shift clerk and review register log.",
    "dueDate": "2026-10-21T18:00:00.000Z",
    "priority": "HIGH"
  }
  ```

#### `POST /api/v1/tasks/:id/complete`
- **Purpose:** Mark task completed with required findings.
- **Access:** Assigned officer, `SUPERVISOR`, `SYSTEM_ADMIN`
- **Request Body:**
  ```json
  {
    "outcomeNotes": "Clerk interviewed. Stated individual entered store around 21:00 to buy water."
  }
  ```

#### `POST /api/v1/tasks/:id/cancel`
- **Purpose:** Cancel redundant or cancelled task.
- **Request Body:** `{"reason": "CCTV confirms individual was elsewhere; task redundant."}`

---

### Group 7: Geospatial Intelligence & Investigation Coordination

#### `GET /api/v1/cases/:caseId/contradictions`
- **Purpose:** Perform multi-observation velocity contradiction analysis across all case observations.
- **Access:** All authenticated roles (jurisdiction-scoped).
- **Query Params:**
  - `assumedTravelMode`: `'PEDESTRIAN' | 'TRANSIT' | 'VEHICULAR'` (default: `'PEDESTRIAN'`)
  - `maxSpeedKmh`: Optional numeric maximum speed override
  - `primaryAnchorId`: Optional UUID of specific observation to evaluate as anchor
- **Response (200 OK):**
  - `pairwiseMatrix`: All-pairs pairwise evaluation matrix including classifications (`NO_CONFLICT_DETECTED`, `POTENTIAL_VELOCITY_CONTRADICTION`, `INSUFFICIENT_INFORMATION`, `INVALID_OBSERVATION`, `DUPLICATE_CANDIDATE`).
  - `sequentialTimelineChain`: Chronological step-by-step path evaluation.
  - `competingAnchors`: Array of observations exhibiting irreconcilable spatio-temporal tension with the anchor.
  - `summary`: High-level natural language summary of findings.
  - `limitations`: Explicit advisory decision-support disclaimer.

#### `POST /api/v1/cases/:caseId/search-zones` (Alias: `POST /api/v1/cases/:id/search-radius`)
- **Purpose:** Compute deterministic candidate search-zone radius and GeoJSON polygon, and formulate alternate competing hypotheses.
- **Access:** `CASE_OFFICER`, `SUPERVISOR`, `SYSTEM_ADMIN`
- **Request Body:**
  ```json
  {
    "anchorObservationId": "UUID (optional, defaults to most recent valid observation)",
    "assumedTravelMode": "PEDESTRIAN",
    "maxSpeedKmh": 4.5,
    "analysisTime": "2026-10-20T14:30:00Z (optional)",
    "excludedObservationIds": ["UUID1"],
    "exclusionReasons": { "UUID1": "Witness recanted statement" },
    "generateAlternateHypotheses": true
  }
  ```
- **Response (200 OK):** Newly formed `SearchZoneHypothesis` with GeoJSON polygon, `alternateHypotheses` (for competing clusters without false centroid merging), `contradictions` list, and `calculationDetails` with non-guarantee warning.

#### `GET /api/v1/cases/:caseId/hypotheses`
- **Purpose:** Retrieve all historical and active candidate search zones with creator metadata, assumptions, and rationale.
- **Access:** All authenticated roles (jurisdiction-scoped).

#### `POST /api/v1/cases/:caseId/observations/:observationId/exclusions`
- **Purpose:** Formally exclude an observation from search calculations and active contradiction models without deleting the original database record.
- **Access:** `CASE_OFFICER`, `SUPERVISOR`, `SYSTEM_ADMIN`
- **Request Body:**
  ```json
  {
    "reason": "Camera clock unsynchronized by 45 minutes; verified by telecom beacon",
    "hypothesisId": "UUID (optional)",
    "isCaseLevel": true
  }
  ```
- **Response (201 Created):** Created `ObservationExclusion` record with actor, timestamp, and audit trail link.

#### `POST /api/v1/cases/:caseId/observations/:observationId/reconsiderations`
- **Purpose:** Restore a previously excluded observation back to the active analysis pool.
- **Access:** `CASE_OFFICER`, `SUPERVISOR`, `SYSTEM_ADMIN`
- **Request Body:**
  ```json
  {
    "reason": "Corroborating ATM receipt confirms sighting timestamp was valid"
  }
  ```
- **Response (200 OK):** Deactivates exclusion record, logs supervisory audit event, and returns restoration confirmation.

#### `GET /api/v1/cases/:caseId/recommendations`
- **Purpose:** Retrieve structured investigation task recommendations based on unassigned leads, velocity contradictions, stale clues, and unchecked search areas.
- **Access:** All authenticated roles (jurisdiction-scoped).
- **Invariants:** Every recommendation item strictly sets `humanReviewRequired: true` and includes `whyHumanReviewRequired`. Systems never auto-dispatch personnel or contact witnesses.

#### `POST /api/v1/cases/:caseId/recommendations/accept`
- **Purpose:** Explicitly accept a recommended follow-up action, transactionally generating a real `InvestigationTask`.
- **Access:** `CASE_OFFICER`, `SUPERVISOR`, `SYSTEM_ADMIN`
- **Request Body:**
  ```json
  {
    "recommendationId": "REC-LEAD-ASSIGN-...",
    "title": "Verify recent sighting: LED-2026-0042",
    "description": "Field canvass and witness verification...",
    "dueDate": "2026-10-21T18:00:00Z",
    "priority": "HIGH",
    "assignedUserId": "UUID (optional)",
    "leadId": "UUID (optional)"
  }
  ```
- **Response (201 Created):** Newly minted `InvestigationTask` with canonical `TSK-YYYY-XXXX` reference and `TASK_RECOMMENDATION_ACCEPTED` audit log.

---

### Group 8: Reports, Administration & Audit

#### `GET /api/v1/reports/caseload`
- **Purpose:** Statistical caseload summaries by status, outcome, and jurisdiction.
- **Access:** `SUPERVISOR`, `SYSTEM_ADMIN`, `READ_ONLY_REVIEWER`

#### `GET /api/v1/admin/users`
- **Purpose:** List users and account statuses.
- **Access:** `SYSTEM_ADMIN`

#### `POST /api/v1/admin/users`
- **Purpose:** Provision new user with assigned role and jurisdiction.
- **Access:** `SYSTEM_ADMIN`

#### `GET /api/v1/admin/jurisdictions`
- **Purpose:** List all configured operational jurisdictions.
- **Access:** All authenticated users.

#### `GET /api/v1/admin/audit-logs`
- **Purpose:** Query immutable system audit logs.
- **Access:** `SUPERVISOR`, `SYSTEM_ADMIN`
- **Query Params:** `?caseId=UUID&actorUserId=UUID&action=CASE_CLOSED&page=1`

---

### Group 9: Cross-Case Pattern Analysis

#### `GET /api/v1/cases/:caseId/patterns` and `POST /api/v1/cases/:caseId/patterns/analyze`
- **Purpose:** Execute bounded, deterministic cross-case pattern analysis for an authorized case against peer cases in the user's jurisdiction scope.
- **Access:** All authenticated roles (strictly pre-scoped to user's assigned jurisdiction; SYSTEM_ADMIN has global scope).
- **Query / Body Parameters:**
  - `maxDistanceKm` (number, default: 5.0, range: 0.1–25.0) — Maximum effective geographic separation in kilometers after spatial uncertainty subtraction.
  - `maxTimeDeltaHours` (number, default: 72.0, range: 1.0–720.0) — Observation horizon in hours.
  - `includeTemporalOverlap` (boolean, default: true) — Include chronological overlap and recurring daily window evaluation.
  - `includeDescriptors` (boolean, default: true) — Include normalized landmark and structured descriptor matching.
  - `minSignals` (number, default: 1, range: 1–3) — Minimum required independent corroborating signals.
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "initiatingCaseId": "UUID",
      "initiatingCaseReference": "CAS-2026-0001",
      "analysisParameters": {
        "maxDistanceKm": 5.0,
        "maxTimeDeltaHours": 72.0,
        "includeTemporalOverlap": true,
        "includeDescriptors": true,
        "minSignals": 1
      },
      "evaluatedCandidateCasesCount": 8,
      "totalPatternsFound": 3,
      "patterns": [
        {
          "id": "PAT-MSIG-a1b2c3d4e5f6",
          "initiatingCaseId": "UUID",
          "initiatingCaseReference": "CAS-2026-0001",
          "candidateCaseId": "UUID",
          "candidateCaseReference": "CAS-2026-0003",
          "primaryCategory": "MULTI_SIGNAL_ASSOCIATION",
          "reviewPriority": "HIGH",
          "priorityRationale": "Close spatial proximity (≤ 2.0 km effective distance) accompanied by a tight chronological interval (≤ 24.0 hours).",
          "signalsCount": 2,
          "signals": [
            {
              "category": "SPATIAL_PROXIMITY",
              "signalName": "RECURRING_GEOGRAPHIC_PROXIMITY",
              "summary": "Observations located within 1.2 km effective separation...",
              "metrics": {
                "distanceKm": 1.45,
                "effectiveDistanceKm": 1.2,
                "uncertaintyMetersA": 150,
                "uncertaintyMetersB": 100
              },
              "rationale": "Spatial distance is within the analytical ceiling of 5.0 km.",
              "limitations": "Spatial proximity does not establish that observations pertain to the same incident or subject."
            }
          ],
          "supportingRecords": {
            "initiatingRecord": { "id": "UUID", "recordType": "OBSERVATION" },
            "candidateRecord": { "id": "UUID", "recordType": "OBSERVATION" }
          },
          "reviewStatus": "UNVERIFIED_CANDIDATE",
          "reviewHistory": null,
          "humanReviewRequired": true,
          "disclaimer": "Candidate analytical pattern based on stated spatial and temporal assumptions; does not establish identity, common causation, suspect status, or confirmed case connection. Human investigative review is required."
        }
      ],
      "disclaimer": "Candidate analytical pattern based on stated spatial and temporal assumptions; does not establish identity, common causation, suspect status, or confirmed case connection. Human investigative review is required."
    }
  }
  ```

#### `GET /api/v1/cases/:caseId/patterns/:patternId`
- **Purpose:** Retrieve explainable detail record for a specific pattern identifier.
- **Access:** All authenticated roles (jurisdiction-scoped).

#### `POST /api/v1/cases/:caseId/patterns/:patternId/review`
- **Purpose:** Record an authorized investigator's operational review classification for a candidate association.
- **Access:** `CASE_OFFICER`, `SUPERVISOR`, `SYSTEM_ADMIN` (DATA_CLERK and READ_ONLY_REVIEWER denied 403 Forbidden).
- **Request Body:**
  ```json
  {
    "decision": "RELEVANT_FOR_FOLLOWUP",
    "rationale": "Verified spatial proximity aligns with bus route 412 corridor; assigned detective to interview transit kiosk staff."
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "patternId": "PAT-MSIG-a1b2c3d4e5f6",
      "caseId": "UUID",
      "decision": "RELEVANT_FOR_FOLLOWUP",
      "rationale": "Verified spatial proximity...",
      "reviewedAt": "2026-10-20T18:00:00.000Z",
      "reviewedBy": {
        "id": "UUID",
        "displayName": "Inspector Rajesh Sharma",
        "role": "CASE_OFFICER"
      },
      "message": "Cross-case pattern PAT-MSIG-a1b2c3d4e5f6 reviewed and recorded as RELEVANT_FOR_FOLLOWUP."
    }
  }
  ```
- **Side Effects:** Transactionally logs `AuditLog` (`action: CROSS_CASE_PATTERN_REVIEWED`) and `CaseEvent` (`eventType: NOTE_ADDED`). Modifies NO evidentiary records, source observations, leads, or case state.

---

### Group 10: Operations Analytics & Reporting (`/api/v1/analytics`)

#### `GET /api/v1/analytics/caseload`
- **Purpose:** Retrieve aggregate caseload breakdown by actual state, priority, and jurisdiction.
- **Access:** All authenticated roles (jurisdiction-scoped; `SYSTEM_ADMIN` platform-wide).
- **Query Parameters:** `jurisdictionId` (optional UUID), `startDate` (optional ISO), `endDate` (optional ISO).
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "metadata": {
        "generatedAt": "2026-10-20T18:30:00.000Z",
        "isPlatformWide": false,
        "jurisdictionScope": "UUID",
        "reportingInterval": { "startDate": "...", "endDate": "..." }
      },
      "caseload": {
        "totalCases": 10,
        "byState": { "REPORTED": 1, "UNDER_REVIEW": 2, "OPEN": 6, "CLOSED": 1 },
        "byPriority": { "CRITICAL": 1, "HIGH": 4, "MEDIUM": 3, "LOW": 2 },
        "byOutcome": { "NOT_TRACED": 7, "LOCATION_REPORTED": 1, "LOCATED_VERIFICATION_PENDING": 1, "TRACED_VERIFIED": 1, "OTHER_OUTCOME": 0 },
        "byJurisdiction": [ { "jurisdictionId": "UUID", "code": "JUR-DEL-NORTH", "name": "North Delhi District", "totalCases": 10 } ],
        "newCasesInPeriod": 10,
        "closedCasesInPeriod": 1
      },
      "definitions": { ... }
    }
  }
  ```

#### `GET /api/v1/analytics/trends`
- **Purpose:** Retrieve time-series activity buckets and resolution duration trends.
- **Access:** All authenticated roles (jurisdiction-scoped).
- **Query Parameters:** `windowDays` (default 30, max 365), `bucket` (`day` | `week` | `month`), `startDate`, `endDate`.
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "metadata": { "windowDays": 30, "bucketType": "day" },
      "summary": {
        "totalReportedInPeriod": 10,
        "totalClosedInPeriod": 1,
        "casesClosedWithResolutionMetricsCount": 1,
        "averageResolutionDays": 5.4,
        "medianResolutionDays": 5.4
      },
      "timeSeries": [
        {
          "bucketIndex": 0,
          "startDate": "2026-09-20T00:00:00.000Z",
          "endDate": "2026-09-21T00:00:00.000Z",
          "label": "2026-09-20 to 2026-09-21",
          "reportedCasesCount": 1,
          "closedCasesCount": 0,
          "reportedLeadsCount": 4,
          "completedTasksCount": 2
        }
      ],
      "definitionNotes": { ... }
    }
  }
  ```

#### `GET /api/v1/analytics/tasks`
- **Purpose:** Retrieve task queue backlog, dynamic overdue count, and completion metrics.
- **Access:** All authenticated roles (jurisdiction-scoped).
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "tasks": {
        "totalTasks": 24,
        "byStatus": { "PENDING": 10, "IN_PROGRESS": 6, "COMPLETED": 7, "CANCELLED": 1 },
        "openTasksCount": 16,
        "overdueTasksCount": 3,
        "openByPriority": { "CRITICAL": 2, "HIGH": 8, "MEDIUM": 4, "LOW": 2 },
        "openByAssignee": [ { "userId": "UUID", "displayName": "Inspector Sharma", "openTasksCount": 5 } ],
        "unassignedOpenTasksCount": 4,
        "completedInPeriod": 7,
        "averageCompletionHours": 32.5,
        "medianCompletionHours": 24.0
      },
      "definitions": { ... }
    }
  }
  ```

#### `GET /api/v1/analytics/patterns`
- **Purpose:** Retrieve cross-case pattern review queue backlog and triage metrics.
- **Access:** All authenticated roles (jurisdiction-scoped).
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "backlog": {
        "totalDistinctPatterns": 4,
        "unverifiedCandidates": 3,
        "relevantForFollowup": 1,
        "underReview": 0,
        "notRelevant": 0,
        "byPriority": { "HIGH": 2, "MEDIUM": 1, "LOW": 1 },
        "byCategory": { "MULTI_SIGNAL_ASSOCIATION": 2, "SPATIAL_PROXIMITY": 2 }
      },
      "reviewQueueItems": [ ... ]
    }
  }
  ```

#### `GET /api/v1/analytics/reports/operational`
- **Purpose:** Retrieve consolidated operational summary report in JSON or RFC-4180 CSV format.
- **Access:** All authenticated roles (jurisdiction-scoped).
- **Query Parameters:** `windowDays` (default 30), `format` (`json` | `csv`).
- **Response (200 OK):** JSON object (when format=json) or `text/csv` stream with `Content-Disposition: attachment; filename="tracegrid-operations-report-YYYY-MM-DD.csv"`.

