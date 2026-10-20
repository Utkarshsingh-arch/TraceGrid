import crypto from 'crypto';
import {
  calculateHaversineDistance,
  isValidCoordinate,
  isValidTimestamp,
  LatLng,
} from '../geospatial/geospatial.util';

export type PatternCategory =
  | 'SPATIAL_PROXIMITY'
  | 'TEMPORAL_WINDOW_OVERLAP'
  | 'DESCRIPTOR_CORRELATION'
  | 'MULTI_SIGNAL_ASSOCIATION';

export type PatternReviewPriority = 'HIGH' | 'MEDIUM' | 'LOW';

export interface ContributingSignal {
  category: PatternCategory;
  signalName: string;
  summary: string;
  metrics: {
    distanceKm?: number;
    effectiveDistanceKm?: number;
    uncertaintyMetersA?: number;
    uncertaintyMetersB?: number;
    timeDeltaHours?: number;
    matchedAttribute?: string;
    matchedValue?: string;
  };
  rationale: string;
  limitations: string;
}

export interface CandidatePattern {
  id: string;
  initiatingCaseId: string;
  initiatingCaseReference: string;
  candidateCaseId: string;
  candidateCaseReference: string;
  primaryCategory: PatternCategory;
  reviewPriority: PatternReviewPriority;
  priorityRationale: string;
  signalsCount: number;
  signals: ContributingSignal[];
  supportingRecords: {
    initiatingRecord: {
      id: string;
      recordType: 'OBSERVATION' | 'LEAD';
      referenceOrType: string;
      description: string;
      timestamp: string | null;
      latitude?: number | null;
      longitude?: number | null;
      uncertaintyMeters?: number | null;
    };
    candidateRecord: {
      id: string;
      recordType: 'OBSERVATION' | 'LEAD';
      referenceOrType: string;
      description: string;
      timestamp: string | null;
      latitude?: number | null;
      longitude?: number | null;
      uncertaintyMeters?: number | null;
    };
  };
  reviewStatus: 'UNVERIFIED_CANDIDATE' | 'RELEVANT_FOR_FOLLOWUP' | 'NOT_RELEVANT' | 'UNDER_REVIEW';
  reviewHistory: {
    decision: string;
    rationale: string;
    reviewedAt: string;
    reviewedBy: {
      id: string;
      displayName: string;
      role: string;
      badgeNumber: string | null;
    };
  } | null;
  humanReviewRequired: true;
  disclaimer: string;
}

export const PATTERN_DISCLAIMER =
  'Candidate analytical pattern based on stated spatial and temporal assumptions; does not establish identity, common causation, suspect status, or confirmed case connection. Human investigative review is required.';

/**
 * Generates a stable, deterministic pattern identifier derived from category and canonical record IDs.
 */
export function generatePatternId(
  category: PatternCategory,
  caseIdA: string,
  caseIdB: string,
  recordIdA: string,
  recordIdB: string
): string {
  const sortedCases = [caseIdA, caseIdB].sort().join(':');
  const sortedRecords = [recordIdA, recordIdB].sort().join(':');
  const rawKey = `${category}:${sortedCases}:${sortedRecords}`;
  const hash = crypto.createHash('sha256').update(rawKey).digest('hex').slice(0, 12);
  const prefix =
    category === 'SPATIAL_PROXIMITY'
      ? 'GEO'
      : category === 'TEMPORAL_WINDOW_OVERLAP'
      ? 'TMP'
      : category === 'DESCRIPTOR_CORRELATION'
      ? 'DSC'
      : 'MSIG';
  return `PAT-${prefix}-${hash}`;
}

/**
 * Evaluates spatial proximity between two coordinates, applying uncertainty subtraction.
 */
export function evaluateSpatialProximity(
  p1: LatLng,
  uncertaintyMeters1: number,
  p2: LatLng,
  uncertaintyMeters2: number
): {
  rawDistanceKm: number;
  uncertaintySubtractedKm: number;
  effectiveDistanceKm: number;
  isWithinThreshold: (thresholdKm: number) => boolean;
} {
  const rawMeters = calculateHaversineDistance(p1, p2);
  const totalUncertaintyMeters = (uncertaintyMeters1 || 0) + (uncertaintyMeters2 || 0);
  const effectiveMeters = Math.max(0, rawMeters - totalUncertaintyMeters);

  const rawDistanceKm = Math.round((rawMeters / 1000) * 100) / 100;
  const uncertaintySubtractedKm = Math.round((totalUncertaintyMeters / 1000) * 100) / 100;
  const effectiveDistanceKm = Math.round((effectiveMeters / 1000) * 100) / 100;

  return {
    rawDistanceKm,
    uncertaintySubtractedKm,
    effectiveDistanceKm,
    isWithinThreshold: (thresholdKm: number) => effectiveDistanceKm <= thresholdKm,
  };
}

/**
 * Evaluates temporal delta between two timestamps.
 */
export function evaluateTemporalDelta(
  timeA: Date | string,
  timeB: Date | string
): {
  timeDeltaHours: number;
  timeDeltaMinutes: number;
  sameDayOfWeek: boolean;
  recurringTimeOfDay: boolean;
  timeOfDayLabel: string | null;
} {
  const dateA = new Date(timeA);
  const dateB = new Date(timeB);

  const deltaMs = Math.abs(dateA.getTime() - dateB.getTime());
  const timeDeltaHours = Math.round((deltaMs / (1000 * 60 * 60)) * 10) / 10;
  const timeDeltaMinutes = Math.round(deltaMs / (1000 * 60));

  const sameDayOfWeek = dateA.getUTCDay() === dateB.getUTCDay();

  // Check if both occurred in the same 3-hour daily time bracket (e.g. morning, afternoon, evening rush, late night)
  const hourA = dateA.getUTCHours();
  const hourB = dateB.getUTCHours();
  const diffHoursOfDay = Math.abs(hourA - hourB);
  const recurringTimeOfDay = diffHoursOfDay <= 2 || diffHoursOfDay >= 22; // within 2 hours of same time-of-day

  let timeOfDayLabel: string | null = null;
  if (recurringTimeOfDay) {
    if (hourA >= 6 && hourA < 11) timeOfDayLabel = 'MORNING_COMMUTE_WINDOW';
    else if (hourA >= 11 && hourA < 16) timeOfDayLabel = 'MIDDAY_ACTIVITY_WINDOW';
    else if (hourA >= 16 && hourA < 21) timeOfDayLabel = 'EVENING_TRANSIT_WINDOW';
    else timeOfDayLabel = 'NIGHT_HOURS_WINDOW';
  }

  return {
    timeDeltaHours,
    timeDeltaMinutes,
    sameDayOfWeek,
    recurringTimeOfDay,
    timeOfDayLabel,
  };
}

/**
 * Normalizes text for narrow landmark/descriptor comparison without fuzziness.
 */
export function normalizeDescriptor(text?: string | null): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Evaluates narrow, explainable descriptor similarities.
 * Excludes generic words and strictly compares meaningful landmark phrases or structured descriptors.
 */
/**
 * Common noise words, stop words, and general action/investigative vocabulary.
 */
const INVESTIGATIVE_STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'near', 'at', 'in', 'on', 'by', 'to', 'from', 'with', 'of',
  'is', 'was', 'are', 'were', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
  'it', 'its', 'he', 'his', 'she', 'her', 'they', 'their', 'them', 'who', 'whom', 'which',
  'this', 'that', 'these', 'those', 'there', 'here', 'where', 'when', 'why', 'how',
  'as', 'so', 'for', 'but', 'not', 'no', 'just', 'also', 'then', 'very', 'too', 'more',
  'most', 'about', 'over', 'under', 'after', 'before', 'during', 'while', 'last', 'first',
  'witness', 'sighting', 'saw', 'seen', 'cctv', 'footage', 'camera', 'confirmed', 'spotted',
  'observed', 'walking', 'standing', 'sitting', 'wearing', 'carrying', 'holding', 'reported',
  'subject', 'person', 'individual', 'victim', 'suspect', 'around', 'towards', 'inside',
  'outside', 'entrance', 'exit', 'approximately', 'front', 'back', 'side', 'north', 'south',
  'east', 'west'
]);

/**
 * Generic place terminology that describes place categories rather than specific landmarks.
 * A match requires at least two meaningful tokens AND at least one specific identifier outside this list.
 */
const GENERIC_PLACE_WORDS = new Set([
  'road', 'street', 'avenue', 'sector', 'stall', 'counter', 'area', 'crossing', 'junction',
  'block', 'terminal', 'station', 'metro', 'bus', 'kiosk', 'booth', 'shop', 'lane', 'market',
  'parking', 'building', 'gate', 'corridor', 'depot', 'stop'
]);

export function findExplicitDescriptorMatch(
  descA?: string | null,
  descB?: string | null
): {
  matched: boolean;
  attribute: string;
  matchedValue: string;
  rationale: string;
} | null {
  const normA = normalizeDescriptor(descA);
  const normB = normalizeDescriptor(descB);

  if (!normA || !normB || normA.length < 8 || normB.length < 8) {
    return null;
  }

  // Exact normalized match on specific location description
  if (normA === normB) {
    return {
      matched: true,
      attribute: 'EXACT_LOCATION_DESCRIPTION',
      matchedValue: descA!.trim(),
      rationale: `Exact normalized match on documented location description: "${descA!.trim()}".`,
    };
  }

  // Tokenize and filter stop words
  const tokensA = normA.split(' ').filter((w) => w.length >= 2 && !INVESTIGATIVE_STOP_WORDS.has(w));
  const setB = new Set(normB.split(' ').filter((w) => w.length >= 2 && !INVESTIGATIVE_STOP_WORDS.has(w)));

  // Shared non-stopword tokens
  const shared = tokensA.filter((w) => setB.has(w));

  // A single shared token must NEVER trigger an association, regardless of token length.
  // Must share >= 2 meaningful tokens.
  if (shared.length < 2) {
    return null;
  }

  // Furthermore, the shared tokens cannot be composed solely of generic place categories (e.g. "metro station", "bus stop")
  const hasDistinctiveTerm = shared.some((w) => !GENERIC_PLACE_WORDS.has(w) && w.length >= 3);
  if (!hasDistinctiveTerm) {
    return null;
  }

  const sharedTerms = shared.join(' ');
  return {
    matched: true,
    attribute: 'SHARED_LANDMARK_PHRASE',
    matchedValue: sharedTerms,
    rationale: `Shared documented landmark keywords: [${shared.join(', ')}] across distinct location records (compares documented observation sourceDescription fields).`,
  };
}

/**
 * Determines ordinal review priority based on deterministic heuristic rules.
 */
export function computeReviewPriority(
  signals: ContributingSignal[],
  effectiveDistanceKm?: number,
  timeDeltaHours?: number
): { priority: PatternReviewPriority; rationale: string } {
  const count = signals.length;

  if (count >= 3) {
    return {
      priority: 'HIGH',
      rationale:
        'Three independent signals observed (Spatial Proximity, Temporal Window Overlap, and Common Descriptor Correlation). Prioritized for supervisory triage.',
    };
  }

  if (
    count >= 2 &&
    effectiveDistanceKm != null &&
    effectiveDistanceKm <= 2.0 &&
    timeDeltaHours != null &&
    timeDeltaHours <= 36.0
  ) {
    return {
      priority: 'HIGH',
      rationale:
        'Close spatial proximity (≤ 2.0 km effective distance) accompanied by a tight chronological interval (≤ 36.0 hours).',
    };
  }

  if (count >= 2) {
    return {
      priority: 'MEDIUM',
      rationale:
        'Multiple corroborating signals observed within configured spatial and temporal thresholds.',
    };
  }

  if (effectiveDistanceKm != null && effectiveDistanceKm <= 1.0) {
    return {
      priority: 'MEDIUM',
      rationale:
        'Notable close spatial proximity (≤ 1.0 km effective distance after uncertainty subtraction).',
    };
  }

  return {
    priority: 'LOW',
    rationale:
      'Single analytical heuristic satisfied; recommended for informational awareness during routine case review.',
  };
}
