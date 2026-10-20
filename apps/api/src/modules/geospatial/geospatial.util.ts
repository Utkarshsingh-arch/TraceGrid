/**
 * Deterministic Geospatial Intelligence & Multi-Observation Contradiction Engine
 * Implements spherical Haversine geometry, uncertainty-bounded velocity analysis,
 * and analytical contradiction classification.
 */

export interface LatLng {
  latitude: number;
  longitude: number;
}

export type TravelMode = 'PEDESTRIAN' | 'TRANSIT' | 'VEHICULAR';

export interface TravelProfile {
  mode: TravelMode;
  defaultSpeedKmh: number;
  plausibleMaxSpeedKmh: number;
  description: string;
}

export const TRAVEL_PROFILES: Record<TravelMode, TravelProfile> = {
  PEDESTRIAN: {
    mode: 'PEDESTRIAN',
    defaultSpeedKmh: 4.5,
    plausibleMaxSpeedKmh: 12.0,
    description: 'Pedestrian on foot (walking ~4.5 km/h, maximum athletic sprint ~12 km/h)',
  },
  TRANSIT: {
    mode: 'TRANSIT',
    defaultSpeedKmh: 25.0,
    plausibleMaxSpeedKmh: 80.0,
    description: 'Public transit (urban bus/metro ~25 km/h, regional transit/express bus ~80 km/h)',
  },
  VEHICULAR: {
    mode: 'VEHICULAR',
    defaultSpeedKmh: 45.0,
    plausibleMaxSpeedKmh: 120.0,
    description: 'Motor vehicle or taxi (urban arterial ~45 km/h, highway corridor ~120 km/h)',
  },
};

export type ContradictionClassification =
  | 'NO_CONFLICT_DETECTED'
  | 'POTENTIAL_VELOCITY_CONTRADICTION'
  | 'INSUFFICIENT_INFORMATION'
  | 'INVALID_OBSERVATION'
  | 'DUPLICATE_CANDIDATE';

const EARTH_RADIUS_METERS = 6371008.8;

/**
 * Validates coordinate bounds: latitude in [-90, 90], longitude in [-180, 180].
 */
export function isValidCoordinate(latitude?: number | null, longitude?: number | null): boolean {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return false;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  return latitude >= -90.0 && latitude <= 90.0 && longitude >= -180.0 && longitude <= 180.0;
}

/**
 * Validates observation timestamp sanity.
 */
export function isValidTimestamp(timestamp?: Date | string | null): boolean {
  if (!timestamp) return false;
  const d = new Date(timestamp);
  const time = d.getTime();
  if (Number.isNaN(time)) return false;
  // Year range sanity [1990, 2100]
  const year = d.getUTCFullYear();
  return year >= 1990 && year <= 2100;
}

/**
 * Calculates Great-Circle distance between two points on Earth using the Haversine formula (in meters).
 */
export function calculateHaversineDistance(p1: LatLng, p2: LatLng): number {
  const dLat = ((p2.latitude - p1.latitude) * Math.PI) / 180;
  const dLng = ((p2.longitude - p1.longitude) * Math.PI) / 180;
  const lat1 = (p1.latitude * Math.PI) / 180;
  const lat2 = (p2.latitude * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
}

/**
 * Generates GeoJSON Polygon coordinates approximating a circular buffer on spherical coordinates.
 */
export function generateCirclePolygon(center: LatLng, radiusMeters: number, steps = 36): number[][][] {
  const coordinates: number[][] = [];
  const latRad = (center.latitude * Math.PI) / 180;
  const lngRad = (center.longitude * Math.PI) / 180;
  const dR = radiusMeters / EARTH_RADIUS_METERS;

  for (let i = 0; i < steps; i++) {
    const bearing = (i * 2 * Math.PI) / steps;
    const pLat = Math.asin(
      Math.sin(latRad) * Math.cos(dR) + Math.cos(latRad) * Math.sin(dR) * Math.cos(bearing)
    );
    const pLng =
      lngRad +
      Math.atan2(
        Math.sin(bearing) * Math.sin(dR) * Math.cos(latRad),
        Math.cos(dR) - Math.sin(latRad) * Math.sin(pLat)
      );

    coordinates.push([(pLng * 180) / Math.PI, (pLat * 180) / Math.PI]);
  }

  // Close polygon loop
  coordinates.push(coordinates[0]);

  return [coordinates];
}

export interface ObservationData {
  id: string;
  caseId?: string;
  observationType: string;
  sourceDescription: string;
  observedAt?: Date | string | null;
  recordedAt?: Date | string | null;
  latitude?: number | null;
  longitude?: number | null;
  locationUncertaintyMeters?: number | null;
  verificationStatus?: string | null;
  isExcluded?: boolean;
  exclusionReason?: string | null;
}

export interface PairwiseComparisonResult {
  observationAId: string;
  observationBId: string;
  observationASummary: string;
  observationBSummary: string;
  observationATime: string | null;
  observationBTime: string | null;
  rawDistanceKm: number;
  effectiveMinDistanceKm: number;
  uncertaintySubtractedKm: number;
  timeDeltaHours: number;
  timeDeltaMinutes: number;
  requiredSpeedKmh: number;
  assumedMaxSpeedKmh: number;
  classification: ContradictionClassification;
  isContradictory: boolean;
  calculationRationale: string;
  limitations: string;
}

const ANALYTICAL_LIMITATIONS_DISCLAIMER =
  'Analytical decision-support classification only. Velocity contradictions indicate physical tension under current travel parameters (which may be caused by sensor error, witness clock skew, or mistaken identity); they do not constitute definitive proof of falsehood.';

/**
 * Evaluates a single pair of observations, accounting for spatial uncertainty bounds and timestamp deltas.
 */
export function evaluateObservationPair(
  obsA: ObservationData,
  obsB: ObservationData,
  assumedTravelMode: TravelMode = 'PEDESTRIAN',
  customMaxSpeedKmh?: number
): PairwiseComparisonResult {
  const profile = TRAVEL_PROFILES[assumedTravelMode] || TRAVEL_PROFILES.PEDESTRIAN;
  const assumedMaxSpeedKmh = customMaxSpeedKmh || profile.defaultSpeedKmh;

  const summaryA = obsA.sourceDescription || `Observation ${obsA.id.slice(0, 8)}`;
  const summaryB = obsB.sourceDescription || `Observation ${obsB.id.slice(0, 8)}`;
  const timeAStr = obsA.observedAt ? new Date(obsA.observedAt).toISOString() : null;
  const timeBStr = obsB.observedAt ? new Date(obsB.observedAt).toISOString() : null;

  // 1. Data Quality Checks: Missing Information
  if (
    obsA.latitude == null ||
    obsA.longitude == null ||
    obsB.latitude == null ||
    obsB.longitude == null ||
    !obsA.observedAt ||
    !obsB.observedAt
  ) {
    return {
      observationAId: obsA.id,
      observationBId: obsB.id,
      observationASummary: summaryA,
      observationBSummary: summaryB,
      observationATime: timeAStr,
      observationBTime: timeBStr,
      rawDistanceKm: 0,
      effectiveMinDistanceKm: 0,
      uncertaintySubtractedKm: 0,
      timeDeltaHours: 0,
      timeDeltaMinutes: 0,
      requiredSpeedKmh: 0,
      assumedMaxSpeedKmh,
      classification: 'INSUFFICIENT_INFORMATION',
      isContradictory: false,
      calculationRationale:
        'One or both observations lack coordinates or temporal timestamps required for spatio-temporal velocity calculation.',
      limitations: ANALYTICAL_LIMITATIONS_DISCLAIMER,
    };
  }

  // 2. Data Quality Checks: Coordinate or Timestamp Invalidation
  if (
    !isValidCoordinate(obsA.latitude, obsA.longitude) ||
    !isValidCoordinate(obsB.latitude, obsB.longitude) ||
    !isValidTimestamp(obsA.observedAt) ||
    !isValidTimestamp(obsB.observedAt)
  ) {
    return {
      observationAId: obsA.id,
      observationBId: obsB.id,
      observationASummary: summaryA,
      observationBSummary: summaryB,
      observationATime: timeAStr,
      observationBTime: timeBStr,
      rawDistanceKm: 0,
      effectiveMinDistanceKm: 0,
      uncertaintySubtractedKm: 0,
      timeDeltaHours: 0,
      timeDeltaMinutes: 0,
      requiredSpeedKmh: 0,
      assumedMaxSpeedKmh,
      classification: 'INVALID_OBSERVATION',
      isContradictory: false,
      calculationRationale:
        'Coordinates outside valid geographic bounds (latitude [-90, 90], longitude [-180, 180]) or corrupted timestamp.',
      limitations: ANALYTICAL_LIMITATIONS_DISCLAIMER,
    };
  }

  const dateA = new Date(obsA.observedAt);
  const dateB = new Date(obsB.observedAt);
  const timeDeltaMs = Math.abs(dateB.getTime() - dateA.getTime());
  const timeDeltaHours = timeDeltaMs / (1000 * 60 * 60);
  const timeDeltaMinutes = Math.round((timeDeltaMs / (1000 * 60)) * 10) / 10;

  // Calculate raw distance
  const rawDistMeters = calculateHaversineDistance(
    { latitude: obsA.latitude, longitude: obsA.longitude },
    { latitude: obsB.latitude, longitude: obsB.longitude }
  );
  const rawDistKm = Math.round((rawDistMeters / 1000) * 1000) / 1000;

  // 3. Duplicate Candidate Detection:
  // Same physical location within 15 meters and within 2 minutes of each other
  if (rawDistMeters <= 15.0 && timeDeltaMinutes <= 2.0) {
    return {
      observationAId: obsA.id,
      observationBId: obsB.id,
      observationASummary: summaryA,
      observationBSummary: summaryB,
      observationATime: timeAStr,
      observationBTime: timeBStr,
      rawDistanceKm: rawDistKm,
      effectiveMinDistanceKm: 0,
      uncertaintySubtractedKm: 0,
      timeDeltaHours: Math.round(timeDeltaHours * 100) / 100,
      timeDeltaMinutes,
      requiredSpeedKmh: 0,
      assumedMaxSpeedKmh,
      classification: 'DUPLICATE_CANDIDATE',
      isContradictory: false,
      calculationRationale: `Observations are separated by only ${Math.round(rawDistMeters)} meters within ${timeDeltaMinutes} minutes. Likely duplicate recordings of the same event.`,
      limitations: ANALYTICAL_LIMITATIONS_DISCLAIMER,
    };
  }

  // 4. Uncertainty accounting:
  // d_min = max(0, d_raw - (u_A + u_B))
  const uA = (obsA.locationUncertaintyMeters ?? 100.0) / 1000;
  const uB = (obsB.locationUncertaintyMeters ?? 100.0) / 1000;
  const totalUncertaintyKm = Math.round((uA + uB) * 1000) / 1000;
  const effectiveMinDistKm = Math.max(0, Math.round((rawDistKm - totalUncertaintyKm) * 1000) / 1000);

  // 5. If spatial uncertainty completely covers the separation, points plausibly overlap
  if (effectiveMinDistKm === 0) {
    return {
      observationAId: obsA.id,
      observationBId: obsB.id,
      observationASummary: summaryA,
      observationBSummary: summaryB,
      observationATime: timeAStr,
      observationBTime: timeBStr,
      rawDistanceKm: rawDistKm,
      effectiveMinDistanceKm: 0,
      uncertaintySubtractedKm: totalUncertaintyKm,
      timeDeltaHours: Math.round(timeDeltaHours * 100) / 100,
      timeDeltaMinutes,
      requiredSpeedKmh: 0,
      assumedMaxSpeedKmh,
      classification: 'NO_CONFLICT_DETECTED',
      isContradictory: false,
      calculationRationale: `Combined spatial uncertainty (${Math.round(totalUncertaintyKm * 1000)}m) accounts for the physical separation (${Math.round(rawDistKm * 1000)}m). No movement required.`,
      limitations: ANALYTICAL_LIMITATIONS_DISCLAIMER,
    };
  }

  // 6. Velocity Calculation & Contradiction Evaluation:
  // Effective distance > 0: Calculate required speed
  const safeTimeHours = Math.max(timeDeltaHours, 0.00028); // ~1 second floor
  const requiredSpeedKmh = Math.round((effectiveMinDistKm / safeTimeHours) * 10) / 10;

  // Velocity threshold: assumed max speed with a 20% margin
  const velocityExceeded = requiredSpeedKmh > assumedMaxSpeedKmh * 1.2;

  // Immediate spatial impossibility: separated by > 500m effective distance within < 2 minutes
  const immediateSpatialImpossibility = timeDeltaMinutes <= 2.0 && effectiveMinDistKm > 0.5;

  const isContradictory = velocityExceeded || immediateSpatialImpossibility;
  const classification: ContradictionClassification = isContradictory
    ? 'POTENTIAL_VELOCITY_CONTRADICTION'
    : 'NO_CONFLICT_DETECTED';

  let rationale = `Plausible under ${assumedTravelMode} travel assumptions: required speed ${requiredSpeedKmh} km/h <= threshold ${Math.round(assumedMaxSpeedKmh * 1.2)} km/h.`;

  if (immediateSpatialImpossibility) {
    rationale = `Immediate spatial conflict: effective separation of ${effectiveMinDistKm} km within only ${timeDeltaMinutes} minutes requires ${requiredSpeedKmh} km/h (assumed maximum: ${assumedMaxSpeedKmh} km/h).`;
  } else if (velocityExceeded) {
    rationale = `Potential velocity contradiction: traversing effective separation of ${effectiveMinDistKm} km in ${timeDeltaMinutes} minutes requires ${requiredSpeedKmh} km/h, exceeding the plausible ${assumedTravelMode} ceiling (${assumedMaxSpeedKmh} km/h) by ${Math.round(((requiredSpeedKmh - assumedMaxSpeedKmh) / assumedMaxSpeedKmh) * 100)}%.`;
  }

  return {
    observationAId: obsA.id,
    observationBId: obsB.id,
    observationASummary: summaryA,
    observationBSummary: summaryB,
    observationATime: timeAStr,
    observationBTime: timeBStr,
    rawDistanceKm: rawDistKm,
    effectiveMinDistanceKm: effectiveMinDistKm,
    uncertaintySubtractedKm: totalUncertaintyKm,
    timeDeltaHours: Math.round(timeDeltaHours * 100) / 100,
    timeDeltaMinutes,
    requiredSpeedKmh,
    assumedMaxSpeedKmh,
    classification,
    isContradictory,
    calculationRationale: rationale,
    limitations: ANALYTICAL_LIMITATIONS_DISCLAIMER,
  };
}

export interface ContradictionCheckResult {
  isContradictory: boolean;
  requiredSpeedKmh: number;
  distanceKm: number;
  timeDeltaHours: number;
  classification?: ContradictionClassification;
  explanation: string;
}

/**
 * Evaluates whether two spatio-temporal observations are physically plausible under an assumed maximum speed.
 * Maintained for backwards compatibility with Checkpoint 3B/4A callers.
 */
export function checkObservationContradiction(
  anchor: { latitude: number; longitude: number; observedAt: Date; locationUncertaintyMeters?: number; id?: string },
  candidate: { latitude: number; longitude: number; observedAt: Date; locationUncertaintyMeters?: number; id?: string },
  assumedMaxSpeedKmh: number
): ContradictionCheckResult {
  const result = evaluateObservationPair(
    {
      id: anchor.id || 'anchor',
      observationType: 'ANCHOR',
      sourceDescription: 'Anchor observation',
      latitude: anchor.latitude,
      longitude: anchor.longitude,
      observedAt: anchor.observedAt,
      locationUncertaintyMeters: anchor.locationUncertaintyMeters ?? 100,
    },
    {
      id: candidate.id || 'candidate',
      observationType: 'CANDIDATE',
      sourceDescription: 'Candidate observation',
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      observedAt: candidate.observedAt,
      locationUncertaintyMeters: candidate.locationUncertaintyMeters ?? 100,
    },
    'PEDESTRIAN',
    assumedMaxSpeedKmh
  );

  return {
    isContradictory: result.isContradictory,
    requiredSpeedKmh: result.requiredSpeedKmh,
    distanceKm: result.rawDistanceKm,
    timeDeltaHours: result.timeDeltaHours,
    classification: result.classification,
    explanation: result.calculationRationale,
  };
}

export interface MultiObservationAnalysisResult {
  caseId: string;
  assumedTravelMode: TravelMode;
  assumedMaxSpeedKmh: number;
  totalObservationsEvaluated: number;
  activeObservationsCount: number;
  excludedObservationsCount: number;
  pairwiseMatrix: PairwiseComparisonResult[];
  sequentialTimelineChain: PairwiseComparisonResult[];
  contradictionPairsCount: number;
  duplicateCandidatesCount: number;
  dataQualityIssuesCount: number;
  competingAnchors: Array<{
    anchorObservationId: string;
    sourceDescription: string;
    conflictingWithAnchorId: string;
    requiredSpeedKmh: number;
    reason: string;
  }>;
  summary: string;
  limitations: string;
}

/**
 * Performs full multi-observation contradiction analysis across all case observations.
 */
export function evaluateAllCaseObservations(
  caseId: string,
  observations: ObservationData[],
  assumedTravelMode: TravelMode = 'PEDESTRIAN',
  customMaxSpeedKmh?: number,
  primaryAnchorId?: string
): MultiObservationAnalysisResult {
  const profile = TRAVEL_PROFILES[assumedTravelMode] || TRAVEL_PROFILES.PEDESTRIAN;
  const assumedMaxSpeedKmh = customMaxSpeedKmh || profile.defaultSpeedKmh;

  const activeObs = observations.filter((o) => !o.isExcluded);
  const excludedObs = observations.filter((o) => o.isExcluded);

  // Chronologically sorted active observations
  const sortedActive = [...activeObs].sort((a, b) => {
    const tA = a.observedAt ? new Date(a.observedAt).getTime() : 0;
    const tB = b.observedAt ? new Date(b.observedAt).getTime() : 0;
    return tA - tB;
  });

  const pairwiseMatrix: PairwiseComparisonResult[] = [];
  const sequentialTimelineChain: PairwiseComparisonResult[] = [];
  let contradictionPairsCount = 0;
  let duplicateCandidatesCount = 0;
  let dataQualityIssuesCount = 0;

  // 1. Sequential Timeline Chain (step-by-step path)
  for (let i = 0; i < sortedActive.length - 1; i++) {
    const res = evaluateObservationPair(sortedActive[i], sortedActive[i + 1], assumedTravelMode, assumedMaxSpeedKmh);
    sequentialTimelineChain.push(res);
  }

  // 2. Pairwise Matrix across all active observations
  for (let i = 0; i < sortedActive.length; i++) {
    for (let j = i + 1; j < sortedActive.length; j++) {
      const res = evaluateObservationPair(sortedActive[i], sortedActive[j], assumedTravelMode, assumedMaxSpeedKmh);
      pairwiseMatrix.push(res);

      if (res.isContradictory) contradictionPairsCount++;
      if (res.classification === 'DUPLICATE_CANDIDATE') duplicateCandidatesCount++;
      if (res.classification === 'INSUFFICIENT_INFORMATION' || res.classification === 'INVALID_OBSERVATION') {
        dataQualityIssuesCount++;
      }
    }
  }

  // 3. Detect Competing Anchors (observations that contradict the primary anchor or each other)
  const competingAnchors: MultiObservationAnalysisResult['competingAnchors'] = [];
  const primaryAnchor = primaryAnchorId
    ? sortedActive.find((o) => o.id === primaryAnchorId)
    : sortedActive[sortedActive.length - 1]; // default to most recent if unassigned

  if (primaryAnchor) {
    for (const obs of sortedActive) {
      if (obs.id === primaryAnchor.id) continue;
      const comp = evaluateObservationPair(primaryAnchor, obs, assumedTravelMode, assumedMaxSpeedKmh);
      if (comp.isContradictory) {
        competingAnchors.push({
          anchorObservationId: obs.id,
          sourceDescription: obs.sourceDescription,
          conflictingWithAnchorId: primaryAnchor.id,
          requiredSpeedKmh: comp.requiredSpeedKmh,
          reason: comp.calculationRationale,
        });
      }
    }
  }

  const summary =
    contradictionPairsCount > 0
      ? `Found ${contradictionPairsCount} potential spatio-temporal contradiction(s) and ${competingAnchors.length} competing location hypothesis anchor(s) under ${assumedTravelMode} (${assumedMaxSpeedKmh} km/h).`
      : `No spatio-temporal conflicts detected across ${activeObs.length} active observations under ${assumedTravelMode} (${assumedMaxSpeedKmh} km/h).`;

  return {
    caseId,
    assumedTravelMode,
    assumedMaxSpeedKmh,
    totalObservationsEvaluated: observations.length,
    activeObservationsCount: activeObs.length,
    excludedObservationsCount: excludedObs.length,
    pairwiseMatrix,
    sequentialTimelineChain,
    contradictionPairsCount,
    duplicateCandidatesCount,
    dataQualityIssuesCount,
    competingAnchors,
    summary,
    limitations: ANALYTICAL_LIMITATIONS_DISCLAIMER,
  };
}
