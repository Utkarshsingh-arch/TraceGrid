import { prisma } from '../../database/prisma';
import { AuthUser } from '../../types/express';
import { Role, EventType, LeadStatus } from '@prisma/client';
import {
  CandidatePattern,
  ContributingSignal,
  evaluateSpatialProximity,
  evaluateTemporalDelta,
  findExplicitDescriptorMatch,
  computeReviewPriority,
  generatePatternId,
  PATTERN_DISCLAIMER,
} from './pattern.util';
import { CasePatternQueryInput, PatternReviewInput } from './pattern.dto';
import { NotFoundError, ForbiddenError, ValidationError } from '../../utils/errors';
import { isValidCoordinate, isValidTimestamp } from '../geospatial/geospatial.util';

export class PatternService {
  /**
   * Evaluates authorized cross-case patterns for an initiating case against peer cases in the user's jurisdiction scope.
   */
  public static async analyzeCasePatterns(
    caseId: string,
    input: CasePatternQueryInput,
    actorUser: AuthUser
  ): Promise<{
    initiatingCaseId: string;
    initiatingCaseReference: string;
    analysisParameters: {
      maxDistanceKm: number;
      maxTimeDeltaHours: number;
      includeTemporalOverlap: boolean;
      includeDescriptors: boolean;
      minSignals: number;
    };
    evaluatedCandidateCasesCount: number;
    totalPatternsFound: number;
    patterns: CandidatePattern[];
    disclaimer: string;
  }> {
    // 1. Authorize and load initiating case
    const targetCase = await prisma.investigationCase.findUnique({
      where: { id: caseId },
      include: {
        personProfile: true,
        jurisdiction: true,
        observations: {
          orderBy: { observedAt: 'asc' },
        },
        leads: {
          orderBy: { reportedAt: 'desc' },
        },
        observationExclusions: {
          where: { isActive: true },
        },
      },
    });

    if (!targetCase) {
      throw new NotFoundError(`Investigation case ${caseId} was not found`);
    }

    if (actorUser.role !== Role.SYSTEM_ADMIN && actorUser.jurisdictionId !== targetCase.jurisdictionId) {
      throw new ForbiddenError('Access denied: case belongs to an operational jurisdiction outside your scope');
    }

    // 2. Query authorized candidate peer cases
    // STRICT RULE: Pre-filter query in database by jurisdictionId to prevent out-of-scope candidate records from ever entering memory!
    const candidateWhere: any = {
      id: { not: caseId },
    };

    if (actorUser.role !== Role.SYSTEM_ADMIN) {
      if (!actorUser.jurisdictionId) {
        throw new ForbiddenError('Access denied: user has no assigned operational jurisdiction');
      }
      candidateWhere.jurisdictionId = actorUser.jurisdictionId;
    }

    const candidateCases = await prisma.investigationCase.findMany({
      where: candidateWhere,
      take: 60,
      orderBy: { lastActivityAt: 'desc' },
      include: {
        personProfile: true,
        jurisdiction: true,
        observations: {
          orderBy: { observedAt: 'asc' },
        },
        leads: {
          orderBy: { reportedAt: 'desc' },
        },
        observationExclusions: {
          where: { isActive: true },
        },
      },
    });

    // 3. Reconstruct review decisions from AuditLog
    // Searches initiating case and accessible candidate cases within caller's jurisdiction
    const accessibleCaseIds = [caseId, ...candidateCases.map((c) => c.id)];
    const patternReviewLogs = await prisma.auditLog.findMany({
      where: {
        caseId: { in: accessibleCaseIds },
        action: 'CROSS_CASE_PATTERN_REVIEWED',
      },
      orderBy: { createdAt: 'desc' },
      include: {
        actorUser: {
          select: {
            id: true,
            displayName: true,
            badgeNumber: true,
            role: true,
          },
        },
      },
    });

    const reviewMap = new Map<
      string,
      {
        decision: 'RELEVANT_FOR_FOLLOWUP' | 'NOT_RELEVANT' | 'UNDER_REVIEW';
        rationale: string;
        reviewedAt: string;
        reviewedBy: { id: string; displayName: string; role: string; badgeNumber: string | null };
      }
    >();

    for (const log of patternReviewLogs) {
      const meta = log.newStateJson as any;
      if (meta?.patternId && !reviewMap.has(meta.patternId)) {
        reviewMap.set(meta.patternId, {
          decision: meta.decision,
          rationale: log.reason || meta.rationale || '',
          reviewedAt: log.createdAt.toISOString(),
          reviewedBy: {
            id: log.actorUser?.id || '',
            displayName: log.actorUser?.displayName || 'Authorized Investigator',
            role: log.actorUser?.role || '',
            badgeNumber: log.actorUser?.badgeNumber || null,
          },
        });
      }
    }

    // Excluded observations set
    const targetExcludedObsIds = new Set(targetCase.observationExclusions.map((e) => e.observationId));

    // Active observations in target case
    const targetValidObs = targetCase.observations.filter(
      (o) => !targetExcludedObsIds.has(o.id) && o.verificationStatus !== LeadStatus.DISPROVED
    );

    const patterns: CandidatePattern[] = [];

    // 4. Pairwise analytical evaluation against each candidate case
    for (const candCase of candidateCases) {
      const candExcludedObsIds = new Set(candCase.observationExclusions.map((e) => e.observationId));
      const candValidObs = candCase.observations.filter(
        (o) => !candExcludedObsIds.has(o.id) && o.verificationStatus !== LeadStatus.DISPROVED
      );

      // Compare observations between target case and candidate case
      for (const obsA of targetValidObs) {
        for (const obsB of candValidObs) {
          const signals: ContributingSignal[] = [];

          // Category A: Spatial Proximity Evaluation
          let spatialResult: ReturnType<typeof evaluateSpatialProximity> | null = null;
          let temporalResult: ReturnType<typeof evaluateTemporalDelta> | null = null;

          if (
            isValidCoordinate(obsA.latitude, obsA.longitude) &&
            isValidCoordinate(obsB.latitude, obsB.longitude)
          ) {
            spatialResult = evaluateSpatialProximity(
              { latitude: obsA.latitude, longitude: obsA.longitude },
              obsA.locationUncertaintyMeters,
              { latitude: obsB.latitude, longitude: obsB.longitude },
              obsB.locationUncertaintyMeters
            );

            if (spatialResult.isWithinThreshold(input.maxDistanceKm)) {
              signals.push({
                category: 'SPATIAL_PROXIMITY',
                signalName: 'RECURRING_GEOGRAPHIC_PROXIMITY',
                summary: `Observations located within ${spatialResult.effectiveDistanceKm} km effective separation (raw: ${spatialResult.rawDistanceKm} km, uncertainty subtracted: ${spatialResult.uncertaintySubtractedKm} km).`,
                metrics: {
                  distanceKm: spatialResult.rawDistanceKm,
                  effectiveDistanceKm: spatialResult.effectiveDistanceKm,
                  uncertaintyMetersA: obsA.locationUncertaintyMeters,
                  uncertaintyMetersB: obsB.locationUncertaintyMeters,
                },
                rationale: `Spatial distance between sightings (${spatialResult.effectiveDistanceKm} km) is within the analytical ceiling of ${input.maxDistanceKm} km.`,
                limitations:
                  'Spatial proximity does not establish that observations pertain to the same incident or subject. Geographical clustering may reflect common thoroughfares, urban density, or chance occurrence.',
              });
            }
          }

          // Category B: Temporal Overlap Evaluation
          if (
            input.includeTemporalOverlap &&
            isValidTimestamp(obsA.observedAt) &&
            isValidTimestamp(obsB.observedAt)
          ) {
            temporalResult = evaluateTemporalDelta(obsA.observedAt, obsB.observedAt);

            if (temporalResult.timeDeltaHours <= input.maxTimeDeltaHours) {
              const recurringNote = temporalResult.recurringTimeOfDay
                ? ` Sightings occurred within a recurring daily window (${temporalResult.timeOfDayLabel}).`
                : '';
              signals.push({
                category: 'TEMPORAL_WINDOW_OVERLAP',
                signalName: 'CHRONOLOGICAL_PROXIMITY_WINDOW',
                summary: `Observations recorded ${temporalResult.timeDeltaHours} hours apart.${recurringNote}`,
                metrics: {
                  timeDeltaHours: temporalResult.timeDeltaHours,
                  matchedAttribute: temporalResult.timeOfDayLabel || 'GENERAL_WINDOW',
                  matchedValue: `${temporalResult.timeDeltaHours}h delta`,
                },
                rationale: `Recorded timestamps fall within the configured observation horizon of ${input.maxTimeDeltaHours} hours.`,
                limitations:
                  'Temporal proximity alone does not demonstrate correlation. Coincident timing across distinct cases frequently occurs in municipal transit and commercial corridors.',
              });
            }
          }

          // Category C: Potentially Related Descriptors
          if (input.includeDescriptors) {
            const descMatch = findExplicitDescriptorMatch(obsA.sourceDescription, obsB.sourceDescription);
            if (descMatch) {
              signals.push({
                category: 'DESCRIPTOR_CORRELATION',
                signalName: descMatch.attribute,
                summary: descMatch.rationale,
                metrics: {
                  matchedAttribute: descMatch.attribute,
                  matchedValue: descMatch.matchedValue,
                },
                rationale: descMatch.rationale,
                limitations:
                  'Descriptor alignment is based strictly on normalized location/feature phrases; it does not constitute biometric identification or prove a shared subject.',
              });
            }
          }

          // Only proceed if signals count meets the required minimum threshold
          if (signals.length >= input.minSignals) {
            const hasSpatial = signals.some((s) => s.category === 'SPATIAL_PROXIMITY');
            const hasTemporal = signals.some((s) => s.category === 'TEMPORAL_WINDOW_OVERLAP');
            const hasDescriptor = signals.some((s) => s.category === 'DESCRIPTOR_CORRELATION');

            let primaryCat: CandidatePattern['primaryCategory'] = 'SPATIAL_PROXIMITY';
            if (signals.length > 1) {
              primaryCat = 'MULTI_SIGNAL_ASSOCIATION';
            } else if (hasTemporal) {
              primaryCat = 'TEMPORAL_WINDOW_OVERLAP';
            } else if (hasDescriptor) {
              primaryCat = 'DESCRIPTOR_CORRELATION';
            }

            const patternId = generatePatternId(
              primaryCat,
              targetCase.id,
              candCase.id,
              obsA.id,
              obsB.id
            );

            const priorityCalc = computeReviewPriority(
              signals,
              spatialResult?.effectiveDistanceKm,
              temporalResult?.timeDeltaHours
            );

            const existingReview = reviewMap.get(patternId) || null;

            patterns.push({
              id: patternId,
              initiatingCaseId: targetCase.id,
              initiatingCaseReference: targetCase.caseReference,
              candidateCaseId: candCase.id,
              candidateCaseReference: candCase.caseReference,
              primaryCategory: primaryCat,
              reviewPriority: priorityCalc.priority,
              priorityRationale: priorityCalc.rationale,
              signalsCount: signals.length,
              signals,
              supportingRecords: {
                initiatingRecord: {
                  id: obsA.id,
                  recordType: 'OBSERVATION',
                  referenceOrType: obsA.observationType,
                  description: obsA.sourceDescription,
                  timestamp: obsA.observedAt ? new Date(obsA.observedAt).toISOString() : null,
                  latitude: obsA.latitude,
                  longitude: obsA.longitude,
                  uncertaintyMeters: obsA.locationUncertaintyMeters,
                },
                candidateRecord: {
                  id: obsB.id,
                  recordType: 'OBSERVATION',
                  referenceOrType: obsB.observationType,
                  description: obsB.sourceDescription,
                  timestamp: obsB.observedAt ? new Date(obsB.observedAt).toISOString() : null,
                  latitude: obsB.latitude,
                  longitude: obsB.longitude,
                  uncertaintyMeters: obsB.locationUncertaintyMeters,
                },
              },
              reviewStatus: existingReview ? existingReview.decision : 'UNVERIFIED_CANDIDATE',
              reviewHistory: existingReview,
              humanReviewRequired: true,
              disclaimer: PATTERN_DISCLAIMER,
            });
          }
        }
      }

      // Also compare Lead locationDescriptions where available
      if (input.includeDescriptors) {
        for (const leadA of targetCase.leads) {
          if (!leadA.locationDescription) continue;
          for (const leadB of candCase.leads) {
            if (!leadB.locationDescription) continue;

            const leadDescMatch = findExplicitDescriptorMatch(
              leadA.locationDescription,
              leadB.locationDescription
            );

            if (leadDescMatch) {
              const patternId = generatePatternId(
                'DESCRIPTOR_CORRELATION',
                targetCase.id,
                candCase.id,
                leadA.id,
                leadB.id
              );

              // Avoid duplicate if already generated
              if (!patterns.some((p) => p.id === patternId)) {
                const signal: ContributingSignal = {
                  category: 'DESCRIPTOR_CORRELATION',
                  signalName: leadDescMatch.attribute,
                  summary: `Shared lead sighting location: ${leadDescMatch.matchedValue}.`,
                  metrics: {
                    matchedAttribute: leadDescMatch.attribute,
                    matchedValue: leadDescMatch.matchedValue,
                  },
                  rationale: leadDescMatch.rationale,
                  limitations:
                    'Shared landmark text in tip narrative does not indicate common involvement or verified presence.',
                };

                const existingReview = reviewMap.get(patternId) || null;

                patterns.push({
                  id: patternId,
                  initiatingCaseId: targetCase.id,
                  initiatingCaseReference: targetCase.caseReference,
                  candidateCaseId: candCase.id,
                  candidateCaseReference: candCase.caseReference,
                  primaryCategory: 'DESCRIPTOR_CORRELATION',
                  reviewPriority: 'LOW',
                  priorityRationale:
                    'Single descriptor alignment across lead sightings; recommended for operational triage.',
                  signalsCount: 1,
                  signals: [signal],
                  supportingRecords: {
                    initiatingRecord: {
                      id: leadA.id,
                      recordType: 'LEAD',
                      referenceOrType: leadA.leadReference,
                      description: leadA.locationDescription,
                      timestamp: leadA.reportedAt ? new Date(leadA.reportedAt).toISOString() : null,
                      latitude: leadA.latitude,
                      longitude: leadA.longitude,
                      uncertaintyMeters: leadA.locationUncertaintyMeters,
                    },
                    candidateRecord: {
                      id: leadB.id,
                      recordType: 'LEAD',
                      referenceOrType: leadB.leadReference,
                      description: leadB.locationDescription,
                      timestamp: leadB.reportedAt ? new Date(leadB.reportedAt).toISOString() : null,
                      latitude: leadB.latitude,
                      longitude: leadB.longitude,
                      uncertaintyMeters: leadB.locationUncertaintyMeters,
                    },
                  },
                  reviewStatus: existingReview ? existingReview.decision : 'UNVERIFIED_CANDIDATE',
                  reviewHistory: existingReview,
                  humanReviewRequired: true,
                  disclaimer: PATTERN_DISCLAIMER,
                });
              }
            }
          }
        }
      }
    }

    // Sort patterns: HIGH priority first, then by signals count descending
    patterns.sort((a, b) => {
      const pScore = { HIGH: 3, MEDIUM: 2, LOW: 1 };
      if (pScore[a.reviewPriority] !== pScore[b.reviewPriority]) {
        return pScore[b.reviewPriority] - pScore[a.reviewPriority];
      }
      return b.signalsCount - a.signalsCount;
    });

    return {
      initiatingCaseId: targetCase.id,
      initiatingCaseReference: targetCase.caseReference,
      analysisParameters: {
        maxDistanceKm: input.maxDistanceKm,
        maxTimeDeltaHours: input.maxTimeDeltaHours,
        includeTemporalOverlap: input.includeTemporalOverlap,
        includeDescriptors: input.includeDescriptors,
        minSignals: input.minSignals,
      },
      evaluatedCandidateCasesCount: candidateCases.length,
      totalPatternsFound: patterns.length,
      patterns,
      disclaimer: PATTERN_DISCLAIMER,
    };
  }

  /**
   * Retrieves a single explainable pattern result by ID for an authorized case.
   */
  public static async getCasePatternById(
    caseId: string,
    patternId: string,
    actorUser: AuthUser
  ): Promise<CandidatePattern> {
    const analysis = await this.analyzeCasePatterns(
      caseId,
      {
        maxDistanceKm: 25.0,
        maxTimeDeltaHours: 720.0,
        includeTemporalOverlap: true,
        includeDescriptors: true,
        minSignals: 1,
      },
      actorUser
    );

    const pattern = analysis.patterns.find((p) => p.id === patternId);
    if (!pattern) {
      throw new NotFoundError(`Pattern association ${patternId} was not found for case ${caseId}`);
    }

    return pattern;
  }

  /**
   * Records an authorized investigator's review decision for a cross-case pattern.
   * Modifies NO evidentiary records, source observations, or case state.
   * Records an immutable AuditLog and CaseEvent.
   */
  public static async recordPatternReview(
    caseId: string,
    patternId: string,
    input: PatternReviewInput,
    actorUser: AuthUser
  ) {
    if (
      actorUser.role !== Role.CASE_OFFICER &&
      actorUser.role !== Role.SUPERVISOR &&
      actorUser.role !== Role.SYSTEM_ADMIN
    ) {
      throw new ForbiddenError(
        'Access denied: Only CASE_OFFICER, SUPERVISOR, or SYSTEM_ADMIN roles may record pattern review decisions'
      );
    }

    const targetCase = await prisma.investigationCase.findUnique({
      where: { id: caseId },
    });

    if (!targetCase) {
      throw new NotFoundError(`Investigation case ${caseId} was not found`);
    }

    if (actorUser.role !== Role.SYSTEM_ADMIN && actorUser.jurisdictionId !== targetCase.jurisdictionId) {
      throw new ForbiddenError('Access denied: case belongs to an operational jurisdiction outside your scope');
    }

    // Verify the pattern belongs to this case
    const pattern = await this.getCasePatternById(caseId, patternId, actorUser);

    const reviewedAt = new Date();

    // Transactionally record AuditLog and CaseEvent
    await prisma.$transaction(async (tx) => {
      await tx.auditLog.create({
        data: {
          actorUserId: actorUser.id,
          action: 'CROSS_CASE_PATTERN_REVIEWED',
          entityType: 'investigation_cases',
          entityId: caseId,
          caseId,
          reason: input.rationale,
          newStateJson: {
            patternId,
            decision: input.decision,
            rationale: input.rationale,
            candidateCaseId: pattern.candidateCaseId,
            candidateCaseReference: pattern.candidateCaseReference,
            primaryCategory: pattern.primaryCategory,
            reviewedAt: reviewedAt.toISOString(),
          },
        },
      });

      await tx.caseEvent.create({
        data: {
          caseId,
          eventType: EventType.NOTE_ADDED,
          actorUserId: actorUser.id,
          description: `[Cross-Case Pattern Review] Association ${patternId} with ${pattern.candidateCaseReference} marked as ${input.decision}: ${input.rationale}`,
          metadataJson: {
            patternId,
            decision: input.decision,
            rationale: input.rationale,
            candidateCaseId: pattern.candidateCaseId,
          },
        },
      });
    });

    return {
      patternId,
      caseId,
      decision: input.decision,
      rationale: input.rationale,
      reviewedAt: reviewedAt.toISOString(),
      reviewedBy: {
        id: actorUser.id,
        displayName: actorUser.displayName || 'Authorized Investigator',
        role: actorUser.role,
      },
      message: `Cross-case pattern ${patternId} reviewed and recorded as ${input.decision}.`,
    };
  }
}
