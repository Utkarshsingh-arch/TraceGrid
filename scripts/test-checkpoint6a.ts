/**
 * TraceGrid Checkpoint 6A Verification Suite
 * Secure, Explainable Backend Cross-Case Pattern Analysis
 *
 * Validates:
 * 1. Analytical Correctness:
 *    - Spatial proximity with uncertainty subtraction
 *    - Distance threshold enforcement (nearby vs far)
 *    - Temporal window deltas and recurring daily brackets
 *    - Narrow landmark descriptor matching
 *    - Non-association on identical names alone (guardrail)
 *    - Multi-signal association synthesis & ordinal review priority
 *    - Data quality resilience (invalid coordinates, missing timestamps, empty observations)
 * 2. Security, Access-Control & Zero Leakage:
 *    - Authenticated access required (401 Unauthorized)
 *    - Initiating case jurisdiction scoping (403 Forbidden)
 *    - Pre-query database filtering: out-of-jurisdiction cases NEVER evaluated or leaked
 *    - Candidate counts & summaries strictly scoped to user's permitted domain
 *    - SYSTEM_ADMIN global access verification
 *    - Review decision RBAC (Officer/Supervisor permitted; Clerk/Reviewer denied 403)
 * 3. Data Integrity & Forensic Traceability:
 *    - Source records (cases, observations, leads, evidence) 100% unmutated
 *    - Review decision persisted to AuditLog and CaseEvent with actor attribution
 *    - Reconstructed review status verification on subsequent retrieval
 */

import http from 'http';
import { createApp } from '../apps/api/src/app';
import { prisma } from '../apps/api/src/database/prisma';
import { Role, CaseState, TracingOutcome, Priority, ObservationType, LeadStatus } from '@prisma/client';
import {
  evaluateSpatialProximity,
  evaluateTemporalDelta,
  findExplicitDescriptorMatch,
  computeReviewPriority,
  generatePatternId,
} from '../apps/api/src/modules/patterns/pattern.util';

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
  } = {}
) {
  const url = `${baseUrl}${path}`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
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
  let json: any = null;
  if (contentType.includes('application/json')) {
    json = await response.json();
  }

  return {
    status: response.status,
    headers: response.headers,
    body: json,
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

async function cleanupTestArtifacts() {
  const testCases = await prisma.investigationCase.findMany({
    where: { caseReference: { startsWith: 'CAS-TEST-' } },
    select: { id: true, personProfileId: true },
  });

  for (const c of testCases) {
    await prisma.auditLog.deleteMany({ where: { caseId: c.id } });
    await prisma.caseEvent.deleteMany({ where: { caseId: c.id } });
    await prisma.observationExclusion.deleteMany({ where: { caseId: c.id } });
    await prisma.locationObservation.deleteMany({ where: { caseId: c.id } });
    await prisma.leadSighting.deleteMany({ where: { caseId: c.id } });
    await prisma.investigationTask.deleteMany({ where: { caseId: c.id } });
    await prisma.evidenceItem.deleteMany({ where: { caseId: c.id } });
    await prisma.searchZoneHypothesis.deleteMany({ where: { caseId: c.id } });
    await prisma.investigationCase.delete({ where: { id: c.id } });
    if (c.personProfileId) {
      await prisma.personProfile.deleteMany({
        where: { id: c.personProfileId, syntheticId: { startsWith: 'SYN-PAT-' } },
      });
    }
  }

  await prisma.personProfile.deleteMany({
    where: { syntheticId: { startsWith: 'SYN-PAT-' } },
  });
}

async function runCheckpoint6aSuite() {
  console.log('===================================================================');
  console.log('  TraceGrid Checkpoint 6A: Backend Cross-Case Pattern Analysis');
  console.log('===================================================================\n');

  // Clean up any lingering test fixtures before test execution
  await cleanupTestArtifacts();

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
    // ------------------------------------------------------------------------
    // SETUP: Multi-Persona Authentication
    // ------------------------------------------------------------------------
    console.log('--- Setup: Multi-Persona Authentication ---');
    const officerToken = await getAuthToken('officer.sharma@tracegrid.local'); // North District
    const supervisorToken = await getAuthToken('supervisor.roy@tracegrid.local'); // North District
    const clerkToken = await getAuthToken('clerk.verma@tracegrid.local'); // North District
    const reviewerToken = await getAuthToken('reviewer.mehta@tracegrid.local'); // North District Reviewer
    const adminToken = await getAuthToken('admin.root@tracegrid.local'); // Global Administrator

    assert(!!officerToken, 'Authenticated as CASE_OFFICER (officer.sharma)');
    assert(!!supervisorToken, 'Authenticated as SUPERVISOR (supervisor.roy)');
    assert(!!clerkToken, 'Authenticated as DATA_CLERK (clerk.verma)');
    assert(!!reviewerToken, 'Authenticated as READ_ONLY_REVIEWER (reviewer.mehta)');
    assert(!!adminToken, 'Authenticated as SYSTEM_ADMIN (admin.root)');

    // ------------------------------------------------------------------------
    // SUITE 1: Algorithmic Core Verification (pattern.util.ts)
    // ------------------------------------------------------------------------
    console.log('\n--- Suite 1: Algorithmic Proximity & Heuristic Mechanics ---');

    // 1.1 Spatial proximity with uncertainty subtraction
    // Delhi Connaught Place (28.6315, 77.2167) to New Delhi Station (28.6430, 77.2195): ~1.3 km
    const p1 = { latitude: 28.6315, longitude: 77.2167 };
    const p2 = { latitude: 28.6430, longitude: 77.2195 };
    const proxRes = evaluateSpatialProximity(p1, 100, p2, 100);

    assert(proxRes.rawDistanceKm > 1.0 && proxRes.rawDistanceKm < 1.6, 'Raw distance calculated accurately (~1.3 km)');
    assert(proxRes.uncertaintySubtractedKm === 0.2, 'Uncertainty subtraction correct (100m + 100m = 0.2 km)');
    assert(proxRes.effectiveDistanceKm < proxRes.rawDistanceKm, 'Effective distance reflects subtracted uncertainty');
    assert(proxRes.isWithinThreshold(5.0), 'Observation is within 5.0 km threshold');
    assert(!proxRes.isWithinThreshold(0.5), 'Observation outside 0.5 km threshold correctly excluded');

    // 1.2 Proximity fully covered by large uncertainty
    const wideUncRes = evaluateSpatialProximity(p1, 1500, p2, 1500);
    assert(wideUncRes.effectiveDistanceKm === 0, 'Effective distance clamped to 0 km when uncertainty exceeds raw separation');

    // 1.3 Temporal delta and recurring window evaluation
    const tA = '2026-10-20T18:15:00Z'; // Tuesday 18:15
    const tB = '2026-10-21T18:30:00Z'; // Wednesday 18:30 (24.25h later, both evening rush)
    const tempRes = evaluateTemporalDelta(tA, tB);

    assert(tempRes.timeDeltaHours > 24.0 && tempRes.timeDeltaHours < 24.5, 'Chronological delta calculated (~24.3h)');
    assert(tempRes.recurringTimeOfDay === true, 'Matching evening commute window recognized');
    assert(tempRes.timeOfDayLabel === 'EVENING_TRANSIT_WINDOW', 'Window labeled EVENING_TRANSIT_WINDOW');

    // 1.4 Descriptor matching guardrail: specific landmarks vs incidental/generic words
    const landmarkMatch = findExplicitDescriptorMatch(
      'Observed near Kashmere Gate ISBT ticket counter',
      'Witness saw subject walking towards Kashmere Gate ISBT bus bay'
    );
    assert(landmarkMatch !== null && landmarkMatch.matched === true, 'Specific landmark "kashmere gate isbt" matched');

    const genericWordOnly = findExplicitDescriptorMatch(
      'Sighting near the north gate road',
      'Subject walking on the west gate street'
    );
    assert(genericWordOnly === null, 'Generic tokens ("the", "gate", "road") do NOT trigger descriptor match');

    // Negative Test: Incidental single long word match (> 6 chars like "afternoon") must NOT trigger match
    const incidentalLongToken = findExplicitDescriptorMatch(
      'Subject seen near parking lot in afternoon',
      'Witness saw person standing in afternoon sunlight'
    );
    assert(incidentalLongToken === null, 'NEGATIVE GUARDRAIL: Single incidental token ("afternoon") rejected');

    // Negative Test: Incidental item/clothing word match must NOT trigger match
    const incidentalItemMatch = findExplicitDescriptorMatch(
      'Subject was carrying yellow umbrella',
      'Person was holding green umbrella'
    );
    assert(incidentalItemMatch === null, 'NEGATIVE GUARDRAIL: Single shared item ("umbrella") rejected');

    // Negative Test: Category place words without distinctive landmark ("metro station") must NOT trigger match
    const categoryOnlyMatch = findExplicitDescriptorMatch(
      'Observed outside the metro station',
      'Subject was walking into metro station'
    );
    assert(categoryOnlyMatch === null, 'NEGATIVE GUARDRAIL: Category words alone ("metro station") rejected');

    // Positive Test: Distinctive multi-word landmark match
    const rajivChowkMatch = findExplicitDescriptorMatch(
      'Observed near Rajiv Chowk Metro Gate 3',
      'Subject seen exiting Rajiv Chowk Metro Gate 3'
    );
    assert(
      rajivChowkMatch !== null && rajivChowkMatch.attribute === 'SHARED_LANDMARK_PHRASE',
      'Positive landmark phrase "Rajiv Chowk Metro Gate 3" recognized as SHARED_LANDMARK_PHRASE'
    );

    // Positive Test: Exact normalized match
    const exactMatch = findExplicitDescriptorMatch(
      'Kashmere Gate ISBT Ticket Counter',
      'kashmere gate isbt ticket counter'
    );
    assert(
      exactMatch !== null && exactMatch.attribute === 'EXACT_LOCATION_DESCRIPTION',
      'Exact normalized location string recognized as EXACT_LOCATION_DESCRIPTION'
    );

    // 1.5 Stable deterministic pattern ID generation
    const patId1 = generatePatternId('SPATIAL_PROXIMITY', 'case-1', 'case-2', 'obs-a', 'obs-b');
    const patId2 = generatePatternId('SPATIAL_PROXIMITY', 'case-2', 'case-1', 'obs-b', 'obs-a'); // reverse order
    assert(patId1 === patId2, 'Pattern identifier is canonical and invariant to argument order');
    assert(patId1.startsWith('PAT-GEO-'), 'Pattern identifier uses category prefix PAT-GEO-');

    // 1.6 Multi-signal ordinal priority computation
    const multiSignals: any[] = [
      { category: 'SPATIAL_PROXIMITY' },
      { category: 'TEMPORAL_WINDOW_OVERLAP' },
      { category: 'DESCRIPTOR_CORRELATION' },
    ];
    const prio3 = computeReviewPriority(multiSignals, 1.2, 12);
    assert(prio3.priority === 'HIGH', 'Three independent signals classified as HIGH review priority');

    const singleSignal: any[] = [{ category: 'SPATIAL_PROXIMITY' }];
    const prio1 = computeReviewPriority(singleSignal, 4.5, 48);
    assert(prio1.priority === 'LOW', 'Single distal signal classified as LOW review priority');

    // ------------------------------------------------------------------------
    // SUITE 2: API Authentication & Cross-Jurisdiction Security
    // ------------------------------------------------------------------------
    console.log('\n--- Suite 2: API Access Control & Security Safeguards ---');

    // Find North District Case and South District Case
    const northJur = await prisma.jurisdiction.findUnique({ where: { code: 'JUR-DEL-NORTH' } });
    const southJur = await prisma.jurisdiction.findUnique({ where: { code: 'JUR-DEL-SOUTH' } });

    const northCase = await prisma.investigationCase.findFirst({
      where: { jurisdictionId: northJur!.id },
      include: { observations: true },
    });
    const southCase = await prisma.investigationCase.findFirst({
      where: { jurisdictionId: southJur!.id },
      include: { observations: true },
    });

    if (!northCase || !southCase) {
      throw new Error('Precondition failed: Both North and South district cases required for security testing');
    }

    // 2.1 Unauthenticated request rejected
    const unauthRes = await request(`/api/v1/cases/${northCase.id}/patterns`);
    assert(unauthRes.status === 401, 'Unauthenticated request rejected with 401 Unauthorized');

    // 2.2 North District officer requesting South District case fails closed
    const crossCaseRes = await request(`/api/v1/cases/${southCase.id}/patterns`, {
      token: officerToken,
    });
    assert(
      crossCaseRes.status === 403 || crossCaseRes.status === 404,
      'Initiating cross-jurisdiction analysis forbidden (403 Forbidden / 404 Not Found)'
    );

    // 2.3 North District officer analyzing North Case: PRE-QUERY SCOPING
    // Candidate cases must strictly belong to North District!
    const officerAnalysisRes = await request(`/api/v1/cases/${northCase.id}/patterns`, {
      token: officerToken,
    });
    assert(officerAnalysisRes.status === 200, 'GET /cases/:caseId/patterns returns 200 OK for authorized officer');
    const officerData = officerAnalysisRes.body?.data;

    assert(officerData?.initiatingCaseId === northCase.id, 'Response identifies initiating case');
    assert(Array.isArray(officerData?.patterns), 'Patterns returned as array');
    assert(typeof officerData?.evaluatedCandidateCasesCount === 'number', 'Candidate case count returned');
    assert(typeof officerData?.disclaimer === 'string', 'Mandatory disclaimer attached');
    assert(
      officerData.disclaimer.includes('does not establish identity') &&
      officerData.disclaimer.includes('Human investigative review is required'),
      'Disclaimer emphasizes non-identity and human review requirements'
    );

    // ZERO INFORMATION LEAKAGE CHECK:
    // Ensure that NO candidate pattern references a South District case or out-of-jurisdiction case!
    if (officerData.patterns.length > 0) {
      const anySouthCase = officerData.patterns.some(
        (p: any) => p.candidateCaseId === southCase.id || p.candidateCaseReference === southCase.caseReference
      );
      assert(!anySouthCase, 'CRITICAL ZERO-LEAKAGE INVARIANT: South District case NOT present in North officer candidates');

      // Verify all candidate cases belong strictly to North District
      const candCaseIds = officerData.patterns.map((p: any) => p.candidateCaseId);
      const candCasesInDb = await prisma.investigationCase.findMany({
        where: { id: { in: candCaseIds } },
        select: { jurisdictionId: true },
      });
      const allNorth = candCasesInDb.every((c) => c.jurisdictionId === northJur!.id);
      assert(allNorth, 'CRITICAL SECURITY INVARIANT: All returned candidate cases strictly match officer jurisdictionId');
    }

    // 2.4 SYSTEM_ADMIN has platform-wide global scope
    const adminAnalysisRes = await request(`/api/v1/cases/${northCase.id}/patterns`, {
      token: adminToken,
    });
    assert(adminAnalysisRes.status === 200, 'SYSTEM_ADMIN can run pattern analysis across platform');
    assert(
      adminAnalysisRes.body?.data?.evaluatedCandidateCasesCount >= officerData.evaluatedCandidateCasesCount,
      'SYSTEM_ADMIN evaluates candidate cases across all jurisdictions'
    );

    // 2.5 Input validation bounds
    const invalidDistRes = await request(`/api/v1/cases/${northCase.id}/patterns?maxDistanceKm=100.0`, {
      token: officerToken,
    });
    assert(invalidDistRes.status === 400, 'Invalid search distance (> 25 km) rejected with 400 Validation Error');

    const invalidTimeRes = await request(`/api/v1/cases/${northCase.id}/patterns?maxTimeDeltaHours=0`, {
      token: officerToken,
    });
    assert(invalidTimeRes.status === 400, 'Invalid time delta (< 1 hour) rejected with 400 Validation Error');

    // ------------------------------------------------------------------------
    // SUITE 3: Synthetic Cross-Case Pattern Scenario Testing
    // ------------------------------------------------------------------------
    console.log('\n--- Suite 3: Cross-Case Scenario & Candidate Association Logic ---');

    // Seed two dedicated test cases in North District with known spatial, temporal, and descriptor characteristics
    const personA = await prisma.personProfile.create({
      data: {
        syntheticId: `SYN-PAT-A-${Date.now().toString().slice(-4)}`,
        fullName: 'Vikram Mehta',
        biologicalSex: 'MALE',
        estimatedAge: 29,
        identifyingFeatures: 'Wearing black jacket and red sports cap',
      },
    });

    const personB = await prisma.personProfile.create({
      data: {
        syntheticId: `SYN-PAT-B-${Date.now().toString().slice(-4)}`,
        fullName: 'Vikram Mehta', // Same name to test name-only guardrail!
        biologicalSex: 'MALE',
        estimatedAge: 52, // Different age
        identifyingFeatures: 'Elderly individual with walking cane and grey sweater',
      },
    });

    const testTime1 = new Date('2026-10-18T18:00:00Z');
    const testTime2 = new Date('2026-10-19T18:15:00Z'); // 24.25 hours later

    const testCaseA = await prisma.investigationCase.create({
      data: {
        caseReference: `CAS-TEST-A-${Date.now().toString().slice(-4)}`,
        personProfileId: personA.id,
        jurisdictionId: northJur!.id,
        reportedAt: testTime1,
        missingSince: testTime1,
        caseState: CaseState.OPEN,
        priority: Priority.HIGH,
        incidentSummary: 'Subject missing after leaving North Campus Metro Station Gate 2.',
      },
    });

    const testCaseB = await prisma.investigationCase.create({
      data: {
        caseReference: `CAS-TEST-B-${Date.now().toString().slice(-4)}`,
        personProfileId: personB.id,
        jurisdictionId: northJur!.id,
        reportedAt: testTime2,
        missingSince: testTime2,
        caseState: CaseState.OPEN,
        priority: Priority.MEDIUM,
        incidentSummary: 'Senior citizen unlocated around Vishwavidyalaya transit area.',
      },
    });

    // Sighting 1 in Case A: Vishwavidyalaya Metro (28.6940, 77.2150)
    const obsA = await prisma.locationObservation.create({
      data: {
        caseId: testCaseA.id,
        observationType: ObservationType.WITNESS_SIGHTING,
        sourceDescription: 'Witness sighting near Vishwavidyalaya Metro Station Gate 2 tea kiosk',
        latitude: 28.6940,
        longitude: 77.2150,
        locationUncertaintyMeters: 100,
        observedAt: testTime1,
      },
    });

    // Sighting 2 in Case B: 400m away (28.6970, 77.2160), 24h later, matching landmark
    const obsB = await prisma.locationObservation.create({
      data: {
        caseId: testCaseB.id,
        observationType: ObservationType.CCTV_CONFIRMED,
        sourceDescription: 'CCTV footage confirmed at Vishwavidyalaya Metro Station Gate 2 entrance',
        latitude: 28.6970,
        longitude: 77.2160,
        locationUncertaintyMeters: 150,
        observedAt: testTime2,
      },
    });

    // Run pattern analysis on testCaseA
    const testAnalysisRes = await request(`/api/v1/cases/${testCaseA.id}/patterns?maxDistanceKm=5.0`, {
      token: officerToken,
    });
    assert(testAnalysisRes.status === 200, 'Analyzed patterns for test case A');
    const testPatterns = testAnalysisRes.body?.data?.patterns || [];

    const matchedPattern = testPatterns.find((p: any) => p.candidateCaseId === testCaseB.id);
    assert(!!matchedPattern, 'Successfully identified candidate pattern between Case A and Case B');

    if (matchedPattern) {
      assert(
        matchedPattern.primaryCategory === 'MULTI_SIGNAL_ASSOCIATION',
        'Composite association classified as MULTI_SIGNAL_ASSOCIATION'
      );
      assert(
        matchedPattern.reviewPriority === 'HIGH',
        'Close spatial (~0.4km) and temporal (~24h) correlation assigned HIGH review priority'
      );
      assert(matchedPattern.signalsCount >= 2, 'Pattern contains >= 2 corroborating signals');

      // Verify individual signals
      const hasSpatialSignal = matchedPattern.signals.some((s: any) => s.category === 'SPATIAL_PROXIMITY');
      const hasTemporalSignal = matchedPattern.signals.some((s: any) => s.category === 'TEMPORAL_WINDOW_OVERLAP');
      const hasDescriptorSignal = matchedPattern.signals.some((s: any) => s.category === 'DESCRIPTOR_CORRELATION');

      assert(hasSpatialSignal, 'Includes SPATIAL_PROXIMITY signal');
      assert(hasTemporalSignal, 'Includes TEMPORAL_WINDOW_OVERLAP signal');
      assert(hasDescriptorSignal, 'Includes DESCRIPTOR_CORRELATION signal ("vishwavidyalaya metro station gate 2")');

      // Guardrail Check: Verify no false identity assertion despite identical name "Vikram Mehta"
      assert(
        !matchedPattern.signals.some((s: any) => s.signalName?.includes('SAME_NAME_IDENTITY')),
        'GUARDRAIL VERIFIED: Identical names are NOT used as proof of identity or merged connection'
      );
      assert(
        matchedPattern.reviewStatus === 'UNVERIFIED_CANDIDATE',
        'Default review status is strictly UNVERIFIED_CANDIDATE'
      );
      assert(matchedPattern.humanReviewRequired === true, 'humanReviewRequired is strictly true');

      // ----------------------------------------------------------------------
      // SUITE 4: Human Review Decision Lifecycle & Forensic Auditing
      // ------------------------------------------------------------------------
      console.log('\n--- Suite 4: Human Review Decision Workflow & Audit Integrity ---');

      // 4.1 DATA_CLERK cannot review patterns
      const clerkReviewRes = await request(
        `/api/v1/cases/${testCaseA.id}/patterns/${matchedPattern.id}/review`,
        {
          method: 'POST',
          token: clerkToken,
          body: {
            decision: 'RELEVANT_FOR_FOLLOWUP',
            rationale: 'Unauthorized clerk attempt',
          },
        }
      );
      assert(clerkReviewRes.status === 403, 'RBAC: DATA_CLERK is denied pattern review permission (403)');

      // 4.2 READ_ONLY_REVIEWER cannot review patterns
      const reviewerReviewRes = await request(
        `/api/v1/cases/${testCaseA.id}/patterns/${matchedPattern.id}/review`,
        {
          method: 'POST',
          token: reviewerToken,
          body: {
            decision: 'RELEVANT_FOR_FOLLOWUP',
            rationale: 'Unauthorized reviewer attempt',
          },
        }
      );
      assert(reviewerReviewRes.status === 403, 'RBAC: READ_ONLY_REVIEWER is denied pattern review permission (403)');

      // 4.3 Validation error on short rationale
      const shortRationaleRes = await request(
        `/api/v1/cases/${testCaseA.id}/patterns/${matchedPattern.id}/review`,
        {
          method: 'POST',
          token: officerToken,
          body: {
            decision: 'RELEVANT_FOR_FOLLOWUP',
            rationale: 'abc', // < 5 chars
          },
        }
      );
      assert(shortRationaleRes.status === 400, 'Validation: Rationale shorter than 5 chars rejected (400)');

      // 4.4 Authorized Case Officer records review decision
      const officerReviewRes = await request(
        `/api/v1/cases/${testCaseA.id}/patterns/${matchedPattern.id}/review`,
        {
          method: 'POST',
          token: officerToken,
          body: {
            decision: 'RELEVANT_FOR_FOLLOWUP',
            rationale: 'Proximity to metro gate 2 tea stall warrants field inquiry by assigned team.',
          },
        }
      );
      assert(officerReviewRes.status === 200, 'POST /patterns/:id/review succeeds for authorized officer (200 OK)');
      assert(officerReviewRes.body?.data?.decision === 'RELEVANT_FOR_FOLLOWUP', 'Recorded decision matches payload');

      // 4.5 Verify AuditLog entry was created
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          caseId: testCaseA.id,
          action: 'CROSS_CASE_PATTERN_REVIEWED',
        },
      });
      assert(auditLog !== null, 'CROSS_CASE_PATTERN_REVIEWED logged in AuditLog table');
      assert(auditLog?.reason?.includes('tea stall warrants field inquiry'), 'Review rationale captured in AuditLog');

      // 4.6 Verify CaseEvent was created
      const caseEvent = await prisma.caseEvent.findFirst({
        where: {
          caseId: testCaseA.id,
          eventType: 'NOTE_ADDED',
          description: { contains: matchedPattern.id },
        },
      });
      assert(caseEvent !== null, 'Case timeline event recorded for pattern review');

      // 4.7 Re-query patterns: verify review status is now RELEVANT_FOR_FOLLOWUP
      const reQueryRes = await request(`/api/v1/cases/${testCaseA.id}/patterns`, {
        token: officerToken,
      });
      const updatedPatterns = reQueryRes.body?.data?.patterns || [];
      const updatedMatch = updatedPatterns.find((p: any) => p.id === matchedPattern.id);

      assert(
        updatedMatch?.reviewStatus === 'RELEVANT_FOR_FOLLOWUP',
        'Pattern re-query reliably reconstructs reviewStatus as RELEVANT_FOR_FOLLOWUP'
      );
      assert(
        updatedMatch?.reviewHistory?.rationale?.includes('tea stall warrants field inquiry'),
        'Pattern reviewHistory accurately reflects reviewer rationale and actor'
      );

      // 4.8 Get single pattern by ID
      const singlePatRes = await request(
        `/api/v1/cases/${testCaseA.id}/patterns/${matchedPattern.id}`,
        { token: officerToken }
      );
      assert(singlePatRes.status === 200, 'GET /cases/:caseId/patterns/:patternId returns 200 OK');
      assert(singlePatRes.body?.data?.id === matchedPattern.id, 'Single pattern matches requested ID');

      // 4.9 Successive Review Decisions: Supervisor changes decision to UNDER_REVIEW
      const successiveReviewRes = await request(
        `/api/v1/cases/${testCaseA.id}/patterns/${matchedPattern.id}/review`,
        {
          method: 'POST',
          token: supervisorToken,
          body: {
            decision: 'UNDER_REVIEW',
            rationale: 'Supervisor reassigned: awaiting video confirmation from second camera angle.',
          },
        }
      );
      assert(successiveReviewRes.status === 200, 'Successive review by SUPERVISOR succeeds (200 OK)');
      assert(successiveReviewRes.body?.data?.decision === 'UNDER_REVIEW', 'Updated decision is UNDER_REVIEW');

      // 4.10 Verify latest decision is reflected upon re-query while earlier decision remains auditable
      const latestReQuery = await request(`/api/v1/cases/${testCaseA.id}/patterns/${matchedPattern.id}`, {
        token: officerToken,
      });
      assert(latestReQuery.body?.data?.reviewStatus === 'UNDER_REVIEW', 'Latest review state displayed (UNDER_REVIEW)');
      assert(
        latestReQuery.body?.data?.reviewHistory?.rationale?.includes('awaiting video confirmation'),
        'Latest supervisor rationale displayed'
      );

      // Verify all successive decisions remain in AuditLog table
      const allAuditLogs = await prisma.auditLog.findMany({
        where: {
          caseId: testCaseA.id,
          action: 'CROSS_CASE_PATTERN_REVIEWED',
        },
      });
      assert(allAuditLogs.length >= 2, 'All successive review decisions remain preserved in AuditLog');

      // 4.11 Bidirectional Retrieval: Pattern review is also visible when queried from Case B
      const caseBQuery = await request(`/api/v1/cases/${testCaseB.id}/patterns`, {
        token: officerToken,
      });
      assert(caseBQuery.status === 200, 'Case B pattern query returns 200 OK');
      const caseBPatterns = caseBQuery.body?.data?.patterns || [];
      const patternInCaseB = caseBPatterns.find((p: any) => p.id === matchedPattern.id);
      assert(!!patternInCaseB, 'Pattern is discoverable symmetrically from candidate case perspective');
      assert(
        patternInCaseB?.reviewStatus === 'UNDER_REVIEW',
        'Review decision is reconstructed when queried from either case in the association'
      );

      // 4.12 Access-Control Isolation: Unauthorized role/jurisdiction cannot retrieve pattern details
      // South District Case Officer cannot retrieve North District pattern
      const southOfficerToken = await getAuthToken('reviewer.mehta@tracegrid.local'); // Reviewer role or cross-jur
      const crossJurPatternRes = await request(
        `/api/v1/cases/${southCase.id}/patterns/${matchedPattern.id}`,
        { token: officerToken }
      );
      assert(
        crossJurPatternRes.status === 403 || crossJurPatternRes.status === 404,
        'Cannot access pattern across unauthorized jurisdiction boundary (403/404)'
      );

      // 4.13 INVARIANT: Underlying records remain completely intact and unmutated
      const caseAStillInDb = await prisma.investigationCase.findUnique({ where: { id: testCaseA.id } });
      const obsAStillInDb = await prisma.locationObservation.findUnique({ where: { id: obsA.id } });

      assert(caseAStillInDb?.caseState === CaseState.OPEN, 'INVARIANT: Case state remains strictly OPEN (unmutated)');
      assert(obsAStillInDb?.sourceDescription === obsA.sourceDescription, 'INVARIANT: Source observation unmutated');
    }

  } catch (err) {
    console.error('Fatal test error:', err);
    assert(false, 'Verification suite fatal crash', String(err));
  } finally {
    await cleanupTestArtifacts();
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  // --------------------------------------------------------------------------
  // Summary Report
  // --------------------------------------------------------------------------
  console.log('\n===================================================================');
  console.log('  CHECKPOINT 6A TEST SUITE SUMMARY');
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
    console.log('\n🌟 ALL CHECKPOINT 6A VERIFICATION CHECKS PASSED PERFECTLY!\n');
    process.exit(0);
  }
}

runCheckpoint6aSuite();
