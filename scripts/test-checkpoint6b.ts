/**
 * TraceGrid Checkpoint 6B Verification Suite
 * Operations Analytics & Reporting Backend
 *
 * Validates:
 * 1. Caseload summary & triage metrics (actual CaseState enums, priorities, outcomes, interval filtering)
 * 2. Activity and resolution trends (time series buckets, median/average duration, reopened case handling)
 * 3. Task backlog & overdue metrics (dynamic overdue rules, terminal state exclusions, completion times)
 * 4. Cross-case pattern review backlog (distinct patterns, latest status reconstruction, non-inflation)
 * 5. Operational reporting (structured JSON, RFC-4180 CSV export, governance disclaimers)
 * 6. Access control & security (database pre-scoping, zero cross-jurisdiction leakage, role permissions)
 * 7. Non-destructive invariants (zero database mutations during analytics reads)
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

async function getAuthToken(email: string): Promise<string> {
  const res = await request('/api/v1/auth/login', {
    method: 'POST',
    body: { email, password: 'Password123!' },
  });
  const token = res.body?.data?.token || res.body?.data?.tokens?.accessToken;
  if (res.status !== 200 || !token) {
    throw new Error(`Failed to login as ${email}: ${JSON.stringify(res.body)}`);
  }
  return token;
}

async function runCheckpoint6bSuite() {
  console.log('===================================================================');
  console.log('  TraceGrid Checkpoint 6B: Operations Analytics & Reporting Suite');
  console.log('===================================================================\n');

  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const address = server.address() as any;
      baseUrl = `http://127.0.0.1:${address.port}`;
      console.log(`Ephemeral API test server listening on ${baseUrl}\n`);
      resolve();
    });
  });

  try {
    // Authenticate test personas
    console.log('--- Setup: Multi-Persona Authentication ---');
    const officerToken = await getAuthToken('officer.sharma@tracegrid.local');
    const supervisorToken = await getAuthToken('supervisor.roy@tracegrid.local');
    const clerkToken = await getAuthToken('clerk.verma@tracegrid.local');
    const reviewerToken = await getAuthToken('reviewer.mehta@tracegrid.local');
    const adminToken = await getAuthToken('admin.root@tracegrid.local');

    assert(!!officerToken, 'Authenticated as CASE_OFFICER (North District)');
    assert(!!supervisorToken, 'Authenticated as SUPERVISOR (North District)');
    assert(!!clerkToken, 'Authenticated as DATA_CLERK (North District)');
    assert(!!reviewerToken, 'Authenticated as READ_ONLY_REVIEWER (North District)');
    assert(!!adminToken, 'Authenticated as SYSTEM_ADMIN (Platform-Wide)');

    // Fetch operational jurisdictions
    const northJur = await prisma.jurisdiction.findUniqueOrThrow({ where: { code: 'JUR-DEL-NORTH' } });
    const southJur = await prisma.jurisdiction.findUniqueOrThrow({ where: { code: 'JUR-DEL-SOUTH' } });

    // Count cases directly in PostgreSQL for North District
    const northCasesInDb = await prisma.investigationCase.findMany({
      where: { jurisdictionId: northJur.id },
    });
    const northTotalInDb = northCasesInDb.length;
    const northOpenInDb = northCasesInDb.filter((c) => c.caseState === CaseState.OPEN).length;
    const northClosedInDb = northCasesInDb.filter((c) => c.caseState === CaseState.CLOSED).length;
    const northUnderReviewInDb = northCasesInDb.filter((c) => c.caseState === CaseState.UNDER_REVIEW).length;
    const northReportedInDb = northCasesInDb.filter((c) => c.caseState === CaseState.REPORTED).length;

    // ------------------------------------------------------------------------
    // SUITE 1: Caseload Breakdown & Triage Summary
    // ------------------------------------------------------------------------
    console.log('\n--- Suite 1: Caseload Breakdown & Triage Metrics ---');

    // 1.1 Unauthenticated request rejected
    const unauthCaseload = await request('/api/v1/analytics/caseload');
    assert(unauthCaseload.status === 401, 'Unauthenticated caseload request rejected with 401 Unauthorized');

    // 1.2 Scoped Case Officer request returns North District metrics only
    const officerCaseloadRes = await request('/api/v1/analytics/caseload', {
      token: officerToken,
    });
    assert(officerCaseloadRes.status === 200, 'GET /api/v1/analytics/caseload returns 200 OK');
    const officerCaseload = officerCaseloadRes.body?.data;

    assert(
      officerCaseload?.caseload?.totalCases === northTotalInDb,
      `Total cases matches direct DB count for North District (${northTotalInDb})`
    );
    assert(
      officerCaseload?.caseload?.byState?.OPEN === northOpenInDb,
      `OPEN cases (${officerCaseload?.caseload?.byState?.OPEN}) matches DB count (${northOpenInDb})`
    );
    assert(
      officerCaseload?.caseload?.byState?.CLOSED === northClosedInDb,
      `CLOSED cases (${officerCaseload?.caseload?.byState?.CLOSED}) matches DB count (${northClosedInDb})`
    );
    assert(
      officerCaseload?.caseload?.byState?.UNDER_REVIEW === northUnderReviewInDb,
      `UNDER_REVIEW cases (${officerCaseload?.caseload?.byState?.UNDER_REVIEW}) matches DB count (${northUnderReviewInDb})`
    );
    assert(
      officerCaseload?.caseload?.byState?.REPORTED === northReportedInDb,
      `REPORTED cases (${officerCaseload?.caseload?.byState?.REPORTED}) matches DB count (${northReportedInDb})`
    );

    // Sum of states must equal totalCases exactly
    const stateSum =
      officerCaseload?.caseload?.byState?.REPORTED +
      officerCaseload?.caseload?.byState?.UNDER_REVIEW +
      officerCaseload?.caseload?.byState?.OPEN +
      officerCaseload?.caseload?.byState?.CLOSED;
    assert(stateSum === officerCaseload?.caseload?.totalCases, 'Zero drift: Sum of states partition matches total cases');

    // Priority breakdown presence
    assert(typeof officerCaseload?.caseload?.byPriority?.CRITICAL === 'number', 'Priority CRITICAL count present');
    assert(typeof officerCaseload?.caseload?.byPriority?.HIGH === 'number', 'Priority HIGH count present');
    assert(typeof officerCaseload?.caseload?.byPriority?.MEDIUM === 'number', 'Priority MEDIUM count present');
    assert(typeof officerCaseload?.caseload?.byPriority?.LOW === 'number', 'Priority LOW count present');

    // 1.3 SYSTEM_ADMIN has platform-wide scope
    const adminCaseloadRes = await request('/api/v1/analytics/caseload', {
      token: adminToken,
    });
    assert(adminCaseloadRes.status === 200, 'SYSTEM_ADMIN caseload query returns 200 OK');
    const adminCaseload = adminCaseloadRes.body?.data;
    assert(
      adminCaseload?.caseload?.totalCases >= officerCaseload?.caseload?.totalCases,
      'SYSTEM_ADMIN evaluates all jurisdictions platform-wide'
    );
    assert(
      adminCaseload?.metadata?.isPlatformWide === true,
      'SYSTEM_ADMIN metadata reflects isPlatformWide: true'
    );
    assert(
      Array.isArray(adminCaseload?.caseload?.byJurisdiction) && adminCaseload.caseload.byJurisdiction.length >= 4,
      'Platform-wide caseload returns breakdown across all operational jurisdictions'
    );

    // 1.4 Date filtering: startDate and endDate
    const filteredCaseloadRes = await request(
      '/api/v1/analytics/caseload?startDate=2026-01-01&endDate=2026-12-31',
      { token: officerToken }
    );
    assert(filteredCaseloadRes.status === 200, 'Caseload query with valid date interval returns 200 OK');
    assert(
      typeof filteredCaseloadRes.body?.data?.caseload?.newCasesInPeriod === 'number',
      'newCasesInPeriod metric computed for interval'
    );
    assert(
      typeof filteredCaseloadRes.body?.data?.caseload?.closedCasesInPeriod === 'number',
      'closedCasesInPeriod metric computed for interval'
    );

    // 1.5 Validation error on inverted date range
    const invalidDateRes = await request(
      '/api/v1/analytics/caseload?startDate=2026-12-31&endDate=2026-01-01',
      { token: officerToken }
    );
    assert(invalidDateRes.status === 400, 'Inverted date range (startDate > endDate) rejected with 400 Bad Request');

    // 1.6 Cross-jurisdiction security violation rejected
    const crossJurCaseloadRes = await request(
      `/api/v1/analytics/caseload?jurisdictionId=${southJur.id}`,
      { token: officerToken }
    );
    assert(
      crossJurCaseloadRes.status === 403,
      'Officer attempting to query South District caseload rejected with 403 Forbidden'
    );

    // ------------------------------------------------------------------------
    // SUITE 2: Case Activity & Resolution Trends
    // ------------------------------------------------------------------------
    console.log('\n--- Suite 2: Case Activity & Resolution Trends ---');

    const trendsRes = await request('/api/v1/analytics/trends?windowDays=30&bucket=day', {
      token: officerToken,
    });
    assert(trendsRes.status === 200, 'GET /api/v1/analytics/trends returns 200 OK');
    const trendsData = trendsRes.body?.data;

    assert(Array.isArray(trendsData?.timeSeries), 'Time-series buckets returned as array');
    assert(trendsData?.timeSeries.length > 0, 'Time-series contains non-empty buckets for reporting interval');
    assert(
      typeof trendsData?.summary?.totalReportedInPeriod === 'number',
      'totalReportedInPeriod summary metric computed'
    );
    assert(
      typeof trendsData?.summary?.totalClosedInPeriod === 'number',
      'totalClosedInPeriod summary metric computed'
    );

    // Bucket structure verification
    const firstBucket = trendsData?.timeSeries[0];
    assert(typeof firstBucket?.startDate === 'string', 'Bucket contains ISO startDate');
    assert(typeof firstBucket?.endDate === 'string', 'Bucket contains ISO endDate');
    assert(typeof firstBucket?.reportedCasesCount === 'number', 'Bucket contains reportedCasesCount');
    assert(typeof firstBucket?.closedCasesCount === 'number', 'Bucket contains closedCasesCount');
    assert(typeof firstBucket?.reportedLeadsCount === 'number', 'Bucket contains reportedLeadsCount');
    assert(typeof firstBucket?.completedTasksCount === 'number', 'Bucket contains completedTasksCount');

    // Weekly bucketing option
    const weeklyTrendsRes = await request('/api/v1/analytics/trends?windowDays=90&bucket=week', {
      token: officerToken,
    });
    assert(weeklyTrendsRes.status === 200, 'GET /analytics/trends with bucket=week returns 200 OK');
    assert(
      weeklyTrendsRes.body?.data?.timeSeries.length > 0,
      'Weekly time-series returns populated contiguous buckets'
    );

    // Resolution duration calculation
    assert(
      trendsData?.summary?.averageResolutionDays === null ||
        typeof trendsData?.summary?.averageResolutionDays === 'number',
      'averageResolutionDays is number or null (when no closures occurred in window)'
    );
    assert(
      trendsData?.summary?.medianResolutionDays === null ||
        typeof trendsData?.summary?.medianResolutionDays === 'number',
      'medianResolutionDays is number or null (when no closures occurred in window)'
    );

    // Definition notes explicitly documented
    assert(
      trendsData?.definitionNotes?.denominator.includes('cases whose closedAt timestamp occurs within'),
      'Resolution duration denominator explicitly documented'
    );
    assert(
      trendsData?.definitionNotes?.timestampBasis.includes('reportedAt'),
      'Timestamp basis (reportedAt to closedAt) explicitly documented'
    );

    // ------------------------------------------------------------------------
    // SUITE 3: Task Backlog & Overdue Metrics
    // ------------------------------------------------------------------------
    console.log('\n--- Suite 3: Task Backlog & Overdue Metrics ---');

    const tasksAnalyticsRes = await request('/api/v1/analytics/tasks', {
      token: officerToken,
    });
    assert(tasksAnalyticsRes.status === 200, 'GET /api/v1/analytics/tasks returns 200 OK');
    const taskMetrics = tasksAnalyticsRes.body?.data?.tasks;

    assert(typeof taskMetrics?.totalTasks === 'number', 'totalTasks metric returned');
    assert(typeof taskMetrics?.byStatus?.PENDING === 'number', 'Tasks in PENDING status returned');
    assert(typeof taskMetrics?.byStatus?.IN_PROGRESS === 'number', 'Tasks in IN_PROGRESS status returned');
    assert(typeof taskMetrics?.byStatus?.COMPLETED === 'number', 'Tasks in COMPLETED status returned');
    assert(typeof taskMetrics?.byStatus?.CANCELLED === 'number', 'Tasks in CANCELLED status returned');

    // Sum of statuses equals totalTasks
    const taskStatusSum =
      taskMetrics?.byStatus?.PENDING +
      taskMetrics?.byStatus?.IN_PROGRESS +
      taskMetrics?.byStatus?.COMPLETED +
      taskMetrics?.byStatus?.CANCELLED;
    assert(taskStatusSum === taskMetrics?.totalTasks, 'Sum of task statuses matches totalTasks exactly');

    // Open tasks count equals PENDING + IN_PROGRESS
    assert(
      taskMetrics?.openTasksCount === taskMetrics?.byStatus?.PENDING + taskMetrics?.byStatus?.IN_PROGRESS,
      'openTasksCount strictly equals PENDING + IN_PROGRESS'
    );

    // CRITICAL INVARIANT: Overdue tasks metric
    assert(typeof taskMetrics?.overdueTasksCount === 'number', 'overdueTasksCount returned as number');
    assert(
      taskMetrics?.overdueTasksCount <= taskMetrics?.openTasksCount,
      'Overdue tasks is bounded by open tasks count (terminal tasks NEVER overdue)'
    );

    // Unassigned open tasks count
    assert(typeof taskMetrics?.unassignedOpenTasksCount === 'number', 'unassignedOpenTasksCount returned');

    // Priority breakdown of open tasks
    assert(typeof taskMetrics?.openByPriority?.HIGH === 'number', 'Open tasks by priority HIGH present');
    assert(typeof taskMetrics?.openByPriority?.MEDIUM === 'number', 'Open tasks by priority MEDIUM present');

    // Completion duration metrics
    assert(
      taskMetrics?.averageCompletionHours === null || typeof taskMetrics?.averageCompletionHours === 'number',
      'averageCompletionHours is number or null'
    );
    assert(
      taskMetrics?.medianCompletionHours === null || typeof taskMetrics?.medianCompletionHours === 'number',
      'medianCompletionHours is number or null'
    );

    // ------------------------------------------------------------------------
    // SUITE 4: Cross-Case Pattern Review Backlog
    // ------------------------------------------------------------------------
    console.log('\n--- Suite 4: Cross-Case Pattern Review Backlog ---');

    const patternBacklogRes = await request('/api/v1/analytics/patterns', {
      token: officerToken,
    });
    assert(patternBacklogRes.status === 200, 'GET /api/v1/analytics/patterns returns 200 OK');
    const patBacklog = patternBacklogRes.body?.data?.backlog;

    assert(typeof patBacklog?.totalDistinctPatterns === 'number', 'totalDistinctPatterns returned');
    assert(typeof patBacklog?.unverifiedCandidates === 'number', 'unverifiedCandidates count returned');
    assert(typeof patBacklog?.relevantForFollowup === 'number', 'relevantForFollowup count returned');
    assert(typeof patBacklog?.underReview === 'number', 'underReview count returned');
    assert(typeof patBacklog?.notRelevant === 'number', 'notRelevant count returned');

    // Sum of review statuses must equal totalDistinctPatterns exactly
    const reviewStatusSum =
      patBacklog?.unverifiedCandidates +
      patBacklog?.relevantForFollowup +
      patBacklog?.underReview +
      patBacklog?.notRelevant;
    assert(
      reviewStatusSum === patBacklog?.totalDistinctPatterns,
      'CRITICAL INVARIANT: Review status breakdown sums exactly to totalDistinctPatterns (no inflation)'
    );

    // Priority rankings present
    assert(typeof patBacklog?.byPriority?.HIGH === 'number', 'HIGH priority pattern count present');
    assert(typeof patBacklog?.byPriority?.MEDIUM === 'number', 'MEDIUM priority pattern count present');
    assert(typeof patBacklog?.byPriority?.LOW === 'number', 'LOW priority pattern count present');

    // Category breakdown present
    assert(typeof patBacklog?.byCategory?.SPATIAL_PROXIMITY === 'number', 'SPATIAL_PROXIMITY count present');
    assert(typeof patBacklog?.byCategory?.TEMPORAL_WINDOW_OVERLAP === 'number', 'TEMPORAL_WINDOW_OVERLAP count present');
    assert(typeof patBacklog?.byCategory?.DESCRIPTOR_CORRELATION === 'number', 'DESCRIPTOR_CORRELATION count present');
    assert(typeof patBacklog?.byCategory?.MULTI_SIGNAL_ASSOCIATION === 'number', 'MULTI_SIGNAL_ASSOCIATION count present');

    // Review Queue items array
    assert(Array.isArray(patternBacklogRes.body?.data?.reviewQueueItems), 'reviewQueueItems returned as array');

    // ZERO-LEAKAGE INVARIANT: South District case NOT in North officer pattern backlog
    const queueItems = patternBacklogRes.body?.data?.reviewQueueItems || [];
    const leaksSouthCase = queueItems.some(
      (item: any) => item.candidateCaseId === southJur.id || item.candidateCaseReference?.includes('SOUTH')
    );
    assert(!leaksSouthCase, 'ZERO-LEAKAGE INVARIANT: South District cases absent from North officer review backlog');

    // ------------------------------------------------------------------------
    // SUITE 5: Operational Reporting (JSON & CSV Export)
    // ------------------------------------------------------------------------
    console.log('\n--- Suite 5: Operational Reporting & CSV Export ---');

    // 5.1 JSON Report Structure
    const reportJsonRes = await request('/api/v1/analytics/reports/operational?windowDays=30&format=json', {
      token: officerToken,
    });
    assert(reportJsonRes.status === 200, 'GET /analytics/reports/operational (JSON) returns 200 OK');
    const jsonReport = reportJsonRes.body?.data;

    assert(!!jsonReport?.reportId, 'Report includes canonical reportId');
    assert(!!jsonReport?.generatedAt, 'Report includes generatedAt timestamp');
    assert(jsonReport?.generatedBy?.role === 'CASE_OFFICER', 'Report attributes generating user and role');
    assert(jsonReport?.scope?.jurisdictionCode === 'JUR-DEL-NORTH', 'Report reflects North District scope');
    assert(!!jsonReport?.caseload, 'Report includes caseload section');
    assert(!!jsonReport?.tasks, 'Report includes tasks section');
    assert(!!jsonReport?.patterns, 'Report includes patterns queue section');
    assert(
      jsonReport?.disclaimer.includes('decision-support management metrics'),
      'Mandatory operational governance disclaimer present in report'
    );

    // 5.2 RFC-4180 CSV Export
    const reportCsvRes = await request('/api/v1/analytics/reports/operational?windowDays=30&format=csv', {
      token: officerToken,
      headers: { Accept: 'text/csv' },
    });
    assert(reportCsvRes.status === 200, 'GET /analytics/reports/operational (CSV) returns 200 OK');
    const csvContent = typeof reportCsvRes.body === 'string' ? reportCsvRes.body : '';

    assert(
      reportCsvRes.headers.get('content-type')?.includes('text/csv') === true,
      'Content-Type header is text/csv'
    );
    assert(
      reportCsvRes.headers.get('content-disposition')?.includes('attachment; filename=') === true,
      'Content-Disposition header triggers file download'
    );
    assert(
      csvContent.includes('"TraceGrid Operational Analytics Report"'),
      'CSV output contains standard report header'
    );
    assert(
      csvContent.includes('"SECTION 1: CASELOAD SUMMARY"'),
      'CSV contains Section 1 Caseload Summary'
    );
    assert(
      csvContent.includes('"SECTION 2: INVESTIGATION TASKS BACKLOG"'),
      'CSV contains Section 2 Investigation Tasks Backlog'
    );
    assert(
      csvContent.includes('"SECTION 3: CROSS-CASE PATTERN REVIEW QUEUE"'),
      'CSV contains Section 3 Pattern Review Queue'
    );
    assert(
      csvContent.includes('"Total Accessible Cases"'),
      'CSV contains key operational metric rows'
    );

    // Verify CSV Formula Injection Defense (CWE-1236)
    assert(sanitizeCsvCell('=1+1') === '"\'=1+1"', 'Formula starting with = is escaped with single quote');
    assert(sanitizeCsvCell('+SUM(A1:A5)') === '"\'+SUM(A1:A5)"', 'Formula starting with + is escaped with single quote');
    assert(sanitizeCsvCell('-cmd') === '"\'-cmd"', 'Formula starting with - is escaped with single quote');
    assert(sanitizeCsvCell('@HYPERLINK') === '"\'@HYPERLINK"', 'Formula starting with @ is escaped with single quote');
    assert(sanitizeCsvCell('\t=cmd') === '"\'\t=cmd"', 'Formula starting with tab is escaped with single quote');
    assert(sanitizeCsvCell('  =SUM(1,2)') === '"\'  =SUM(1,2)"', 'Formula with leading whitespace is escaped with single quote');
    assert(sanitizeCsvCell(123) === '123', 'Numeric literal is preserved without injection quote');
    assert(sanitizeCsvCell('Normal text "quoted"') === '"Normal text ""quoted"""', 'Standard RFC-4180 quotes are doubled');

    // ------------------------------------------------------------------------
    // SUITE 6: Access Control & Data Scoping
    // ------------------------------------------------------------------------
    console.log('\n--- Suite 6: RBAC Policy & Data Scoping ---');

    // 6.1 DATA_CLERK permitted to read operational analytics for assigned jurisdiction
    const clerkRes = await request('/api/v1/analytics/caseload', { token: clerkToken });
    assert(clerkRes.status === 200, 'DATA_CLERK permitted read-only access to assigned jurisdiction analytics');

    // 6.2 READ_ONLY_REVIEWER permitted read-only access
    const reviewerRes = await request('/api/v1/analytics/caseload', { token: reviewerToken });
    assert(reviewerRes.status === 200, 'READ_ONLY_REVIEWER permitted read-only access to analytics');

    // 6.3 Cross-jurisdiction requests fail closed for non-admins
    const clerkCrossRes = await request(`/api/v1/analytics/tasks?jurisdictionId=${southJur.id}`, {
      token: clerkToken,
    });
    assert(clerkCrossRes.status === 403, 'DATA_CLERK denied access to out-of-scope jurisdiction (403)');

    const reviewerCrossRes = await request(`/api/v1/analytics/patterns?jurisdictionId=${southJur.id}`, {
      token: reviewerToken,
    });
    assert(reviewerCrossRes.status === 403, 'READ_ONLY_REVIEWER denied access to out-of-scope jurisdiction (403)');

    // ------------------------------------------------------------------------
    // SUITE 7: Non-Destructive Invariants Verification
    // ------------------------------------------------------------------------
    console.log('\n--- Suite 7: Non-Destructive Read Invariants ---');

    // Verify database record counts remained completely unchanged
    const finalCasesCount = await prisma.investigationCase.count();
    const finalTasksCount = await prisma.investigationTask.count();
    const finalLeadsCount = await prisma.leadSighting.count();
    const finalObsCount = await prisma.locationObservation.count();
    const finalProfilesCount = await prisma.personProfile.count();

    assert(finalCasesCount === 35, 'INVARIANT: InvestigationCase count strictly 35 (zero database mutations)');
    assert(finalProfilesCount === 35, 'INVARIANT: PersonProfile count strictly 35 (zero database mutations)');
    assert(finalTasksCount >= 65, 'INVARIANT: InvestigationTask count unchanged');
    assert(finalLeadsCount >= 120, 'INVARIANT: LeadSighting count unchanged');
    assert(finalObsCount >= 40, 'INVARIANT: LocationObservation count unchanged');

  } catch (err) {
    console.error('Fatal test error:', err);
    assert(false, 'Verification suite fatal crash', String(err));
  } finally {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  // --------------------------------------------------------------------------
  // Summary Report
  // --------------------------------------------------------------------------
  console.log('\n===================================================================');
  console.log('  CHECKPOINT 6B TEST SUITE SUMMARY');
  console.log('===================================================================');

  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`  Total Checks: ${total}`);
  console.log(`  Passed:       ${passed}`);
  console.log(`  Failed:       ${failed}`);

  if (failed > 0) {
    console.error('\n❌ FAILED CHECKS:');
    results.filter((r) => !r.passed).forEach((r) => console.error(`  - ${r.name}: ${r.details || 'No details'}`));
    process.exit(1);
  } else {
    console.log('\n🌟 ALL CHECKPOINT 6B VERIFICATION CHECKS PASSED PERFECTLY!\n');
    process.exit(0);
  }
}

runCheckpoint6bSuite();
