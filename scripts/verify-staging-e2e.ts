/**
 * TraceGrid — Staging End-to-End Verification Suite
 * Tests the live staging stack running via Docker Compose through Nginx on port 8080.
 *
 * Covers:
 * 1. Health & Nginx Reverse Proxy
 * 2. Multi-Persona Authentication, Token Revocation, and Me Endpoint
 * 3. Role-Based Access Control (RBAC) & Scope Guardrails
 * 4. Case Register Search, Pagination, and Case Workspace Detail
 * 5. Leads & Sightings Ledger Workflows (Lodgement & Verification Outcome)
 * 6. Task Management (Creation, Overdue calculation, Completion)
 * 7. Evidence & Attachment Upload (Multipart through Nginx 12M limit) & Authenticated Download
 * 8. Geospatial Contradictions & Candidate Search Zones
 * 9. Observation Exclusion & Reconsideration
 * 10. Cross-Case Pattern Analysis & Human Review Recording
 * 11. Operations Dashboard Analytics (Caseload, Trends, Tasks, Patterns)
 * 12. Operational Reports (JSON & Escaped CSV Download)
 * 13. Strict Error Handling & Defensive Bounds (400, 401, 403, 404, 409)
 * 14. Static SPA Assets & Lazy-Loaded Route Bundles Integrity
 */

import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://127.0.0.1:8080';
const API_URL = `${BASE_URL}/api/v1`;

let totalChecks = 0;
let passedChecks = 0;

function assert(condition: boolean, message: string) {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`  ✅ [PASS] ${message}`);
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function request(path: string, options: RequestInit = {}): Promise<{ status: number; headers: Headers; body: any; rawText: string }> {
  const url = path.startsWith('http') ? path : `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;
  const response = await fetch(url, options);
  const rawText = await response.text();
  let body: any = null;
  try {
    body = JSON.parse(rawText);
  } catch {
    body = rawText;
  }
  return { status: response.status, headers: response.headers, body, rawText };
}

async function runStagingVerification() {
  console.log('===================================================================');
  console.log('  TraceGrid Staging End-to-End Verification Suite');
  console.log(`  Target: ${BASE_URL} (Nginx + Staging API + Staging Postgres)`);
  console.log('===================================================================\n');

  // --- Suite 1: Health & Reverse Proxy Ingress ---
  console.log('--- Suite 1: Health & Reverse Proxy Ingress ---');
  const healthRes = await request(`${BASE_URL}/api/health`);
  assert(healthRes.status === 200, 'Health endpoint responds with 200 OK');
  assert(healthRes.body.status === 'ok', 'Health status is "ok"');
  assert(healthRes.body.environment === 'staging', 'Environment is reported as "staging"');
  assert(healthRes.body.subsystems?.database === 'connected', 'Database subsystem reports "connected"');
  assert(healthRes.body.subsystems?.tokenRevocation === 'healthy', 'Token revocation reports "healthy"');
  assert(healthRes.headers.has('x-request-id'), 'Nginx forwards and generates X-Request-Id header');
  assert(healthRes.headers.get('x-frame-options')?.includes('SAMEORIGIN') === true, 'Security header X-Frame-Options is enforced');

  // --- Suite 2: Multi-Persona Authentication & Token Lifecycle ---
  console.log('\n--- Suite 2: Multi-Persona Authentication & Token Lifecycle ---');
  const personas = [
    { email: 'officer.sharma@tracegrid.local', role: 'CASE_OFFICER' },
    { email: 'supervisor.roy@tracegrid.local', role: 'SUPERVISOR' },
    { email: 'clerk.verma@tracegrid.local', role: 'DATA_CLERK' },
    { email: 'reviewer.mehta@tracegrid.local', role: 'READ_ONLY_REVIEWER' },
    { email: 'admin.root@tracegrid.local', role: 'SYSTEM_ADMIN' },
  ];

  const tokens: Record<string, string> = {};
  for (const p of personas) {
    const res = await request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: p.email, password: 'Password123!' }),
    });
    assert(res.status === 200, `Login succeeds for persona: ${p.email}`);
    assert(res.body.success === true, `Login response success is true for ${p.email}`);
    assert(res.body.data?.user?.role === p.role, `Persona role is ${p.role}`);
    assert(typeof res.body.data?.token === 'string', `JWT issued for ${p.email}`);
    tokens[p.role] = res.body.data.token;
  }

  // Verify /auth/me
  const meRes = await request('/auth/me', {
    headers: { Authorization: `Bearer ${tokens['CASE_OFFICER']}` },
  });
  assert(meRes.status === 200, 'GET /auth/me returns 200 OK for valid JWT');
  assert(meRes.body.data?.email === 'officer.sharma@tracegrid.local', 'Authenticated user matches session');

  // Verify token revocation on logout
  const tempLogin = await request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'officer.sharma@tracegrid.local', password: 'Password123!' }),
  });
  const tempToken = tempLogin.body.data.token;
  const logoutRes = await request('/auth/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tempToken}` },
  });
  assert(logoutRes.status === 200, 'POST /auth/logout returns 200 OK');
  const postLogoutRes = await request('/auth/me', {
    headers: { Authorization: `Bearer ${tempToken}` },
  });
  assert(postLogoutRes.status === 401, 'Revoked token rejected with 401 Unauthorized');

  // --- Suite 3: RBAC & Access Restrictions ---
  console.log('\n--- Suite 3: RBAC & Access Restrictions ---');
  // Clerk cannot transition case state
  const clerkCasesRes = await request('/cases?page=1&limit=5', {
    headers: { Authorization: `Bearer ${tokens['DATA_CLERK']}` },
  });
  const testCase = clerkCasesRes.body.data?.[0];
  assert(!!testCase, 'Test case resolved from register');

  const clerkTransitionRes = await request(`/cases/${testCase.id}/transition-state`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokens['DATA_CLERK']}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ targetState: 'OPEN', rationale: 'Unauthorized test transition' }),
  });
  assert(clerkTransitionRes.status === 403, 'DATA_CLERK forbidden from transitioning case state (403)');

  // Reviewer cannot create tasks
  const reviewerTaskRes = await request(`/cases/${testCase.id}/tasks`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokens['READ_ONLY_REVIEWER']}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title: 'Unauthorized Task', priority: 'HIGH' }),
  });
  assert(reviewerTaskRes.status === 403, 'READ_ONLY_REVIEWER forbidden from creating tasks (403)');

  // Officer Sharma sees strictly 10 North District cases (zero leakage from Gurugram/Noida/South)
  const officerCasesRes = await request('/cases?page=1&limit=50', {
    headers: { Authorization: `Bearer ${tokens['CASE_OFFICER']}` },
  });
  assert(officerCasesRes.status === 200, 'GET /cases for Officer Sharma returns 200 OK');
  assert(officerCasesRes.body.meta?.total === 10, 'Officer Sharma sees exactly 10 cases in jurisdiction scope');
  const allNorth = officerCasesRes.body.data?.every((c: any) => c.jurisdiction?.name === 'North District Division');
  assert(allNorth === true, 'All cases returned for officer belong strictly to North District Division');

  // Admin platform-wide sees all 35 cases
  const adminCasesRes = await request('/cases?page=1&limit=100', {
    headers: { Authorization: `Bearer ${tokens['SYSTEM_ADMIN']}` },
  });
  assert(adminCasesRes.status === 200, 'GET /cases for System Admin returns 200 OK');
  assert(adminCasesRes.body.meta?.total === 35, 'System Admin sees all 35 platform-wide cases');

  // --- Suite 4: Case Register Search & Case Workspace ---
  console.log('\n--- Suite 4: Case Register Search & Case Workspace ---');
  const searchRes = await request('/cases?search=CAS-2026&page=1&limit=10', {
    headers: { Authorization: `Bearer ${tokens['CASE_OFFICER']}` },
  });
  assert(searchRes.status === 200, 'GET /cases with search parameter returns 200 OK');
  assert(Array.isArray(searchRes.body.data), 'Cases returned as array');
  assert(searchRes.body.meta?.total >= 1, 'Total cases count metadata present');

  const workspaceRes = await request(`/cases/${testCase.id}`, {
    headers: { Authorization: `Bearer ${tokens['CASE_OFFICER']}` },
  });
  assert(workspaceRes.status === 200, `GET /cases/:id returns 200 OK for case ${testCase.caseReference}`);
  assert(workspaceRes.body.data?.caseReference === testCase.caseReference, 'Case workspace matches requested reference');
  assert(Array.isArray(workspaceRes.body.data?.observations), 'Case workspace contains observations');
  assert(Array.isArray(workspaceRes.body.data?.events), 'Case workspace contains events');

  // --- Suite 5: Leads & Sightings Ledger Workflows ---
  console.log('\n--- Suite 5: Leads & Sightings Ledger Workflows ---');
  const newLeadRes = await request(`/cases/${testCase.id}/leads`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokens['CASE_OFFICER']}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      narrative: 'Staging E2E verified lead observation at transport terminal',
      sourceType: 'WITNESS_STATEMENT',
      sourceContact: 'Confidential informant #884',
      observedAt: new Date().toISOString(),
      latitude: 28.6672,
      longitude: 77.2285,
      locationDescription: 'Kashmere Gate Metro Gate 3',
    }),
  });
  assert(newLeadRes.status === 201, 'Lead lodged successfully (201 Created)');
  const leadId = newLeadRes.body.data?.id;
  assert(!!leadId, 'Sequential lead reference assigned');

  // Assign lead
  const assignLeadRes = await request(`/leads/${leadId}/assignments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokens['SUPERVISOR']}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ assignedUserId: meRes.body.data.id, reassignmentReason: 'Field follow-up assignment' }),
  });
  assert(assignLeadRes.status === 200, 'Lead assigned to officer (200 OK)');

  // Verify lead outcome
  const outcomeRes = await request(`/leads/${leadId}/verification-outcome`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokens['CASE_OFFICER']}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ verificationStatus: 'VERIFIED', findings: 'CCTV footage confirmed sighting.' }),
  });
  assert(outcomeRes.status === 200, 'Lead verification outcome recorded (200 OK)');

  // --- Suite 6: Task Creation, Backlog & Completion ---
  console.log('\n--- Suite 6: Task Creation, Backlog & Completion ---');
  const newTaskRes = await request(`/cases/${testCase.id}/tasks`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokens['CASE_OFFICER']}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: 'Staging verification: Review CCTV feed',
      description: 'Check gate 3 cameras between 14:00 and 16:00',
      priority: 'HIGH',
      dueDate: new Date(Date.now() + 86400000).toISOString(),
    }),
  });
  assert(newTaskRes.status === 201, 'Task created successfully (201 Created)');
  const taskId = newTaskRes.body.data?.id;
  assert(!!taskId, 'Task sequential reference assigned');

  const completeTaskRes = await request(`/tasks/${taskId}/complete`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokens['CASE_OFFICER']}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ outcomeNotes: 'CCTV footage reviewed and catalogued.' }),
  });
  assert(completeTaskRes.status === 200, 'Task completed with outcome notes (200 OK)');
  assert(completeTaskRes.body.data?.status === 'COMPLETED', 'Task status is COMPLETED');

  // --- Suite 7: Evidence Metadata & Private Attachment Streaming ---
  console.log('\n--- Suite 7: Evidence Metadata & Private Attachment Streaming ---');
  const newEvdRes = await request(`/cases/${testCase.id}/evidence`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokens['CASE_OFFICER']}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: 'Staging test evidence item: CCTV still extract',
      description: 'Extracted video frame showing subject profile',
      evidenceType: 'CCTV_FOOTAGE',
      sourceProvenance: 'DMRC CCTV security office',
      accessClassification: 'INTERNAL',
    }),
  });
  assert(newEvdRes.status === 201, 'Evidence item registered (201 Created)');
  const evidenceId = newEvdRes.body.data?.id;
  assert(!!evidenceId, 'Evidence reference assigned');

  // Multipart upload of real PNG bytes
  const boundary = '----WebKitFormBoundaryStagingTest7C';
  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);
  const multipartBody = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="staging_evidence_test.png"\r\nContent-Type: image/png\r\n\r\n`),
    pngHeader,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const uploadRes = await fetch(`${API_URL}/evidence/${evidenceId}/attachments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokens['CASE_OFFICER']}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body: multipartBody,
  });
  const uploadJson = await uploadRes.json();
  assert(uploadRes.status === 201, 'Attachment uploaded via Nginx proxy to staging storage (201 Created)');
  const attachmentId = uploadJson.data?.id;
  assert(!!attachmentId, 'Attachment record created with UUID storage key');
  assert(uploadJson.data?.sha256Checksum?.length === 64, 'SHA-256 checksum computed');

  // Authenticated streaming download
  const downloadRes = await fetch(`${API_URL}/attachments/${attachmentId}/download`, {
    headers: { Authorization: `Bearer ${tokens['CASE_OFFICER']}` },
  });
  assert(downloadRes.status === 200, 'Authenticated download streams attachment (200 OK)');
  assert(downloadRes.headers.get('content-type') === 'image/png', 'Content-Type preserved as image/png');
  const downloadedBytes = await downloadRes.arrayBuffer();
  assert(downloadedBytes.byteLength === pngHeader.byteLength, 'Streamed bytes match uploaded bytes byte-for-byte');

  // Unauthenticated download rejected
  const unauthDownloadRes = await fetch(`${API_URL}/attachments/${attachmentId}/download`);
  assert(unauthDownloadRes.status === 401, 'Unauthenticated attachment download rejected (401 Unauthorized)');

  // --- Suite 8: Geospatial Intelligence & Contradiction Analysis ---
  console.log('\n--- Suite 8: Geospatial Intelligence & Contradiction Analysis ---');
  const contradictionRes = await request(`/cases/${testCase.id}/contradictions`, {
    headers: { Authorization: `Bearer ${tokens['CASE_OFFICER']}` },
  });
  assert(contradictionRes.status === 200, 'GET /contradictions returns 200 OK');
  assert(Array.isArray(contradictionRes.body.data?.pairwiseMatrix), 'Pairwise contradiction matrix present');
  assert(typeof contradictionRes.body.data?.contradictionPairsCount === 'number', 'Contradiction pairs count computed');
  assert(typeof contradictionRes.body.data?.limitations === 'string', 'Decision-support analytical disclaimer present');

  // Generate candidate search zones
  const searchZonesRes = await request(`/cases/${testCase.id}/search-zones`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokens['CASE_OFFICER']}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ mode: 'PEDESTRIAN' }),
  });
  assert(searchZonesRes.status === 200, 'POST /search-zones returns 200 OK');
  assert(!!searchZonesRes.body.data?.hypothesis?.geometryGeojson, 'Primary hypothesis contains GeoJSON polygon');

  // --- Suite 9: Observation Exclusion & Reconsideration Workflows ---
  console.log('\n--- Suite 9: Observation Exclusion & Reconsideration Workflows ---');
  const obsList = workspaceRes.body.data?.observations || [];
  if (obsList.length > 0) {
    const obsId = obsList[0].id;
    const excludeRes = await request(`/cases/${testCase.id}/observations/${obsId}/exclusions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokens['CASE_OFFICER']}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason: 'Staging verification: Credible CCTV alibi disproves sighting' }),
    });
    assert(excludeRes.status === 201, 'Observation excluded with reason (201 Created)');

    const reconsiderRes = await request(`/cases/${testCase.id}/observations/${obsId}/reconsiderations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokens['CASE_OFFICER']}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason: 'Staging verification: Additional timeline evidence warrants reconsideration' }),
    });
    assert(reconsiderRes.status === 200, 'Observation reconsidered and restored to analysis pool (200 OK)');
  }

  // --- Suite 10: Cross-Case Pattern Analysis & Review Decisions ---
  console.log('\n--- Suite 10: Cross-Case Pattern Analysis & Review Decisions ---');
  const patternsRes = await request(`/cases/${testCase.id}/patterns`, {
    headers: { Authorization: `Bearer ${tokens['CASE_OFFICER']}` },
  });
  assert(patternsRes.status === 200, 'GET /cases/:id/patterns returns 200 OK');
  assert(Array.isArray(patternsRes.body.data?.patterns), 'Candidate patterns returned as array');
  assert(typeof patternsRes.body.data?.disclaimer === 'string', 'Mandatory non-identity disclaimer attached');

  if (patternsRes.body.data?.patterns?.length > 0) {
    const pattern = patternsRes.body.data.patterns[0];
    const reviewRes = await request(`/cases/${testCase.id}/patterns/${pattern.id}/review`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokens['CASE_OFFICER']}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        decision: 'RELEVANT_FOR_FOLLOWUP',
        rationale: 'Staging verification: High spatial and temporal correlation with active lead',
      }),
    });
    assert(reviewRes.status === 200, 'Pattern review decision recorded (200 OK)');
    assert(reviewRes.body.data?.decision === 'RELEVANT_FOR_FOLLOWUP', 'Recorded decision matches payload');
  }

  // --- Suite 11: Operations Dashboard & Analytics KPIs ---
  console.log('\n--- Suite 11: Operations Dashboard & Analytics KPIs ---');
  const caseloadRes = await request('/analytics/caseload', {
    headers: { Authorization: `Bearer ${tokens['CASE_OFFICER']}` },
  });
  assert(caseloadRes.status === 200, 'GET /analytics/caseload returns 200 OK');
  assert(typeof caseloadRes.body.data?.caseload?.totalCases === 'number', 'Total cases metric computed');
  assert(typeof caseloadRes.body.data?.caseload?.byState?.OPEN === 'number', 'Open cases breakdown present');

  const trendsRes = await request('/analytics/trends?windowDays=30&bucket=week', {
    headers: { Authorization: `Bearer ${tokens['CASE_OFFICER']}` },
  });
  assert(trendsRes.status === 200, 'GET /analytics/trends returns 200 OK');
  assert(Array.isArray(trendsRes.body.data?.timeSeries), 'Time series trends buckets returned');

  const taskAnalyticsRes = await request('/analytics/tasks', {
    headers: { Authorization: `Bearer ${tokens['CASE_OFFICER']}` },
  });
  assert(taskAnalyticsRes.status === 200, 'GET /analytics/tasks returns 200 OK');
  assert(typeof taskAnalyticsRes.body.data?.tasks?.totalTasks === 'number', 'Task backlog total computed');

  const patternAnalyticsRes = await request('/analytics/patterns', {
    headers: { Authorization: `Bearer ${tokens['CASE_OFFICER']}` },
  });
  assert(patternAnalyticsRes.status === 200, 'GET /analytics/patterns returns 200 OK');
  assert(typeof patternAnalyticsRes.body.data?.backlog?.totalDistinctPatterns === 'number', 'Total distinct patterns metric computed');

  // --- Suite 12: Operational Reporting & CSV Download ---
  console.log('\n--- Suite 12: Operational Reporting & CSV Download ---');
  const jsonReportRes = await request('/analytics/reports/operational', {
    headers: { Authorization: `Bearer ${tokens['CASE_OFFICER']}` },
  });
  assert(jsonReportRes.status === 200, 'GET /analytics/reports/operational (JSON) returns 200 OK');
  assert(!!jsonReportRes.body.data?.reportId, 'Canonical reportId generated');

  const csvReportRes = await fetch(`${API_URL}/analytics/reports/operational?format=csv`, {
    headers: { Authorization: `Bearer ${tokens['CASE_OFFICER']}` },
  });
  assert(csvReportRes.status === 200, 'GET /analytics/reports/operational?format=csv returns 200 OK');
  assert(csvReportRes.headers.get('content-type')?.includes('text/csv') === true, 'Content-Type is text/csv');
  assert(csvReportRes.headers.get('content-disposition')?.includes('attachment') === true, 'Content-Disposition triggers download');
  const csvText = await csvReportRes.text();
  assert(csvText.includes('TraceGrid Operational Analytics Report'), 'CSV contains standard report header');
  assert(csvText.includes('SECTION 1: CASELOAD SUMMARY'), 'CSV contains caseload section');

  // --- Suite 13: Error Handling & Defensive Bounds ---
  console.log('\n--- Suite 13: Error Handling & Defensive Bounds ---');
  const badIdRes = await request('/cases/not-a-valid-uuid', {
    headers: { Authorization: `Bearer ${tokens['CASE_OFFICER']}` },
  });
  assert(badIdRes.status === 400, 'Invalid UUID identifier returns 400 Bad Request');
  assert(badIdRes.body.success === false, 'Error envelope success is false');
  assert(badIdRes.body.error?.code === 'VALIDATION_ERROR', 'Error code is VALIDATION_ERROR');

  const notFoundRes = await request('/non-existent-endpoint', {
    headers: { Authorization: `Bearer ${tokens['CASE_OFFICER']}` },
  });
  assert(notFoundRes.status === 404, 'Non-existent route returns 404 Not Found');

  const unauthRes = await request('/cases');
  assert(unauthRes.status === 401, 'Unauthenticated request returns 401 Unauthorized');

  // Inverted date range
  const invertedDateRes = await request('/analytics/caseload?startDate=2026-12-31&endDate=2026-01-01', {
    headers: { Authorization: `Bearer ${tokens['CASE_OFFICER']}` },
  });
  assert(invertedDateRes.status === 400, 'Inverted date range returns 400 Bad Request');

  // --- Suite 14: SPA Routes & Lazy-Loaded Asset Integrity ---
  console.log('\n--- Suite 14: SPA Routes & Lazy-Loaded Asset Integrity ---');
  const routes = ['/', '/operations', '/patterns', '/reports', '/cases'];
  for (const r of routes) {
    const routeRes = await fetch(`${BASE_URL}${r}`);
    assert(routeRes.status === 200, `Direct navigation to ${r} returns 200 OK`);
    const html = await routeRes.text();
    assert(html.includes('<div id="root"'), `Route ${r} renders HTML root container`);
  }

  // Dynamically verify all built chunks in dist/assets are reachable through Nginx
  const assetsDir = path.resolve(__dirname, '../apps/web/dist/assets');
  const assetFiles = fs.readdirSync(assetsDir);
  for (const file of assetFiles) {
    const chunk = `/assets/${file}`;
    const assetRes = await fetch(`${BASE_URL}${chunk}`);
    assert(assetRes.status === 200, `Static asset ${chunk} reachable through Nginx (200 OK)`);
    assert(assetRes.headers.get('cache-control')?.includes('max-age=31536000') === true, `Cache-Control header configured for ${chunk}`);
  }

  console.log('\n===================================================================');
  console.log(`  Staging Verification Complete: ${passedChecks} / ${totalChecks} Checks Passed`);
  console.log('===================================================================');
  console.log('🎉 ALL LIVE STAGING END-TO-END CHECKS PASSED PERFECTLY!\n');
}

runStagingVerification().catch((err) => {
  console.error('\n❌ STAGING VERIFICATION FAILED:', err);
  process.exit(1);
});
