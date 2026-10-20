/**
 * TraceGrid Checkpoint 6C Verification Suite
 * Operations Dashboard & Reports Frontend Integration Verification
 *
 * Validates:
 * 1. Persona authentication & RBAC policy resolution
 * 2. Caseload analytics & lifecycle state triage
 * 3. Activity and resolution trends with multi-window (7d, 30d, 90d) and bucket support
 * 4. Task backlog metrics, overdue SLA boundaries, and officer allocation
 * 5. Cross-case pattern review queue integrity and signal telemetry
 * 6. Interactive pattern detail retrieval and human review submission workflow
 * 7. Operational report generation (JSON summary + RFC-4180 CSV export)
 * 8. CSV Formula Injection Defense (CWE-1236)
 * 9. Non-destructive invariants (zero database mutations during analytics reads)
 */

import http from 'http';
import { createApp } from '../apps/api/src/app';
import { prisma } from '../apps/api/src/database/prisma';
import { Role, CaseState, Priority, TaskStatus } from '@prisma/client';
import { sanitizeCsvCell } from '../apps/api/src/modules/analytics/analytics.util';

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

async function request(
  path: string,
  options: {
    method?: string;
    token?: string;
    body?: any;
    headers?: Record<string, string>;
  } = {}
) {
  const url = `${baseUrl}${path}`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...options.headers,
  };

  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  let bodyContent: any = undefined;
  if (options.body) {
    headers['Content-Type'] = 'application/json';
    bodyContent = JSON.stringify(options.body);
  }

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: bodyContent,
  });

  const contentType = response.headers.get('content-type') || '';
  let data: any = null;
  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  return {
    status: response.status,
    headers: response.headers,
    body: data,
  };
}

async function runCheckpoint6cTests() {
  console.log('===================================================================');
  console.log('  TraceGrid Checkpoint 6C: Operations Dashboard & Reports Suite');
  console.log('===================================================================\n');

  try {
    const app = createApp();
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        console.log(`Ephemeral API test server listening on ${baseUrl}\n`);
        resolve();
      });
    });

    // ------------------------------------------------------------------------
    // SETUP: Multi-Persona Authentication
    // ------------------------------------------------------------------------
    console.log('--- Setup: Multi-Persona Authentication ---');

    const officerLogin = await request('/api/v1/auth/login', {
      method: 'POST',
      body: { email: 'officer.sharma@tracegrid.local', password: 'Password123!' },
    });
    const officerToken = officerLogin.body?.data?.token;
    assert(officerLogin.status === 200 && !!officerToken, 'Authenticated as CASE_OFFICER (North District)');

    const supervisorLogin = await request('/api/v1/auth/login', {
      method: 'POST',
      body: { email: 'supervisor.roy@tracegrid.local', password: 'Password123!' },
    });
    const supervisorToken = supervisorLogin.body?.data?.token;
    assert(supervisorLogin.status === 200 && !!supervisorToken, 'Authenticated as SUPERVISOR (North District)');

    const clerkLogin = await request('/api/v1/auth/login', {
      method: 'POST',
      body: { email: 'clerk.verma@tracegrid.local', password: 'Password123!' },
    });
    const clerkToken = clerkLogin.body?.data?.token;
    assert(clerkLogin.status === 200 && !!clerkToken, 'Authenticated as DATA_CLERK (North District)');

    const reviewerLogin = await request('/api/v1/auth/login', {
      method: 'POST',
      body: { email: 'reviewer.mehta@tracegrid.local', password: 'Password123!' },
    });
    const reviewerToken = reviewerLogin.body?.data?.token;
    assert(reviewerLogin.status === 200 && !!reviewerToken, 'Authenticated as READ_ONLY_REVIEWER (North District)');

    const adminLogin = await request('/api/v1/auth/login', {
      method: 'POST',
      body: { email: 'admin.root@tracegrid.local', password: 'Password123!' },
    });
    const adminToken = adminLogin.body?.data?.token;
    assert(adminLogin.status === 200 && !!adminToken, 'Authenticated as SYSTEM_ADMIN (Platform-Wide)');

    const northJur = await prisma.jurisdiction.findUniqueOrThrow({ where: { code: 'JUR-DEL-NORTH' } });
    const southJur = await prisma.jurisdiction.findUniqueOrThrow({ where: { code: 'JUR-DEL-SOUTH' } });

    // ------------------------------------------------------------------------
    // SUITE 1: Operations Dashboard Caseload & Lifecycle Integration
    // ------------------------------------------------------------------------
    console.log('\n--- Suite 1: Operations Dashboard Caseload Integration ---');

    const caseloadRes = await request('/api/v1/analytics/caseload', { token: officerToken });
    assert(caseloadRes.status === 200, 'GET /api/v1/analytics/caseload returns 200 OK');
    const casePayload = caseloadRes.body.data;
    assert(typeof casePayload.caseload.totalCases === 'number', 'Caseload payload contains totalCases count');
    assert(
      casePayload.caseload.byState.REPORTED !== undefined &&
      casePayload.caseload.byState.UNDER_REVIEW !== undefined &&
      casePayload.caseload.byState.OPEN !== undefined &&
      casePayload.caseload.byState.CLOSED !== undefined,
      'Caseload partition contains all 4 standard case states (REPORTED, UNDER_REVIEW, OPEN, CLOSED)'
    );
    assert(
      casePayload.caseload.byPriority.CRITICAL !== undefined &&
      casePayload.caseload.byPriority.HIGH !== undefined &&
      casePayload.caseload.byPriority.MEDIUM !== undefined &&
      casePayload.caseload.byPriority.LOW !== undefined,
      'Caseload partition contains all 4 priority tiers'
    );
    assert(
      casePayload.caseload.byState.REPORTED +
      casePayload.caseload.byState.UNDER_REVIEW +
      casePayload.caseload.byState.OPEN +
      casePayload.caseload.byState.CLOSED === casePayload.caseload.totalCases,
      'Zero drift: Sum of state partition strictly equals totalCases'
    );

    // ------------------------------------------------------------------------
    // SUITE 2: Multi-Window Trends Integration (7D, 30D, 90D)
    // ------------------------------------------------------------------------
    console.log('\n--- Suite 2: Multi-Window Trends Integration ---');

    for (const days of [7, 30, 90]) {
      const trendRes = await request(`/api/v1/analytics/trends?windowDays=${days}`, { token: officerToken });
      assert(trendRes.status === 200, `GET /api/v1/analytics/trends?windowDays=${days} returns 200 OK`);
      assert(trendRes.body.data.metadata.reportingInterval.windowDays === days, `Trends metadata reflects windowDays=${days}`);
      assert(Array.isArray(trendRes.body.data.timeSeries), `Time series returned for ${days}D window`);
      assert(trendRes.body.data.definitionNotes.timestampBasis.includes('reportedAt'), 'Timestamp basis explicitly documented');
    }

    // Weekly bucket verification
    const weekTrendRes = await request('/api/v1/analytics/trends?windowDays=30&bucket=week', { token: officerToken });
    assert(weekTrendRes.status === 200, 'GET /api/v1/analytics/trends with bucket=week returns 200 OK');
    assert(weekTrendRes.body.data.metadata.reportingInterval.bucketType === 'week', 'Metadata reflects bucketType=week');

    // ------------------------------------------------------------------------
    // SUITE 3: Task Backlog & Overdue Metrics
    // ------------------------------------------------------------------------
    console.log('\n--- Suite 3: Task Backlog & Officer Allocation ---');

    const tasksRes = await request('/api/v1/analytics/tasks', { token: officerToken });
    assert(tasksRes.status === 200, 'GET /api/v1/analytics/tasks returns 200 OK');
    const taskPayload = tasksRes.body.data.tasks;
    assert(typeof taskPayload.totalTasks === 'number', 'Tasks payload contains totalTasks');
    assert(typeof taskPayload.openTasksCount === 'number', 'Tasks payload contains openTasksCount');
    assert(typeof taskPayload.overdueTasksCount === 'number', 'Tasks payload contains overdueTasksCount');
    assert(
      taskPayload.overdueTasksCount <= taskPayload.openTasksCount,
      'Invariant: Overdue tasks count is bounded by open tasks count'
    );
    assert(Array.isArray(taskPayload.openByAssignee), 'Open tasks by assignee array populated');
    assert(
      typeof taskPayload.unassignedOpenTasksCount === 'number',
      'Unassigned open tasks count tracked for supervisor workload balancing'
    );

    // ------------------------------------------------------------------------
    // SUITE 4: Cross-Case Pattern Review Queue & Triage Backlog
    // ------------------------------------------------------------------------
    console.log('\n--- Suite 4: Cross-Case Pattern Review Queue ---');

    const patternBacklogRes = await request('/api/v1/analytics/patterns', { token: officerToken });
    assert(patternBacklogRes.status === 200, 'GET /api/v1/analytics/patterns returns 200 OK');
    const patternPayload = patternBacklogRes.body.data.backlog;
    assert(typeof patternPayload.totalDistinctPatterns === 'number', 'Total distinct patterns returned');
    assert(
      patternPayload.unverifiedCandidates +
      patternPayload.relevantForFollowup +
      patternPayload.underReview +
      patternPayload.notRelevant === patternPayload.totalDistinctPatterns,
      'Invariant: Review status categories partition totalDistinctPatterns without double counting'
    );
    assert(Array.isArray(patternBacklogRes.body.data.reviewQueueItems), 'reviewQueueItems list populated for queue UI');
    assert(
      patternBacklogRes.body.data.definitions.distinctPatterns.includes('canonical pattern identifiers'),
      'Analytical association definitions attached to pattern backlog'
    );

    // ------------------------------------------------------------------------
    // SUITE 5: Pattern Detail & Human Review Action Workflow
    // ------------------------------------------------------------------------
    console.log('\n--- Suite 5: Pattern Detail Retrieval & Review Submission ---');

    // Find a North District case with patterns
    const northCase = await prisma.investigationCase.findFirstOrThrow({
      where: { jurisdictionId: northJur.id },
      include: { observations: true },
    });

    const casePatternsRes = await request(`/api/v1/cases/${northCase.id}/patterns`, { token: officerToken });
    assert(casePatternsRes.status === 200, `GET /api/v1/cases/:id/patterns returns 200 OK`);

    if (casePatternsRes.body.data.patterns.length > 0) {
      const targetPattern = casePatternsRes.body.data.patterns[0];
      const patternId = targetPattern.id;

      // 5.1 Retrieve pattern detail by ID
      const detailRes = await request(`/api/v1/cases/${northCase.id}/patterns/${patternId}`, {
        token: officerToken,
      });
      assert(detailRes.status === 200, 'GET /api/v1/cases/:id/patterns/:patternId returns 200 OK');
      assert(detailRes.body.data.id === patternId, 'Pattern ID matches requested target');
      assert(Array.isArray(detailRes.body.data.signals), 'Contributing signals array populated in detail view');
      assert(!!detailRes.body.data.supportingRecords, 'Supporting records comparison payload present');

      // 5.2 Validate review rationale minimum length requirement (< 5 chars rejected)
      const shortRationaleRes = await request(`/api/v1/cases/${northCase.id}/patterns/${patternId}/review`, {
        method: 'POST',
        token: officerToken,
        body: {
          decision: 'RELEVANT_FOR_FOLLOWUP',
          rationale: 'no', // too short (< 5 chars)
        },
      });
      assert(shortRationaleRes.status === 400, 'Review submission with < 5 chars rationale rejected (400 Bad Request)');

      // 5.3 Submit valid review decision by CASE_OFFICER
      const validReviewRes = await request(`/api/v1/cases/${northCase.id}/patterns/${patternId}/review`, {
        method: 'POST',
        token: officerToken,
        body: {
          decision: 'RELEVANT_FOR_FOLLOWUP',
          rationale: 'Physical description and spatio-temporal proximity warrant officer enquiry.',
        },
      });
      assert(validReviewRes.status === 200, 'CASE_OFFICER successfully records review decision (200 OK)');
      assert(
        validReviewRes.body.data.decision === 'RELEVANT_FOR_FOLLOWUP',
        'Pattern review decision recorded as RELEVANT_FOR_FOLLOWUP'
      );
      assert(
        validReviewRes.body.data.reviewedBy.role === 'CASE_OFFICER',
        'Review attributed to CASE_OFFICER role'
      );

      // Verify re-fetched pattern reflects latest review state
      const updatedPatternRes = await request(`/api/v1/cases/${northCase.id}/patterns/${patternId}`, {
        token: officerToken,
      });
      assert(
        updatedPatternRes.body.data.reviewStatus === 'RELEVANT_FOR_FOLLOWUP',
        'Pattern review status updated to RELEVANT_FOR_FOLLOWUP in pattern detail'
      );
      assert(
        updatedPatternRes.body.data.reviewHistory.decision === 'RELEVANT_FOR_FOLLOWUP',
        'Review history decision persisted in pattern detail'
      );

      // 5.4 READ_ONLY_REVIEWER forbidden from recording review decision
      const reviewerForbiddenRes = await request(`/api/v1/cases/${northCase.id}/patterns/${patternId}/review`, {
        method: 'POST',
        token: reviewerToken,
        body: {
          decision: 'NOT_RELEVANT',
          rationale: 'Unauthorized reviewer review attempt.',
        },
      });
      assert(reviewerForbiddenRes.status === 403, 'READ_ONLY_REVIEWER forbidden from recording pattern review (403)');
    } else {
      console.log('  ⚠️ [SKIP] No candidate patterns found for target North case; skipping detail assertions');
    }

    // ------------------------------------------------------------------------
    // SUITE 6: Operational Reports & CSV Download
    // ------------------------------------------------------------------------
    console.log('\n--- Suite 6: Operational Reports & CSV Export ---');

    // 6.1 JSON Report
    const reportJsonRes = await request('/api/v1/analytics/reports/operational?format=json&windowDays=30', {
      token: supervisorToken,
    });
    assert(reportJsonRes.status === 200, 'GET /api/v1/analytics/reports/operational (JSON) returns 200 OK');
    assert(!!reportJsonRes.body.data.reportId, 'Report ID generated');
    assert(!!reportJsonRes.body.data.caseload, 'Caseload section included in report');
    assert(!!reportJsonRes.body.data.tasks, 'Tasks section included in report');
    assert(!!reportJsonRes.body.data.patterns, 'Patterns section included in report');

    // 6.2 CSV Export
    const reportCsvRes = await request('/api/v1/analytics/reports/operational?format=csv&windowDays=30', {
      token: supervisorToken,
    });
    assert(reportCsvRes.status === 200, 'GET /api/v1/analytics/reports/operational (CSV) returns 200 OK');
    assert(reportCsvRes.headers.get('content-type')?.includes('text/csv') === true, 'Content-Type is text/csv');
    assert(
      reportCsvRes.headers.get('content-disposition')?.includes('attachment') === true,
      'Content-Disposition triggers file download'
    );

    // ------------------------------------------------------------------------
    // SUITE 7: CSV Formula Injection Defense (CWE-1236)
    // ------------------------------------------------------------------------
    console.log('\n--- Suite 7: CSV Formula Injection Defense Verification ---');

    assert(sanitizeCsvCell('=cmd|"/C calc"!A0') === '"\'=cmd|""/C calc""!A0"', 'Neutralized = formula execution');
    assert(sanitizeCsvCell('+1+2') === '"\'+1+2"', 'Neutralized + formula execution');
    assert(sanitizeCsvCell('-2+3') === '"\'-2+3"', 'Neutralized - formula execution');
    assert(sanitizeCsvCell('@SUM(1,2)') === '"\'@SUM(1,2)"', 'Neutralized @ formula execution');
    assert(sanitizeCsvCell('\t=1+1') === '"\'\t=1+1"', 'Neutralized leading tab formula trigger');
    assert(sanitizeCsvCell('   =SUM(1)') === '"\'   =SUM(1)"', 'Neutralized leading whitespace formula trigger');
    assert(sanitizeCsvCell(42) === '42', 'Preserved pure numeric literal 42 without injection prefix');
    assert(sanitizeCsvCell('Standard string') === '"Standard string"', 'RFC-4180 standard string wrapping');

    // ------------------------------------------------------------------------
    // SUITE 8: Non-Destructive Invariants Verification
    // ------------------------------------------------------------------------
    console.log('\n--- Suite 8: Non-Destructive Storage Invariants ---');

    const totalCasesCount = await prisma.investigationCase.count();
    const totalProfilesCount = await prisma.personProfile.count();
    const totalTasksCount = await prisma.investigationTask.count();
    const totalLeadsCount = await prisma.leadSighting.count();
    const totalObsCount = await prisma.locationObservation.count();

    assert(totalCasesCount === 35, 'INVARIANT: InvestigationCase count is strictly 35 (zero database mutations)');
    assert(totalProfilesCount === 35, 'INVARIANT: PersonProfile count is strictly 35 (zero database mutations)');
    assert(totalTasksCount >= 65, 'INVARIANT: InvestigationTask count intact');
    assert(totalLeadsCount >= 120, 'INVARIANT: LeadSighting count intact');
    assert(totalObsCount >= 40, 'INVARIANT: LocationObservation count intact');

  } catch (err) {
    console.error('Fatal test error:', err);
    assert(false, 'Verification suite fatal crash', String(err));
  } finally {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  // Summary
  console.log('\n===================================================================');
  console.log('  CHECKPOINT 6C TEST SUITE SUMMARY');
  console.log('===================================================================');
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`  Total Checks: ${results.length}`);
  console.log(`  Passed:       ${passed}`);
  console.log(`  Failed:       ${failed}`);

  if (failed > 0) {
    console.error(`\n❌ ${failed} CHECK(S) FAILED!`);
    process.exit(1);
  } else {
    console.log('\n🌟 ALL CHECKPOINT 6C VERIFICATION CHECKS PASSED PERFECTLY!');
  }
}

runCheckpoint6cTests();
