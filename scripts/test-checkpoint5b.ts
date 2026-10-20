/**
 * TraceGrid Checkpoint 5B Verification Suite
 * Geospatial Investigation Frontend & Human-in-the-Loop Coordination
 *
 * Validates:
 * 1. Feature A: Map-Based Contradiction Overlays Contract & Classified Speed Vectors
 * 2. Feature B: Observation Exclusion & Reconsideration Lifecycle (No DB Record Deletion)
 * 3. Feature C: Competing Search-Hypothesis Switcher & Centroid Independence
 * 4. Feature D: Investigation Coordination, Advisory Recommendations & Human Review Guardrails
 * 5. Multi-Persona RBAC Enforcement (Officer/Supervisor/Admin vs Clerk/Reviewer)
 * 6. Frontend Build & Component Architecture Integrity
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { createApp } from '../apps/api/src/app';
import { prisma } from '../apps/api/src/database/prisma';
import { Role, Priority } from '@prisma/client';

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

async function runTests() {
  console.log('===================================================================');
  console.log('  TraceGrid Checkpoint 5B: Geospatial Investigation Frontend Suite');
  console.log('===================================================================\n');

  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const address = server.address() as any;
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });

  console.log(`Ephemeral API test server listening on ${baseUrl}\n`);

  try {
    // ------------------------------------------------------------------------
    // SETUP: Multi-Persona Authentication
    // ------------------------------------------------------------------------
    console.log('--- Setup: Multi-Persona Authentication ---');
    const officerToken = await getAuthToken('officer.sharma@tracegrid.local');
    const supervisorToken = await getAuthToken('supervisor.roy@tracegrid.local');
    const clerkToken = await getAuthToken('clerk.verma@tracegrid.local');
    const adminToken = await getAuthToken('admin.root@tracegrid.local');
    const reviewerToken = await getAuthToken('reviewer.mehta@tracegrid.local');

    assert(!!officerToken, 'Authenticated as CASE_OFFICER (officer.sharma)');
    assert(!!supervisorToken, 'Authenticated as SUPERVISOR (supervisor.roy)');
    assert(!!clerkToken, 'Authenticated as DATA_CLERK (clerk.verma)');
    assert(!!adminToken, 'Authenticated as SYSTEM_ADMIN (admin.root)');
    assert(!!reviewerToken, 'Authenticated as READ_ONLY_REVIEWER (reviewer.mehta)');

    // Retrieve active target case
    const casesRes = await request('/api/v1/cases', { token: officerToken });
    assert(casesRes.status === 200, 'Fetch case register for testing');
    const cases = casesRes.body?.data || [];
    assert(cases.length > 0, `Active cases available (found ${cases.length})`);
    const testCase = cases[0];
    const caseId = testCase.id;

    // Fetch full case details to get observations
    const fullCaseRes = await request(`/api/v1/cases/${caseId}`, { token: officerToken });
    const fullCase = fullCaseRes.body?.data;
    const observations = fullCase?.observations || [];
    assert(observations.length >= 2, `Test case has >= 2 spatial observations (found ${observations.length})`);

    // ------------------------------------------------------------------------
    // SUITE 1: Feature A — Map-Based Contradiction Overlays Contract & Logic
    // ------------------------------------------------------------------------
    console.log('\n--- Suite 1: Feature A — Map-Based Contradiction Overlays ---');

    const contradictionsRes = await request(
      `/api/v1/cases/${caseId}/contradictions?assumedTravelMode=PEDESTRIAN&maxSpeedKmh=4.5`,
      { token: officerToken }
    );
    assert(contradictionsRes.status === 200, 'GET /contradictions returns 200 OK');
    const contradictionData = contradictionsRes.body?.data;

    assert(Array.isArray(contradictionData?.pairwiseMatrix), 'Response contains pairwiseMatrix array');
    assert(typeof contradictionData?.contradictionPairsCount === 'number', 'Response contains contradictionPairsCount');
    assert(typeof contradictionData?.totalObservationsEvaluated === 'number', 'Response contains totalObservationsEvaluated');
    assert(
      typeof contradictionData?.limitations === 'string' &&
      contradictionData.limitations.includes('Analytical decision-support classification only'),
      'Response includes analytical limitations disclaimer'
    );

    // Verify pairwise comparison structures and classifications
    if (contradictionData.pairwiseMatrix.length > 0) {
      const pair = contradictionData.pairwiseMatrix[0];
      assert(!!pair.observationAId && !!pair.observationBId, 'Pair comparison references observationAId and observationBId');
      assert(typeof pair.rawDistanceKm === 'number', 'Pair comparison includes rawDistanceKm');
      assert(typeof pair.uncertaintySubtractedKm === 'number', 'Pair comparison includes uncertaintySubtractedKm');
      assert(typeof pair.effectiveMinDistanceKm === 'number', 'Pair comparison includes effectiveMinDistanceKm');
      assert(typeof pair.timeDeltaHours === 'number', 'Pair comparison includes timeDeltaHours');
      assert(
        ['POTENTIAL_VELOCITY_CONTRADICTION', 'DUPLICATE_CANDIDATE', 'NO_CONFLICT_DETECTED'].includes(
          pair.classification
        ),
        `Valid classification output: ${pair.classification}`
      );
      assert(typeof pair.calculationRationale === 'string' && pair.calculationRationale.length > 0, 'Includes analytical calculationRationale');
    }

    // ------------------------------------------------------------------------
    // SUITE 2: Feature B — Observation Exclusion & Reconsideration Lifecycle
    // ------------------------------------------------------------------------
    console.log('\n--- Suite 2: Feature B — Observation Exclusion & Reconsideration Lifecycle ---');

    const obsToExclude = observations[1];
    const initialObsCount = await prisma.locationObservation.count({ where: { caseId } });

    // 2.1 Submit structured exclusion
    const excludeRes = await request(
      `/api/v1/cases/${caseId}/observations/${obsToExclude.id}/exclusions`,
      {
        method: 'POST',
        token: officerToken,
        body: {
          reason: 'Witness acknowledged sighting was delayed and uncertain regarding exact timeline',
          isCaseLevel: true,
        },
      }
    );
    assert(excludeRes.status === 201, 'POST /exclusions succeeds with 201 Created');
    const exclusionData = excludeRes.body?.data;
    assert(exclusionData?.observationId === obsToExclude.id, 'Exclusion linked to targeted observation');
    assert(exclusionData?.isActive === true, 'Exclusion is active');
    assert(exclusionData?.isCaseLevel === true, 'Exclusion recorded as case-level');

    // 2.2 Verify INVARIANT: Observation is NEVER deleted from database
    const postExcludeObsCount = await prisma.locationObservation.count({ where: { caseId } });
    assert(
      postExcludeObsCount === initialObsCount,
      `INVARIANT: Observation record was preserved in database (count remains ${initialObsCount})`
    );

    const obsStillInDb = await prisma.locationObservation.findUnique({ where: { id: obsToExclude.id } });
    assert(!!obsStillInDb, 'Physical observation row remains intact in PostgreSQL');

    // 2.3 Verify RBAC on Exclusion: Data Clerk cannot exclude
    const clerkExcludeRes = await request(
      `/api/v1/cases/${caseId}/observations/${obsToExclude.id}/exclusions`,
      {
        method: 'POST',
        token: clerkToken,
        body: { reason: 'Unauthorized exclusion attempt by clerk', isCaseLevel: true },
      }
    );
    assert(
      clerkExcludeRes.status === 403,
      'RBAC: DATA_CLERK is denied exclusion privileges (403 Forbidden)'
    );

    // 2.4 Verify Reconsideration Lifecycle: Restore observation with rationale
    const reconsiderRes = await request(
      `/api/v1/cases/${caseId}/observations/${obsToExclude.id}/reconsiderations`,
      {
        method: 'POST',
        token: supervisorToken,
        body: {
          reason: 'CCTV footage corroborated that witness was present at transit hub at reported timestamp',
        },
      }
    );
    assert(reconsiderRes.status === 200, 'POST /reconsiderations succeeds with 200 OK');
    assert(reconsiderRes.body?.data?.isRestored === true, 'Observation restored to active analysis pool');

    // Verify active exclusions set to inactive
    const activeExclusions = await prisma.observationExclusion.findMany({
      where: { observationId: obsToExclude.id, isActive: true },
    });
    assert(activeExclusions.length === 0, 'Active exclusions deactivated after reconsideration');

    // ------------------------------------------------------------------------
    // SUITE 3: Feature C — Competing Search-Hypothesis Switcher & Non-Centroid Blurring
    // ------------------------------------------------------------------------
    console.log('\n--- Suite 3: Feature C — Competing Search-Hypotheses ---');

    // Generate Primary Pedestrian Hypothesis
    const primaryHypRes = await request(`/api/v1/cases/${caseId}/search-zones`, {
      method: 'POST',
      token: officerToken,
      body: {
        anchorObservationId: observations[0].id,
        assumedTravelMode: 'PEDESTRIAN',
        maxSpeedKmh: 4.5,
        generateAlternateHypotheses: true,
      },
    });
    assert(primaryHypRes.status === 200, 'POST /search-zones returns 200 OK');
    const primaryHyp = primaryHypRes.body?.data?.hypothesis;
    assert(
      primaryHyp?.calculationMethod?.includes('PEDESTRIAN') ||
      primaryHyp?.title?.includes('PEDESTRIAN'),
      'Primary hypothesis calculationMethod/title indicates PEDESTRIAN mode'
    );
    assert(
      primaryHyp?.geometryGeojson?.type === 'Feature' || primaryHyp?.geometryGeojson?.type === 'Polygon',
      'Primary hypothesis contains valid GeoJSON structure'
    );

    // Generate Alternate Transit Hypothesis from different observation
    const alternateHypRes = await request(`/api/v1/cases/${caseId}/search-zones`, {
      method: 'POST',
      token: officerToken,
      body: {
        anchorObservationId: observations[observations.length - 1].id,
        assumedTravelMode: 'TRANSIT',
        maxSpeedKmh: 30.0,
      },
    });
    assert(alternateHypRes.status === 200, 'POST /search-zones (Transit) returns 200 OK');
    const alternateHyp = alternateHypRes.body?.data?.hypothesis;
    assert(
      alternateHyp?.calculationMethod?.includes('TRANSIT') ||
      alternateHyp?.title?.includes('TRANSIT'),
      'Alternate hypothesis calculationMethod/title indicates TRANSIT mode'
    );

    // Verify hypotheses retrieval for switcher component
    const listHypRes = await request(`/api/v1/cases/${caseId}/hypotheses`, { token: officerToken });
    assert(listHypRes.status === 200, 'GET /hypotheses returns 200 OK');
    const hypothesesList = listHypRes.body?.data || [];
    assert(hypothesesList.length >= 2, `At least 2 competing hypotheses available (found ${hypothesesList.length})`);

    // Verify competing clusters remain distinct (no centroid averaging)
    assert(
      primaryHyp.id !== alternateHyp.id &&
      primaryHyp.supportingObservationIds?.[0] !== alternateHyp.supportingObservationIds?.[0],
      'Competing hypotheses maintain separate anchors and identities (no false centroid averaging)'
    );

    // Verify disclaimer
    assert(
      typeof primaryHypRes.body?.data?.calculationDetails?.warning === 'string' &&
      primaryHypRes.body.data.calculationDetails.warning.includes('not been validated as an authoritative recovery guarantee'),
      'Hypothesis result includes mandatory non-guarantee candidate area disclaimer'
    );

    // ------------------------------------------------------------------------
    // SUITE 4: Feature D — Investigation Coordination & Recommendations
    // ------------------------------------------------------------------------
    console.log('\n--- Suite 4: Feature D — Investigation Coordination & Human Review ---');

    const recsRes = await request(`/api/v1/cases/${caseId}/recommendations`, { token: officerToken });
    assert(recsRes.status === 200, 'GET /recommendations returns 200 OK');
    const recsData = recsRes.body?.data;
    const recommendations = recsData?.recommendations || [];

    assert(
      typeof recsData?.disclaimer === 'string' &&
      recsData.disclaimer.includes('Automated systems must never dispatch personnel'),
      'Recommendations response contains safety disclaimer'
    );

    // Verify human review guardrail invariant
    if (recommendations.length > 0) {
      const allRequireHumanReview = recommendations.every((r: any) => r.humanReviewRequired === true);
      assert(allRequireHumanReview, 'GUARDRAIL: Every recommendation has humanReviewRequired === true');

      const sampleRec = recommendations[0];
      assert(typeof sampleRec.title === 'string', 'Recommendation has title');
      assert(typeof sampleRec.suggestedAction === 'string', 'Recommendation has suggestedAction');
      assert(
        typeof sampleRec.whyHumanReviewRequired === 'string' && sampleRec.whyHumanReviewRequired.length > 0,
        'Recommendation includes detailed "whyHumanReviewRequired" operational justification'
      );

      // 4.1 Test Recommendation Acceptance Workflow
      console.log('\n--- Testing Recommendation Acceptance Workflow ---');
      const acceptRes = await request(`/api/v1/cases/${caseId}/recommendations/accept`, {
        method: 'POST',
        token: officerToken,
        body: {
          recommendationId: sampleRec.id,
          title: `[Accepted] ${sampleRec.title}`,
          description: sampleRec.description,
          dueDate: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
          priority: sampleRec.suggestedPriority || 'MEDIUM',
        },
      });
      assert(acceptRes.status === 201, 'POST /recommendations/accept created formal InvestigationTask (201)');
      const createdTask = acceptRes.body?.data;
      assert(createdTask?.status === 'PENDING', 'Created task initialized with PENDING status');
      assert(createdTask?.title.includes('[Accepted]'), 'Created task has expected accepted title');

      // 4.2 Verify RBAC on Task Acceptance
      const clerkAcceptRes = await request(`/api/v1/cases/${caseId}/recommendations/accept`, {
        method: 'POST',
        token: clerkToken,
        body: {
          recommendationId: sampleRec.id,
          title: 'Unauthorized task creation by clerk',
          description: 'Testing RBAC',
          dueDate: new Date().toISOString(),
          priority: 'LOW',
        },
      });
      assert(
        clerkAcceptRes.status === 403,
        'RBAC: DATA_CLERK is denied task acceptance privilege (403 Forbidden)'
      );
    } else {
      console.log('  ℹ️ Note: No pending recommendations for current test case; verified endpoint contracts.');
    }

    // ------------------------------------------------------------------------
    // SUITE 5: Frontend Component Architecture & Build Verification
    // ------------------------------------------------------------------------
    console.log('\n--- Suite 5: Frontend Component Architecture & Production Build ---');

    const webSrcDir = path.resolve(__dirname, '../apps/web/src');
    const requiredFiles = [
      'features/mapping/CaseMapCanvas.tsx',
      'features/mapping/ContradictionDetailModal.tsx',
      'features/mapping/ObservationExclusionModal.tsx',
      'features/coordination/RecommendationDrawer.tsx',
      'features/coordination/AcceptRecommendationModal.tsx',
      'features/cases/CaseWorkspace.tsx',
      'lib/api.ts',
    ];

    for (const relFile of requiredFiles) {
      const fullPath = path.join(webSrcDir, relFile);
      assert(fs.existsSync(fullPath), `Frontend component exists: ${relFile}`);
    }

    // Check production build artifacts
    const distHtml = path.resolve(__dirname, '../apps/web/dist/index.html');
    assert(fs.existsSync(distHtml), 'Vite production build output exists: dist/index.html');

    const distAssets = path.resolve(__dirname, '../apps/web/dist/assets');
    assert(fs.existsSync(distAssets), 'Vite production build assets directory exists: dist/assets');

    // Verify disclaimers exist in compiled/source files
    const mapCanvasCode = fs.readFileSync(path.join(webSrcDir, 'features/mapping/CaseMapCanvas.tsx'), 'utf-8');
    assert(
      mapCanvasCode.includes('Reported sequence, not a verified route'),
      'CaseMapCanvas contains mandatory sequence disclaimer'
    );
    assert(
      mapCanvasCode.includes('ObservationExclusionModal'),
      'CaseMapCanvas mounts ObservationExclusionModal'
    );
    assert(
      mapCanvasCode.includes('ContradictionDetailModal'),
      'CaseMapCanvas mounts ContradictionDetailModal'
    );

    const workspaceCode = fs.readFileSync(path.join(webSrcDir, 'features/cases/CaseWorkspace.tsx'), 'utf-8');
    assert(
      workspaceCode.includes('RecommendationDrawer'),
      'CaseWorkspace mounts RecommendationDrawer'
    );

    const recDrawerCode = fs.readFileSync(
      path.join(webSrcDir, 'features/coordination/RecommendationDrawer.tsx'),
      'utf-8'
    );
    assert(
      recDrawerCode.includes('Decision-Support Guardrail'),
      'RecommendationDrawer includes Decision-Support Guardrail notice'
    );
    assert(
      recDrawerCode.includes('Why Human Review Is Mandatory'),
      'RecommendationDrawer displays "Why Human Review Is Mandatory"'
    );

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
  console.log('  CHECKPOINT 5B TEST SUITE SUMMARY');
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
    console.log('\n🌟 ALL CHECKPOINT 5B VERIFICATION CHECKS PASSED PERFECTLY!\n');
    process.exit(0);
  }
}

runTests();
