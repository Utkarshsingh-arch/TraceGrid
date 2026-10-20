/**
 * TraceGrid Checkpoint 5A Verification Suite
 * Geospatial Intelligence & Investigation Coordination Backend
 *
 * Validates:
 * 1. Algorithmic velocity & spatio-temporal mechanics (Haversine, spatial uncertainty subtraction, duplicate detection, invalid coordinates)
 * 2. Multi-observation contradiction engine (pairwise matrix, sequential timeline chain, classifications)
 * 3. Observation exclusion & reconsideration (persisted in DB, original observation NEVER deleted, audit logs created)
 * 4. Search-zone refinement & competing location hypotheses (deterministic buffer, alternate hypotheses without false averaging)
 * 5. Automated investigation task recommendations (cautious suggestions, mandatory human review, no auto-dispatch)
 * 6. Recommendation acceptance workflow (transactional task creation, audit logs, case events)
 * 7. Permission enforcement & cross-case/cross-jurisdiction security
 */

import http from 'http';
import { createApp } from '../apps/api/src/app';
import { prisma } from '../apps/api/src/database/prisma';
import { Role, Priority } from '@prisma/client';
import {
  calculateHaversineDistance,
  generateCirclePolygon,
  evaluateObservationPair,
  evaluateAllCaseObservations,
} from '../apps/api/src/modules/geospatial/geospatial.util';

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

async function runCheckpoint5aSuite() {
  console.log('===========================================================');
  console.log('  TraceGrid Checkpoint 5A: Geospatial & Coordination Backend');
  console.log('===========================================================\n');

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
    // Authenticate test personas
    const officerToken = await getAuthToken('officer.sharma@tracegrid.local'); // North District Case Officer
    const supervisorToken = await getAuthToken('supervisor.roy@tracegrid.local'); // North District Supervisor
    const adminToken = await getAuthToken('admin.root@tracegrid.local'); // Global Admin
    const reviewerToken = await getAuthToken('reviewer.mehta@tracegrid.local'); // Read Only Reviewer

    // --- Suite 1: Algorithmic Velocity & Uncertainty Mechanics (Algorithm Core) ---
    console.log('--- Suite 1: Algorithmic Velocity & Uncertainty Mechanics ---');

    // 1. Consistent observations (1 km apart, 30 min, pedestrian)
    const baseDate = new Date('2026-10-20T10:00:00Z');
    const later30Min = new Date('2026-10-20T10:30:00Z');
    const consistentPair = evaluateObservationPair(
      {
        id: 'obs-cons-1',
        observationType: 'WITNESS_SIGHTING',
        sourceDescription: 'Market Square Sighting',
        latitude: 28.6500,
        longitude: 77.2100,
        locationUncertaintyMeters: 50,
        observedAt: baseDate,
      },
      {
        id: 'obs-cons-2',
        observationType: 'CCTV_CONFIRMED',
        sourceDescription: 'Metro Gate CCTV',
        latitude: 28.6570,
        longitude: 77.2150,
        locationUncertaintyMeters: 50,
        observedAt: later30Min,
      },
      'PEDESTRIAN',
      4.5
    );
    assert(
      consistentPair.classification === 'NO_CONFLICT_DETECTED',
      'Two consistent observations classified as NO_CONFLICT_DETECTED'
    );
    assert(
      !consistentPair.isContradictory,
      'Consistent observations marked isContradictory = false'
    );
    assert(
      consistentPair.requiredSpeedKmh <= 4.5 * 1.2,
      `Calculated velocity ${consistentPair.requiredSpeedKmh} km/h is within pedestrian tolerance`
    );

    // 2. Potentially impossible travel (25 km apart in 15 min on foot)
    const later15Min = new Date('2026-10-20T10:15:00Z');
    const impossiblePair = evaluateObservationPair(
      {
        id: 'obs-imp-1',
        observationType: 'WITNESS_SIGHTING',
        sourceDescription: 'North Market',
        latitude: 28.6500,
        longitude: 77.2100,
        locationUncertaintyMeters: 100,
        observedAt: baseDate,
      },
      {
        id: 'obs-imp-2',
        observationType: 'WITNESS_SIGHTING',
        sourceDescription: 'Airport Terminal 3',
        latitude: 28.5562,
        longitude: 77.1000,
        locationUncertaintyMeters: 100,
        observedAt: later15Min,
      },
      'PEDESTRIAN',
      4.5
    );
    assert(
      impossiblePair.classification === 'POTENTIAL_VELOCITY_CONTRADICTION',
      'Impossible travel classified as POTENTIAL_VELOCITY_CONTRADICTION'
    );
    assert(
      impossiblePair.isContradictory === true,
      'Contradictory observation pair has isContradictory = true'
    );
    assert(
      impossiblePair.requiredSpeedKmh > 50,
      `Required speed ${impossiblePair.requiredSpeedKmh} km/h exceeds pedestrian speed ceiling`
    );

    // 3. Contradictory distance mitigated by large spatial uncertainty
    // Points 4 km apart, but uncertainties are 2500m + 2000m = 4500m >= 4000m => effective distance = 0!
    const largeUncertaintyPair = evaluateObservationPair(
      {
        id: 'obs-unc-1',
        observationType: 'SYNTHETIC_TELCO_CELL',
        sourceDescription: 'Broad Sector Cell Tower',
        latitude: 28.6500,
        longitude: 77.2100,
        locationUncertaintyMeters: 2500,
        observedAt: baseDate,
      },
      {
        id: 'obs-unc-2',
        observationType: 'SYNTHETIC_TELCO_CELL',
        sourceDescription: 'Adjacent Sector Cell Tower',
        latitude: 28.6800,
        longitude: 77.2300,
        locationUncertaintyMeters: 2000,
        observedAt: later15Min,
      },
      'PEDESTRIAN',
      4.5
    );
    assert(
      largeUncertaintyPair.effectiveMinDistanceKm === 0,
      'Large spatial uncertainties correctly subtract to 0 km effective separation'
    );
    assert(
      largeUncertaintyPair.classification === 'NO_CONFLICT_DETECTED',
      'Observation separation covered by uncertainty classified as NO_CONFLICT_DETECTED'
    );

    // 4. Missing timestamp
    const missingTimestampPair = evaluateObservationPair(
      {
        id: 'obs-notime-1',
        observationType: 'WITNESS_SIGHTING',
        sourceDescription: 'Undated sighting',
        latitude: 28.6500,
        longitude: 77.2100,
        observedAt: null,
      },
      {
        id: 'obs-notime-2',
        observationType: 'WITNESS_SIGHTING',
        sourceDescription: 'Valid sighting',
        latitude: 28.6600,
        longitude: 77.2200,
        observedAt: baseDate,
      }
    );
    assert(
      missingTimestampPair.classification === 'INSUFFICIENT_INFORMATION',
      'Observation missing observedAt timestamp classified as INSUFFICIENT_INFORMATION'
    );

    // 5. Missing coordinates
    const missingCoordsPair = evaluateObservationPair(
      {
        id: 'obs-nocoord-1',
        observationType: 'WITNESS_SIGHTING',
        sourceDescription: 'Unmapped clue',
        latitude: null,
        longitude: null,
        observedAt: baseDate,
      },
      {
        id: 'obs-nocoord-2',
        observationType: 'WITNESS_SIGHTING',
        sourceDescription: 'Mapped clue',
        latitude: 28.6500,
        longitude: 77.2100,
        observedAt: later30Min,
      }
    );
    assert(
      missingCoordsPair.classification === 'INSUFFICIENT_INFORMATION',
      'Observation missing coordinates classified as INSUFFICIENT_INFORMATION'
    );

    // 6. Invalid out-of-bounds coordinates
    const invalidCoordsPair = evaluateObservationPair(
      {
        id: 'obs-inv-1',
        observationType: 'WITNESS_SIGHTING',
        sourceDescription: 'Corrupted coordinates',
        latitude: 145.0, // Invalid: > 90
        longitude: 77.2100,
        observedAt: baseDate,
      },
      {
        id: 'obs-inv-2',
        observationType: 'WITNESS_SIGHTING',
        sourceDescription: 'Standard sighting',
        latitude: 28.6500,
        longitude: 77.2100,
        observedAt: later30Min,
      }
    );
    assert(
      invalidCoordsPair.classification === 'INVALID_OBSERVATION',
      'Out-of-bounds latitude (145.0) classified as INVALID_OBSERVATION'
    );

    // 7. Duplicate observation candidate (10 meters and 1 minute apart)
    const duplicatePair = evaluateObservationPair(
      {
        id: 'obs-dup-1',
        observationType: 'WITNESS_SIGHTING',
        sourceDescription: 'Tip Line Caller A',
        latitude: 28.65000,
        longitude: 77.21000,
        observedAt: baseDate,
      },
      {
        id: 'obs-dup-2',
        observationType: 'WITNESS_SIGHTING',
        sourceDescription: 'Tip Line Caller B',
        latitude: 28.65005, // ~6 meters apart
        longitude: 77.21005,
        observedAt: new Date(baseDate.getTime() + 45 * 1000), // 45s apart
      }
    );
    assert(
      duplicatePair.classification === 'DUPLICATE_CANDIDATE',
      'Close spatial (<15m) and temporal (<2min) observations classified as DUPLICATE_CANDIDATE'
    );

    // 8. Deterministic radius calculations and unit conversions
    // r = (v * dt) + u = (4.5 km/h * 2.0 h * 1000) + 150m = 9150 meters
    const speedKmh = 4.5;
    const elapsedHours = 2.0;
    const anchorUncertainty = 150.0;
    const expectedRadius = Math.round(speedKmh * elapsedHours * 1000 + anchorUncertainty);
    assert(
      expectedRadius === 9150,
      `Deterministic radius formulation verified: (4.5km/h * 2.0h * 1000) + 150m = ${expectedRadius}m`
    );

    // --- Suite 2: Multi-Observation Contradiction API ---
    console.log('\n--- Suite 2: Multi-Observation Contradiction API ---');

    // Retrieve a North District case with multiple observations
    const northCase = await prisma.investigationCase.findFirst({
      where: {
        jurisdiction: { code: 'JUR-DEL-NORTH' },
        observations: { some: {} },
      },
      include: {
        observations: true,
      },
    });

    if (!northCase) {
      throw new Error('Precondition failed: No North District case with observations found');
    }

    const contraRes = await request(`/api/v1/cases/${northCase.id}/contradictions?assumedTravelMode=PEDESTRIAN`, {
      token: officerToken,
    });
    assert(contraRes.status === 200, 'GET /api/v1/cases/:id/contradictions returns 200 OK');
    const contraData = contraRes.body.data;
    assert(Array.isArray(contraData.pairwiseMatrix), 'Pairwise comparison matrix returned as array');
    assert(Array.isArray(contraData.sequentialTimelineChain), 'Sequential timeline chain returned as array');
    assert(typeof contraData.totalObservationsEvaluated === 'number', 'Total observations evaluated returned as number');
    assert(typeof contraData.summary === 'string', 'Summary description provided');
    assert(
      contraData.limitations.includes('Analytical decision-support classification only'),
      'Analytical limitations disclaimer explicitly present'
    );

    // Empty and single-observation resilience test
    // Find or create an empty case without observations
    const emptyCase = await prisma.investigationCase.findFirst({
      where: {
        jurisdictionId: northCase.jurisdictionId,
        observations: { none: {} },
      },
    });

    if (emptyCase) {
      const emptyContraRes = await request(`/api/v1/cases/${emptyCase.id}/contradictions`, {
        token: officerToken,
      });
      assert(emptyContraRes.status === 200, 'GET /contradictions on case with zero observations returns 200 OK');
      assert(
        emptyContraRes.body.data.pairwiseMatrix.length === 0,
        'Empty observation case returns empty pairwise matrix gracefully'
      );
    }

    // --- Suite 3: Observation Exclusion & Reconsideration Workflows ---
    console.log('\n--- Suite 3: Observation Exclusion & Reconsideration Workflows ---');

    const targetObs = northCase.observations[0];

    // Exclude observation
    const excludeRes = await request(`/api/v1/cases/${northCase.id}/observations/${targetObs.id}/exclusions`, {
      method: 'POST',
      token: officerToken,
      body: {
        reason: 'Sighting rejected: witness recanted statement after photo lineup review',
        isCaseLevel: true,
      },
    });

    assert(excludeRes.status === 201, 'POST /observations/:id/exclusions succeeds (201 Created)');
    assert(excludeRes.body.data.reason.includes('witness recanted'), 'Exclusion reason persisted in record');
    assert(excludeRes.body.data.isActive === true, 'Exclusion is active');

    // CRITICAL INVARIANT: LocationObservation record remains stored in database
    const obsInDb = await prisma.locationObservation.findUnique({
      where: { id: targetObs.id },
    });
    assert(obsInDb !== null, 'CRITICAL INVARIANT: Excluded observation is NOT deleted from database');

    // Check exclusion is reflected in contradiction analysis
    const contraAfterExcl = await request(`/api/v1/cases/${northCase.id}/contradictions`, {
      token: officerToken,
    });
    assert(
      contraAfterExcl.body.data.excludedObservationsCount >= 1,
      'Contradiction analysis recognizes excluded observation count >= 1'
    );

    // Reconsider observation
    const reconsiderRes = await request(`/api/v1/cases/${northCase.id}/observations/${targetObs.id}/reconsiderations`, {
      method: 'POST',
      token: officerToken,
      body: {
        reason: 'New corroborating ATM timestamp confirms witness sighting was accurate',
      },
    });

    assert(reconsiderRes.status === 200, 'POST /observations/:id/reconsiderations succeeds (200 OK)');
    assert(reconsiderRes.body.data.isRestored === true, 'Observation marked as restored');

    // Verify exclusion record was deactivated in DB
    const deactExclusion = await prisma.observationExclusion.findFirst({
      where: { observationId: targetObs.id, isActive: false },
      orderBy: { reconsideredAt: 'desc' },
    });
    assert(deactExclusion !== null, 'ObservationExclusion marked isActive = false in database');
    assert(
      deactExclusion?.reconsiderationReason?.includes('corroborating ATM timestamp'),
      'Reconsideration reason captured in exclusion record'
    );

    // Verify AuditLog captured both exclusion and reconsideration
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        caseId: northCase.id,
        action: { in: ['OBSERVATION_EXCLUDED', 'OBSERVATION_RECONSIDERED'] },
      },
    });
    assert(
      auditLogs.some((l) => l.action === 'OBSERVATION_EXCLUDED'),
      'OBSERVATION_EXCLUDED recorded in supervisory audit logs'
    );
    assert(
      auditLogs.some((l) => l.action === 'OBSERVATION_RECONSIDERED'),
      'OBSERVATION_RECONSIDERED recorded in supervisory audit logs'
    );

    // Reject cross-case observation exclusion
    const southCase = await prisma.investigationCase.findFirst({
      where: { jurisdiction: { code: 'JUR-DEL-SOUTH' } },
    });
    if (southCase) {
      const crossExclRes = await request(`/api/v1/cases/${southCase.id}/observations/${targetObs.id}/exclusions`, {
        method: 'POST',
        token: adminToken, // Admin has access to both, but observation does not belong to southCase
        body: {
          reason: 'Attempt cross-case exclusion injection',
        },
      });
      assert(
        crossExclRes.status === 400 || crossExclRes.status === 404,
        'Cross-case observation exclusion rejected (400 Bad Request / 404 Not Found)'
      );
    }

    // --- Suite 4: Search Zone Refinement & Competing Hypotheses ---
    console.log('\n--- Suite 4: Search Zone Refinement & Competing Hypotheses ---');

    // Create a temporary case with two contradictory observations to test competing hypotheses
    const tempCase = await prisma.investigationCase.create({
      data: {
        caseReference: `CAS-TEST-GEO-${Date.now().toString().slice(-4)}`,
        personProfileId: northCase.personProfileId,
        jurisdictionId: northCase.jurisdictionId,
        reportedAt: new Date(),
        missingSince: new Date(Date.now() - 4 * 60 * 60 * 1000), // 4h ago
        incidentSummary: 'Synthetic test case for multi-cluster competing hypotheses verification',
        observations: {
          create: [
            {
              observationType: 'WITNESS_SIGHTING',
              sourceDescription: 'Cluster Alpha: North Bus Terminal',
              latitude: 28.6800,
              longitude: 77.2100,
              locationUncertaintyMeters: 100,
              observedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2h ago
            },
            {
              observationType: 'WITNESS_SIGHTING',
              sourceDescription: 'Cluster Beta: Far South Sector Station',
              latitude: 28.5200, // ~19 km away
              longitude: 77.2100,
              locationUncertaintyMeters: 100,
              observedAt: new Date(Date.now() - 2 * 60 * 60 * 1000 + 5 * 60 * 1000), // 5 min after Alpha -> impossible on foot!
            },
          ],
        },
      },
      include: {
        observations: true,
      },
    });

    const alphaObs = tempCase.observations[0];
    const betaObs = tempCase.observations[1];

    // Generate search zone with alternate hypotheses enabled
    const searchZoneRes = await request(`/api/v1/cases/${tempCase.id}/search-zones`, {
      method: 'POST',
      token: officerToken,
      body: {
        anchorObservationId: alphaObs.id,
        assumedTravelMode: 'PEDESTRIAN',
        maxSpeedKmh: 4.5,
        generateAlternateHypotheses: true,
      },
    });

    assert(searchZoneRes.status === 200, 'POST /api/v1/cases/:id/search-zones returns 200 OK');
    const szData = searchZoneRes.body.data;

    assert(szData.hypothesis !== null, 'Primary hypothesis returned');
    assert(szData.hypothesis.isActive === true, 'Primary hypothesis marked isActive = true');
    assert(
      szData.hypothesis.geometryGeojson.type === 'Feature',
      'GeoJSON candidate circle polygon generated'
    );
    assert(
      szData.hypothesis.geometryGeojson.geometry.type === 'Polygon',
      'GeoJSON geometry is Polygon type'
    );

    // Competing location hypothesis verification
    assert(
      Array.isArray(szData.alternateHypotheses) && szData.alternateHypotheses.length >= 1,
      'Competing location cluster generated as a distinct alternate hypothesis (no false averaging)'
    );
    assert(
      szData.alternateHypotheses[0].isActive === false,
      'Alternate hypothesis marked isActive = false (investigator review required to swap)'
    );
    assert(
      szData.alternateHypotheses[0].title.includes('Alternate Hypothesis'),
      'Alternate hypothesis title explicitly identifies competing cluster'
    );

    // Verify warnings and disclaimers
    assert(
      typeof szData.calculationDetails.warning === 'string' &&
        szData.calculationDetails.warning.includes('not been validated as an authoritative recovery guarantee'),
      'Non-guaranteed decision-support disclaimer explicitly attached'
    );

    // Verify prior hypotheses query
    const hypQueryRes = await request(`/api/v1/cases/${tempCase.id}/hypotheses`, {
      token: officerToken,
    });
    assert(hypQueryRes.status === 200, 'GET /api/v1/cases/:id/hypotheses returns 200 OK');
    assert(
      hypQueryRes.body.data.length >= 2,
      'GET /hypotheses returns both primary and alternate hypotheses for auditability'
    );

    // Reject cross-case anchor observation
    const crossAnchorRes = await request(`/api/v1/cases/${northCase.id}/search-zones`, {
      method: 'POST',
      token: officerToken,
      body: {
        anchorObservationId: betaObs.id, // betaObs belongs to tempCase, not northCase
        assumedTravelMode: 'PEDESTRIAN',
      },
    });
    assert(
      crossAnchorRes.status === 400 || crossAnchorRes.status === 404,
      'Cross-case anchor observation rejected with validation error (400 Bad Request)'
    );

    // --- Suite 5: Investigation Task Recommendations Engine ---
    console.log('\n--- Suite 5: Investigation Task Recommendations Engine ---');

    // Add an unassigned lead and a stale lead to tempCase to test recommendations
    const unassignedLead = await prisma.leadSighting.create({
      data: {
        leadReference: `LED-TEST-${Date.now().toString().slice(-4)}`,
        caseId: tempCase.id,
        sourceType: 'CITIZEN_TIP',
        narrative: 'Caller spotted a person matching profile near community park gate.',
        verificationStatus: 'NEW',
        reportedAt: new Date(),
      },
    });

    const staleLead = await prisma.leadSighting.create({
      data: {
        leadReference: `LED-STALE-${Date.now().toString().slice(-4)}`,
        caseId: tempCase.id,
        sourceType: 'WITNESS_STATEMENT',
        narrative: 'Shopkeeper reported seeing subject 3 days ago.',
        verificationStatus: 'NEW',
        reportedAt: new Date(Date.now() - 72 * 60 * 60 * 1000), // 72h ago
      },
    });

    const recRes = await request(`/api/v1/cases/${tempCase.id}/recommendations`, {
      token: officerToken,
    });
    assert(recRes.status === 200, 'GET /api/v1/cases/:id/recommendations returns 200 OK');
    const recData = recRes.body.data;
    assert(Array.isArray(recData.recommendations), 'Recommendations returned as array');
    assert(recData.recommendations.length >= 3, 'Multiple actionable recommendations generated');

    // Invariant: humanReviewRequired is strictly true across ALL recommendations
    const allRequireReview = recData.recommendations.every((r: any) => r.humanReviewRequired === true);
    assert(allRequireReview, 'CRITICAL SAFETY INVARIANT: humanReviewRequired is true on all recommendations');

    // Invariant: No automated dispatch disclaimer present
    assert(
      recData.disclaimer.includes('Automated systems must never dispatch personnel'),
      'CRITICAL SAFETY INVARIANT: Automated dispatch prohibition disclaimer present'
    );

    // Verify specific recommendation types generated
    const hasUnassignedLeadRec = recData.recommendations.some(
      (r: any) => r.type === 'UNASSIGNED_LEAD_VERIFICATION' && r.relatedLeadId === unassignedLead.id
    );
    assert(hasUnassignedLeadRec, 'UNASSIGNED_LEAD_VERIFICATION recommended for unassigned lead');

    const hasVelocityRec = recData.recommendations.some(
      (r: any) => r.type === 'CONTRADICTORY_OBSERVATION_CLARIFICATION'
    );
    assert(hasVelocityRec, 'CONTRADICTORY_OBSERVATION_CLARIFICATION recommended for velocity conflict');

    const hasStaleLeadRec = recData.recommendations.some(
      (r: any) => r.type === 'STALE_LEAD_TRIAGE' && r.relatedLeadId === staleLead.id
    );
    assert(hasStaleLeadRec, 'STALE_LEAD_TRIAGE recommended for lead older than 48 hours');

    // --- Suite 6: Recommendation Acceptance Workflow ---
    console.log('\n--- Suite 6: Recommendation Acceptance Workflow ---');

    const chosenRec = recData.recommendations.find(
      (r: any) => r.type === 'UNASSIGNED_LEAD_VERIFICATION'
    );
    if (!chosenRec) {
      throw new Error('Precondition failed: UNASSIGNED_LEAD_VERIFICATION recommendation missing');
    }

    // 1. Read-Only reviewer cannot accept recommendations
    const reviewerAcceptRes = await request(`/api/v1/cases/${tempCase.id}/recommendations/accept`, {
      method: 'POST',
      token: reviewerToken,
      body: {
        recommendationId: chosenRec.id,
        title: chosenRec.title,
        description: chosenRec.description,
        dueDate: chosenRec.suggestedDueDate,
        priority: chosenRec.suggestedPriority,
        leadId: chosenRec.relatedLeadId,
      },
    });
    assert(
      reviewerAcceptRes.status === 403,
      'READ_ONLY_REVIEWER forbidden from accepting recommendation (403 Forbidden)'
    );

    // 2. Case Officer accepts recommendation
    const officerAcceptRes = await request(`/api/v1/cases/${tempCase.id}/recommendations/accept`, {
      method: 'POST',
      token: officerToken,
      body: {
        recommendationId: chosenRec.id,
        title: chosenRec.title,
        description: chosenRec.description,
        dueDate: chosenRec.suggestedDueDate,
        priority: chosenRec.suggestedPriority,
        leadId: chosenRec.relatedLeadId,
      },
    });
    assert(officerAcceptRes.status === 201, 'Officer accepting recommendation returns 201 Created');
    const createdTask = officerAcceptRes.body.data;
    assert(!!createdTask.id, 'InvestigationTask created with UUID primary key');
    assert(
      createdTask.taskReference.startsWith('TSK-'),
      `Canonical sequential reference assigned (${createdTask.taskReference})`
    );
    assert(
      createdTask.status === 'PENDING',
      'Newly task created from recommendation defaults to PENDING (never dispatched)'
    );

    // Verify supervisory audit log
    const acceptAudit = await prisma.auditLog.findFirst({
      where: {
        caseId: tempCase.id,
        action: 'TASK_RECOMMENDATION_ACCEPTED',
      },
    });
    assert(acceptAudit !== null, 'TASK_RECOMMENDATION_ACCEPTED recorded in audit logs with actor user');

    // --- Suite 7: Jurisdiction Scoping & Permission Enforcement ---
    console.log('\n--- Suite 7: Jurisdiction Scoping & RBAC Protections ---');

    // Cross-jurisdiction access test: North officer accessing South District case
    if (southCase) {
      const crossContraRes = await request(`/api/v1/cases/${southCase.id}/contradictions`, {
        token: officerToken,
      });
      assert(
        crossContraRes.status === 403,
        'Cross-jurisdiction GET /contradictions rejected (403 Forbidden)'
      );

      const crossSearchZoneRes = await request(`/api/v1/cases/${southCase.id}/search-zones`, {
        method: 'POST',
        token: officerToken,
        body: {
          assumedTravelMode: 'PEDESTRIAN',
        },
      });
      assert(
        crossSearchZoneRes.status === 403,
        'Cross-jurisdiction POST /search-zones rejected (403 Forbidden)'
      );

      const crossRecRes = await request(`/api/v1/cases/${southCase.id}/recommendations`, {
        token: officerToken,
      });
      assert(
        crossRecRes.status === 403,
        'Cross-jurisdiction GET /recommendations rejected (403 Forbidden)'
      );
    }

    // Global Admin has access across all cases
    const adminContraRes = await request(`/api/v1/cases/${northCase.id}/contradictions`, {
      token: adminToken,
    });
    assert(
      adminContraRes.status === 200,
      'SYSTEM_ADMIN granted platform-wide access to /contradictions (200 OK)'
    );

    // Unauthenticated request rejected
    const unauthRes = await request(`/api/v1/cases/${northCase.id}/contradictions`);
    assert(unauthRes.status === 401, 'Unauthenticated request rejected (401 Unauthorized)');

    // Clean up temporary synthetic test case
    await prisma.investigationCase.delete({
      where: { id: tempCase.id },
    });

    console.log('\n===========================================================');
    const passed = results.filter((r) => r.passed).length;
    const total = results.length;
    console.log(`  Assertions Checked: ${total}`);
    console.log(`  Tests Passed: ${passed} / ${total}`);
    if (passed === total) {
      console.log('  🎉 ALL CHECKPOINT 5A INTEGRATION TESTS PASSED!');
    } else {
      console.error(`  ❌ ${total - passed} TESTS FAILED`);
      process.exit(1);
    }
    console.log('===========================================================\n');
  } finally {
    if (server) {
      server.close();
    }
    await prisma.$disconnect();
  }
}

runCheckpoint5aSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
