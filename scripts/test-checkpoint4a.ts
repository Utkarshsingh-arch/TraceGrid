/**
 * TraceGrid Checkpoint 4A Automated Integration & Verification Suite
 * Validates:
 * - Lead & Sighting lifecycle, verification outcomes, duplicate handling, and parent case invariants
 * - Investigation Task lifecycle, cross-case lead validation, dynamic overdue calculations, case closure invariants
 * - Evidence metadata registration, access classifications, and provenance protection
 * - Private attachment storage, file signature validation, checksum verification, and authorized streaming
 * - Separation between user-facing event timeline and restricted supervisory audit trail
 */

import http from 'http';
import crypto from 'crypto';
import { createApp } from '../apps/api/src/app';
import { prisma } from '../apps/api/src/database/prisma';
import { 
  Role, 
  LeadStatus, 
  LeadSource, 
  TaskStatus, 
  Priority, 
  EvidenceType, 
  AccessClassification, 
  CaseState,
  EventType 
} from '@prisma/client';

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

async function request(path: string, options: { 
  method?: string; 
  token?: string; 
  body?: any;
  formData?: FormData;
} = {}) {
  const url = `${baseUrl}${path}`;
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };

  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  let requestBody: any = undefined;

  if (options.formData) {
    // Let fetch handle multipart headers and boundary
    requestBody = options.formData;
  } else if (options.body) {
    headers['Content-Type'] = 'application/json';
    requestBody = JSON.stringify(options.body);
  }

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: requestBody,
  });

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const json = await response.json();
    return {
      status: response.status,
      ok: response.ok,
      headers: response.headers,
      body: json,
    };
  }

  const arrayBuffer = await response.arrayBuffer();
  return {
    status: response.status,
    ok: response.ok,
    headers: response.headers,
    buffer: Buffer.from(arrayBuffer),
  };
}

async function runTests() {
  console.log('===========================================================');
  console.log('  TraceGrid Checkpoint 4A: Leads, Tasks, Evidence & Audits');
  console.log('===========================================================\n');

  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address() as any;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });

  console.log(`Ephemeral API test server listening on ${baseUrl}\n`);

  try {
    // ------------------------------------------------------------------------
    // SETUP: Authenticate Demo Users
    // ------------------------------------------------------------------------
    const loginUser = async (email: string) => {
      const res = await request('/api/v1/auth/login', {
        method: 'POST',
        body: { email, password: 'Password123!' },
      });
      return res.body.data.token;
    };

    const officerToken = await loginUser('officer.sharma@tracegrid.local');      // North District Officer
    const supervisorToken = await loginUser('supervisor.roy@tracegrid.local');    // North District Supervisor
    const clerkToken = await loginUser('clerk.verma@tracegrid.local');            // North District Clerk
    const adminToken = await loginUser('admin.root@tracegrid.local');             // Global Admin
    const reviewerToken = await loginUser('reviewer.mehta@tracegrid.local');       // North District Reviewer

    const northJur = await prisma.jurisdiction.findUniqueOrThrow({ where: { code: 'JUR-DEL-NORTH' } });
    const southJur = await prisma.jurisdiction.findUniqueOrThrow({ where: { code: 'JUR-DEL-SOUTH' } });

    // Target North District Case
    const targetCase = await prisma.investigationCase.findFirstOrThrow({
      where: {
        jurisdictionId: northJur.id,
        caseState: CaseState.OPEN,
      },
    });

    // South District Case for Cross-Jurisdiction Rejection
    const crossCase = await prisma.investigationCase.findFirstOrThrow({
      where: {
        jurisdictionId: southJur.id,
      },
    });

    // ------------------------------------------------------------------------
    // SUITE 1: Lead Management & Invariant Verification
    // ------------------------------------------------------------------------
    console.log('--- Suite 1: Lead & Sighting Management ---');

    // 1.1: Lodge new lead
    const createLeadRes = await request(`/api/v1/cases/${targetCase.id}/leads`, {
      method: 'POST',
      token: officerToken,
      body: {
        sourceType: LeadSource.WITNESS_STATEMENT,
        sourceContact: 'Rahul M. (+91 98110 22334)',
        narrative: 'Witness observed a person matching subject description purchasing a prepaid transit card at Kashmere Gate metro station.',
        observedAt: new Date(Date.now() - 3600 * 1000 * 2).toISOString(),
        latitude: 28.6675,
        longitude: 77.2285,
        locationUncertaintyMeters: 50.0,
        locationDescription: 'Kashmere Gate Metro Gate 2 Ticket Counter',
      },
    });
    assert(createLeadRes.status === 201, 'Lead registered successfully (201 Created)');
    assert(createLeadRes.body.data.leadReference.startsWith('LED-'), 'Lead reference format verified (LED-YYYY-XXXX)');
    assert(createLeadRes.body.data.verificationStatus === LeadStatus.NEW, 'Initial lead status defaults to NEW');
    const createdLeadId = createLeadRes.body.data.id;

    // Verify linked observation created
    const linkedObs = await prisma.locationObservation.findFirst({
      where: { leadId: createdLeadId },
    });
    assert(!!linkedObs, 'Spatial observation created and linked to lead atomically');

    // 1.2: Cross-jurisdiction lead creation rejected
    const crossLeadRes = await request(`/api/v1/cases/${crossCase.id}/leads`, {
      method: 'POST',
      token: officerToken,
      body: {
        sourceType: LeadSource.CITIZEN_TIP,
        narrative: 'Attempted lead registration in unauthorized jurisdiction',
      },
    });
    assert(crossLeadRes.status === 403, 'Cross-jurisdiction lead lodgement rejected (403 Forbidden)');

    // 1.3: List leads for case
    const listLeadsRes = await request(`/api/v1/cases/${targetCase.id}/leads?limit=10`, {
      token: officerToken,
    });
    assert(listLeadsRes.status === 200, 'GET /api/v1/cases/:caseId/leads returns 200 OK');
    assert(Array.isArray(listLeadsRes.body.data), 'Leads returned as array');
    assert(listLeadsRes.body.data.some((l: any) => l.id === createdLeadId), 'Newly lodged lead present in listing');

    // 1.4: Update permitted metadata
    const updateLeadRes = await request(`/api/v1/leads/${createdLeadId}`, {
      method: 'PATCH',
      token: officerToken,
      body: {
        locationDescription: 'Kashmere Gate Metro Gate 2 Ticket Counter (Updated CCTV angle confirmed)',
      },
    });
    assert(updateLeadRes.status === 200, 'Permitted lead metadata update succeeds (200 OK)');
    assert(
      updateLeadRes.body.data.locationDescription.includes('Updated CCTV angle confirmed'),
      'Lead metadata change persisted'
    );

    // 1.5: Assign lead to investigator
    const assignLeadRes = await request(`/api/v1/leads/${createdLeadId}/assignments`, {
      method: 'POST',
      token: supervisorToken,
      body: {
        assignedUserId: (await prisma.user.findFirstOrThrow({ where: { role: Role.CASE_OFFICER, jurisdictionId: northJur.id } })).id,
        reassignmentReason: 'Priority witness interview dispatch',
      },
    });
    assert(assignLeadRes.status === 200, 'Lead assigned to officer by supervisor (200 OK)');
    assert(assignLeadRes.body.data.verificationStatus === LeadStatus.ASSIGNED, 'Lead status advances to ASSIGNED');

    // 1.6: Record Verification Outcome: DISPROVED
    // CRITICAL INVARIANT: Disproved lead must NEVER close or alter the parent investigation case
    const parentCaseBefore = await prisma.investigationCase.findUniqueOrThrow({ where: { id: targetCase.id } });
    assert(parentCaseBefore.caseState === CaseState.OPEN, 'Pre-condition: Parent case is OPEN');

    const disproveLeadRes = await request(`/api/v1/leads/${createdLeadId}/verification-outcome`, {
      method: 'POST',
      token: officerToken,
      body: {
        verificationStatus: LeadStatus.DISPROVED,
        findings: 'CCTV footage audited: subject in question verified as unrelated commuter. Physical description disproved.',
      },
    });
    assert(disproveLeadRes.status === 200, 'Lead outcome updated to DISPROVED (200 OK)');

    const parentCaseAfter = await prisma.investigationCase.findUniqueOrThrow({ where: { id: targetCase.id } });
    assert(
      parentCaseAfter.caseState === CaseState.OPEN,
      'CRITICAL INVARIANT VERIFIED: Disproving a lead leaves parent case strictly OPEN'
    );

    // 1.7: Duplicate reports grouping preserves original provenance
    const lead2Res = await request(`/api/v1/cases/${targetCase.id}/leads`, {
      method: 'POST',
      token: clerkToken,
      body: {
        sourceType: LeadSource.CITIZEN_TIP,
        narrative: 'Second citizen reporting sighting at metro station',
      },
    });
    const lead2Id = lead2Res.body.data.id;

    const duplicateOutcomeRes = await request(`/api/v1/leads/${lead2Id}/verification-outcome`, {
      method: 'POST',
      token: officerToken,
      body: {
        verificationStatus: LeadStatus.DUPLICATE,
        duplicateOfLeadId: createdLeadId,
        findings: 'Duplicate report of metro sighting previously lodged.',
      },
    });
    assert(duplicateOutcomeRes.status === 200, 'Duplicate lead classified with cross-reference (200 OK)');

    // Verify original lead2 remains intact in DB
    const lead2InDb = await prisma.leadSighting.findUnique({ where: { id: lead2Id } });
    assert(
      lead2InDb !== null && lead2InDb.narrative.includes('Second citizen reporting'),
      'Provenance preserved: original duplicate lead record and narrative remain intact'
    );

    // ------------------------------------------------------------------------
    // SUITE 2: Investigation Task Management & Constraints
    // ------------------------------------------------------------------------
    console.log('\n--- Suite 2: Investigation Task Management ---');

    // 2.1: Create valid task linked to case
    const officerUser = await prisma.user.findFirstOrThrow({
      where: { role: Role.CASE_OFFICER, jurisdictionId: northJur.id },
    });

    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

    const createTaskRes = await request(`/api/v1/cases/${targetCase.id}/tasks`, {
      method: 'POST',
      token: officerToken,
      body: {
        title: 'Review Metro Station Platform CCTV',
        description: 'Obtain and review platform 1 & 2 CCTV footage for the 18:00 to 20:00 window.',
        dueDate: tomorrow,
        priority: Priority.HIGH,
        assignedUserId: officerUser.id,
        leadId: createdLeadId,
      },
    });
    assert(createTaskRes.status === 201, 'Task created successfully (201 Created)');
    assert(createTaskRes.body.data.taskReference.startsWith('TSK-'), 'Task reference format verified (TSK-YYYY-XXXX)');
    assert(createTaskRes.body.data.isOverdue === false, 'Future due date isOverdue evaluated as false');
    const taskId = createTaskRes.body.data.id;

    // 2.2: Cross-case lead linkage rejected
    // Attempting to link a lead belonging to crossCase to a task in targetCase
    const crossCaseLead = await prisma.leadSighting.findFirstOrThrow({
      where: { caseId: crossCase.id },
    });

    const invalidLinkTaskRes = await request(`/api/v1/cases/${targetCase.id}/tasks`, {
      method: 'POST',
      token: officerToken,
      body: {
        title: 'Cross Case Link Attempt',
        description: 'Attempting invalid lead cross linkage',
        dueDate: tomorrow,
        leadId: crossCaseLead.id, // Belong to South Case!
      },
    });
    assert(
      invalidLinkTaskRes.status === 400 && invalidLinkTaskRes.body.error.message.includes('belongs to a different investigation case'),
      'Cross-case task-lead linkage rejected with validation error (400 Bad Request)'
    );

    // 2.3: Dynamic Overdue Evaluation
    const overdueTaskRes = await request(`/api/v1/cases/${targetCase.id}/tasks`, {
      method: 'POST',
      token: officerToken,
      body: {
        title: 'Overdue Audit Inspection Task',
        description: 'Task with past due date to test dynamic evaluation',
        dueDate: yesterday, // Past due date!
        priority: Priority.MEDIUM,
      },
    });
    assert(overdueTaskRes.status === 201, 'Overdue test task lodged');
    assert(overdueTaskRes.body.data.isOverdue === true, 'Dynamic overdue calculation returns true for past due date');
    const overdueTaskId = overdueTaskRes.body.data.id;

    // 2.4: Case Closure Precondition & Resolution
    // Verify that attempting to close case while tasks are pending is rejected (409 Conflict)
    const prematureCloseRes = await request(`/api/v1/cases/${targetCase.id}/transition-state`, {
      method: 'POST',
      token: supervisorToken,
      body: {
        targetState: CaseState.CLOSED,
        reason: 'Attempted premature closure with pending tasks',
      },
    });
    assert(
      prematureCloseRes.status === 409 && prematureCloseRes.body.error.message.includes('outstanding tasks'),
      'Case closure rejected when pending/in-progress tasks exist (409 Conflict)'
    );

    // 2.5: Complete task with required outcome notes
    const completeTaskRes = await request(`/api/v1/tasks/${taskId}/complete`, {
      method: 'POST',
      token: officerToken,
      body: {
        outcomeNotes: 'Platform CCTV obtained and audited in full. No sightings detected.',
      },
    });
    assert(completeTaskRes.status === 200, 'Task marked COMPLETED with outcome notes (200 OK)');
    assert(completeTaskRes.body.data.status === TaskStatus.COMPLETED, 'Task status updated to COMPLETED');
    assert(completeTaskRes.body.data.isOverdue === false, 'Completed task isOverdue is false regardless of date');

    // 2.6: Cancel remaining task with required reason
    const cancelTaskRes = await request(`/api/v1/tasks/${overdueTaskId}/cancel`, {
      method: 'POST',
      token: supervisorToken,
      body: {
        reason: 'Superseded by physical witness verification',
      },
    });
    assert(cancelTaskRes.status === 200, 'Task marked CANCELLED with reason (200 OK)');

    // ------------------------------------------------------------------------
    // SUITE 3: Evidence Metadata & Private Attachments
    // ------------------------------------------------------------------------
    console.log('\n--- Suite 3: Evidence Metadata & Private Attachments ---');

    // 3.1: Register Evidence Metadata
    const createEvidenceRes = await request(`/api/v1/cases/${targetCase.id}/evidence`, {
      method: 'POST',
      token: officerToken,
      body: {
        title: 'Kashmere Gate Metro Gate 2 CCTV Footage',
        description: 'Digital video extract of gate 2 concourse between 18:30 and 19:15.',
        evidenceType: EvidenceType.CCTV_FOOTAGE,
        sourceProvenance: 'DMRC Station Security Office; Officer Sharma on duty.',
        accessClassification: AccessClassification.RESTRICTED,
        leadId: createdLeadId,
      },
    });
    assert(createEvidenceRes.status === 201, 'Evidence metadata registered (201 Created)');
    assert(createEvidenceRes.body.data.evidenceReference.startsWith('EVD-'), 'Evidence reference format verified (EVD-YYYY-XXXX)');
    const evidenceId = createEvidenceRes.body.data.id;

    // 3.2: Confidential evidence classification clearance enforcement
    const createConfidentialEvidenceRes = await request(`/api/v1/cases/${targetCase.id}/evidence`, {
      method: 'POST',
      token: officerToken, // Officer is not Supervisor or Admin!
      body: {
        title: 'Confidential Informant Debrief',
        description: 'Classified informant intelligence report',
        evidenceType: EvidenceType.DOCUMENT,
        sourceProvenance: 'Special Branch',
        accessClassification: AccessClassification.CONFIDENTIAL,
      },
    });
    assert(
      createConfidentialEvidenceRes.status === 403,
      'Confidential classification requires supervisor clearance (403 Forbidden)'
    );

    // 3.3: Upload Controlled Binary Attachment with Magic Bytes & Checksum
    // Synthetic valid PNG file: 89 50 4E 47 0D 0A 1A 0A followed by PNG IHDR chunk
    const validPngBytes = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG Signature
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR header
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 pixel
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
      0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
      0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
      0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
      0x42, 0x60, 0x82,
    ]);

    const expectedSha256 = crypto.createHash('sha256').update(validPngBytes).digest('hex');

    const formData = new FormData();
    const fileBlob = new Blob([validPngBytes], { type: 'image/png' });
    formData.append('file', fileBlob, 'metro_gate2_snapshot.png');

    const uploadRes = await request(`/api/v1/evidence/${evidenceId}/attachments`, {
      method: 'POST',
      token: officerToken,
      formData,
    });
    assert(uploadRes.status === 201, 'Attachment uploaded to private storage (201 Created)');
    assert(uploadRes.body.data.sha256Checksum === expectedSha256, 'SHA-256 checksum calculated and verified');
    assert(typeof uploadRes.body.data.fileSizeBytes === 'number', 'File size in bytes recorded');
    const attachmentId = uploadRes.body.data.id;

    // 3.4: Attachment Metadata endpoint never reveals server filesystem paths
    const metaRes = await request(`/api/v1/attachments/${attachmentId}`, { token: officerToken });
    assert(metaRes.status === 200, 'GET /api/v1/attachments/:id returns 200 OK');
    assert(!metaRes.body.data.storageKey.includes('\\') && !metaRes.body.data.storageKey.includes('/'), 'Storage key is an opaque UUID without filesystem paths');
    assert(metaRes.body.data.originalFileName === 'metro_gate2_snapshot.png', 'Original filename preserved');

    // 3.5: Stream attachment binary content after authentication
    const downloadRes = await request(`/api/v1/attachments/${attachmentId}/download`, {
      token: officerToken,
    });
    assert(downloadRes.status === 200, 'GET /api/v1/attachments/:id/download streams file (200 OK)');
    assert(downloadRes.headers.get('content-type') === 'image/png', 'Content-Type header preserved');
    assert(downloadRes.buffer.equals(validPngBytes), 'Streamed file bytes match uploaded file byte-for-byte');

    // 3.6: Unauthenticated attachment download rejected
    const unauthDownloadRes = await request(`/api/v1/attachments/${attachmentId}/download`);
    assert(unauthDownloadRes.status === 401, 'Unauthenticated attachment retrieval rejected (401 Unauthorized)');

    // 3.7: File size enforcement (fake oversized rejection test)
    const invalidSignatureBlob = new Blob([Buffer.from([0x00, 0x01, 0x02, 0x03])], { type: 'image/png' });
    const badForm = new FormData();
    badForm.append('file', invalidSignatureBlob, 'corrupted.png');
    const badUploadRes = await request(`/api/v1/evidence/${evidenceId}/attachments`, {
      method: 'POST',
      token: officerToken,
      formData: badForm,
    });
    assert(
      badUploadRes.status === 400 && badUploadRes.body.error.message.includes('PNG signature'),
      'File signature validation rejects corrupted magic bytes (400 Bad Request)'
    );

    // ------------------------------------------------------------------------
    // SUITE 4: Audit & Event Separation
    // ------------------------------------------------------------------------
    console.log('\n--- Suite 4: Timeline Events & Restricted Audit Trail ---');

    // 4.1: User-facing timeline retrieval
    const eventsRes = await request(`/api/v1/cases/${targetCase.id}/events`, {
      token: officerToken,
    });
    assert(eventsRes.status === 200, 'GET /api/v1/cases/:caseId/events returns 200 OK');
    assert(Array.isArray(eventsRes.body.data), 'Timeline events returned as array');
    assert(
      eventsRes.body.data.some((e: any) => e.eventType === EventType.LEAD_REGISTERED),
      'LEAD_REGISTERED recorded in case timeline'
    );
    assert(
      eventsRes.body.data.some((e: any) => e.eventType === EventType.TASK_COMPLETED),
      'TASK_COMPLETED recorded in case timeline'
    );
    assert(
      eventsRes.body.data.some((e: any) => e.eventType === EventType.EVIDENCE_LOGGED),
      'EVIDENCE_LOGGED recorded in case timeline'
    );

    // 4.2: Restricted Audit Log retrieval - Officer forbidden
    const officerAuditRes = await request(`/api/v1/cases/${targetCase.id}/audit-logs`, {
      token: officerToken,
    });
    assert(
      officerAuditRes.status === 403,
      'Case officer forbidden from accessing restricted supervisory audit logs (403 Forbidden)'
    );

    // 4.3: Restricted Audit Log retrieval - Supervisor authorized
    const supervisorAuditRes = await request(`/api/v1/cases/${targetCase.id}/audit-logs`, {
      token: supervisorToken,
    });
    assert(
      supervisorAuditRes.status === 200,
      'Supervisor granted access to tamper-evident audit logs (200 OK)'
    );
    assert(
      supervisorAuditRes.body.data.some((l: any) => l.action === 'ATTACHMENT_DOWNLOADED'),
      'ATTACHMENT_DOWNLOADED access event recorded in audit logs'
    );

    // ------------------------------------------------------------------------
    // SUITE 5: Case Workspace Integration Verification
    // ------------------------------------------------------------------------
    console.log('\n--- Suite 5: Case Workspace Aggregations ---');

    const caseWorkspaceRes = await request(`/api/v1/cases/${targetCase.id}`, {
      token: officerToken,
    });
    assert(caseWorkspaceRes.status === 200, 'GET /api/v1/cases/:id returns 200 OK');
    assert(Array.isArray(caseWorkspaceRes.body.data.leads), 'Leads summary included in case workspace');
    assert(Array.isArray(caseWorkspaceRes.body.data.tasks), 'Tasks summary included in case workspace');
    assert(Array.isArray(caseWorkspaceRes.body.data.evidence), 'Evidence summary included in case workspace');
    assert(
      caseWorkspaceRes.body.data.evidence.every((e: any) => !('attachments' in e) || !e.attachments?.some((a: any) => 'buffer' in a)),
      'Workspace response strictly excludes private file bytes'
    );

    // Print summary
    console.log('\n===========================================================');
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;
    console.log(`  Assertions Checked: ${results.length}`);
    console.log(`  Tests Passed: ${passed} / ${results.length}`);
    if (failed > 0) {
      console.error(`  ❌ ${failed} TEST(S) FAILED!`);
      process.exit(1);
    } else {
      console.log('  🎉 ALL CHECKPOINT 4A INTEGRATION TESTS PASSED!');
      console.log('===========================================================');
    }
  } finally {
    if (server) {
      server.close();
    }
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  if (server) server.close();
  process.exit(1);
});
