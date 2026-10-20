import { prisma } from '../../database/prisma';
import { AuthUser } from '../../types/express';
import { Role, CaseState, Priority, TracingOutcome, TaskStatus } from '@prisma/client';
import { ForbiddenError, ValidationError } from '../../utils/errors';
import {
  CaseloadQueryInput,
  TrendsQueryInput,
  TasksAnalyticsQueryInput,
  PatternAnalyticsQueryInput,
  OperationalReportQueryInput,
} from './analytics.dto';
import {
  calculateMean,
  calculateMedian,
  generateTimeBuckets,
  serializeReportToCsv,
  TimeBucket,
} from './analytics.util';
import { PatternService } from '../patterns/pattern.service';
import { CandidatePattern } from '../patterns/pattern.util';

export class AnalyticsService {
  /**
   * Resolves authorized jurisdiction scope based on actor role and optional query filter.
   */
  private static resolveJurisdictionScope(
    actorUser: AuthUser,
    requestedJurisdictionId?: string
  ): { targetJurisdictionId?: string; isPlatformWide: boolean } {
    if (actorUser.role !== Role.SYSTEM_ADMIN) {
      if (requestedJurisdictionId && requestedJurisdictionId !== actorUser.jurisdictionId) {
        throw new ForbiddenError(
          'Access denied: You are not authorized to query analytics outside your assigned jurisdiction.'
        );
      }
      return { targetJurisdictionId: actorUser.jurisdictionId || undefined, isPlatformWide: false };
    }

    if (requestedJurisdictionId) {
      return { targetJurisdictionId: requestedJurisdictionId, isPlatformWide: false };
    }

    return { targetJurisdictionId: undefined, isPlatformWide: true };
  }

  /**
   * 1. Caseload Breakdown & Triage Summary
   */
  public static async getCaseloadSummary(query: CaseloadQueryInput, actorUser: AuthUser) {
    const { targetJurisdictionId, isPlatformWide } = this.resolveJurisdictionScope(
      actorUser,
      query.jurisdictionId
    );

    const caseWhere: any = {};
    if (targetJurisdictionId) {
      caseWhere.jurisdictionId = targetJurisdictionId;
    }

    // Interval filter if supplied
    let startDate: Date | undefined;
    let endDate: Date | undefined;
    if (query.startDate) startDate = new Date(query.startDate);
    if (query.endDate) endDate = new Date(query.endDate);

    if (startDate && endDate && startDate > endDate) {
      throw new ValidationError('startDate must be before or equal to endDate');
    }

    // 1. By actual CaseState
    const stateGroups = await prisma.investigationCase.groupBy({
      by: ['caseState'],
      where: caseWhere,
      _count: true,
    });

    const byState: Record<CaseState, number> = {
      REPORTED: 0,
      UNDER_REVIEW: 0,
      OPEN: 0,
      CLOSED: 0,
    };
    for (const g of stateGroups) {
      byState[g.caseState] = g._count;
    }

    const totalCases = Object.values(byState).reduce((a, b) => a + b, 0);

    // 2. By Priority
    const priorityGroups = await prisma.investigationCase.groupBy({
      by: ['priority'],
      where: caseWhere,
      _count: true,
    });

    const byPriority: Record<Priority, number> = {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
    };
    for (const g of priorityGroups) {
      byPriority[g.priority] = g._count;
    }

    // 3. By Tracing Outcome
    const outcomeGroups = await prisma.investigationCase.groupBy({
      by: ['tracingOutcome'],
      where: caseWhere,
      _count: true,
    });

    const byOutcome: Record<TracingOutcome, number> = {
      NOT_TRACED: 0,
      LOCATION_REPORTED: 0,
      LOCATED_VERIFICATION_PENDING: 0,
      TRACED_VERIFIED: 0,
      OTHER_OUTCOME: 0,
    };
    for (const g of outcomeGroups) {
      byOutcome[g.tracingOutcome] = g._count;
    }

    // 4. By Authorized Jurisdiction Breakdown
    let byJurisdiction: Array<{
      jurisdictionId: string;
      code: string;
      name: string;
      totalCases: number;
    }> = [];

    if (isPlatformWide) {
      const allJurisdictions = await prisma.jurisdiction.findMany({
        where: { isActive: true },
        select: { id: true, code: true, name: true },
      });
      const jurGroups = await prisma.investigationCase.groupBy({
        by: ['jurisdictionId'],
        _count: true,
      });
      const countMap = new Map(jurGroups.map((g) => [g.jurisdictionId, g._count]));
      byJurisdiction = allJurisdictions.map((j) => ({
        jurisdictionId: j.id,
        code: j.code,
        name: j.name,
        totalCases: countMap.get(j.id) || 0,
      }));
    } else {
      const jur = await prisma.jurisdiction.findUnique({
        where: { id: targetJurisdictionId! },
        select: { id: true, code: true, name: true },
      });
      if (jur) {
        byJurisdiction = [
          {
            jurisdictionId: jur.id,
            code: jur.code,
            name: jur.name,
            totalCases,
          },
        ];
      }
    }

    // 5. New Cases and Closed Cases in Interval (if specified, else past 30 days)
    const intervalStart = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const intervalEnd = endDate || new Date();

    const newCasesInPeriod = await prisma.investigationCase.count({
      where: {
        ...caseWhere,
        reportedAt: { gte: intervalStart, lte: intervalEnd },
      },
    });

    const closedCasesInPeriod = await prisma.investigationCase.count({
      where: {
        ...caseWhere,
        closedAt: { gte: intervalStart, lte: intervalEnd },
      },
    });

    return {
      metadata: {
        generatedAt: new Date().toISOString(),
        isPlatformWide,
        jurisdictionScope: isPlatformWide ? 'ALL_JURISDICTIONS' : targetJurisdictionId,
        reportingInterval: {
          startDate: intervalStart.toISOString(),
          endDate: intervalEnd.toISOString(),
        },
      },
      caseload: {
        totalCases,
        byState,
        byPriority,
        byOutcome,
        byJurisdiction,
        newCasesInPeriod,
        closedCasesInPeriod,
      },
      definitions: {
        totalCases: 'Total accessible cases matching the caller jurisdiction scope.',
        caseState: 'Current lifecycle state (REPORTED, UNDER_REVIEW, OPEN, CLOSED). Snapshot metric.',
        newCasesInPeriod: 'Cases where reportedAt timestamp falls within the reporting interval.',
        closedCasesInPeriod: 'Cases where closedAt timestamp falls within the reporting interval.',
      },
    };
  }

  /**
   * 2. Case Activity & Resolution Trends
   */
  public static async getActivityAndResolutionTrends(query: TrendsQueryInput, actorUser: AuthUser) {
    const { targetJurisdictionId, isPlatformWide } = this.resolveJurisdictionScope(
      actorUser,
      query.jurisdictionId
    );

    const caseWhere: any = {};
    if (targetJurisdictionId) {
      caseWhere.jurisdictionId = targetJurisdictionId;
    }

    const windowDays = query.windowDays || 30;
    const endDate = query.endDate ? new Date(query.endDate) : new Date();
    const startDate = query.startDate
      ? new Date(query.startDate)
      : new Date(endDate.getTime() - windowDays * 24 * 60 * 60 * 1000);

    if (startDate > endDate) {
      throw new ValidationError('startDate must be before or equal to endDate');
    }

    const maxSpanMs = 366 * 24 * 60 * 60 * 1000;
    if (endDate.getTime() - startDate.getTime() > maxSpanMs) {
      throw new ValidationError('Trend query date span cannot exceed 366 days');
    }

    // Generate non-overlapping contiguous time buckets
    const rawBuckets = generateTimeBuckets(startDate, endDate, query.bucket || 'day');

    // Fetch accessible cases, leads, and tasks within scope
    const cases = await prisma.investigationCase.findMany({
      where: caseWhere,
      select: {
        id: true,
        reportedAt: true,
        closedAt: true,
        caseState: true,
      },
    });

    const leads = await prisma.leadSighting.findMany({
      where: { case: caseWhere },
      select: { id: true, reportedAt: true },
    });

    const completedTasks = await prisma.investigationTask.findMany({
      where: {
        case: caseWhere,
        status: TaskStatus.COMPLETED,
        completedAt: { not: null },
      },
      select: { id: true, completedAt: true },
    });

    // Populate each bucket
    const timeSeries: TimeBucket[] = rawBuckets.map((b, idx) => {
      const bStartMs = b.start.getTime();
      const bEndMs = b.end.getTime();

      const reportedCasesCount = cases.filter(
        (c) => c.reportedAt.getTime() >= bStartMs && c.reportedAt.getTime() < bEndMs
      ).length;

      const closedCasesCount = cases.filter(
        (c) => c.closedAt && c.closedAt.getTime() >= bStartMs && c.closedAt.getTime() < bEndMs
      ).length;

      const reportedLeadsCount = leads.filter(
        (l) => l.reportedAt.getTime() >= bStartMs && l.reportedAt.getTime() < bEndMs
      ).length;

      const completedTasksCount = completedTasks.filter(
        (t) => t.completedAt && t.completedAt.getTime() >= bStartMs && t.completedAt.getTime() < bEndMs
      ).length;

      return {
        bucketIndex: idx,
        startDate: b.start.toISOString(),
        endDate: b.end.toISOString(),
        label: b.label,
        reportedCasesCount,
        closedCasesCount,
        reportedLeadsCount,
        completedTasksCount,
      };
    });

    // Compute Resolution Duration Metrics for cases closed in this reporting interval
    const closedInInterval = cases.filter(
      (c) =>
        c.closedAt &&
        c.closedAt.getTime() >= startDate.getTime() &&
        c.closedAt.getTime() <= endDate.getTime()
    );

    const resolutionDurationsDays = closedInInterval.map((c) => {
      const diffMs = Math.max(0, c.closedAt!.getTime() - c.reportedAt.getTime());
      return Math.round((diffMs / (1000 * 60 * 60 * 24)) * 10) / 10;
    });

    const averageResolutionDays = calculateMean(resolutionDurationsDays);
    const medianResolutionDays = calculateMedian(resolutionDurationsDays);

    const totalReportedInPeriod = cases.filter(
      (c) =>
        c.reportedAt.getTime() >= startDate.getTime() && c.reportedAt.getTime() <= endDate.getTime()
    ).length;

    const totalClosedInPeriod = closedInInterval.length;

    return {
      metadata: {
        generatedAt: new Date().toISOString(),
        isPlatformWide,
        jurisdictionScope: isPlatformWide ? 'ALL_JURISDICTIONS' : targetJurisdictionId,
        reportingInterval: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          windowDays,
          bucketType: query.bucket || 'day',
        },
      },
      summary: {
        totalReportedInPeriod,
        totalClosedInPeriod,
        casesClosedWithResolutionMetricsCount: closedInInterval.length,
        averageResolutionDays,
        medianResolutionDays,
      },
      timeSeries,
      definitionNotes: {
        denominator: 'Resolution durations are calculated strictly from cases whose closedAt timestamp occurs within the selected reporting interval.',
        timestampBasis: 'reportedAt (start of investigation) to closedAt (formal supervisory closure). UTC timezone.',
        reopenedCases: 'Cases that were reopened clear closedAt; if subsequently re-closed, resolution time reflects the active closedAt timestamp.',
      },
    };
  }

  /**
   * 3. Task Backlog & Overdue Metrics
   */
  public static async getTaskBacklogMetrics(query: TasksAnalyticsQueryInput, actorUser: AuthUser) {
    const { targetJurisdictionId, isPlatformWide } = this.resolveJurisdictionScope(
      actorUser,
      query.jurisdictionId
    );

    const caseWhere: any = {};
    if (targetJurisdictionId) {
      caseWhere.jurisdictionId = targetJurisdictionId;
    }

    const taskWhere: any = { case: caseWhere };

    const now = new Date();

    // 1. Task counts by status
    const statusGroups = await prisma.investigationTask.groupBy({
      by: ['status'],
      where: taskWhere,
      _count: true,
    });

    const byStatus: Record<TaskStatus, number> = {
      PENDING: 0,
      IN_PROGRESS: 0,
      COMPLETED: 0,
      CANCELLED: 0,
    };
    for (const g of statusGroups) {
      byStatus[g.status] = g._count;
    }

    const totalTasks = Object.values(byStatus).reduce((a, b) => a + b, 0);
    const openTasksCount = byStatus.PENDING + byStatus.IN_PROGRESS;

    // 2. Overdue tasks count
    // A task is overdue ONLY if it is in an active state (PENDING or IN_PROGRESS) and dueDate < now
    const overdueTasksCount = await prisma.investigationTask.count({
      where: {
        ...taskWhere,
        status: { in: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS] },
        dueDate: { lt: now },
      },
    });

    // 3. Open tasks by priority
    const priorityGroups = await prisma.investigationTask.groupBy({
      by: ['priority'],
      where: {
        ...taskWhere,
        status: { in: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS] },
      },
      _count: true,
    });

    const openByPriority: Record<Priority, number> = {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
    };
    for (const g of priorityGroups) {
      openByPriority[g.priority] = g._count;
    }

    // 4. Open tasks by Assignee & Unassigned Count
    const unassignedOpenTasksCount = await prisma.investigationTask.count({
      where: {
        ...taskWhere,
        status: { in: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS] },
        assignedUserId: null,
      },
    });

    const assignedGroups = await prisma.investigationTask.groupBy({
      by: ['assignedUserId'],
      where: {
        ...taskWhere,
        status: { in: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS] },
        assignedUserId: { not: null },
      },
      _count: true,
    });

    const assignedUserIds = assignedGroups.map((g) => g.assignedUserId!).filter(Boolean);
    const users = await prisma.user.findMany({
      where: { id: { in: assignedUserIds } },
      select: { id: true, displayName: true, badgeNumber: true, role: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    const openByAssignee = assignedGroups.map((g) => {
      const u = userMap.get(g.assignedUserId!);
      return {
        userId: g.assignedUserId!,
        displayName: u?.displayName || 'Unknown Officer',
        badgeNumber: u?.badgeNumber || null,
        role: u?.role || 'CASE_OFFICER',
        openTasksCount: g._count,
      };
    });

    // 5. Completion Times for completed tasks
    const completedTasks = await prisma.investigationTask.findMany({
      where: {
        ...taskWhere,
        status: TaskStatus.COMPLETED,
        completedAt: { not: null },
      },
      select: {
        createdAt: true,
        completedAt: true,
      },
    });

    const completionHours = completedTasks.map((t) => {
      const diffMs = Math.max(0, t.completedAt!.getTime() - t.createdAt.getTime());
      return Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10;
    });

    const averageCompletionHours = calculateMean(completionHours);
    const medianCompletionHours = calculateMedian(completionHours);

    // Optional period counts
    let completedInPeriod = byStatus.COMPLETED;
    if (query.startDate && query.endDate) {
      completedInPeriod = await prisma.investigationTask.count({
        where: {
          ...taskWhere,
          status: TaskStatus.COMPLETED,
          completedAt: {
            gte: new Date(query.startDate),
            lte: new Date(query.endDate),
          },
        },
      });
    }

    return {
      metadata: {
        generatedAt: now.toISOString(),
        isPlatformWide,
        jurisdictionScope: isPlatformWide ? 'ALL_JURISDICTIONS' : targetJurisdictionId,
      },
      tasks: {
        totalTasks,
        byStatus,
        openTasksCount,
        overdueTasksCount,
        openByPriority,
        openByAssignee,
        unassignedOpenTasksCount,
        completedInPeriod,
        averageCompletionHours,
        medianCompletionHours,
      },
      definitions: {
        overdueTasksCount:
          'Strictly tasks in PENDING or IN_PROGRESS status whose dueDate is in the past. Terminal states (COMPLETED, CANCELLED) are never counted as overdue.',
        openTasksCount: 'Tasks in PENDING or IN_PROGRESS status awaiting resolution.',
        completionHours: 'Elapsed duration in hours from task creation (createdAt) to completion (completedAt).',
      },
    };
  }

  /**
   * 4. Cross-Case Pattern Review Backlog
   */
  public static async getPatternReviewBacklog(query: PatternAnalyticsQueryInput, actorUser: AuthUser) {
    const { targetJurisdictionId, isPlatformWide } = this.resolveJurisdictionScope(
      actorUser,
      query.jurisdictionId
    );

    const caseWhere: any = {};
    if (targetJurisdictionId) {
      caseWhere.jurisdictionId = targetJurisdictionId;
    }

    // Retrieve accessible cases within caller scope
    const accessibleCases = await prisma.investigationCase.findMany({
      where: caseWhere,
      select: { id: true, caseReference: true },
      orderBy: { reportedAt: 'desc' },
    });

    const distinctPatternsMap = new Map<string, CandidatePattern>();

    // Run pattern analysis across accessible cases
    for (const c of accessibleCases) {
      const analysis = await PatternService.analyzeCasePatterns(
        c.id,
        {
          maxDistanceKm: query.maxDistanceKm || 5.0,
          maxTimeDeltaHours: query.maxTimeDeltaHours || 72.0,
          includeTemporalOverlap: true,
          includeDescriptors: true,
          minSignals: 1,
        },
        actorUser
      );

      for (const pat of analysis.patterns) {
        if (!distinctPatternsMap.has(pat.id)) {
          distinctPatternsMap.set(pat.id, pat);
        }
      }
    }

    const allPatterns = Array.from(distinctPatternsMap.values());

    let unverifiedCandidates = 0;
    let relevantForFollowup = 0;
    let underReview = 0;
    let notRelevant = 0;

    const byPriority: Record<Priority, number> = {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
    };

    const byCategory: Record<string, number> = {
      SPATIAL_PROXIMITY: 0,
      TEMPORAL_WINDOW_OVERLAP: 0,
      DESCRIPTOR_CORRELATION: 0,
      MULTI_SIGNAL_ASSOCIATION: 0,
    };

    for (const p of allPatterns) {
      if (p.reviewStatus === 'UNVERIFIED_CANDIDATE') unverifiedCandidates++;
      else if (p.reviewStatus === 'RELEVANT_FOR_FOLLOWUP') relevantForFollowup++;
      else if (p.reviewStatus === 'UNDER_REVIEW') underReview++;
      else if (p.reviewStatus === 'NOT_RELEVANT') notRelevant++;

      if (p.reviewPriority === 'HIGH') byPriority.HIGH++;
      else if (p.reviewPriority === 'MEDIUM') byPriority.MEDIUM++;
      else if (p.reviewPriority === 'LOW') byPriority.LOW++;

      byCategory[p.primaryCategory] = (byCategory[p.primaryCategory] || 0) + 1;
    }

    // Queue summary list for supervisor triage
    const reviewQueueItems = allPatterns.map((p) => ({
      patternId: p.id,
      primaryCategory: p.primaryCategory,
      reviewPriority: p.reviewPriority,
      reviewStatus: p.reviewStatus,
      signalsCount: p.signalsCount,
      initiatingCaseId: p.initiatingCaseId,
      initiatingCaseReference: p.initiatingCaseReference,
      candidateCaseId: p.candidateCaseId,
      candidateCaseReference: p.candidateCaseReference,
      lastReviewedAt: p.reviewHistory?.reviewedAt || null,
      reviewedBy: p.reviewHistory?.reviewedBy?.displayName || null,
      disclaimer: p.disclaimer,
    }));

    return {
      metadata: {
        generatedAt: new Date().toISOString(),
        isPlatformWide,
        jurisdictionScope: isPlatformWide ? 'ALL_JURISDICTIONS' : targetJurisdictionId,
        casesEvaluatedCount: accessibleCases.length,
      },
      backlog: {
        totalDistinctPatterns: allPatterns.length,
        unverifiedCandidates,
        relevantForFollowup,
        underReview,
        notRelevant,
        byPriority: {
          HIGH: byPriority.HIGH,
          MEDIUM: byPriority.MEDIUM,
          LOW: byPriority.LOW,
        },
        byCategory,
      },
      reviewQueueItems,
      definitions: {
        distinctPatterns:
          'Deduplicated canonical pattern identifiers derived from record pairings. Exactly one count per pattern pair, invariant to direction.',
        reviewStatus:
          'UNVERIFIED_CANDIDATE indicates automated heuristic match pending human review. Other statuses reflect audited supervisor classifications.',
        priorityNote:
          'Review priorities (HIGH, MEDIUM, LOW) are ordinal triage rankings based on multi-signal convergence, not probabilities of guilt or identity.',
      },
    };
  }

  /**
   * 5. Operational Report Data (JSON and CSV)
   */
  public static async getOperationalReport(query: OperationalReportQueryInput, actorUser: AuthUser) {
    const { targetJurisdictionId, isPlatformWide } = this.resolveJurisdictionScope(
      actorUser,
      query.jurisdictionId
    );

    const windowDays = query.windowDays || 30;
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - windowDays * 24 * 60 * 60 * 1000);

    const [caseloadRes, tasksRes, patternsRes] = await Promise.all([
      this.getCaseloadSummary(
        {
          jurisdictionId: targetJurisdictionId,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
        actorUser
      ),
      this.getTaskBacklogMetrics(
        {
          jurisdictionId: targetJurisdictionId,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
        actorUser
      ),
      this.getPatternReviewBacklog(
        {
          jurisdictionId: targetJurisdictionId,
        },
        actorUser
      ),
    ]);

    let jurCode = 'ALL_JURISDICTIONS';
    let jurName = 'All Platform Jurisdictions';
    if (!isPlatformWide && targetJurisdictionId) {
      const jur = await prisma.jurisdiction.findUnique({
        where: { id: targetJurisdictionId },
        select: { code: true, name: true },
      });
      if (jur) {
        jurCode = jur.code;
        jurName = jur.name;
      }
    }

    const reportData = {
      reportId: `RPT-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      generatedAt: new Date().toISOString(),
      generatedBy: {
        id: actorUser.id,
        displayName: actorUser.displayName || 'Authorized Investigator',
        role: actorUser.role,
      },
      scope: {
        isPlatformWide,
        jurisdictionId: targetJurisdictionId || null,
        jurisdictionCode: jurCode,
        jurisdictionName: jurName,
      },
      reportingInterval: {
        startDate: startDate.toISOString().slice(0, 10),
        endDate: endDate.toISOString().slice(0, 10),
        windowDays,
      },
      caseload: caseloadRes.caseload,
      tasks: tasksRes.tasks,
      patterns: patternsRes.backlog,
      disclaimer:
        'TraceGrid Operational Analytics are decision-support management metrics derived from documented investigation records. Operational indicators do not establish individual culpability or replace sworn human investigative judgment.',
    };

    if (query.format === 'csv') {
      const csvContent = serializeReportToCsv(reportData);
      return { format: 'csv', content: csvContent };
    }

    return { format: 'json', data: reportData };
  }
}
