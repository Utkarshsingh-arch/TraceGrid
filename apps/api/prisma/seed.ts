import { PrismaClient, Role, BiologicalSex, CaseState, TracingOutcome, Priority, AssignmentRole, LeadStatus, LeadSource, EvidenceType, AccessClassification, TaskStatus, ObservationType, EventType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting TraceGrid Deterministic Synthetic Seeder...');

  // 1. Password Hash for Demo Users (dev-only deterministic hash)
  const demoPasswordHash = await bcrypt.hash('Password123!', 10);

  // ----------------------------------------------------------------------------
  // 2. Jurisdictions (4 Divisions)
  // ----------------------------------------------------------------------------
  const jurisdictionsData = [
    { code: 'JUR-DEL-NORTH', name: 'North District Division', region: 'Delhi NCT' },
    { code: 'JUR-DEL-SOUTH', name: 'South District Division', region: 'Delhi NCT' },
    { code: 'JUR-UP-NOIDA',  name: 'Gautam Buddha Nagar Zone', region: 'Uttar Pradesh' },
    { code: 'JUR-HAR-GUR',   name: 'Gurugram Central Division', region: 'Haryana' },
  ];

  const jurisdictions: Record<string, any> = {};
  for (const j of jurisdictionsData) {
    const record = await prisma.jurisdiction.upsert({
      where: { code: j.code },
      update: { name: j.name, region: j.region },
      create: j,
    });
    jurisdictions[j.code] = record;
  }
  console.log(`✅ Upserted ${Object.keys(jurisdictions).length} Jurisdictions`);

  // ----------------------------------------------------------------------------
  // 3. Demo Users (5 Roles)
  // ----------------------------------------------------------------------------
  const usersData = [
    {
      email: 'officer.sharma@tracegrid.local',
      displayName: 'Inspector Rajesh Sharma',
      badgeNumber: 'DL-8841',
      role: Role.CASE_OFFICER,
      jurisdictionId: jurisdictions['JUR-DEL-NORTH'].id,
    },
    {
      email: 'supervisor.roy@tracegrid.local',
      displayName: 'ACP Sunita Roy',
      badgeNumber: 'DL-1092',
      role: Role.SUPERVISOR,
      jurisdictionId: jurisdictions['JUR-DEL-NORTH'].id,
    },
    {
      email: 'clerk.verma@tracegrid.local',
      displayName: 'Head Clerk Amit Verma',
      badgeNumber: 'DL-5520',
      role: Role.DATA_CLERK,
      jurisdictionId: jurisdictions['JUR-DEL-NORTH'].id,
    },
    {
      email: 'admin.root@tracegrid.local',
      displayName: 'System Administrator',
      badgeNumber: 'SYS-0001',
      role: Role.SYSTEM_ADMIN,
      jurisdictionId: null, // Global scope
    },
    {
      email: 'reviewer.mehta@tracegrid.local',
      displayName: 'Legal Reviewer Ananya Mehta',
      badgeNumber: 'REV-3301',
      role: Role.READ_ONLY_REVIEWER,
      jurisdictionId: jurisdictions['JUR-DEL-NORTH'].id,
    },
  ];

  const users: Record<string, any> = {};
  for (const u of usersData) {
    const record = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        displayName: u.displayName,
        badgeNumber: u.badgeNumber,
        role: u.role,
        jurisdictionId: u.jurisdictionId,
      },
      create: {
        ...u,
        passwordHash: demoPasswordHash,
      },
    });
    users[u.email] = record;
  }
  console.log(`✅ Upserted ${Object.keys(users).length} Demo Users`);

  // ----------------------------------------------------------------------------
  // 4. Person Profiles & Investigation Cases (35 Cases)
  // ----------------------------------------------------------------------------
  const baseDate = new Date('2026-10-15T00:00:00.000Z');

  // Case configuration definitions
  const caseConfigs = [
    // Scenario 1: Active high-priority case with multiple leads, overdue task, disproved lead
    {
      ref: 'CAS-2026-0001',
      name: 'Aarav Sharma',
      age: 22,
      sex: BiologicalSex.MALE,
      state: CaseState.OPEN,
      outcome: TracingOutcome.NOT_TRACED,
      priority: Priority.HIGH,
      jurCode: 'JUR-DEL-NORTH',
      missingDays: 3,
      summary: 'University student last seen leaving North Campus central library after evening study session.',
    },
    // Scenario 2: Reopened case with historic closure and new confirmed lead
    {
      ref: 'CAS-2026-0002',
      name: 'Meera Deshmukh',
      age: 34,
      sex: BiologicalSex.FEMALE,
      state: CaseState.OPEN,
      outcome: TracingOutcome.NOT_TRACED,
      priority: Priority.CRITICAL,
      jurCode: 'JUR-DEL-SOUTH',
      missingDays: 14,
      summary: 'Architect went missing while visiting construction site. Case was briefly closed on false alibi then reopened upon video evidence.',
    },
    // Scenario 3: Located awaiting physical verification
    {
      ref: 'CAS-2026-0003',
      name: 'Rohan Kulkarni',
      age: 17,
      sex: BiologicalSex.MALE,
      state: CaseState.OPEN,
      outcome: TracingOutcome.LOCATED_VERIFICATION_PENDING,
      priority: Priority.HIGH,
      jurCode: 'JUR-UP-NOIDA',
      missingDays: 2,
      summary: 'High school student reported missing after coaching class. Hospital triage in Sector 62 reported patient matching description.',
    },
    // Scenario 4: Properly closed case
    {
      ref: 'CAS-2026-0004',
      name: 'Pooja Iyer',
      age: 28,
      sex: BiologicalSex.FEMALE,
      state: CaseState.CLOSED,
      outcome: TracingOutcome.TRACED_VERIFIED,
      priority: Priority.MEDIUM,
      jurCode: 'JUR-DEL-SOUTH',
      missingDays: 8,
      summary: 'Accountant missing during commute. Traced safely in Jaipur; confirmed reunited with relatives.',
      closureReason: 'Subject traced safely in Jaipur; verified in-person by local police post.',
    },
    // Scenario 5: Incomplete case lodged at triage (UNDER_REVIEW)
    {
      ref: 'CAS-2026-0005',
      name: 'Unknown Male (Elderly)',
      age: 72,
      sex: BiologicalSex.MALE,
      state: CaseState.UNDER_REVIEW,
      outcome: TracingOutcome.NOT_TRACED,
      priority: Priority.HIGH,
      jurCode: 'JUR-DEL-NORTH',
      missingDays: 1,
      summary: 'Disoriented senior citizen wandered from residential park; reporter could not provide full medical background.',
    },
    // Scenario 6: Freshly lodged case (REPORTED)
    {
      ref: 'CAS-2026-0006',
      name: 'Simran Kaur',
      age: 19,
      sex: BiologicalSex.FEMALE,
      state: CaseState.REPORTED,
      outcome: TracingOutcome.NOT_TRACED,
      priority: Priority.MEDIUM,
      jurCode: 'JUR-HAR-GUR',
      missingDays: 0,
      summary: 'College freshman missed hostel curfew; roommates lodged initial missing notice.',
    },
    // Scenario 7: Contradictory clues case
    {
      ref: 'CAS-2026-0007',
      name: 'Vikram Malhotra',
      age: 41,
      sex: BiologicalSex.MALE,
      state: CaseState.OPEN,
      outcome: TracingOutcome.LOCATION_REPORTED,
      priority: Priority.CRITICAL,
      jurCode: 'JUR-DEL-NORTH',
      missingDays: 5,
      summary: 'Corporate executive vehicle found abandoned on Ring Road. Sighting in Connaught Place conflicts with synthetic cell tower in Ghaziabad.',
    },
    // Scenario 8: Cold case closed archive
    {
      ref: 'CAS-2026-0008',
      name: 'Deepak Joshi',
      age: 39,
      sex: BiologicalSex.MALE,
      state: CaseState.CLOSED,
      outcome: TracingOutcome.NOT_TRACED,
      priority: Priority.LOW,
      jurCode: 'JUR-DEL-NORTH',
      missingDays: 180,
      summary: 'Reported missing 6 months ago. Extensive inter-state inquiries yielded no leads; case archived under review protocols.',
      closureReason: 'Investigative leads exhausted across all jurisdictions; archived to cold case repository per SOP.',
    },
    // Scenario 9: Located & Traced Verified
    {
      ref: 'CAS-2026-0009',
      name: 'Ananya Sen',
      age: 26,
      sex: BiologicalSex.FEMALE,
      state: CaseState.CLOSED,
      outcome: TracingOutcome.TRACED_VERIFIED,
      priority: Priority.MEDIUM,
      jurCode: 'JUR-UP-NOIDA',
      missingDays: 4,
      summary: 'Software developer lost in transit after phone battery died. Traced at metro station assistance desk.',
      closureReason: 'Subject located at Metro station; verified in person by primary officer.',
    },
    // Scenario 10: Case with multiple reassignments
    {
      ref: 'CAS-2026-0010',
      name: 'Kavita Nair',
      age: 31,
      sex: BiologicalSex.FEMALE,
      state: CaseState.OPEN,
      outcome: TracingOutcome.NOT_TRACED,
      priority: Priority.HIGH,
      jurCode: 'JUR-DEL-SOUTH',
      missingDays: 6,
      summary: 'NGO worker missing after community field visit. Reassigned from local beat to specialized unit.',
    },
  ];

  // Fill up to 35 total cases with synthetic profiles
  const firstNames = ['Aditya', 'Neha', 'Kabir', 'Tanvi', 'Aryan', 'Ishita', 'Arjun', 'Sanya', 'Varun', 'Kriti', 'Harsh', 'Divya', 'Kunal', 'Rhea', 'Manish', 'Payal', 'Naveen', 'Shreya', 'Gaurav', 'Bhavna', 'Siddharth', 'Pallavi', 'Nikhil', 'Priyanka', 'Tarun'];
  const lastNames = ['Verma', 'Bhatia', 'Saxena', 'Kapoor', 'Rao', 'Reddy', 'Patel', 'Singh', 'Chopra', 'Gupta', 'Mehra', 'Bansal', 'Thakur', 'Yadav', 'Mishra'];
  const priorities = [Priority.LOW, Priority.MEDIUM, Priority.HIGH, Priority.CRITICAL];
  const states = [CaseState.OPEN, CaseState.OPEN, CaseState.OPEN, CaseState.UNDER_REVIEW, CaseState.REPORTED];

  for (let i = 11; i <= 35; i++) {
    const fn = firstNames[(i * 3) % firstNames.length];
    const ln = lastNames[(i * 7) % lastNames.length];
    const jurList = Object.keys(jurisdictions);
    const jurCode = jurList[i % jurList.length];

    caseConfigs.push({
      ref: `CAS-2026-${i.toString().padStart(4, '0')}`,
      name: `${fn} ${ln}`,
      age: 18 + ((i * 5) % 55),
      sex: i % 2 === 0 ? BiologicalSex.MALE : BiologicalSex.FEMALE,
      state: states[i % states.length],
      outcome: i % 8 === 0 ? TracingOutcome.LOCATION_REPORTED : TracingOutcome.NOT_TRACED,
      priority: priorities[i % priorities.length],
      jurCode,
      missingDays: 1 + (i % 20),
      summary: `Synthetic investigation case for ${fn} ${ln}. Missing from ${jurisdictions[jurCode].name} area.`,
    });
  }

  const seededCases: Record<string, any> = {};

  for (const cfg of caseConfigs) {
    const synId = `SYN-PER-${cfg.ref.replace('CAS-2026-', '')}`;
    
    // 1. PersonProfile Upsert
    const person = await prisma.personProfile.upsert({
      where: { syntheticId: synId },
      update: {
        fullName: cfg.name,
        estimatedAge: cfg.age,
        biologicalSex: cfg.sex,
      },
      create: {
        syntheticId: synId,
        fullName: cfg.name,
        estimatedAge: cfg.age,
        biologicalSex: cfg.sex,
        aliases: [cfg.name.split(' ')[0]],
        identifyingFeatures: 'Synthetic test profile descriptive markers.',
      },
    });

    const reportedAt = new Date(baseDate.getTime() - cfg.missingDays * 86400000 + 3600000);
    const missingSince = new Date(baseDate.getTime() - cfg.missingDays * 86400000);

    // 2. InvestigationCase Upsert
    const c = await prisma.investigationCase.upsert({
      where: { caseReference: cfg.ref },
      update: {
        caseState: cfg.state,
        tracingOutcome: cfg.outcome,
        priority: cfg.priority,
        incidentSummary: cfg.summary,
        closureReason: (cfg as any).closureReason || null,
        closedAt: cfg.state === CaseState.CLOSED ? new Date(baseDate.getTime() - 86400000) : null,
      },
      create: {
        caseReference: cfg.ref,
        personProfileId: person.id,
        jurisdictionId: jurisdictions[cfg.jurCode].id,
        reportedAt,
        missingSince,
        caseState: cfg.state,
        tracingOutcome: cfg.outcome,
        priority: cfg.priority,
        incidentSummary: cfg.summary,
        closureReason: (cfg as any).closureReason || null,
        closedAt: cfg.state === CaseState.CLOSED ? new Date(baseDate.getTime() - 86400000) : null,
      },
    });

    seededCases[cfg.ref] = c;

    // 3. Case Assignment (assign primary officer)
    const officer = users['officer.sharma@tracegrid.local'];
    const supervisor = users['supervisor.roy@tracegrid.local'];

    await prisma.caseAssignment.upsert({
      where: { id: `00000000-0000-4000-8000-${cfg.ref.replace('CAS-2026-', '').padStart(12, '0')}` },
      update: { isActive: true },
      create: {
        id: `00000000-0000-4000-8000-${cfg.ref.replace('CAS-2026-', '').padStart(12, '0')}`,
        caseId: c.id,
        userId: officer.id,
        assignmentRole: AssignmentRole.PRIMARY_OFFICER,
        assignedAt: reportedAt,
        isActive: true,
      },
    });

    // 4. Initial Case Event
    await prisma.caseEvent.upsert({
      where: { id: `00000001-0000-4000-8000-${cfg.ref.replace('CAS-2026-', '').padStart(12, '0')}` },
      update: {},
      create: {
        id: `00000001-0000-4000-8000-${cfg.ref.replace('CAS-2026-', '').padStart(12, '0')}`,
        caseId: c.id,
        eventType: EventType.CASE_CREATED,
        actorUserId: supervisor.id,
        eventTimestamp: reportedAt,
        description: `Investigation case formally registered under reference ${cfg.ref}.`,
      },
    });
  }

  console.log(`✅ Upserted ${Object.keys(seededCases).length} Investigation Cases & Person Profiles`);

  // ----------------------------------------------------------------------------
  // 5. Leads & Sightings (~120 Leads)
  // ----------------------------------------------------------------------------
  const leadSources = [
    LeadSource.CITIZEN_TIP,
    LeadSource.WITNESS_STATEMENT,
    LeadSource.OFFICER_PATROL,
    LeadSource.CCTV_REVIEW,
    LeadSource.SYNTHETIC_TELCO,
    LeadSource.SYNTHETIC_FINANCIAL,
  ];

  const leadStatuses = [
    LeadStatus.NEW,
    LeadStatus.UNDER_REVIEW,
    LeadStatus.ASSIGNED,
    LeadStatus.VERIFIED,
    LeadStatus.DISPROVED,
    LeadStatus.INCONCLUSIVE,
  ];

  const baseLat = 28.6139; // Delhi NCR center
  const baseLng = 77.2090;

  let leadCount = 0;
  const seededLeads: Record<string, any> = {};

  for (let cIdx = 1; cIdx <= 35; cIdx++) {
    const caseRef = `CAS-2026-${cIdx.toString().padStart(4, '0')}`;
    const parentCase = seededCases[caseRef];
    // Between 2 and 5 leads per case
    const numLeads = 2 + (cIdx % 4);

    for (let l = 1; l <= numLeads; l++) {
      leadCount++;
      const leadRef = `LEAD-2026-${leadCount.toString().padStart(4, '0')}`;
      const src = leadSources[(leadCount + l) % leadSources.length];
      const status = leadStatuses[(leadCount * 3) % leadStatuses.length];

      // Jitter coordinates around NCR
      const latJitter = ((leadCount * 17) % 100 - 50) * 0.003;
      const lngJitter = ((leadCount * 23) % 100 - 50) * 0.003;
      const lat = baseLat + latJitter;
      const lng = baseLng + lngJitter;

      let narrative = `Simulated investigative lead regarding ${parentCase.caseReference}.`;
      let findings: string | null = null;

      // Specialized edge scenarios
      if (leadCount === 1) {
        // Disproved lead under open case CAS-2026-0001
        narrative = 'Witness reported sighting individual at bus terminal ticket counter #4.';
        findings = 'CCTV footage review confirmed the ticket buyer was another passenger. Lead DISPROVED.';
      } else if (leadCount === 2) {
        // Duplicate sighting A
        narrative = 'Passerby reported individual matching description at Metro Station Gate 2 at 18:30.';
      } else if (leadCount === 3) {
        // Duplicate sighting B (same event)
        narrative = 'Shopkeeper reported seeing same youth near Metro Gate 2 tea stall around 18:35.';
      } else if (leadCount === 4) {
        // Contradictory clue: [SIMULATED] Telco
        narrative = '[SIMULATED] Mobile cell-tower connection recorded in Sector 62, Noida at 18:40.';
      } else if (leadCount === 5) {
        // Stale clue with high uncertainty
        narrative = 'Citizen tip called in 7 days after event claiming sighting near highway toll booth.';
      }

      const isDisproved = leadCount === 1;
      const leadStatus = isDisproved ? LeadStatus.DISPROVED : status;

      const lead = await prisma.leadSighting.upsert({
        where: { leadReference: leadRef },
        update: {
          narrative,
          verificationStatus: leadStatus,
          findings,
        },
        create: {
          leadReference: leadRef,
          caseId: parentCase.id,
          sourceType: src,
          narrative,
          observedAt: new Date(parentCase.reportedAt.getTime() + l * 3600000),
          reportedAt: new Date(parentCase.reportedAt.getTime() + (l + 1) * 3600000),
          latitude: lat,
          longitude: lng,
          locationUncertaintyMeters: leadCount === 5 ? 2500.0 : (src === LeadSource.SYNTHETIC_TELCO ? 1200.0 : 150.0),
          locationDescription: `Synthetic landmark near coordinate cluster ${l}`,
          verificationStatus: leadStatus,
          assignedUserId: users['officer.sharma@tracegrid.local'].id,
          findings,
        },
      });

      seededLeads[leadRef] = lead;
    }
  }

  console.log(`✅ Upserted ${leadCount} Leads & Sightings`);

  // ----------------------------------------------------------------------------
  // 6. Investigation Tasks (~65 Tasks)
  // ----------------------------------------------------------------------------
  let taskCount = 0;
  const taskTitles = [
    'Canvas Local Businesses for CCTV Recordings',
    'Interview Eyewitness and Document Statement',
    'Review Transit Terminal Log and Ticket Counter Logs',
    'Coordinate with Hospital Emergency Ward Administration',
    'Follow Up with Family on Recent Social Interactions',
    'Verify Alibi of Last Known Contact',
    'Inspect Disputed Vehicle Abandonment Site',
  ];

  for (let cIdx = 1; cIdx <= 35; cIdx++) {
    const caseRef = `CAS-2026-${cIdx.toString().padStart(4, '0')}`;
    const parentCase = seededCases[caseRef];
    // 1 to 3 tasks per case
    const numTasks = 1 + (cIdx % 3);

    for (let t = 1; t <= numTasks; t++) {
      taskCount++;
      const taskRef = `TSK-2026-${taskCount.toString().padStart(4, '0')}`;
      const title = taskTitles[(taskCount + t) % taskTitles.length];

      // Overdue scenario: first 8 tasks have past due date and are pending
      const isOverdue = taskCount <= 8;
      const isCompleted = taskCount > 8 && taskCount <= 25;
      const isCancelled = taskCount > 55;

      const dueDate = isOverdue
        ? new Date(Date.now() - (taskCount * 86400000))
        : new Date(Date.now() + ((taskCount % 7) + 1) * 86400000);

      const status = isCompleted
        ? TaskStatus.COMPLETED
        : isCancelled
        ? TaskStatus.CANCELLED
        : isOverdue
        ? TaskStatus.PENDING
        : TaskStatus.IN_PROGRESS;

      await prisma.investigationTask.upsert({
        where: { taskReference: taskRef },
        update: {
          title,
          status,
          dueDate,
          outcomeNotes: isCompleted ? 'Task actions fully executed; findings documented in case docket.' : (isCancelled ? 'Task cancelled due to priority shift.' : null),
          completedAt: isCompleted ? new Date() : null,
        },
        create: {
          taskReference: taskRef,
          caseId: parentCase.id,
          assignedUserId: users['officer.sharma@tracegrid.local'].id,
          title,
          description: `Detailed operational instructions for task ${taskRef} on case ${parentCase.caseReference}.`,
          dueDate,
          priority: isOverdue ? Priority.CRITICAL : Priority.MEDIUM,
          status,
          outcomeNotes: isCompleted ? 'Task actions fully executed; findings documented in case docket.' : (isCancelled ? 'Task cancelled due to priority shift.' : null),
          completedAt: isCompleted ? new Date() : null,
        },
      });
    }
  }

  console.log(`✅ Upserted ${taskCount} Investigation Tasks (including 8 overdue tasks)`);

  // ----------------------------------------------------------------------------
  // 7. Evidence Items & Attachments (~45 Evidence Items)
  // ----------------------------------------------------------------------------
  let evidenceCount = 0;
  const evidenceTypes = [
    EvidenceType.CCTV_FOOTAGE,
    EvidenceType.DIGITAL_IMAGE,
    EvidenceType.DOCUMENT,
    EvidenceType.PHYSICAL,
    EvidenceType.TRANSCRIPT,
    EvidenceType.FORENSIC_REPORT,
  ];

  for (let cIdx = 1; cIdx <= 35; cIdx++) {
    const caseRef = `CAS-2026-${cIdx.toString().padStart(4, '0')}`;
    const parentCase = seededCases[caseRef];
    // 1 or 2 evidence items per case
    const numEvidence = (cIdx % 3 === 0) ? 2 : 1;

    for (let e = 1; e <= numEvidence; e++) {
      evidenceCount++;
      const evdRef = `EVD-2026-${evidenceCount.toString().padStart(4, '0')}`;
      const evdType = evidenceTypes[(evidenceCount + e) % evidenceTypes.length];

      const item = await prisma.evidenceItem.upsert({
        where: { evidenceReference: evdRef },
        update: {
          title: `Evidentiary Record ${evdRef}`,
          evidenceType: evdType,
        },
        create: {
          evidenceReference: evdRef,
          caseId: parentCase.id,
          evidenceType: evdType,
          title: `Evidentiary Item ${evdRef}`,
          description: `Cataloged evidentiary record for investigation ${parentCase.caseReference}.`,
          sourceProvenance: `Collected by primary officer under standard chain of custody protocol.`,
          accessClassification: evidenceCount % 5 === 0 ? AccessClassification.CONFIDENTIAL : AccessClassification.INTERNAL,
          isVerified: true,
          recordedAt: new Date(parentCase.reportedAt.getTime() + e * 7200000),
        },
      });

      // Add attachment metadata for first 30 evidence records
      if (evidenceCount <= 30) {
        const storageKey = `f47ac10b-58cc-4372-a567-${evidenceCount.toString().padStart(12, '0')}.dat`;
        await prisma.attachment.upsert({
          where: { storageKey },
          update: {},
          create: {
            evidenceItemId: item.id,
            storageKey,
            originalFileName: `evidence_doc_${evidenceCount}.pdf`,
            mimeType: 'application/pdf',
            fileSizeBytes: BigInt(204800 + evidenceCount * 1024),
            sha256Checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          },
        });
      }
    }
  }

  console.log(`✅ Upserted ${evidenceCount} Evidence Items & Attachments`);

  // ----------------------------------------------------------------------------
  // 8. Location Observations (45 Observations)
  // ----------------------------------------------------------------------------
  let obsCount = 0;
  for (let cIdx = 1; cIdx <= 15; cIdx++) {
    const caseRef = `CAS-2026-${cIdx.toString().padStart(4, '0')}`;
    const parentCase = seededCases[caseRef];

    for (let o = 1; o <= 3; o++) {
      obsCount++;
      const isTelco = o === 2;
      const isPos = o === 3;
      const obsType = isTelco
        ? ObservationType.SYNTHETIC_TELCO_CELL
        : isPos
        ? ObservationType.SYNTHETIC_POS_TRANSACTION
        : ObservationType.WITNESS_SIGHTING;

      const desc = isTelco
        ? '[SIMULATED] Mobile-network cellular tower Sector-4 observation.'
        : isPos
        ? '[SIMULATED] Bank card point-of-sale transaction record.'
        : 'Witness observation recorded during field canvassing.';

      const id = `00000002-0000-4000-8000-${obsCount.toString().padStart(12, '0')}`;

      await prisma.locationObservation.upsert({
        where: { id },
        update: {},
        create: {
          id,
          caseId: parentCase.id,
          observationType: obsType,
          sourceDescription: desc,
          latitude: baseLat + (obsCount * 0.002),
          longitude: baseLng + (obsCount * 0.002),
          locationUncertaintyMeters: isTelco ? 1500.0 : (isPos ? 50.0 : 200.0),
          observedAt: new Date(parentCase.reportedAt.getTime() + o * 3600000),
          verificationStatus: LeadStatus.ASSIGNED,
          reliabilityScore: isPos ? 0.95 : (isTelco ? 0.70 : 0.60),
        },
      });
    }
  }

  console.log(`✅ Upserted ${obsCount} Location Observations`);

  // ----------------------------------------------------------------------------
  // 9. Illustrative Search Zone Hypotheses (3 Hypotheses)
  // ----------------------------------------------------------------------------
  const hypoCase = seededCases['CAS-2026-0001'];
  const hypoAdmin = users['supervisor.roy@tracegrid.local'];

  const samplePolygon = {
    type: 'Feature',
    properties: {
      bufferMeters: 500,
      mode: 'PEDESTRIAN_SEARCH_ZONE',
    },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [77.2000, 28.6100],
          [77.2200, 28.6100],
          [77.2200, 28.6250],
          [77.2000, 28.6250],
          [77.2000, 28.6100],
        ],
      ],
    },
  };

  await prisma.searchZoneHypothesis.upsert({
    where: { id: '00000003-0000-4000-8000-000000000001' },
    update: {},
    create: {
      id: '00000003-0000-4000-8000-000000000001',
      caseId: hypoCase.id,
      title: 'Pedestrian Dispersal Zone — North Campus Environs',
      supportingObservationIds: [],
      excludedObservationIds: [],
      geometryGeojson: samplePolygon,
      calculationMethod: 'TEMPORAL_BUFFER_CONVEX_HULL_V1',
      assumptions: [
        'Assumes normal walking speed of 4.5 km/h from last-seen point.',
        'Buffer expands radially up to 6 hours elapsed time.',
      ],
      humanReadableRationale: 'Candidate boundary estimated around Central Library and adjacent transit routes.',
      uncertaintyRepresentation: 'Decision-support polygon; does not guarantee physical presence within boundary.',
      createdByUserId: hypoAdmin.id,
      isActive: true,
    },
  });

  console.log(`✅ Upserted illustrative SearchZoneHypothesis`);

  // ----------------------------------------------------------------------------
  // 10. Audit Logs (Initial Operational Audit Trail)
  // ----------------------------------------------------------------------------
  await prisma.auditLog.upsert({
    where: { id: '00000004-0000-4000-8000-000000000001' },
    update: {},
    create: {
      id: '00000004-0000-4000-8000-000000000001',
      actorUserId: users['supervisor.roy@tracegrid.local'].id,
      action: 'CASE_CLOSED',
      entityType: 'investigation_cases',
      entityId: seededCases['CAS-2026-0004'].id,
      caseId: seededCases['CAS-2026-0004'].id,
      previousStateJson: { caseState: 'OPEN', tracingOutcome: 'LOCATED_VERIFICATION_PENDING' },
      newStateJson: { caseState: 'CLOSED', tracingOutcome: 'TRACED_VERIFIED' },
      reason: 'Subject verified in-person by local officers in Jaipur; formal closure approved.',
      ipAddress: '127.0.0.1',
      userAgent: 'TraceGrid Seeder Script v1.0',
    },
  });

  console.log('✅ Upserted Audit Log records');
  console.log('🎉 Seeding successfully completed!');
}

main()
  .catch((e) => {
    console.error('❌ Seeder execution error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
