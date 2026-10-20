<USER_REQUEST>
# TRACEGRID — CHECKPOINT 7A: SECURITY & PRIVACY AUDIT

**Repository:** `C:\Users\gagan\TraceGrid`  
**Scope:** Security audit, privacy review, targeted security fixes, and regression testing  
**Authorisation:** Explicitly approved by the user

## 1. Objective

Conduct a systematic security and privacy audit of the existing TraceGrid application before production-readiness work begins.

TraceGrid is a standalone investigation-operations prototype using React, TypeScript, Express, Prisma, PostgreSQL, Leaflet, and private evidence attachment storage.

The application handles sensitive fictional investigation records. Continue using synthetic data only. Do not introduce real personal information or connect to external police, telecom, surveillance, or government systems.

The objective is to identify actual vulnerabilities, assess their severity, correct confirmed issues safely within this checkpoint, and document anything that needs additional work.

**No new product features. No redesign. No deployment.**

## 2. Initial Inspection

Before editing anything:

1. Inspect the repository structure, current Git status, recent changes, and existing documentation.
2. Read `docs/CHECKPOINTS.md`, `docs/API_CONTRACTS.md`, and relevant architecture/security documentation.
3. Inspect authentication middleware, login/logout flows, JWT handling, role permissions, jurisdiction-scoping helpers, and session revocation.
4. Inspect evidence upload/download handling, file storage, content validation, path handling, and audit logging.
5. Inspect all routes that return investigation records, cross-case patterns, analytics aggregates, and operational reports.
6. Inspect frontend authentication state, API error handling, navigation guards, and handling of potentially untrusted text.
7. Inspect runtime configuration, environment-variable handling, Docker Compose configuration, and database connection settings.
8. Inspect existing test suites and the dependency manifests and lockfiles.

First produce a concise audit plan identifying the attack surfaces, relevant files, tests, and any limitations. Then conduct the audit.

Use the actual source code as the authority. Do not assume that a control exists merely because documentation claims it does.

## 3. Authentication and Session Security

Review:

- Password handling and credential verification, if implemented.
- JWT signing algorithm, secret management, issuer/audience validation where applicable, and token expiry.
- Whether every protected endpoint consistently requires authentication.
- Login and logout behaviour.
- Token revocation and session invalidation.
- Behaviour after an API or process restart.
- Credential leakage through browser storage, logs, error responses, or URLs.
- Brute-force protections and login rate limiting.
- Demo credentials and demo role-switching behaviour.

### Known limitation to investigate

Earlier TraceGrid reports described logout revocation as an in-memory store that does not survive server restarts.

Verify whether this remains true. Assess whether a stolen or revoked token can continue to be used after a restart, and document the actual risk.

Do not claim persistent session revocation if the implementation does not provide it.

If a serious vulnerability is confirmed, propose and implement the smallest safe correction that fits the existing architecture. For substantial schema changes or disruptive authentication changes, document the required approach and stop for review rather than improvising a migration.

Never print passwords, secrets, tokens, or credential values in the audit report.

## 4. Authorisation and Jurisdiction Isolation

This is a critical audit area.

Verify that server-side permissions are enforced consistently for:

- Cases and case state transitions.
- Case assignments and jurisdiction restrictions.
- Leads and sightings.
- Tasks and task mutations.
- Evidence registration, upload, download, and metadata.
- Location observations and hypothesis exclusions.
- Geospatial analysis and search hypotheses.
- Cross-case pattern analysis, details, and review decisions.
- Operations dashboard metrics and reports.
- Audit history and supervisor-only views.

Tests must verify that an authenticated user cannot access or modify a resource simply by changing its identifier in an API request.

Specifically inspect:

1. Direct object-reference vulnerabilities and missing ownership/scope checks.
2. Whether jurisdiction scoping occurs inside the relevant database query and service logic.
3. Whether nested references can expose inaccessible cases or related records.
4. Whether aggregate totals, errors, pagination, pattern details, or CSV exports leak restricted information.
5. Whether frontend-only permission checks are incorrectly relied upon as the security boundary.
6. Whether SYSTEM_ADMIN permissions match the application's documented policy.

Create negative tests for forbidden reads and mutations across roles and jurisdictions. Do not broaden permissions to make tests pass.

## 5. Evidence and File Storage Security

Inspect the existing private attachment storage implementation.

Verify:

- Uploaded files remain outside the publicly served frontend assets.
- File paths cannot be manipulated through traversal sequences, encoded paths, or crafted identifiers.
- Server-generated storage keys are used safely.
- File access is authorised at download time, not merely at upload time.
- File size limits are enforced by the server.
- Extension, declared MIME type, and file-signature checks are consistent.
- Malformed uploads are rejected safely.
- Download headers and filenames do not enable header injection or unsafe handling.
- Restricted attachments cannot be retrieved by users lacking permission.
- Hashes and audit references remain consistent when files are uploaded or accessed.
- Temporary files or partial uploads are handled safely after errors.

Do not weaken the existing 10 MB upload limit or replace signature validation with trust in client-provided MIME types.

Do not expose file contents, sensitive filesystem paths, or storage-provider details in routine API errors.

## 6. Input Validation and API Security

Inspect all API modules for:

- Missing request validation.
- Unsafe numeric ranges or unbounded queries.
- Invalid date ranges and timezone edge cases.
- SQL injection risks or unsafe raw queries.
- Path traversal, unsafe filenames, and filesystem misuse.
- Object-property overposting or mass-assignment risks.
- Improper state-transition validation.
- Duplicate submissions and race conditions in sensitive mutations.
- Inconsistent error status codes or excessive exception detail.
- Unbounded expensive spatial, pattern, or analytics queries.
- Missing request rate limits on sensitive or expensive endpoints.

Ensure Zod validation and service-layer business rules are consistently applied. Validation at the frontend must never be treated as sufficient protection.

Do not rewrite functioning modules without a demonstrated security reason.

## 7. Audit Integrity and Sensitive Data

Review `AuditLog` and `CaseEvent` behaviour.

Verify that:

- Material mutations are logged according to the application's existing audit contract.
- Audit records identify the actor, action, timestamp, and relevant resource references.
- Failed or forbidden operations do not expose restricted data in audit responses.
- Ordinary users cannot modify or delete audit records through application APIs.
- Case changes, evidence operations, observation exclusions, pattern reviews, and task mutations preserve their existing auditing requirements.
- Transactional updates and audit writes behave consistently when operations fail.
- Logs and exceptions do not disclose credentials, JWTs, database URLs, private evidence paths, or unnecessary personal information.
- Review histories and source records remain traceable.

Do not make unsupported claims that the audit trail is tamper-proof or cryptographically immutable. Describe the guarantees actually implemented.

## 8. Frontend Security and Privacy

Inspect `apps/web` for:

- Unsafe rendering of untrusted text or HTML.
- Use of `dangerouslySetInnerHTML` or similar constructs.
- Token storage and logout cleanup.
- Stale client state after switching demo users or roles.
- Accidental leakage of restricted data into local storage, URLs, logs, or error messages.
- Unsafe links, downloaded filenames, and CSV handling.
- Missing handling of 401 and 403 responses.
- Role-based controls that appear authorised while backend requests remain insufficiently protected.

Check whether third-party map resources load externally and document what information may be sent to those services. Do not remove required functionality without assessing the impact.

Do not introduce new external services or telemetry.

## 9. Configuration, Dependencies, and Infrastructure

Inspect:

- `.env` files, `.gitignore`, secret exposure risks, and example environment files.
- Production defaults, fallback secrets, permissive CORS settings, and debugging options.
- Docker Compose port bindings and database exposure.
- Database credentials, connection configuration, and least-privilege assumptions.
- HTTP security headers and relevant cookie settings, where applicable.
- Dependency versions, lockfile consistency, and known dependency vulnerabilities.
- Error reporting and application logging configuration.

Run available dependency-audit tooling if it is already available or can be used safely. If network access or registry access is unavailable, report that limitation. Do not blindly upgrade all packages or replace the lockfile.

Never copy production credentials into the repository or output secrets into the completion report.

## 10. Targeted Fix Policy

For each finding:

1. Assign a severity: CRITICAL, HIGH, MEDIUM, LOW, or INFORMATIONAL.
2. Identify the affected file, route, or subsystem.
3. Explain a realistic impact and the conditions needed to exploit it.
4. State the evidence that confirms the issue.
5. Identify the smallest safe correction.
6. Add a regression test where practicable.

Fix confirmed CRITICAL and HIGH issues that can be corrected safely within this checkpoint.

Correct MEDIUM issues when the fix is well scoped and does not destabilise unrelated functionality.

For significant architectural work, schema migrations, or breaking changes, document the proposal and stop for review rather than making an unapproved large change.

Do not report hypothetical concerns as confirmed exploitable vulnerabilities. Distinguish verified findings from recommended improvements.

Never weaken authentication, authorisation, validation, or tests to force a passing build.

## 11. Required Regression and Security Testing

Use the existing repository test framework and synthetic data.

In addition to the normal build and regression suites, verify:

- Unauthenticated requests to protected routes.
- Expired or malformed tokens.
- Revoked-token behaviour and the effect of server restart, where testable.
- Cross-jurisdiction and cross-role resource access attempts.
- Forbidden reads and mutations by changing resource identifiers.
- Restricted attachment upload and download cases.
- Invalid file signatures, oversize files, and unsafe filenames.
- Invalid query parameters and large unbounded requests.
- Restricted fields in errors, analytics, and exports.
- CSV formula-injection regressions.
- Audit records for permitted and forbidden sensitive operations.
- Existing case, task, evidence, mapping, recommendation, pattern, and reporting workflows.

Run the applicable commands:

`npm run build`

`npm run test:health`

`npm run test:db`

`npm run test:api`

`npm run test:checkpoint3b`

`npm run test:checkpoint4a`

`npm run test:checkpoint4b`

`npm run test:checkpoint5a`

`npm run test:checkpoint5b`

`npm run test:checkpoint6a`

`npm run test:checkpoint6b`

`npm run test:checkpoint6c`

Run additional security tests and any available dependency-audit commands.

Record actual outcomes. If a command is unavailable or fails, say so explicitly. Do not claim complete security verification simply because the regression suite passes.

## 12. Strict Scope Boundary

Permitted:
- Security-related corrections.
- Focused regression tests.
- Relevant security documentation updates.
- Minimal configuration changes necessary to address verified security defects.

Not permitted:
- New product features.
- Dashboard redesigns.
- External integrations.
- Database reset or destructive reseeding.
- Unrelated refactoring.
- Changes to NexuxEdu or any other repository.
- Production deployment or import of real investigation records.

Preserve existing synthetic data.

## 13. Required Completion Report

Return a security report containing:

1. Executive summary and overall assessment.
2. Audit coverage by subsystem.
3. Findings table with severity, evidence, impact, and remediation status.
4. Confirmed vulnerabilities versus non-exploitable concerns.
5. Exact files changed and why.
6. Authentication, session-revocation, RBAC, and jurisdiction-isolation findings.
7. Attachment-storage, audit-integrity, and configuration findings.
8. Dependency-audit results or limitations.
9. All tests executed and actual outcomes.
10. Residual risks and recommended follow-up actions.
11. Confirmation that no new features, unrelated repositories, or destructive database operations were introduced.

Provide a concise recommendation for the next production-hardening stage, but do not implement it.

## 14. Stop Condition

**Stop after Checkpoint 7A.**

Do not proceed to Checkpoint 7B, deploy the system, introduce new features, or claim production readiness without a separate review and explicit approval.

Passing automated tests is necessary but not sufficient to establish that TraceGrid is secure for real investigation data.
</USER_REQUEST>
<ADDITIONAL_METADATA>
The current local time is: 2026-10-21T00:24:25+05:30.
</ADDITIONAL_METADATA>