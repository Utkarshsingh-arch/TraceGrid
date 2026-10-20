/**
 * TraceGrid Checkpoint 3A API & Service Test Suite
 * Validates Authentication, RBAC, Jurisdiction Scoping, and Case Management APIs.
 */

import http from 'http';
import jwt from 'jsonwebtoken';
import { createApp } from '../apps/api/src/app';
import { prisma } from '../apps/api/src/database/prisma';
import { env } from '../apps/api/src/config/env';
import { Role, CaseState, Priority } from '@prisma/client';

let server: http.Server;
let baseUrl: string;

interface TestResult {
  name: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, name: string, details?: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${name}`);
    results.push({ name, passed: true, details });
  } else {
    console.error(`  ❌ [FAIL] ${name} ${details ? `(${details})` : ''}`);
    results.push({ name, passed: false, details });
  }
}

async function request(path: string, options: { method?: string; token?: string; body?: any } = {}) {
  const url = `${baseUrl}${path}`;
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };

  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  return {
    status: response.status,
    ok: response.ok,
    body: json,
  };
}

async function runTests() {
  console.log('====================================================');
  console.log('  TraceGrid Checkpoint 3A: API & Security Test Suite');
  console.log('====================================================\n');

  // Boot server on ephemeral port
  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address() as any;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });

  console.log(`API test server listening on ${baseUrl}\n`);

  try {
    // ------------------------------------------------------------------------
    // SUITE 1: Authentication Endpoints & Token Security
    // ------------------------------------------------------------------------
    console.log('--- Suite 1: Authentication & Token Security ---');

    // Test 1: Successful login
    const loginRes = await request('/api/v1/auth/login', {
      method: 'POST',
      body: {
        email: 'officer.sharma@tracegrid.local',
        password: 'Password123!',
      },
    });
    assert(loginRes.status === 200 && !!loginRes.body.data.token, 'Login succeeds with valid credentials (200 OK)');
    const officerToken = loginRes.body.data.token;
    const officerUser = loginRes.body.data.user;
    assert(officerUser.role === Role.CASE_OFFICER, 'Authenticated user context contains correct role');
    assert(officerUser.passwordHash === undefined, 'Sensitive passwordHash is excluded from response');

    // Test 2: Invalid password
    const badPassRes = await request('/api/v1/auth/login', {
      method: 'POST',
      body: {
        email: 'officer.sharma@tracegrid.local',
        password: 'WrongPassword!',
      },
    });
    assert(
      badPassRes.status === 401 && badPassRes.body.error.code === 'UNAUTHENTICATED',
      'Invalid password returns 401 UNAUTHENTICATED'
    );

    // Test 3: Non-existent user
    const badUserRes = await request('/api/v1/auth/login', {
      method: 'POST',
      body: {
        email: 'unknown.ghost@tracegrid.local',
        password: 'Password123!',
      },
    });
    assert(
      badUserRes.status === 401 && badUserRes.body.error.message === 'Invalid email or password',
      'Non-existent account returns generic error message to prevent enumeration'
    );

    // Test 4: Current user context GET /auth/me
    const meRes = await request('/api/v1/auth/me', { token: officerToken });
    assert(meRes.status === 200 && meRes.body.data.email === 'officer.sharma@tracegrid.local', 'GET /auth/me returns current user context');

    // Test 5: Forged / Invalid token
    const forgedRes = await request('/api/v1/auth/me', { token: 'invalid.forged.token-123' });
    assert(forgedRes.status === 401 && forgedRes.body.error.code === 'UNAUTHENTICATED', 'Forged token rejected with 401');

    // Test 6: Expired token
    const expiredToken = jwt.sign(
      { sub: officerUser.id, email: officerUser.email, role: officerUser.role, jurisdictionId: officerUser.jurisdictionId },
      env.JWT_SECRET,
      { expiresIn: '-1s' }
    );
    const expiredRes = await request('/api/v1/auth/me', { token: expiredToken });
    assert(expiredRes.status === 401 && expiredRes.body.error.message.includes('expired'), 'Expired token rejected with 401');

    // Test 7: Logout & Token Revocation
    const logoutRes = await request('/api/v1/auth/logout', { method: 'POST', token: officerToken });
    assert(logoutRes.status === 200, 'POST /auth/logout returns 200 OK');

    const postLogoutRes = await request('/api/v1/auth/me', { token: officerToken });
    assert(postLogoutRes.status === 401 && postLogoutRes.body.error.message.includes('revoked'), 'Revoked token rejected with 401 on subsequent calls');

    // Log in all 5 demo users for subsequent tests
    const getLoginToken = async (email: string) => {
      const res = await request('/api/v1/auth/login', {
        method: 'POST',
        body: { email, password: 'Password123!' },
      });
      return res.body.data.token;
    };

    const supervisorToken = await getLoginToken('supervisor.roy@tracegrid.local');
    const clerkToken = await getLoginToken('clerk.verma@tracegrid.local');
    const adminToken = await getLoginToken('admin.root@tracegrid.local');
    const reviewerToken = await getLoginToken('reviewer.mehta@tracegrid.local');
    const freshOfficerToken = await getLoginToken('officer.sharma@tracegrid.local');

    // ------------------------------------------------------------------------
    // SUITE 2: Role-Based Access Control (RBAC)
    // ------------------------------------------------------------------------
    console.log('\n--- Suite 2: Role-Based Access Control (RBAC) ---');

    // Test 8: READ_ONLY_REVIEWER cannot create cases
    const reviewerCreateRes = await request('/api/v1/cases', {
      method: 'POST',
      token: reviewerToken,
      body: {
        personProfile: { fullName: 'Test Unauthorized' },
        case: { jurisdictionId: '00000000-0000-0000-0000-000000000000', missingSince: new Date().toISOString(), incidentSummary: 'Test' },
      },
    });
    assert(reviewerCreateRes.status === 403 && reviewerCreateRes.body.error.code === 'FORBIDDEN', 'READ_ONLY_REVIEWER forbidden from creating cases (403)');

    // Test 9: CASE_OFFICER cannot transition case states directly
    const aCase = await prisma.investigationCase.findFirstOrThrow({ where: { caseState: CaseState.REPORTED } });
    const officerTransitionRes = await request(`/api/v1/cases/${aCase.id}/transition-state`, {
      method: 'POST',
      token: freshOfficerToken,
      body: { targetState: CaseState.UNDER_REVIEW, reason: 'Officer attempting transition' },
    });
    assert(officerTransitionRes.status === 403, 'CASE_OFFICER forbidden from transitioning case state (403)');

    // ------------------------------------------------------------------------
    // SUITE 3: Jurisdiction Scoping & Isolation
    // ------------------------------------------------------------------------
    console.log('\n--- Suite 3: Jurisdiction Scoping & Isolation ---');

    const northJur = await prisma.jurisdiction.findUniqueOrThrow({ where: { code: 'JUR-DEL-NORTH' } });
    const southJur = await prisma.jurisdiction.findUniqueOrThrow({ where: { code: 'JUR-DEL-SOUTH' } });

    // Test 10: North officer attempting to register case in South jurisdiction
    const crossJurCreateRes = await request('/api/v1/cases', {
      method: 'POST',
      token: freshOfficerToken,
      body: {
        personProfile: {
          fullName: 'Cross Jurisdiction Subject',
          biologicalSex: 'MALE',
        },
        case: {
          jurisdictionId: southJur.id, // North officer targeting South!
          missingSince: new Date().toISOString(),
          incidentSummary: 'Attempted cross jurisdiction case lodgement',
        },
      },
    });
    assert(crossJurCreateRes.status === 403, 'User cannot lodge a case outside assigned jurisdiction (403)');

    // Test 11: Case listing automatically scoped to user jurisdiction
    const officerListRes = await request('/api/v1/cases', { token: freshOfficerToken });
    const officerCases = officerListRes.body.data;
    const allNorth = officerCases.every((c: any) => c.jurisdictionId === northJur.id);
    assert(allNorth && officerCases.length > 0, 'Case list strictly filtered to officer assigned jurisdiction only');

    // Test 12: SYSTEM_ADMIN can view cases across all jurisdictions
    const adminListRes = await request('/api/v1/cases', { token: adminToken });
    const adminCases = adminListRes.body.data;
    const hasMultipleJurs = new Set(adminCases.map((c: any) => c.jurisdictionId)).size > 1;
    assert(hasMultipleJurs, 'SYSTEM_ADMIN global scope returns cases across multiple jurisdictions');

    // Test 13: Attempting to access specific case belonging to another jurisdiction
    const southCase = await prisma.investigationCase.findFirstOrThrow({ where: { jurisdictionId: southJur.id } });
    const crossAccessRes = await request(`/api/v1/cases/${southCase.id}`, { token: freshOfficerToken });
    assert(crossAccessRes.status === 403, 'Direct access to out-of-scope case returns 403 FORBIDDEN');

    // ------------------------------------------------------------------------
    // SUITE 4: Case Registration & Atomic Integrity
    // ------------------------------------------------------------------------
    console.log('\n--- Suite 4: Case Registration & Atomic Transactions ---');

    // Test 14: Valid case registration
    const newCaseRes = await request('/api/v1/cases', {
      method: 'POST',
      token: freshOfficerToken,
      body: {
        personProfile: {
          fullName: 'Tanmay Saxena',
          aliases: ['Tony'],
          estimatedAge: 27,
          biologicalSex: 'MALE',
          identifyingFeatures: 'Small scar near right wrist, wearing black jacket',
        },
        case: {
          jurisdictionId: northJur.id,
          missingSince: new Date().toISOString(),
          priority: 'HIGH',
          incidentSummary: 'Last seen departing metro terminal on foot after evening shift.',
        },
      },
    });

    assert(newCaseRes.status === 201 && !!newCaseRes.body.data.id, 'Valid case registered successfully (201 Created)');
    const createdCase = newCaseRes.body.data;
    assert(createdCase.caseReference.startsWith('CAS-2026-'), 'Internal caseReference generated format CAS-YYYY-XXXX');
    assert(createdCase.caseState === CaseState.REPORTED, 'Initial case state defaults to REPORTED');
    assert(createdCase.tracingOutcome === 'NOT_TRACED', 'Initial tracing outcome defaults to NOT_TRACED');

    // Verify atomic initial CaseEvent and AuditLog were created
    const createdEvent = await prisma.caseEvent.findFirst({ where: { caseId: createdCase.id, eventType: 'CASE_CREATED' } });
    const createdAudit = await prisma.auditLog.findFirst({ where: { caseId: createdCase.id, action: 'CASE_CREATED' } });
    assert(createdEvent !== null, 'Initial CASE_CREATED event created atomically');
    assert(createdAudit !== null, 'Initial CASE_CREATED audit record logged atomically');

    // ------------------------------------------------------------------------
    // SUITE 5: Case Metadata Updates & Strict Protections
    // ------------------------------------------------------------------------
    console.log('\n--- Suite 5: Metadata Updates & Workflow Protections ---');

    // Test 15: Disallowed direct state modification via PATCH
    const patchStateRes = await request(`/api/v1/cases/${createdCase.id}`, {
      method: 'PATCH',
      token: freshOfficerToken,
      body: {
        caseState: 'CLOSED', // Prohibited in PATCH
        tracingOutcome: 'TRACED_VERIFIED', // Prohibited in PATCH
      },
    });
    assert(patchStateRes.status === 400, 'Attempted direct state/outcome mutation via PATCH is rejected (400)');

    // Test 16: Allowed metadata update
    const patchValidRes = await request(`/api/v1/cases/${createdCase.id}`, {
      method: 'PATCH',
      token: freshOfficerToken,
      body: {
        priority: Priority.CRITICAL,
        incidentSummary: 'Updated incident narrative with additional witness alibi context.',
      },
    });
    assert(patchValidRes.status === 200 && patchValidRes.body.data.priority === Priority.CRITICAL, 'Permitted metadata update succeeds (200 OK)');

    // ------------------------------------------------------------------------
    // SUITE 6: State Transition Machine & Closure Invariants
    // ------------------------------------------------------------------------
    console.log('\n--- Suite 6: State Transitions & Closure Invariants ---');

    // Test 17: Valid transition REPORTED -> UNDER_REVIEW
    const triageRes = await request(`/api/v1/cases/${createdCase.id}/transition-state`, {
      method: 'POST',
      token: supervisorToken,
      body: {
        targetState: CaseState.UNDER_REVIEW,
        reason: 'Case accepted for supervisory assessment and operational review.',
      },
    });
    assert(triageRes.status === 200 && triageRes.body.data.caseState === CaseState.UNDER_REVIEW, 'REPORTED -> UNDER_REVIEW transition succeeds (200 OK)');

    // Test 18: Valid transition UNDER_REVIEW -> OPEN
    const openRes = await request(`/api/v1/cases/${createdCase.id}/transition-state`, {
      method: 'POST',
      token: supervisorToken,
      body: {
        targetState: CaseState.OPEN,
        reason: 'Primary officer assigned and active operational canvassing commenced.',
      },
    });
    assert(openRes.status === 200 && openRes.body.data.caseState === CaseState.OPEN, 'UNDER_REVIEW -> OPEN transition succeeds (200 OK)');

    // Test 19: Case closure invariant: cannot close with outstanding tasks
    // Create an active task for createdCase
    await prisma.investigationTask.create({
      data: {
        taskReference: `TSK-TEST-${Date.now()}`,
        caseId: createdCase.id,
        title: 'Active Verification Task',
        description: 'Mandatory field check',
        dueDate: new Date(Date.now() + 86400000),
        status: 'PENDING',
      },
    });

    const prematureCloseRes = await request(`/api/v1/cases/${createdCase.id}/transition-state`, {
      method: 'POST',
      token: supervisorToken,
      body: {
        targetState: CaseState.CLOSED,
        reason: 'Attempted closure before task completion',
      },
    });
    assert(
      prematureCloseRes.status === 409 && prematureCloseRes.body.error.message.includes('outstanding tasks'),
      'Closure rejected when pending or in-progress tasks exist (409 Conflict)'
    );

    // Complete the task and retry closure
    await prisma.investigationTask.updateMany({
      where: { caseId: createdCase.id },
      data: { status: 'COMPLETED', completedAt: new Date(), outcomeNotes: 'Completed test task' },
    });

    const validCloseRes = await request(`/api/v1/cases/${createdCase.id}/transition-state`, {
      method: 'POST',
      token: supervisorToken,
      body: {
        targetState: CaseState.CLOSED,
        reason: 'All investigative leads vetted; formal case closure approved.',
      },
    });
    assert(validCloseRes.status === 200 && validCloseRes.body.data.caseState === CaseState.CLOSED, 'Case closes successfully once tasks are resolved');
    assert(validCloseRes.body.data.closedAt !== null, 'Case closedAt timestamp is populated');

    // Test 20: Reopening closed case
    const reopenRes = await request(`/api/v1/cases/${createdCase.id}/reopen`, {
      method: 'POST',
      token: supervisorToken,
      body: {
        reason: 'New credible CCTV footage submitted; case formally reopened.',
      },
    });
    assert(reopenRes.status === 200 && reopenRes.body.data.caseState === CaseState.OPEN, 'Closed case successfully reopened by supervisor (200 OK)');
    assert(reopenRes.body.data.closedAt === null, 'Reopened case clears closedAt timestamp');

    // Test 21: Attempting to reopen already open case
    const badReopenRes = await request(`/api/v1/cases/${createdCase.id}/reopen`, {
      method: 'POST',
      token: supervisorToken,
      body: { reason: 'Redundant reopen' },
    });
    assert(badReopenRes.status === 409, 'Attempting to reopen an open case rejected (409 Conflict)');

    // ------------------------------------------------------------------------
    // SUITE 7: Officer Assignment History
    // ------------------------------------------------------------------------
    console.log('\n--- Suite 7: Officer Assignment & History Preservation ---');

    const officer2 = await prisma.user.findFirstOrThrow({ where: { email: 'clerk.verma@tracegrid.local' } }); // using clerk ID as target test assignee
    const assignRes = await request(`/api/v1/cases/${createdCase.id}/assignments`, {
      method: 'POST',
      token: supervisorToken,
      body: {
        userId: officer2.id,
        assignmentRole: 'PRIMARY_OFFICER',
        reassignmentReason: 'Reassigned for specialized digital forensics follow-up.',
      },
    });
    assert(assignRes.status === 200 && assignRes.body.data.isActive === true, 'New assignment created and marked active (200 OK)');

    // Verify historical assignment was deactivated
    const oldAssignments = await prisma.caseAssignment.findMany({
      where: { caseId: createdCase.id, isActive: false },
    });
    assert(oldAssignments.length >= 1, 'Previous assignment preserved in database and marked isActive=false');

    // Cleanup created test case and children
    await prisma.investigationCase.delete({ where: { id: createdCase.id } });
    await prisma.personProfile.delete({ where: { id: createdCase.personProfileId } });

  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.$disconnect();
  }

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n====================================================');
  const failed = results.filter((r) => !r.passed);
  if (failed.length === 0) {
    console.log(`  🎉 ALL ${results.length} API INTEGRATION TESTS PASSED!`);
    console.log('====================================================');
    process.exit(0);
  } else {
    console.error(`  ❌ ${failed.length} / ${results.length} TESTS FAILED.`);
    console.log('====================================================');
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
