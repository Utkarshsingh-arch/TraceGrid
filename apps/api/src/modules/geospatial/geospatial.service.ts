import { prisma } from '../../database/prisma';
import { AuthUser } from '../../types/express';
import { Role, EventType } from '@prisma/client';
import {
  evaluateAllCaseObservations,
  generateCirclePolygon,
  calculateHaversineDistance,
  TRAVEL_PROFILES,
  TravelMode,
  ObservationData,
  MultiObservationAnalysisResult,
} from './geospatial.util';
import {
  CalculateSearchZoneInput,
  ContradictionQueryInput,
  ExcludeObservationInput,
  ReconsiderObservationInput,
} from './geospatial.schema';
import { NotFoundError, ForbiddenError, ValidationError } from '../../utils/errors';

export class GeospatialService {
  /**
   * Evaluates all case observations for velocity contradictions, data quality, and duplicate candidates.
   */
  public static async analyzeCaseContradictions(
    caseId: string,
    query: ContradictionQueryInput,
    actorUser: AuthUser
  ): Promise<MultiObservationAnalysisResult> {
    const caseRecord = await prisma.investigationCase.findUnique({
      where: { id: caseId },
      include: {
        observations: {
          orderBy: { observedAt: 'asc' },
        },
        observationExclusions: {
          where: { isActive: true },
        },
      },
    });

    if (!caseRecord) {
      throw new NotFoundError(`Investigation case ${caseId} was not found`);
    }

    if (actorUser.role !== Role.SYSTEM_ADMIN && actorUser.jurisdictionId !== caseRecord.jurisdictionId) {
      throw new ForbiddenError('Access denied: case belongs to an operational jurisdiction outside your scope');
    }

    // Build observation list with exclusion states
    const activeExclusionMap = new Map<string, string>();
    for (const excl of caseRecord.observationExclusions) {
      activeExclusionMap.set(excl.observationId, excl.reason);
    }

    const observations: ObservationData[] = caseRecord.observations.map((o: any) => ({
      id: o.id,
      caseId: o.caseId,
      observationType: o.observationType,
      sourceDescription: o.sourceDescription,
      observedAt: o.observedAt,
      recordedAt: o.recordedAt,
      latitude: o.latitude,
      longitude: o.longitude,
      locationUncertaintyMeters: o.locationUncertaintyMeters,
      verificationStatus: o.verificationStatus,
      isExcluded: activeExclusionMap.has(o.id),
      exclusionReason: activeExclusionMap.get(o.id) || null,
    }));

    return evaluateAllCaseObservations(
      caseId,
      observations,
      query.assumedTravelMode as TravelMode,
      query.maxSpeedKmh,
      query.primaryAnchorId
    );
  }

  /**
   * Generates deterministic candidate search zones, accounting for uncertainties, exclusions,
   * and constructing alternate hypotheses for competing observation clusters.
   */
  public static async generateSearchZones(
    caseId: string,
    input: CalculateSearchZoneInput,
    actorUser: AuthUser
  ) {
    const caseRecord = await prisma.investigationCase.findUnique({
      where: { id: caseId },
      include: {
        observations: true,
        observationExclusions: {
          where: { isActive: true },
        },
      },
    });

    if (!caseRecord) {
      throw new NotFoundError(`Case ${caseId} was not found`);
    }

    if (actorUser.role !== Role.SYSTEM_ADMIN && actorUser.jurisdictionId !== caseRecord.jurisdictionId) {
      throw new ForbiddenError('Access denied: case belongs to an operational jurisdiction outside your scope');
    }

    if (caseRecord.observations.length === 0) {
      throw new ValidationError('Cannot generate search zone: No observations exist for this case.');
    }

    // Validate that if anchorObservationId was specified, it belongs to this case
    let anchor: (typeof caseRecord.observations)[0] | undefined;
    if (input.anchorObservationId) {
      anchor = caseRecord.observations.find((o: any) => o.id === input.anchorObservationId);
      if (!anchor) {
        throw new ValidationError('Selected anchor observation does not belong to this case');
      }
    } else {
      // Pick most recent valid observation with coordinates as primary anchor
      const validCoords = caseRecord.observations.filter(
        (o: any) => o.latitude != null && o.longitude != null && !input.excludedObservationIds.includes(o.id)
      );
      if (validCoords.length === 0) {
        throw new ValidationError('Cannot generate search zone: No non-excluded spatial observations with coordinates exist.');
      }
      // Sort desc by observedAt
      validCoords.sort((a: any, b: any) => b.observedAt.getTime() - a.observedAt.getTime());
      anchor = validCoords[0];
    }

    // Verify all excludedObservationIds belong to this case
    for (const exclId of input.excludedObservationIds) {
      const match = caseRecord.observations.find((o: any) => o.id === exclId);
      if (!match) {
        throw new ValidationError(`Excluded observation ${exclId} does not belong to this case`);
      }
    }

    const travelProfile = TRAVEL_PROFILES[input.assumedTravelMode] || TRAVEL_PROFILES.PEDESTRIAN;
    const maxSpeedKmh = input.maxSpeedKmh || travelProfile.defaultSpeedKmh;
    const analysisDate = input.analysisTime ? new Date(input.analysisTime) : new Date();

    // Primary search zone formulation:
    // candidateRadius = (maxSpeed * elapsedHours * 1000) + anchorUncertainty
    const elapsedMs = Math.max(analysisDate.getTime() - anchor.observedAt.getTime(), 0);
    const elapsedHours = elapsedMs / (1000 * 60 * 60);
    const travelDistanceMeters = elapsedHours * maxSpeedKmh * 1000;
    const candidateRadiusMeters = Math.min(
      Math.round(travelDistanceMeters + anchor.locationUncertaintyMeters),
      150000 // Upper bound 150 km cap
    );

    // Contradiction analysis across all observations against the primary anchor
    const otherObservations = caseRecord.observations.filter((o: any) => o.id !== anchor!.id);
    const contradictionList: Array<{
      observationId: string;
      observationType: string;
      sourceDescription: string;
      distanceKm: number;
      timeDeltaHours: number;
      requiredSpeedKmh: number;
      isContradictory: boolean;
      isExcluded: boolean;
      exclusionReason?: string;
      explanation: string;
    }> = [];

    const competingAnchors: Array<(typeof otherObservations)[0]> = [];

    for (const obs of otherObservations) {
      const distMeters = calculateHaversineDistance(
        { latitude: anchor!.latitude, longitude: anchor!.longitude },
        { latitude: obs.latitude, longitude: obs.longitude }
      );
      const rawDistKm = Math.round((distMeters / 1000) * 100) / 100;
      const tDeltaMs = Math.abs(obs.observedAt.getTime() - anchor!.observedAt.getTime());
      const tDeltaHours = Math.max(tDeltaMs / (1000 * 60 * 60), 0.00028);

      const uTotalKm = (anchor!.locationUncertaintyMeters + obs.locationUncertaintyMeters) / 1000;
      const effectiveDistKm = Math.max(0, rawDistKm - uTotalKm);
      const reqSpeedKmh = Math.round((effectiveDistKm / tDeltaHours) * 10) / 10;

      const isContradictory =
        reqSpeedKmh > maxSpeedKmh * 1.2 || (tDeltaHours < 0.0333 && effectiveDistKm > 0.5);

      const isExcluded =
        input.excludedObservationIds.includes(obs.id) ||
        caseRecord.observationExclusions.some((e: any) => e.observationId === obs.id && e.isActive);

      const exclusionReason =
        input.exclusionReasons[obs.id] ||
        caseRecord.observationExclusions.find((e: any) => e.observationId === obs.id && e.isActive)?.reason ||
        (isExcluded ? 'Investigator excluded' : undefined);

      let explanation = 'Physically plausible under current travel assumptions.';
      if (isContradictory) {
        explanation = `Velocity threshold exceeded: traversing ${effectiveDistKm} km in ${Math.round(tDeltaHours * 10) / 10}h requires ${reqSpeedKmh} km/h (assumed maximum: ${maxSpeedKmh} km/h).`;
        if (!isExcluded) {
          competingAnchors.push(obs);
        }
      }

      contradictionList.push({
        observationId: obs.id,
        observationType: obs.observationType,
        sourceDescription: obs.sourceDescription,
        distanceKm: rawDistKm,
        timeDeltaHours: Math.round(tDeltaHours * 100) / 100,
        requiredSpeedKmh: reqSpeedKmh,
        isContradictory,
        isExcluded,
        exclusionReason,
        explanation,
      });
    }

    // Generate GeoJSON polygon for primary anchor
    const primaryCoordinates = generateCirclePolygon(
      { latitude: anchor.latitude, longitude: anchor.longitude },
      candidateRadiusMeters,
      36
    );

    const primaryGeoJson = {
      type: 'Feature',
      properties: {
        anchorObservationId: anchor.id,
        assumedTravelMode: input.assumedTravelMode,
        maxSpeedKmh,
        candidateRadiusMeters,
        elapsedHours: Math.round(elapsedHours * 10) / 10,
        isPrimary: true,
        createdAt: new Date().toISOString(),
      },
      geometry: {
        type: 'Polygon',
        coordinates: primaryCoordinates,
      },
    };

    const assumptions = [
      `Assumed travel mode: ${input.assumedTravelMode} at maximum speed ${maxSpeedKmh} km/h.`,
      `Anchor observation: ${anchor.sourceDescription} (${anchor.latitude.toFixed(4)}, ${anchor.longitude.toFixed(4)}) with ${anchor.locationUncertaintyMeters}m initial spatial uncertainty.`,
      `Elapsed travel interval: ${Math.round(elapsedHours * 10) / 10} hours up to analysis timestamp.`,
      `Estimated search radius: ${candidateRadiusMeters >= 1000 ? `${(candidateRadiusMeters / 1000).toFixed(1)} km` : `${candidateRadiusMeters} m`}.`,
    ];

    if (input.excludedObservationIds.length > 0) {
      assumptions.push(`Investigator excluded ${input.excludedObservationIds.length} conflicting observation(s) from candidate area formulation.`);
    }

    const rationale = `Candidate search boundary generated from anchor observation. Buffer calculated deterministically as (${maxSpeedKmh} km/h × ${Math.round(elapsedHours * 10) / 10}h) + ${anchor.locationUncertaintyMeters}m spatial uncertainty. This candidate geometry represents an operational prioritisation zone and must not be interpreted as guaranteed physical presence.`;

    // Transactionally persist primary hypothesis and any alternate competing hypotheses
    const result = await prisma.$transaction(async (tx: any) => {
      // Deactivate prior hypotheses
      await tx.searchZoneHypothesis.updateMany({
        where: { caseId, isActive: true },
        data: { isActive: false },
      });

      // Save Primary Hypothesis
      const primaryHypothesis = await tx.searchZoneHypothesis.create({
        data: {
          caseId,
          title: `Candidate Search Zone (${input.assumedTravelMode}) — ${anchor!.sourceDescription.slice(0, 32)}`,
          supportingObservationIds: [
            anchor!.id,
            ...otherObservations
              .filter((o: any) => !input.excludedObservationIds.includes(o.id) && !competingAnchors.some((c: any) => c.id === o.id))
              .map((o: any) => o.id),
          ],
          excludedObservationIds: input.excludedObservationIds,
          geometryGeojson: primaryGeoJson as any,
          calculationMethod: `DETERMINISTIC_VELOCITY_RADIUS_${input.assumedTravelMode}`,
          assumptions,
          humanReadableRationale: rationale,
          uncertaintyRepresentation: `Operational bounding radius: ${candidateRadiusMeters} meters around anchor observation. Non-predictive heuristic triage.`,
          isActive: true,
          createdByUserId: actorUser.id,
        },
      });

      // If competing anchors exist and alternate hypotheses enabled, generate separate hypotheses without false averaging
      const alternateHypotheses: any[] = [];
      if (input.generateAlternateHypotheses && competingAnchors.length > 0) {
        for (const compAnchor of competingAnchors.slice(0, 3)) {
          const altElapsedMs = Math.max(analysisDate.getTime() - compAnchor.observedAt.getTime(), 0);
          const altElapsedHours = altElapsedMs / (1000 * 60 * 60);
          const altRadiusMeters = Math.min(
            Math.round(altElapsedHours * maxSpeedKmh * 1000 + compAnchor.locationUncertaintyMeters),
            150000
          );
          const altCoordinates = generateCirclePolygon(
            { latitude: compAnchor.latitude, longitude: compAnchor.longitude },
            altRadiusMeters,
            36
          );

          const altGeoJson = {
            type: 'Feature',
            properties: {
              anchorObservationId: compAnchor.id,
              assumedTravelMode: input.assumedTravelMode,
              maxSpeedKmh,
              candidateRadiusMeters: altRadiusMeters,
              elapsedHours: Math.round(altElapsedHours * 10) / 10,
              isPrimary: false,
              isAlternateHypothesis: true,
              competingWithPrimaryAnchorId: anchor!.id,
              createdAt: new Date().toISOString(),
            },
            geometry: {
              type: 'Polygon',
              coordinates: altCoordinates,
            },
          };

          const altHyp = await tx.searchZoneHypothesis.create({
            data: {
              caseId,
              title: `Alternate Hypothesis (${input.assumedTravelMode}) — ${compAnchor.sourceDescription.slice(0, 32)}`,
              supportingObservationIds: [compAnchor.id],
              excludedObservationIds: [anchor!.id],
              geometryGeojson: altGeoJson as any,
              calculationMethod: `COMPETING_CLUSTER_HYPOTHESIS_${input.assumedTravelMode}`,
              assumptions: [
                `Formulated as an independent alternate hypothesis for competing sighting ${compAnchor.sourceDescription}.`,
                `Assumes primary anchor sighting ${anchor!.sourceDescription} was erroneous or disproved.`,
              ],
              humanReadableRationale: `Competing location pattern detected. Rather than averaging mutually contradictory sightings into an unfounded central point, this alternate zone models the possibility that sighting ${compAnchor.sourceDescription} is authentic.`,
              uncertaintyRepresentation: `Alternate bounding radius: ${altRadiusMeters} meters around competing observation ${compAnchor.id}.`,
              isActive: false, // marked inactive by default so primary remains authoritative unless toggled
              createdByUserId: actorUser.id,
            },
          });

          alternateHypotheses.push(altHyp);
        }
      }

      await tx.caseEvent.create({
        data: {
          caseId,
          eventType: EventType.HYPOTHESIS_GENERATED,
          actorUserId: actorUser.id,
          description: `Generated search hypothesis: ${primaryHypothesis.title} (Radius: ${candidateRadiusMeters}m). ${
            alternateHypotheses.length > 0 ? `Also formulated ${alternateHypotheses.length} alternate competing hypotheses.` : ''
          }`,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actorUser.id,
          action: 'HYPOTHESIS_GENERATED',
          entityType: 'search_zone_hypotheses',
          entityId: primaryHypothesis.id,
          caseId,
          newStateJson: {
            hypothesisId: primaryHypothesis.id,
            radiusMeters: candidateRadiusMeters,
            assumedTravelMode: input.assumedTravelMode,
            alternateHypothesesCount: alternateHypotheses.length,
          },
          reason: 'Deterministic search zone formulation based on reviewed observation anchor',
        },
      });

      return {
        primaryHypothesis,
        alternateHypotheses,
      };
    });

    return {
      hypothesis: result.primaryHypothesis,
      alternateHypotheses: result.alternateHypotheses,
      contradictions: contradictionList,
      calculationDetails: {
        anchorObservation: {
          id: anchor.id,
          latitude: anchor.latitude,
          longitude: anchor.longitude,
          uncertaintyMeters: anchor.locationUncertaintyMeters,
          observedAt: anchor.observedAt,
          sourceDescription: anchor.sourceDescription,
        },
        assumedTravelMode: input.assumedTravelMode,
        maxSpeedKmh,
        elapsedHours: Math.round(elapsedHours * 10) / 10,
        travelDistanceMeters: Math.round(travelDistanceMeters),
        candidateRadiusMeters,
        assumptions,
        rationale,
        warning:
          'This calculated zone is an investigative search triage suggestion based on user assumptions. It has not been validated as an authoritative recovery guarantee.',
      },
    };
  }

  /**
   * Retrieves all search zone hypotheses for a case.
   */
  public static async getCaseHypotheses(caseId: string, actorUser: AuthUser) {
    const caseRecord = await prisma.investigationCase.findUnique({
      where: { id: caseId },
    });

    if (!caseRecord) {
      throw new NotFoundError(`Case ${caseId} was not found`);
    }

    if (actorUser.role !== Role.SYSTEM_ADMIN && actorUser.jurisdictionId !== caseRecord.jurisdictionId) {
      throw new ForbiddenError('Access denied: case belongs to an operational jurisdiction outside your scope');
    }

    return await prisma.searchZoneHypothesis.findMany({
      where: { caseId },
      orderBy: { createdAt: 'desc' },
      include: {
        createdByUser: {
          select: {
            id: true,
            displayName: true,
            badgeNumber: true,
            role: true,
          },
        },
      },
    });
  }

  /**
   * Records an analyst observation exclusion without deleting the original observation.
   */
  public static async excludeObservation(
    caseId: string,
    observationId: string,
    input: ExcludeObservationInput,
    actorUser: AuthUser
  ) {
    const caseRecord = await prisma.investigationCase.findUnique({
      where: { id: caseId },
      include: {
        observations: {
          where: { id: observationId },
        },
      },
    });

    if (!caseRecord) {
      throw new NotFoundError(`Case ${caseId} was not found`);
    }

    if (actorUser.role !== Role.SYSTEM_ADMIN && actorUser.jurisdictionId !== caseRecord.jurisdictionId) {
      throw new ForbiddenError('Access denied: case belongs to an operational jurisdiction outside your scope');
    }

    const observation = caseRecord.observations[0];
    if (!observation) {
      throw new ValidationError(`Observation ${observationId} does not belong to case ${caseId}`);
    }

    return await prisma.$transaction(async (tx: any) => {
      // Create explicit exclusion record
      const exclusion = await tx.observationExclusion.create({
        data: {
          caseId,
          observationId,
          hypothesisId: input.hypothesisId,
          isCaseLevel: input.isCaseLevel,
          reason: input.reason,
          excludedByUserId: actorUser.id,
          isActive: true,
        },
        include: {
          observation: true,
          excludedByUser: {
            select: {
              id: true,
              displayName: true,
              badgeNumber: true,
              role: true,
            },
          },
        },
      });

      await tx.caseEvent.create({
        data: {
          caseId,
          eventType: EventType.NOTE_ADDED,
          actorUserId: actorUser.id,
          description: `Observation ${observationId.slice(0, 8)} excluded from analysis. Reason: ${input.reason}`,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actorUser.id,
          action: 'OBSERVATION_EXCLUDED',
          entityType: 'location_observations',
          entityId: observationId,
          caseId,
          newStateJson: {
            exclusionId: exclusion.id,
            isCaseLevel: input.isCaseLevel,
            hypothesisId: input.hypothesisId,
            reason: input.reason,
          },
          reason: input.reason,
        },
      });

      return exclusion;
    });
  }

  /**
   * Reconsiders a previously excluded observation, restoring it to active analysis.
   */
  public static async reconsiderObservation(
    caseId: string,
    observationId: string,
    input: ReconsiderObservationInput,
    actorUser: AuthUser
  ) {
    const caseRecord = await prisma.investigationCase.findUnique({
      where: { id: caseId },
      include: {
        observations: {
          where: { id: observationId },
        },
      },
    });

    if (!caseRecord) {
      throw new NotFoundError(`Case ${caseId} was not found`);
    }

    if (actorUser.role !== Role.SYSTEM_ADMIN && actorUser.jurisdictionId !== caseRecord.jurisdictionId) {
      throw new ForbiddenError('Access denied: case belongs to an operational jurisdiction outside your scope');
    }

    const observation = caseRecord.observations[0];
    if (!observation) {
      throw new ValidationError(`Observation ${observationId} does not belong to case ${caseId}`);
    }

    return await prisma.$transaction(async (tx: any) => {
      // Find active exclusions
      const activeExclusions = await tx.observationExclusion.findMany({
        where: {
          caseId,
          observationId,
          isActive: true,
        },
      });

      if (activeExclusions.length === 0) {
        throw new ValidationError(`Observation ${observationId} does not have an active exclusion record`);
      }

      await tx.observationExclusion.updateMany({
        where: {
          caseId,
          observationId,
          isActive: true,
        },
        data: {
          isActive: false,
          reconsideredAt: new Date(),
          reconsideredByUserId: actorUser.id,
          reconsiderationReason: input.reason,
        },
      });

      await tx.caseEvent.create({
        data: {
          caseId,
          eventType: EventType.NOTE_ADDED,
          actorUserId: actorUser.id,
          description: `Observation ${observationId.slice(0, 8)} reconsidered and restored to active pool. Reason: ${input.reason}`,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actorUser.id,
          action: 'OBSERVATION_RECONSIDERED',
          entityType: 'location_observations',
          entityId: observationId,
          caseId,
          newStateJson: {
            reconsideredExclusionsCount: activeExclusions.length,
            reconsiderationReason: input.reason,
          },
          reason: input.reason,
        },
      });

      return {
        observationId,
        isRestored: true,
        reconsideredExclusionsCount: activeExclusions.length,
        message: 'Observation successfully restored to active analysis pool.',
      };
    });
  }
}
