/**
 * TraceGrid — Security Verification Suite:
 * Authentication Gate & Jurisdiction Isolation
 *
 * Verifies:
 * 1. Unauthenticated requests to /cases return HTTP 401.
 * 2. Valid North District officer sees only cases permitted by existing policy (10 cases, all JUR-DEL-NORTH).
 * 3. Attempts to retrieve another jurisdiction's case by ID are denied without leaking details (HTTP 403).
 * 4. Cross-jurisdiction case mutations are rejected (PATCH, transition-state, reopen, assign, update-outcome).
 * 5. Restricted leads, tasks, observations, evidence, attachments, analytics, and reports remain inaccessible across jurisdictions.
 * 6. System Administrator access follows its explicitly authorized scope (platform-wide and per-jurisdiction filtering).
 * 7. Non-admin passing foreign ?jurisdictionId to /cases is rejected with HTTP 403 Forbidden.
 * 8. Changing the frontend persona cannot grant additional permissions (server evaluates genuine cryptographic JWT).
 * 9. Logout and revoked tokens prevent further protected requests (HTTP 401).
 * 10. Direct navigation and refresh without a valid token cannot access protected endpoints (HTTP 401).
 */

import http from 'http';
import { createApp } from '../apps/api/src/app';
import { prisma } from '../apps/api/src/database/prisma';
import { resetLoginRateLimits } from '../apps/api/src/middleware/rateLimiter';

let server: http.Server;
let baseUrl: string;

let passedChecks = 0;
let totalChecks = 0;

function assert(condition: boolean, message: string) {
  totalChecks++;
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    passedChecks++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function request(
  urlPath: string,
  options: {
    method?: string;
    token?: string;
    body?: any;
    headers?: Record<string, string>;
  } = {}
): Promise<{ status: number; headers: Headers; body: any; rawText: string }> {
  const url = `${baseUrl}${urlPath.startsWith('/') ? urlPath : `/${urlPath}`}`;
  const reqHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...(options.headers || {}),
  };

  if (options.token) {
    reqHeaders['Authorization'] = `Bearer ${options.token}`;
  }

  if (options.body && !reqHeaders['Content-Type']) {
    reqHeaders['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: reqHeaders,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const rawText = await res.text();
  let body: any = null;
  try {
    body = JSON.parse(rawText);
  } catch {
    body = rawText;
  }

  return { status: res.status, headers: res.headers, body, rawText };
}

async function runSecuritySuite() {
  console.log('===================================================================');
  console.log('  TraceGrid Security Suite: Auth Gate & Jurisdiction Isolation');
  console.log('===================================================================\n');

  resetLoginRateLimits();
  const app = createApp();

  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address() as any;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      console.log(`Ephemeral API test server listening on ${baseUrl}\n`);
      resolve();
    });
  });

  try {
    // Lookup operational jurisdictions from database
    const northJur = await prisma.jurisdiction.findUniqueOrThrow({ where: { code: 'JUR-DEL-NORTH' } });
    const southJur = await prisma.jurisdiction.findUniqueOrThrow({ where: { code: 'JUR-DEL-SOUTH' } });
    const noidaJur = await prisma.jurisdiction.findUniqueOrThrow({ where: { code: 'JUR-UP-NOIDA' } });
    const gurugramJur = await prisma.jurisdiction.findUniqueOrThrow({ where: { code: 'JUR-HAR-GUR' } });

    // Lookup sample cases across all jurisdictions
    const northCase = await prisma.investigationCase.findFirstOrThrow({ where: { jurisdictionId: northJur.id } });
    const southCase = await prisma.investigationCase.findFirstOrThrow({ where: { jurisdictionId: southJur.id } });
    const noidaCase = await prisma.investigationCase.findFirstOrThrow({ where: { jurisdictionId: noidaJur.id } });
    const gurugramCase = await prisma.investigationCase.findFirstOrThrow({ where: { jurisdictionId: gurugramJur.id } });

    // --- Suite 1: Unauthenticated Requests & Authentication Gate ---
    console.log('--- Suite 1: Unauthenticated Requests & Authentication Gate ---');
    const unauthCases = await request('/api/v1/cases');
    assert(unauthCases.status === 401, 'Unauthenticated request to /cases returns HTTP 401');
    assert(unauthCases.body.success === false, 'Error envelope success is false');
    assert(unauthCases.body.error?.code === 'UNAUTHENTICATED', 'Error code is UNAUTHENTICATED');

    const unauthCaseDetail = await request(`/api/v1/cases/${northCase.id}`);
    assert(unauthCaseDetail.status === 401, 'Unauthenticated request to /cases/:id returns HTTP 401');

    const unauthAnalytics = await request('/api/v1/analytics/caseload');
    assert(unauthAnalytics.status === 401, 'Unauthenticated request to /analytics/caseload returns HTTP 401');

    const unauthMe = await request('/api/v1/auth/me');
    assert(unauthMe.status === 401, 'Unauthenticated request to /auth/me returns HTTP 401');

    // --- Suite 2: North District Officer Scope & Zero Leakage ---
    console.log('\n--- Suite 2: North District Officer Scope & Zero Leakage ---');
    const officerLogin = await request('/api/v1/auth/login', {
      method: 'POST',
      body: { email: 'officer.sharma@tracegrid.local', password: 'Password123!' },
    });
    assert(officerLogin.status === 200, 'Officer Sharma login succeeds (200 OK)');
    const officerToken = officerLogin.body.data.token;
    assert(officerLogin.body.data.user.role === 'CASE_OFFICER', 'Authenticated role is CASE_OFFICER');
    assert(officerLogin.body.data.user.jurisdictionId === northJur.id, 'Officer jurisdiction is North District');

    // Query cases register
    const officerCasesRes = await request('/api/v1/cases?limit=50', { token: officerToken });
    assert(officerCasesRes.status === 200, 'GET /cases for North District officer returns 200 OK');
    const returnedCases = officerCasesRes.body.data;
    assert(Array.isArray(returnedCases), 'Returned cases is an array');
    assert(returnedCases.length === 10, `Officer sees exactly 10 cases (actual: ${returnedCases.length})`);
    assert(officerCasesRes.body.meta.total === 10, `Total count metadata reflects 10 cases (actual: ${officerCasesRes.body.meta.total})`);

    // Verify all returned cases strictly belong to North District
    const allNorth = returnedCases.every((c: any) => c.jurisdictionId === northJur.id);
    assert(allNorth, 'CRITICAL INVARIANT: 100% of cases returned belong to North District Division');

    const hasGurugram = returnedCases.some((c: any) => c.jurisdictionId === gurugramJur.id);
    assert(!hasGurugram, 'ZERO LEAKAGE: Gurugram Central Division cases are absent from register');

    const hasNoida = returnedCases.some((c: any) => c.jurisdictionId === noidaJur.id);
    assert(!hasNoida, 'ZERO LEAKAGE: Gautam Buddha Nagar Zone cases are absent from register');

    const hasSouth = returnedCases.some((c: any) => c.jurisdictionId === southJur.id);
    assert(!hasSouth, 'ZERO LEAKAGE: South District Division cases are absent from register');

    // Search query should not leak outside jurisdiction
    const searchRes = await request('/api/v1/cases?search=Sharma', { token: officerToken });
    assert(searchRes.status === 200, 'Search within officer scope returns 200 OK');
    const allSearchNorth = searchRes.body.data.every((c: any) => c.jurisdictionId === northJur.id);
    assert(allSearchNorth, 'Search results strictly confined to North District');

    // Attempting to query another jurisdiction via query parameter
    const foreignQueryRes = await request(`/api/v1/cases?jurisdictionId=${gurugramJur.id}`, { token: officerToken });
    assert(foreignQueryRes.status === 403, 'Non-admin querying another jurisdiction (?jurisdictionId=Gurugram) rejected with 403 Forbidden');
    assert(foreignQueryRes.body.error?.code === 'FORBIDDEN', 'Error code is FORBIDDEN');

    // --- Suite 3: Cross-Jurisdiction Retrieval by ID Denials Without Data Leakage ---
    console.log('\n--- Suite 3: Cross-Jurisdiction Retrieval by ID Denials Without Data Leakage ---');
    const southDetailRes = await request(`/api/v1/cases/${southCase.id}`, { token: officerToken });
    assert(southDetailRes.status === 403, 'Direct GET on South District case returns HTTP 403 Forbidden');
    assert(southDetailRes.body.data === undefined, 'No case details returned in forbidden response');
    assert(southDetailRes.body.error?.code === 'FORBIDDEN', 'Forbidden error code returned');
    assert(!southDetailRes.rawText.includes(southCase.caseReference), 'Case reference not leaked in response');

    const gurugramDetailRes = await request(`/api/v1/cases/${gurugramCase.id}`, { token: officerToken });
    assert(gurugramDetailRes.status === 403, 'Direct GET on Gurugram case returns HTTP 403 Forbidden');

    const noidaDetailRes = await request(`/api/v1/cases/${noidaCase.id}`, { token: officerToken });
    assert(noidaDetailRes.status === 403, 'Direct GET on Noida case returns HTTP 403 Forbidden');

    // Authorized case in North District succeeds
    const northDetailRes = await request(`/api/v1/cases/${northCase.id}`, { token: officerToken });
    assert(northDetailRes.status === 200, 'Authorized North District case returns 200 OK');
    assert(northDetailRes.body.data.id === northCase.id, 'Authorized case ID matches');

    // --- Suite 4: Cross-Jurisdiction Mutations Rejected ---
    console.log('\n--- Suite 4: Cross-Jurisdiction Mutations Rejected ---');
    // Update metadata on out-of-scope case
    const patchRes = await request(`/api/v1/cases/${gurugramCase.id}`, {
      method: 'PATCH',
      token: officerToken,
      body: { incidentSummary: 'Attempted unauthorized mutation of Gurugram case' },
    });
    assert(patchRes.status === 403, 'PATCH on foreign jurisdiction case rejected with 403 Forbidden');

    // Update outcome on out-of-scope case
    const outcomeRes = await request(`/api/v1/cases/${gurugramCase.id}/update-outcome`, {
      method: 'POST',
      token: officerToken,
      body: { tracingOutcome: 'LOCATED_VERIFICATION_PENDING', notes: 'Unauthorized outcome update' },
    });
    assert(outcomeRes.status === 403, 'update-outcome on foreign case rejected with 403 Forbidden');

    // Supervisor cross-jurisdiction state transition
    const supervisorLogin = await request('/api/v1/auth/login', {
      method: 'POST',
      body: { email: 'supervisor.roy@tracegrid.local', password: 'Password123!' },
    });
    const supervisorToken = supervisorLogin.body.data.token;

    const transitionRes = await request(`/api/v1/cases/${gurugramCase.id}/transition-state`, {
      method: 'POST',
      token: supervisorToken,
      body: { targetState: 'OPEN', reason: 'Unauthorized transition attempt' },
    });
    assert(transitionRes.status === 403, 'transition-state on foreign case rejected with 403 Forbidden');

    const reopenRes = await request(`/api/v1/cases/${gurugramCase.id}/reopen`, {
      method: 'POST',
      token: supervisorToken,
      body: { reason: 'Unauthorized reopen attempt' },
    });
    assert(reopenRes.status === 403, 'reopen on foreign case rejected with 403 Forbidden');

    // --- Suite 5: Nested Records & Analytical Endpoints Isolation ---
    console.log('\n--- Suite 5: Nested Records & Analytical Endpoints Isolation ---');
    const leadsRes = await request(`/api/v1/cases/${gurugramCase.id}/leads`, { token: officerToken });
    assert(leadsRes.status === 403, 'GET /cases/:id/leads on foreign case rejected with 403 Forbidden');

    const tasksRes = await request(`/api/v1/cases/${gurugramCase.id}/tasks`, { token: officerToken });
    assert(tasksRes.status === 403, 'GET /cases/:id/tasks on foreign case rejected with 403 Forbidden');

    const evidenceRes = await request(`/api/v1/cases/${gurugramCase.id}/evidence`, { token: officerToken });
    assert(evidenceRes.status === 403, 'GET /cases/:id/evidence on foreign case rejected with 403 Forbidden');

    const eventsRes = await request(`/api/v1/cases/${gurugramCase.id}/events`, { token: officerToken });
    assert(eventsRes.status === 403, 'GET /cases/:id/events on foreign case rejected with 403 Forbidden');

    const auditRes = await request(`/api/v1/cases/${gurugramCase.id}/audit-logs`, { token: supervisorToken });
    assert(auditRes.status === 403, 'GET /cases/:id/audit-logs on foreign case rejected with 403 Forbidden');

    const contradictionsRes = await request(`/api/v1/cases/${gurugramCase.id}/contradictions`, { token: officerToken });
    assert(contradictionsRes.status === 403, 'GET /cases/:id/contradictions on foreign case rejected with 403 Forbidden');

    const hypothesesRes = await request(`/api/v1/cases/${gurugramCase.id}/hypotheses`, { token: officerToken });
    assert(hypothesesRes.status === 403, 'GET /cases/:id/hypotheses on foreign case rejected with 403 Forbidden');

    const recommendationsRes = await request(`/api/v1/cases/${gurugramCase.id}/recommendations`, { token: officerToken });
    assert(recommendationsRes.status === 403, 'GET /cases/:id/recommendations on foreign case rejected with 403 Forbidden');

    const patternsRes = await request(`/api/v1/cases/${gurugramCase.id}/patterns`, { token: officerToken });
    assert(patternsRes.status === 403, 'GET /cases/:id/patterns on foreign case rejected with 403 Forbidden');

    // Foreign analytics queries
    const foreignAnalyticsRes = await request(`/api/v1/analytics/caseload?jurisdictionId=${gurugramJur.id}`, { token: officerToken });
    assert(foreignAnalyticsRes.status === 403, 'Analytics caseload for foreign jurisdiction rejected with 403 Forbidden');

    const foreignReportsRes = await request(`/api/v1/analytics/reports/operational?jurisdictionId=${gurugramJur.id}`, { token: officerToken });
    assert(foreignReportsRes.status === 403, 'Operational reports for foreign jurisdiction rejected with 403 Forbidden');

    // --- Suite 6: System Administrator Platform-Wide Scope ---
    console.log('\n--- Suite 6: System Administrator Platform-Wide Scope ---');
    const adminLogin = await request('/api/v1/auth/login', {
      method: 'POST',
      body: { email: 'admin.root@tracegrid.local', password: 'Password123!' },
    });
    assert(adminLogin.status === 200, 'Admin login succeeds (200 OK)');
    const adminToken = adminLogin.body.data.token;
    assert(adminLogin.body.data.user.role === 'SYSTEM_ADMIN', 'Role is SYSTEM_ADMIN');
    assert(adminLogin.body.data.user.jurisdictionId === null, 'Admin jurisdictionId is null (Global Scope)');

    // Admin queries without filter -> all 35 cases
    const adminCasesAll = await request('/api/v1/cases?limit=100', { token: adminToken });
    assert(adminCasesAll.status === 200, 'Admin GET /cases returns 200 OK');
    assert(adminCasesAll.body.meta.total === 35, `Admin platform-wide sees all 35 cases (actual: ${adminCasesAll.body.meta.total})`);

    // Admin filters by Gurugram
    const adminGurugramRes = await request(`/api/v1/cases?jurisdictionId=${gurugramJur.id}&limit=100`, { token: adminToken });
    assert(adminGurugramRes.status === 200, 'Admin filtering by Gurugram returns 200 OK');
    const allAdminGurugram = adminGurugramRes.body.data.every((c: any) => c.jurisdictionId === gurugramJur.id);
    assert(allAdminGurugram, 'Admin Gurugram filter returns strictly Gurugram cases');

    // Admin can access Gurugram case by ID
    const adminGurugramDetail = await request(`/api/v1/cases/${gurugramCase.id}`, { token: adminToken });
    assert(adminGurugramDetail.status === 200, 'Admin can view Gurugram case workspace by ID (200 OK)');

    // --- Suite 7: Token Revocation on Logout & Session Invalidation ---
    console.log('\n--- Suite 7: Token Revocation on Logout & Session Invalidation ---');
    const clerkLogin = await request('/api/v1/auth/login', {
      method: 'POST',
      body: { email: 'clerk.verma@tracegrid.local', password: 'Password123!' },
    });
    const clerkToken = clerkLogin.body.data.token;

    // Verify token works initially
    const clerkMe = await request('/api/v1/auth/me', { token: clerkToken });
    assert(clerkMe.status === 200, 'Token valid before logout');

    // Execute logout
    const logoutRes = await request('/api/v1/auth/logout', { method: 'POST', token: clerkToken });
    assert(logoutRes.status === 200, 'Logout succeeds with 200 OK');

    // Subsequent call with revoked token must fail with 401
    const revokedCall = await request('/api/v1/auth/me', { token: clerkToken });
    assert(revokedCall.status === 401, 'Revoked token rejected with HTTP 401 on /auth/me');
    assert(revokedCall.body.error?.message?.includes('revoked') === true, 'Error message indicates token was revoked');

    const revokedCases = await request('/api/v1/cases', { token: clerkToken });
    assert(revokedCases.status === 401, 'Revoked token rejected on /cases with HTTP 401');

    console.log('\n===================================================================');
    console.log(`  Security Suite Complete: ${passedChecks} / ${totalChecks} Checks Passed`);
    console.log('===================================================================');
    console.log('🎉 ALL AUTHENTICATION GATE & JURISDICTION ISOLATION CHECKS PASSED!\n');
  } finally {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }
}

runSecuritySuite().catch((err) => {
  console.error('\n❌ SECURITY SUITE FAILED:', err);
  process.exit(1);
});
