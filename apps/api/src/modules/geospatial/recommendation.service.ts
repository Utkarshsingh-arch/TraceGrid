import { prisma } from '../../database/prisma';
import { AuthUser } from '../../types/express';
import { Role, LeadStatus, Priority, TaskStatus } from '@prisma/client';
import { TaskService } from '../tasks/task.service';
import { AcceptRecommendationInput } from './geospatial.schema';
import { evaluateAllCaseObservations, ObservationData } from './geospatial.util';
import { NotFoundError, ForbiddenError } from '../../utils/errors';

export interface InvestigationTaskRecommendation {
  id: string;
  type:
    | 'UNASSIGNED_LEAD_VERIFICATION'
    | 'CONTRADICTORY_OBSERVATION_CLARIFICATION'
    | 'STALE_LEAD_TRIAGE'
    | 'UNCHECKED_SEARCH_AREA_CANVASS';
  title: string;
  description: string;
  suggestedAction: string;
  triggeringConditions: string;
  suggestedPriority: Priority;
  suggestedDueDate: string;
  relatedCaseId: string;
  relatedLeadId?: string | null;
  relatedObservationId?: string | null;
  humanReviewRequired: true;
  whyHumanReviewRequired: string;
  disclaimer: string;
}

const HUMAN_REVIEW_DISCLAIMER =
  'Advisory decision-support recommendation only. Automated systems must never dispatch personnel, issue alerts, or contact witnesses without human investigator confirmation.';

export class RecommendationService {
  /**
   * Generates cautious investigation task recommendations for reviewed observations, leads, and search zones.
   */
  public static async generateCaseRecommendations(
    caseId: string,
    actorUser: AuthUser
  ): Promise<{
    caseId: string;
    totalRecommendations: number;
    recommendations: InvestigationTaskRecommendation[];
    disclaimer: string;
  }> {
    const caseRecord = await prisma.investigationCase.findUnique({
      where: { id: caseId },
      include: {
        leads: {
          orderBy: { reportedAt: 'desc' },
          include: {
            tasks: {
              where: { status: { in: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS] } },
            },
          },
        },
        observations: {
          orderBy: { observedAt: 'asc' },
        },
        observationExclusions: {
          where: { isActive: true },
        },
        hypotheses: {
          where: { isActive: true },
        },
        tasks: {
          where: { status: { in: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS] } },
        },
      },
    });

    if (!caseRecord) {
      throw new NotFoundError(`Case ${caseId} was not found`);
    }

    if (actorUser.role !== Role.SYSTEM_ADMIN && actorUser.jurisdictionId !== caseRecord.jurisdictionId) {
      throw new ForbiddenError('Access denied: case belongs to an operational jurisdiction outside your scope');
    }

    const recommendations: InvestigationTaskRecommendation[] = [];
    const now = new Date();

    // 1. Unassigned Lead Verification
    for (const lead of caseRecord.leads) {
      if (lead.verificationStatus === LeadStatus.NEW && !lead.assignedUserId && lead.tasks.length === 0) {
        const dueDate = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h follow up
        recommendations.push({
          id: `REC-LEAD-ASSIGN-${lead.id}`,
          type: 'UNASSIGNED_LEAD_VERIFICATION',
          title: `Assign verification task for lead ${lead.leadReference}`,
          description: `Field verification required for unassigned lead ${lead.leadReference} (${lead.sourceType}). Narrative: "${lead.narrative.slice(0, 100)}..."`,
          suggestedAction: 'Assign an investigator to review the sighting details and verify witness statement.',
          triggeringConditions: `Lead ${lead.leadReference} lodged in NEW status without an assigned officer or active task.`,
          suggestedPriority: Priority.HIGH,
          suggestedDueDate: dueDate.toISOString(),
          relatedCaseId: caseId,
          relatedLeadId: lead.id,
          humanReviewRequired: true,
          whyHumanReviewRequired:
            'Investigator must evaluate informant credibility, officer safety, and jurisdictional priority before assigning field operations.',
          disclaimer: HUMAN_REVIEW_DISCLAIMER,
        });
      }
    }

    // 2. Contradictory Observation Clarification
    const activeExclusionMap = new Map<string, string>();
    for (const excl of caseRecord.observationExclusions) {
      activeExclusionMap.set(excl.observationId, excl.reason);
    }

    const obsData: ObservationData[] = caseRecord.observations.map((o: any) => ({
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

    const analysis = evaluateAllCaseObservations(caseId, obsData, 'PEDESTRIAN', 4.5);
    const contradictoryPairs = analysis.pairwiseMatrix.filter(
      (p) => p.isContradictory && p.classification === 'POTENTIAL_VELOCITY_CONTRADICTION'
    );

    for (const pair of contradictoryPairs.slice(0, 3)) {
      const dueDate = new Date(now.getTime() + 48 * 60 * 60 * 1000);
      recommendations.push({
        id: `REC-VELOCITY-CONFLICT-${pair.observationAId.slice(0, 8)}-${pair.observationBId.slice(0, 8)}`,
        type: 'CONTRADICTORY_OBSERVATION_CLARIFICATION',
        title: `Clarify conflicting sightings: ${pair.observationAId.slice(0, 8)} vs ${pair.observationBId.slice(0, 8)}`,
        description: `Potential velocity contradiction: traversing between observations requires ${pair.requiredSpeedKmh} km/h (effective separation: ${pair.effectiveMinDistanceKm} km in ${pair.timeDeltaMinutes} min). Source clarification needed.`,
        suggestedAction: 'Review surveillance timestamps, check witness clocks, or perform targeted interview to resolve contradiction.',
        triggeringConditions: pair.calculationRationale,
        suggestedPriority: Priority.HIGH,
        suggestedDueDate: dueDate.toISOString(),
        relatedCaseId: caseId,
        relatedObservationId: pair.observationAId,
        humanReviewRequired: true,
        whyHumanReviewRequired:
          'Supervisors must evaluate whether the conflict stems from erroneous sensor clocks, mistaken witness identity, or deceptive reporting before altering case theory.',
        disclaimer: HUMAN_REVIEW_DISCLAIMER,
      });
    }

    // 3. Stale Lead Triage
    for (const lead of caseRecord.leads) {
      const reportedAt = new Date(lead.reportedAt);
      const hoursSinceReported = (now.getTime() - reportedAt.getTime()) / (1000 * 60 * 60);
      if (
        (lead.verificationStatus === LeadStatus.NEW || lead.verificationStatus === LeadStatus.UNDER_REVIEW) &&
        hoursSinceReported > 48.0 &&
        lead.tasks.length === 0
      ) {
        const dueDate = new Date(now.getTime() + 72 * 60 * 60 * 1000);
        recommendations.push({
          id: `REC-STALE-LEAD-${lead.id}`,
          type: 'STALE_LEAD_TRIAGE',
          title: `Triage stale lead: ${lead.leadReference}`,
          description: `Lead ${lead.leadReference} has been in ${lead.verificationStatus} status for ${Math.round(hoursSinceReported)} hours without resolution. Determine if lead should be closed as inconclusive or prioritized.`,
          suggestedAction: 'Assess lead viability or mark as INCONCLUSIVE to reduce cognitive noise in the lead ledger.',
          triggeringConditions: `Unresolved lead inactive for > 48 hours without task assignment.`,
          suggestedPriority: Priority.MEDIUM,
          suggestedDueDate: dueDate.toISOString(),
          relatedCaseId: caseId,
          relatedLeadId: lead.id,
          humanReviewRequired: true,
          whyHumanReviewRequired:
            'Case officers must decide if stale leads warrant continued resource expenditure.',
          disclaimer: HUMAN_REVIEW_DISCLAIMER,
        });
      }
    }

    // 4. Unchecked Search Area Canvass
    if (caseRecord.hypotheses.length > 0) {
      const activeHyp = caseRecord.hypotheses[0];
      const hasSearchTask = caseRecord.tasks.some(
        (t: any) =>
          t.title.toLowerCase().includes('search') ||
          t.title.toLowerCase().includes('canvass') ||
          t.description.toLowerCase().includes('search zone')
      );

      if (!hasSearchTask) {
        const dueDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        recommendations.push({
          id: `REC-SEARCH-CANVASS-${activeHyp.id}`,
          type: 'UNCHECKED_SEARCH_AREA_CANVASS',
          title: `Coordinate search for candidate zone: ${activeHyp.title.slice(0, 32)}`,
          description: `Active search hypothesis formulated (${activeHyp.title}). No active ground canvass or search task currently scheduled.`,
          suggestedAction: 'Draft and review an operational area search plan within the candidate radius bounds.',
          triggeringConditions: `Active candidate search zone exists without an active search or canvass task.`,
          suggestedPriority: Priority.MEDIUM,
          suggestedDueDate: dueDate.toISOString(),
          relatedCaseId: caseId,
          humanReviewRequired: true,
          whyHumanReviewRequired:
            'Candidate zones are decision-support heuristics, not physical presence guarantees. Operational ground searches require formal supervisor approval.',
          disclaimer: HUMAN_REVIEW_DISCLAIMER,
        });
      }
    }

    return {
      caseId,
      totalRecommendations: recommendations.length,
      recommendations,
      disclaimer: HUMAN_REVIEW_DISCLAIMER,
    };
  }

  /**
   * Accepts a suggested recommendation and transactionally creates an InvestigationTask with an audit event.
   */
  public static async acceptRecommendation(
    caseId: string,
    input: AcceptRecommendationInput,
    actorUser: AuthUser
  ) {
    if (
      actorUser.role !== Role.CASE_OFFICER &&
      actorUser.role !== Role.SUPERVISOR &&
      actorUser.role !== Role.SYSTEM_ADMIN
    ) {
      throw new ForbiddenError('Unauthorized: only case officers, supervisors or administrators can accept task recommendations');
    }

    // Create the task using the existing validated TaskService
    const task = await TaskService.createTask(
      caseId,
      {
        title: input.title,
        description: `${input.description}\n\n[Origin: Accepted from automated recommendation ${input.recommendationId}]`,
        dueDate: input.dueDate,
        priority: input.priority,
        assignedUserId: input.assignedUserId,
        leadId: input.leadId,
      },
      actorUser
    );

    // Record explicit audit log linking the recommendation
    await prisma.auditLog.create({
      data: {
        actorUserId: actorUser.id,
        action: 'TASK_RECOMMENDATION_ACCEPTED',
        entityType: 'investigation_tasks',
        entityId: task.id,
        caseId,
        newStateJson: {
          recommendationId: input.recommendationId,
          taskId: task.id,
          taskReference: task.taskReference,
          priority: input.priority,
        },
        reason: `Investigator formally approved recommended action: ${input.recommendationId}`,
      },
    });

    return task;
  }
}
