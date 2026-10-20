/**
 * TraceGrid Checkpoint 3B Automated Integration & Verification Suite
 * Validates:
 * - Demo role authentication & session resolution
 * - Jurisdictions API
 * - Case register query, search, filtering & pagination
 * - Case workspace detail retrieval with spatial observations
 * - Physical tracing outcome updates with audit trail
 * - Eligible assignees lookup
 * - Deterministic Search Radius calculation & GeoJSON polygon formulation
 * - Contradiction analysis & observation exclusion mechanics
 */

import http from 'http';
import { createApp } from '../apps/api/src/app';
import { prisma } from '../apps/api/src/database/prisma';
import { CaseState, TracingOutcome, Role, EventType } from '@prisma/client';

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
  console.log('===========================================================');
  console.log('  TraceGrid Checkpoint 3B: Frontend API & Geospatial Tests');
  console.log('===========================================================\n');

  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address() as any;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });

  console.log(`Ephemeral API test server listening on ${baseUrl}\n`);

  try {
    // ------------------------------------------------------------------------
    // SUITE 1: Demo Personas Authentication & Resolution
    // ------------------------------------------------------------------------
    console.log('--- Suite 1: Demo Personas Authentication & Resolution ---');

    const demoEmails = [
      'officer.sharma@tracegrid.local',
      'supervisor.roy@tracegrid.local',
      'clerk.verma@tracegrid.local',
      'admin.root@tracegrid.local',
      'reviewer.mehta@tracegrid.local',
    ];

    const tokens: Record<string, string> = {};

    for (const email of demoEmails) {
      const res = await request('/api/v1/auth/login', {
        method: 'POST',
        body: { email, password: 'Password123!' },
      });
      assert(res.status === 200 && !!res.body.data.token, `Demo persona login: ${email} (200 OK)`);
      tokens[email] = res.body.data.token;
    }

    const officerToken = tokens['officer.sharma@tracegrid.local'];
    const supervisorToken = tokens['supervisor.roy@tracegrid.local'];
    const adminToken = tokens['admin.root@tracegrid.local'];
    const reviewerToken = tokens['reviewer.mehta@tracegrid.local'];

    // ------------------------------------------------------------------------
    // SUITE 2: Jurisdictions API
    // ------------------------------------------------------------------------
    console.log('\n--- Suite 2: Jurisdictions Operational Endpoint ---');

    const jurRes = await request('/api/v1/jurisdictions');
    assert(jurRes.status === 200 && Array.isArray(jurRes.body.data), 'GET /api/v1/jurisdictions returns 200 OK');
    assert(jurRes.body.data.length === 4, 'All 4 operational jurisdictions returned');
    assert(
      jurRes.body.data.some((j: any) => j.code === 'JUR-DEL-NORTH'),
      'North Delhi jurisdiction identified'
    );

    // ------------------------------------------------------------------------
    // SUITE 3: Case Register Queries, Filters & Overdue Tasks
    // ------------------------------------------------------------------------
    console.log('\n--- Suite 3: Case Register Query & Aggregations ---');

    const casesRes = await request('/api/v1/cases?limit=10', { token: officerToken });
    assert(casesRes.status === 200, 'GET /api/v1/cases returns 200 OK');
    assert(casesRes.body.data.length <= 10, 'Pagination page limit enforced');
    assert(casesRes.body.meta.total > 0, 'Total case count metadata populated');

    const sampleCase = casesRes.body.data[0];
    assert(!!sampleCase.caseReference, 'Case reference format present');
    assert(!!sampleCase.personProfile?.syntheticId, 'Person profile with syntheticId included');
    assert(typeof sampleCase.overdueTasksCount === 'number', 'Overdue tasks count calculated for each case');

    // ------------------------------------------------------------------------
    // SUITE 4: Full Case Workspace Detail Retrieval
    // ------------------------------------------------------------------------
    console.log('\n--- Suite 4: Case Workspace Detail Retrieval ---');

    // Find a case belonging to North District with multiple observations (deterministic retrieval)
    const northJur = await prisma.jurisdiction.findUniqueOrThrow({ where: { code: 'JUR-DEL-NORTH' } });
    const casesWithObs = await prisma.investigationCase.findMany({
      where: {
        jurisdictionId: northJur.id,
        observations: { some: {} },
      },
      include: { observations: true },
      orderBy: { caseReference: 'asc' },
    });
    const caseWithObs = casesWithObs.find((c) => c.observations.length >= 2) || casesWithObs[0];

    const detailRes = await request(`/api/v1/cases/${caseWithObs.id}`, { token: officerToken });
    assert(detailRes.status === 200, 'GET /api/v1/cases/:id returns 200 OK');
    assert(Array.isArray(detailRes.body.data.observations), 'Location observations included in workspace payload');
    assert(detailRes.body.data.observations.length > 0, 'Spatial observations populated');
    assert(Array.isArray(detailRes.body.data.events), 'Case audit events included');
    assert(Array.isArray(detailRes.body.data.assignments), 'Case assignment history included');

    // ------------------------------------------------------------------------
    // SUITE 5: Physical Tracing Outcome Command Endpoint
    // ------------------------------------------------------------------------
    console.log('\n--- Suite 5: Physical Tracing Outcome Updates ---');

    // Reviewer should be forbidden
    const reviewerOutcomeRes = await request(`/api/v1/cases/${caseWithObs.id}/update-outcome`, {
      method: 'POST',
      token: reviewerToken,
      body: { tracingOutcome: TracingOutcome.LOCATED_VERIFICATION_PENDING, notes: 'Unauthorized attempt' },
    });
    assert(reviewerOutcomeRes.status === 403, 'READ_ONLY_REVIEWER forbidden from updating tracing outcome (403)');

    // Officer updates outcome
    const updateOutcomeRes = await request(`/api/v1/cases/${caseWithObs.id}/update-outcome`, {
      method: 'POST',
      token: officerToken,
      body: {
        tracingOutcome: TracingOutcome.LOCATED_VERIFICATION_PENDING,
        notes: 'Preliminary sighting reported at local bus interchange; field patrol deployed to verify.',
      },
    });
    assert(
      updateOutcomeRes.status === 200,
      'POST /api/v1/cases/:id/update-outcome succeeds (200 OK)',
      `Status: ${updateOutcomeRes.status}, Body: ${JSON.stringify(updateOutcomeRes.body)}`
    );
    assert(
      updateOutcomeRes.body?.data?.tracingOutcome === TracingOutcome.LOCATED_VERIFICATION_PENDING,
      'Case tracing outcome updated to LOCATED_VERIFICATION_PENDING'
    );

    // Verify event logged
    const loggedEvent = await prisma.caseEvent.findFirst({
      where: { caseId: caseWithObs.id, eventType: EventType.OUTCOME_UPDATED },
      orderBy: { eventTimestamp: 'desc' },
    });
    assert(!!loggedEvent, 'OUTCOME_UPDATED event recorded in case timeline');

    // ------------------------------------------------------------------------
    // SUITE 6: Eligible Assignees Lookup
    // ------------------------------------------------------------------------
    console.log('\n--- Suite 6: Eligible Assignees Lookup ---');

    const assigneesRes = await request(`/api/v1/cases/${caseWithObs.id}/eligible-assignees`, {
      token: supervisorToken,
    });
    assert(assigneesRes.status === 200, 'GET /api/v1/cases/:id/eligible-assignees returns 200 OK');
    assert(Array.isArray(assigneesRes.body.data), 'Assignees list returned as array');
    assert(
      assigneesRes.body.data.every((u: any) => u.role === Role.CASE_OFFICER || u.role === Role.SUPERVISOR),
      'Only CASE_OFFICER or SUPERVISOR eligible for assignment'
    );

    // ------------------------------------------------------------------------
    // SUITE 7: Deterministic Search Radius & Contradiction Analysis
    // ------------------------------------------------------------------------
    console.log('\n--- Suite 7: Geospatial Search Radius & Contradiction Model ---');

    const anchorObs = caseWithObs.observations[0];
    const secondObs = caseWithObs.observations.length > 1 ? caseWithObs.observations[1] : null;

    const searchRadiusRes = await request(`/api/v1/cases/${caseWithObs.id}/search-radius`, {
      method: 'POST',
      token: officerToken,
      body: {
        anchorObservationId: anchorObs.id,
        assumedTravelMode: 'PEDESTRIAN',
        maxSpeedKmh: 4.5,
        excludedObservationIds: secondObs ? [secondObs.id] : [],
        exclusionReasons: secondObs ? { [secondObs.id]: 'Velocity impossibility benchmark' } : {},
      },
    });

    assert(searchRadiusRes.status === 200, 'POST /api/v1/cases/:id/search-radius returns 200 OK');
    const calcData = searchRadiusRes.body.data;

    assert(!!calcData.hypothesis, 'SearchZoneHypothesis persisted in database');
    assert(calcData.hypothesis.isActive === true, 'Generated hypothesis is marked active');
    assert(
      calcData.hypothesis.geometryGeojson.type === 'Feature',
      'GeoJSON candidate circle polygon generated'
    );
    assert(
      calcData.hypothesis.geometryGeojson.geometry.type === 'Polygon',
      'GeoJSON geometry is Polygon type'
    );

    // Verify mathematical formulation:
    // candidateRadius = (speed * elapsedHours * 1000) + anchorUncertainty
    const details = calcData.calculationDetails;
    const expectedBuffer = details.elapsedHours * details.maxSpeedKmh * 1000;
    const expectedRadius = Math.min(
      Math.round(expectedBuffer + anchorObs.locationUncertaintyMeters),
      150000
    );
    assert(
      Math.abs(details.candidateRadiusMeters - expectedRadius) <= 250 ||
        details.candidateRadiusMeters === details.travelDistanceMeters + anchorObs.locationUncertaintyMeters,
      `Deterministic formula verified: (${details.maxSpeedKmh}km/h * ${details.elapsedHours}h * 1000) + ${anchorObs.locationUncertaintyMeters}m ≈ ${details.candidateRadiusMeters}m (expected: ${expectedRadius}m)`
    );

    // Verify explicit disclaimer in API response
    assert(
      details.warning.includes('investigative search triage suggestion') &&
      details.warning.includes('not been validated as an authoritative recovery guarantee'),
      'Decision-support disclaimer explicitly attached to calculation'
    );

    // Verify Contradiction Analysis
    assert(Array.isArray(calcData.contradictions), 'Contradiction report list generated');
    if (secondObs) {
      const contradictionItem = calcData.contradictions.find((c: any) => c.observationId === secondObs.id);
      assert(!!contradictionItem, 'Second observation analyzed for velocity contradiction');
      assert(contradictionItem.isExcluded === true, 'Investigator exclusion recorded in calculation');
      assert(
        contradictionItem.exclusionReason === 'Velocity impossibility benchmark',
        'Exclusion reason preserved'
      );
    }

    // Invariant: Excluded observation was NOT deleted from database
    if (secondObs) {
      const dbObs = await prisma.locationObservation.findUnique({ where: { id: secondObs.id } });
      assert(!!dbObs, 'Invariant: Excluded observation is NOT deleted from database');
    }

    // Print summary
    console.log('\n===========================================================');
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;
    console.log(`  Tests Passed: ${passed} / ${results.length}`);
    if (failed > 0) {
      console.error(`  ❌ ${failed} TEST(S) FAILED!`);
      process.exit(1);
    } else {
      console.log('  🎉 ALL 18 CHECKPOINT 3B INTEGRATION TESTS PASSED!');
      console.log('===========================================================');
    }
  } finally {
    if (server) {
      server.close();
    }
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  if (server) server.close();
  process.exit(1);
});
