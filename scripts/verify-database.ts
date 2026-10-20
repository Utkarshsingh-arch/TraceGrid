/**
 * TraceGrid Database Integrity & Verification Suite
 * Validates PostgreSQL schema, constraints, relationships, KPI counts, and domain invariants.
 */

import { PrismaClient, CaseState, TracingOutcome, LeadStatus, TaskStatus } from '@prisma/client';

const prisma = new PrismaClient();

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

async function runVerification() {
  console.log('====================================================');
  console.log('  TraceGrid Database Integrity & Verification Suite');
  console.log('====================================================\n');

  // --------------------------------------------------------------------------
  // TEST SUITE 1: Record Count Verification
  // --------------------------------------------------------------------------
  console.log('--- Suite 1: Seed Record Counts & Baseline Metrics ---');
  const jurCount = await prisma.jurisdiction.count();
  const userCount = await prisma.user.count();
  const personCount = await prisma.personProfile.count();
  const caseCount = await prisma.investigationCase.count();
  const leadCount = await prisma.leadSighting.count();
  const taskCount = await prisma.investigationTask.count();
  const evidenceCount = await prisma.evidenceItem.count();
  const attachmentCount = await prisma.attachment.count();
  const observationCount = await prisma.locationObservation.count();
  const hypothesisCount = await prisma.searchZoneHypothesis.count();
  const eventCount = await prisma.caseEvent.count();
  const auditCount = await prisma.auditLog.count();

  assert(jurCount === 4, 'Jurisdictions count equals 4', `Found: ${jurCount}`);
  assert(userCount === 5, 'Demo Users count equals 5', `Found: ${userCount}`);
  assert(personCount === 35, 'Person Profiles count equals 35', `Found: ${personCount}`);
  assert(caseCount === 35, 'Investigation Cases count equals 35', `Found: ${caseCount}`);
  assert(leadCount >= 120, 'Leads count meets target (~120)', `Found: ${leadCount}`);
  assert(taskCount >= 65, 'Tasks count meets target (~65)', `Found: ${taskCount}`);
  assert(evidenceCount >= 45, 'Evidence records meet target (~45)', `Found: ${evidenceCount}`);
  assert(attachmentCount >= 30, 'Attachment records meet target (>=30)', `Found: ${attachmentCount}`);
  assert(observationCount >= 40, 'Location Observations meet target (>=40)', `Found: ${observationCount}`);
  assert(hypothesisCount >= 1, 'SearchZoneHypotheses present', `Found: ${hypothesisCount}`);
  assert(eventCount >= 35, 'Case Events recorded for all cases', `Found: ${eventCount}`);
  assert(auditCount >= 1, 'Audit Log entries present', `Found: ${auditCount}`);

  // --------------------------------------------------------------------------
  // TEST SUITE 2: Unique Constraints Enforcement
  // --------------------------------------------------------------------------
  console.log('\n--- Suite 2: Unique Constraints Enforcement ---');
  let duplicateCaseRejected = false;
  try {
    await prisma.investigationCase.create({
      data: {
        caseReference: 'CAS-2026-0001', // Already exists!
        personProfileId: (await prisma.personProfile.findFirstOrThrow()).id,
        jurisdictionId: (await prisma.jurisdiction.findFirstOrThrow()).id,
        reportedAt: new Date(),
        missingSince: new Date(),
        incidentSummary: 'Duplicate collision test',
      },
    });
  } catch (err: any) {
    if (err.code === 'P2002') {
      duplicateCaseRejected = true;
    }
  }
  assert(duplicateCaseRejected, 'Duplicate case_reference rejected by unique constraint (P2002)');

  let duplicateEmailRejected = false;
  try {
    await prisma.user.create({
      data: {
        email: 'officer.sharma@tracegrid.local', // Already exists!
        displayName: 'Duplicate Officer',
        passwordHash: 'hash',
        role: 'CASE_OFFICER',
      },
    });
  } catch (err: any) {
    if (err.code === 'P2002') {
      duplicateEmailRejected = true;
    }
  }
  assert(duplicateEmailRejected, 'Duplicate user email rejected by unique constraint (P2002)');

  // --------------------------------------------------------------------------
  // TEST SUITE 3: Foreign Key Integrity
  // --------------------------------------------------------------------------
  console.log('\n--- Suite 3: Foreign Key Integrity ---');
  let invalidForeignKeyRejected = false;
  try {
    await prisma.investigationCase.create({
      data: {
        caseReference: 'CAS-9999-FAKE',
        personProfileId: '00000000-0000-4000-8000-000000000000', // Non-existent person!
        jurisdictionId: (await prisma.jurisdiction.findFirstOrThrow()).id,
        reportedAt: new Date(),
        missingSince: new Date(),
        incidentSummary: 'FK violation test',
      },
    });
  } catch (err: any) {
    if (err.code === 'P2003') {
      invalidForeignKeyRejected = true;
    }
  }
  assert(invalidForeignKeyRejected, 'Non-existent person profile foreign key rejected (P2003)');

  // --------------------------------------------------------------------------
  // TEST SUITE 4: Investigation Domain Scenarios & Invariants
  // --------------------------------------------------------------------------
  console.log('\n--- Suite 4: Investigation Domain Scenarios & Invariants ---');

  // Scenario: Disproved lead in an open case
  const disprovedLead = await prisma.leadSighting.findFirst({
    where: { leadReference: 'LEAD-2026-0001' },
    include: { case: true },
  });
  assert(
    disprovedLead?.verificationStatus === LeadStatus.DISPROVED && disprovedLead.case.caseState === CaseState.OPEN,
    'Invariant: Disproved lead does NOT close parent investigation (CAS-2026-0001 remains OPEN)'
  );

  // Scenario: Overdue task detection
  const overdueTasks = await prisma.investigationTask.findMany({
    where: {
      status: { notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELLED] },
      dueDate: { lt: new Date() },
    },
  });
  assert(
    overdueTasks.length === 8,
    'Overdue tasks calculated accurately from due_date and status',
    `Found: ${overdueTasks.length} overdue tasks`
  );

  // Scenario: Located person awaiting physical verification
  const locatedPendingCase = await prisma.investigationCase.findFirst({
    where: { tracingOutcome: TracingOutcome.LOCATED_VERIFICATION_PENDING },
  });
  assert(
    locatedPendingCase !== null && locatedPendingCase.caseState === CaseState.OPEN,
    'Invariant: LOCATED_VERIFICATION_PENDING is an active investigation state, not an automatic closure'
  );

  // Scenario: Closed case metadata integrity
  const closedCase = await prisma.investigationCase.findFirst({
    where: { caseReference: 'CAS-2026-0004' },
  });
  assert(
    closedCase?.caseState === CaseState.CLOSED &&
    closedCase.closedAt !== null &&
    closedCase.closureReason !== null &&
    closedCase.closureReason.length > 0,
    'Invariant: CLOSED case requires closure_reason and closed_at timestamp'
  );

  // Scenario: Completed task outcome documentation
  const completedTask = await prisma.investigationTask.findFirst({
    where: { status: TaskStatus.COMPLETED },
  });
  assert(
    completedTask?.completedAt !== null &&
    completedTask?.outcomeNotes !== null &&
    (completedTask?.outcomeNotes?.length ?? 0) > 0,
    'Invariant: COMPLETED task requires completion timestamp and outcome notes'
  );

  // --------------------------------------------------------------------------
  // TEST SUITE 5: Live KPI Source Queries (Dashboard Feasibility)
  // --------------------------------------------------------------------------
  console.log('\n--- Suite 5: Live KPI Source Aggregate Queries ---');

  const openCases = await prisma.investigationCase.count({ where: { caseState: CaseState.OPEN } });
  const underReviewCases = await prisma.investigationCase.count({ where: { caseState: CaseState.UNDER_REVIEW } });
  const closedCases = await prisma.investigationCase.count({ where: { caseState: CaseState.CLOSED } });
  const unresolvedLeads = await prisma.leadSighting.count({
    where: { verificationStatus: { in: [LeadStatus.NEW, LeadStatus.UNDER_REVIEW, LeadStatus.ASSIGNED] } },
  });

  console.log(`    Total Cases:        ${caseCount}`);
  console.log(`    Open Cases:         ${openCases}`);
  console.log(`    Under Review Cases: ${underReviewCases}`);
  console.log(`    Closed Cases:       ${closedCases}`);
  console.log(`    Overdue Tasks:      ${overdueTasks.length}`);
  console.log(`    Unresolved Leads:   ${unresolvedLeads}`);

  assert(
    openCases + underReviewCases + closedCases + (await prisma.investigationCase.count({ where: { caseState: CaseState.REPORTED } })) === caseCount,
    'State partition sums exactly to total cases (Zero hardcoded KPI drift)'
  );

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n====================================================');
  const failed = results.filter((r) => !r.passed);
  if (failed.length === 0) {
    console.log(`  🎉 ALL ${results.length} DATABASE VERIFICATION TESTS PASSED!`);
    console.log('====================================================');
    process.exit(0);
  } else {
    console.error(`  ❌ ${failed.length} / ${results.length} TESTS FAILED.`);
    console.log('====================================================');
    process.exit(1);
  }
}

runVerification()
  .catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
