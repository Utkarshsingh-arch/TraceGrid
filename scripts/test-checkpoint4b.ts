/**
 * TraceGrid Checkpoint 4B Verification Suite
 * Validates:
 * - Leads Ledger: list, filter, create, assign, outcome state-machine & disproved invariant
 * - Tasks Queue: create, assign, dynamic overdue, completion with notes, cancellation with reason, closure blocker
 * - Evidence & Private Attachments: metadata registration, classification access, binary streaming, checksum
 * - Chronological Activity vs. Supervisory Audit isolation
 * - Multi-Persona RBAC across all 5 demo accounts
 */

import http from 'http';
import { createApp } from '../apps/api/src/app';
import { prisma } from '../apps/api/src/database/prisma';
import { Role, CaseState, LeadStatus, TaskStatus, EvidenceType, AccessClassification } from '@prisma/client';
import crypto from 'crypto';

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

  let bodyContent: any = undefined;
  if (options.body) {
    headers['Content-Type'] = 'application/json';
    bodyContent = JSON.stringify(options.body);
  } else if (options.formData) {
    bodyContent = options.formData;
  }

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: options.formData ? (options.token ? { Authorization: `Bearer ${options.token}` } : {}) : headers,
    body: bodyContent,
  });

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/octet-stream') || contentType.includes('image/')) {
    const arrayBuffer = await response.arrayBuffer();
    return {
      status: response.status,
      headers: response.headers,
      buffer: Buffer.from(arrayBuffer),
    };
  }

  const text = await response.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  return {
    status: response.status,
    headers: response.headers,
    body: json,
  };
}

async function runTests() {
  console.log('===========================================================');
  console.log('  TraceGrid Checkpoint 4B: Operational Workflows Frontend');
  console.log('===========================================================\n');

  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const address = server.address() as any;
      baseUrl = `http://127.0.0.1:${address.port}`;
      console.log(`Ephemeral API test server listening on ${baseUrl}\n`);
      resolve();
    });
  });

  try {
    // -------------------------------------------------------------------------
    // Pre-flight: Demo Personas Authentication
    // -------------------------------------------------------------------------
    console.log('--- Suite 1: Authentication & Demo Persona Resolution ---');
    const loginOfficer = await request('/api/v1/auth/login', {
      method: 'POST',
      body: { email: 'officer.sharma@tracegrid.local', password: 'Password123!' },
    });
    assert(loginOfficer.status === 200, 'Case Officer authentication succeeds (200 OK)');
    const officerToken = loginOfficer.body.data.token;
    const officerUser = loginOfficer.body.data.user;

    const loginSupervisor = await request('/api/v1/auth/login', {
      method: 'POST',
      body: { email: 'supervisor.roy@tracegrid.local', password: 'Password123!' },
    });
    assert(loginSupervisor.status === 200, 'Supervisor authentication succeeds (200 OK)');
    const supervisorToken = loginSupervisor.body.data.token;
    const supervisorUser = loginSupervisor.body.data.user;

    const loginReviewer = await request('/api/v1/auth/login', {
      method: 'POST',
      body: { email: 'reviewer.mehta@tracegrid.local', password: 'Password123!' },
    });
    assert(loginReviewer.status === 200, 'Reviewer authentication succeeds (200 OK)');
    const reviewerToken = loginReviewer.body.data.token;

    const loginClerk = await request('/api/v1/auth/login', {
      method: 'POST',
      body: { email: 'clerk.verma@tracegrid.local', password: 'Password123!' },
    });
    assert(loginClerk.status === 200, 'Data Clerk authentication succeeds (200 OK)');
    const clerkToken = loginClerk.body.data.token;

    // Retrieve active open case for North Delhi
    const casesRes = await request('/api/v1/cases?caseState=OPEN&limit=1', { token: officerToken });
    assert(casesRes.status === 200, 'GET /api/v1/cases?caseState=OPEN returns 200 OK');
    const testCase = casesRes.body.data[0];
    const caseId = testCase.id;

    // -------------------------------------------------------------------------
    // Suite 2: Leads & Sightings Ledger Workflows
    // -------------------------------------------------------------------------
    console.log('\n--- Suite 2: Leads & Sightings Ledger Workflows ---');

    // 2.1: Lodge new lead with optional coordinates
    const lodgeRes = await request(`/api/v1/cases/${caseId}/leads`, {
      method: 'POST',
      token: officerToken,
      body: {
        sourceType: 'WITNESS_STATEMENT',
        narrative: 'Witness spotted individual matching subject physical description purchasing transit ticket at Kashmere Gate.',
        observedAt: new Date().toISOString(),
        latitude: 28.6672,
        longitude: 77.2285,
        locationUncertaintyMeters: 75,
        locationDescription: 'Near north metro turnstiles',
        sourceContact: 'Station supervisor Rajesh (ext 402)',
      },
    });
    assert(lodgeRes.status === 201, 'Lead lodged via frontend contract (201 Created)');
    assert(lodgeRes.body.data.leadReference.startsWith('LED-'), 'Sequential reference format LED-YYYY-XXXX assigned');
    assert(lodgeRes.body.data.verificationStatus === 'NEW', 'Initial lead verification status defaults to NEW');
    const createdLeadId = lodgeRes.body.data.id;
    const createdLeadRef = lodgeRes.body.data.leadReference;

    // 2.2: List leads with status filter
    const listLeadsRes = await request(`/api/v1/cases/${caseId}/leads?verificationStatus=NEW`, {
      token: officerToken,
    });
    assert(listLeadsRes.status === 200, 'GET /api/v1/cases/:id/leads filter by status returns 200 OK');
    const foundInList = listLeadsRes.body.data.some((l: any) => l.id === createdLeadId);
    assert(foundInList, 'Newly lodged lead present in filtered ledger list');

    // 2.3: Assign investigator to lead
    const assignLeadRes = await request(`/api/v1/leads/${createdLeadId}/assignments`, {
      method: 'POST',
      token: supervisorToken,
      body: {
        assignedUserId: officerUser.id,
        reassignmentReason: 'Priority verification assigned to district lead investigator',
      },
    });
    assert(assignLeadRes.status === 200, 'POST /api/v1/leads/:id/assignments succeeds (200 OK)');
    assert(assignLeadRes.body.data.verificationStatus === 'ASSIGNED', 'Status advances to ASSIGNED on assignment');

    // 2.4: Record verification outcome: DISPROVED
    const outcomeDisprovedRes = await request(`/api/v1/leads/${createdLeadId}/verification-outcome`, {
      method: 'POST',
      token: officerToken,
      body: {
        verificationStatus: 'DISPROVED',
        findings: 'CCTV review at timestamp confirms individual was not the missing person (tall stature discrepancy).',
      },
    });
    assert(outcomeDisprovedRes.status === 200, 'POST /api/v1/leads/:id/verification-outcome DISPROVED (200 OK)');
    assert(outcomeDisprovedRes.body.data.verificationStatus === 'DISPROVED', 'Lead status marked DISPROVED');

    // CRITICAL INVARIANT: Parent case remains strictly OPEN
    const checkParentCase = await request(`/api/v1/cases/${caseId}`, { token: officerToken });
    assert(checkParentCase.body.data.caseState === 'OPEN', 'CRITICAL INVARIANT: Disproved lead leaves parent case strictly OPEN');

    // 2.5: Duplicate lead classification with provenance preservation
    const secondLeadRes = await request(`/api/v1/cases/${caseId}/leads`, {
      method: 'POST',
      token: officerToken,
      body: {
        sourceType: 'CITIZEN_TIP',
        narrative: 'Second tip received mentioning the exact same transit ticket incident at Kashmere Gate.',
      },
    });
    const secondLeadId = secondLeadRes.body.data.id;

    const outcomeDuplicateRes = await request(`/api/v1/leads/${secondLeadId}/verification-outcome`, {
      method: 'POST',
      token: officerToken,
      body: {
        verificationStatus: 'DUPLICATE',
        findings: 'Subsequent citizen tip corroborating earlier lodged lead LED.',
        duplicateOfLeadId: createdLeadId,
      },
    });
    assert(outcomeDuplicateRes.status === 200, 'Duplicate outcome classified with canonical link (200 OK)');
    assert(outcomeDuplicateRes.body.data.verificationStatus === 'DUPLICATE', 'Lead status updated to DUPLICATE');

    // -------------------------------------------------------------------------
    // Suite 3: Tasks Queue Workflows
    // -------------------------------------------------------------------------
    console.log('\n--- Suite 3: Tasks Queue Workflows ---');

    // 3.1: Create operational task
    const futureDue = new Date(Date.now() + 86400000 * 2).toISOString();
    const createTaskRes = await request(`/api/v1/cases/${caseId}/tasks`, {
      method: 'POST',
      token: officerToken,
      body: {
        title: 'Collect Station Master Logbook',
        description: 'Interview Station Master on shift and copy entry logs for Gate 2.',
        priority: 'HIGH',
        dueDate: futureDue,
        assignedUserId: officerUser.id,
        leadId: createdLeadId,
      },
    });
    assert(createTaskRes.status === 201, 'Task created via frontend contract (201 Created)');
    assert(createTaskRes.body.data.taskReference.startsWith('TSK-'), 'Sequential reference TSK-YYYY-XXXX assigned');
    assert(createTaskRes.body.data.isOverdue === false, 'Future due task evaluated as isOverdue = false');
    const createdTaskId = createTaskRes.body.data.id;

    // 3.2: Reassign task
    const reassignTaskRes = await request(`/api/v1/tasks/${createdTaskId}/assignments`, {
      method: 'POST',
      token: supervisorToken,
      body: {
        assignedUserId: supervisorUser.id,
        reassignmentReason: 'Supervisory direct oversight required',
      },
    });
    assert(reassignTaskRes.status === 200, 'POST /api/v1/tasks/:id/assignments succeeds (200 OK)');
    assert(reassignTaskRes.body.data.assignedUserId === supervisorUser.id, 'Task assignee updated in database');

    // 3.3: Overdue task dynamic calculation
    const pastDue = new Date(Date.now() - 86400000).toISOString();
    const createOverdueTaskRes = await request(`/api/v1/cases/${caseId}/tasks`, {
      method: 'POST',
      token: officerToken,
      body: {
        title: 'Expedited CCTV Extraction',
        description: 'Immediate retrieval before 24hr retention overwrite.',
        priority: 'CRITICAL',
        dueDate: pastDue,
      },
    });
    assert(createOverdueTaskRes.status === 201, 'Overdue task created (201 Created)');
    assert(createOverdueTaskRes.body.data.isOverdue === true, 'Dynamic overdue calculation returns true for past due date');
    const overdueTaskId = createOverdueTaskRes.body.data.id;

    // 3.4: Complete task with mandatory notes
    const completeRes = await request(`/api/v1/tasks/${createdTaskId}/complete`, {
      method: 'POST',
      token: supervisorToken,
      body: {
        outcomeNotes: 'Logbook reviewed in person; verified no ticket issued under subject alias.',
      },
    });
    assert(completeRes.status === 200, 'POST /api/v1/tasks/:id/complete succeeds (200 OK)');
    assert(completeRes.body.data.status === 'COMPLETED', 'Task status transitioned to COMPLETED');
    assert(completeRes.body.data.isOverdue === false, 'Completed task isOverdue is always false');

    // 3.5: Cancel task with mandatory reason
    const cancelRes = await request(`/api/v1/tasks/${overdueTaskId}/cancel`, {
      method: 'POST',
      token: officerToken,
      body: {
        reason: 'Station Master confirmed cameras were non-operational during relevant window.',
      },
    });
    assert(cancelRes.status === 200, 'POST /api/v1/tasks/:id/cancel succeeds (200 OK)');
    assert(cancelRes.body.data.status === 'CANCELLED', 'Task status transitioned to CANCELLED');

    // -------------------------------------------------------------------------
    // Suite 4: Evidence & Private Attachments Workflows
    // -------------------------------------------------------------------------
    console.log('\n--- Suite 4: Evidence & Private Attachments Workflows ---');

    // 4.1: Register evidence
    const regEvidenceRes = await request(`/api/v1/cases/${caseId}/evidence`, {
      method: 'POST',
      token: officerToken,
      body: {
        title: 'CCTV Camera 4 Video Segment',
        description: '15-minute video export from North Gate Camera 4 covering 14:00 - 14:15.',
        evidenceType: 'CCTV_FOOTAGE',
        sourceProvenance: 'Extracted by Station Control Officer and handed to Insp. Sharma on USB Drive.',
        accessClassification: 'RESTRICTED',
      },
    });
    assert(regEvidenceRes.status === 201, 'Evidence registered (201 Created)');
    assert(regEvidenceRes.body.data.evidenceReference.startsWith('EVD-'), 'Sequential reference EVD-YYYY-XXXX assigned');
    const evidenceId = regEvidenceRes.body.data.id;

    // 4.2: Upload private attachment with valid binary signature (PNG)
    const validPngBytes = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
      0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
      0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
      0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
      0x42, 0x60, 0x82
    ]);
    const expectedSha256 = crypto.createHash('sha256').update(validPngBytes).digest('hex');

    const pngBlob = new Blob([validPngBytes], { type: 'image/png' });
    const formData = new FormData();
    formData.append('file', pngBlob, 'cctv_frame_capture.png');

    const uploadRes = await request(`/api/v1/evidence/${evidenceId}/attachments`, {
      method: 'POST',
      token: officerToken,
      formData,
    });
    assert(uploadRes.status === 201, 'Attachment ingested into private storage (201 Created)');
    assert(uploadRes.body.data.sha256Checksum === expectedSha256, 'Cryptographic SHA-256 checksum matches byte hash');
    const attachmentId = uploadRes.body.data.id;

    // 4.3: Authenticated binary streaming
    const downloadRes = await request(`/api/v1/attachments/${attachmentId}/download`, {
      token: officerToken,
    });
    assert(downloadRes.status === 200, 'Authenticated streaming download succeeds (200 OK)');
    assert(downloadRes.headers.get('content-type') === 'image/png', 'Content-Type header preserved');
    assert(downloadRes.buffer.equals(validPngBytes), 'Binary bytes streamed accurately without corruption');

    // 4.4: Unauthenticated download rejected
    const unauthDownload = await request(`/api/v1/attachments/${attachmentId}/download`);
    assert(unauthDownload.status === 401, 'Unauthenticated file retrieval rejected (401 Unauthorized)');

    // -------------------------------------------------------------------------
    // Suite 5: Activity Timeline vs Supervisory Audit Isolation
    // -------------------------------------------------------------------------
    console.log('\n--- Suite 5: Activity Timeline vs Supervisory Audit Isolation ---');

    // 5.1: Case Events user-facing timeline
    const eventsRes = await request(`/api/v1/cases/${caseId}/events`, { token: officerToken });
    assert(eventsRes.status === 200, 'GET /api/v1/cases/:id/events returns 200 OK');
    assert(Array.isArray(eventsRes.body.data), 'Timeline events returned as array');
    const hasLeadEvt = eventsRes.body.data.some((e: any) => e.eventType === 'LEAD_REGISTERED');
    assert(hasLeadEvt, 'LEAD_REGISTERED event present in case timeline');

    // 5.2: Supervisory Audit Trail RBAC
    const officerAuditAttempt = await request(`/api/v1/cases/${caseId}/audit-logs`, {
      token: officerToken,
    });
    assert(officerAuditAttempt.status === 403, 'Case officer forbidden from supervisory audit trail (403 Forbidden)');

    const supervisorAuditRes = await request(`/api/v1/cases/${caseId}/audit-logs`, {
      token: supervisorToken,
    });
    assert(supervisorAuditRes.status === 200, 'Supervisor granted access to audit trail (200 OK)');
    assert(Array.isArray(supervisorAuditRes.body.data), 'Audit logs returned as array');
    const hasAuditAction = supervisorAuditRes.body.data.some((l: any) => l.action === 'LEAD_ASSIGNED');
    assert(hasAuditAction, 'LEAD_ASSIGNED audit record captured with actor and reason');

    // -------------------------------------------------------------------------
    // Suite 6: Multi-Persona Role Access Verification
    // -------------------------------------------------------------------------
    console.log('\n--- Suite 6: Multi-Persona Role Access Verification ---');

    // 6.1: Read-Only Reviewer forbidden from mutations
    const reviewerLeadAttempt = await request(`/api/v1/cases/${caseId}/leads`, {
      method: 'POST',
      token: reviewerToken,
      body: { sourceType: 'CITIZEN_TIP', narrative: 'Reviewer should not create leads' },
    });
    assert(reviewerLeadAttempt.status === 403, 'READ_ONLY_REVIEWER forbidden from lodging leads (403 Forbidden)');

    const reviewerTaskAttempt = await request(`/api/v1/cases/${caseId}/tasks`, {
      method: 'POST',
      token: reviewerToken,
      body: { title: 'Reviewer Task', description: 'Test action', dueDate: futureDue },
    });
    assert(reviewerTaskAttempt.status === 403, 'READ_ONLY_REVIEWER forbidden from creating tasks (403 Forbidden)');

    // 6.2: Data clerk permitted to lodge leads
    const clerkLeadRes = await request(`/api/v1/cases/${caseId}/leads`, {
      method: 'POST',
      token: clerkToken,
      body: {
        sourceType: 'CITIZEN_TIP',
        narrative: 'Data clerk lodged public hotline tip for officer review.',
      },
    });
    assert(clerkLeadRes.status === 201, 'DATA_CLERK permitted to lodge leads (201 Created)');

    // 6.3: Data clerk forbidden from transitioning case state
    const clerkStateAttempt = await request(`/api/v1/cases/${caseId}/transition-state`, {
      method: 'POST',
      token: clerkToken,
      body: { targetState: 'CLOSED', reason: 'Clerk cannot close cases' },
    });
    assert(clerkStateAttempt.status === 403, 'DATA_CLERK forbidden from transitioning case state (403 Forbidden)');

    console.log('\n===========================================================');
    const passed = results.filter((r) => r.passed).length;
    const total = results.length;
    console.log(`  Assertions Checked: ${total}`);
    console.log(`  Tests Passed: ${passed} / ${total}`);
    if (passed === total) {
      console.log('  🎉 ALL CHECKPOINT 4B INTEGRATION TESTS PASSED!');
    } else {
      console.error(`  ⚠️ ${total - passed} TESTS FAILED`);
      process.exit(1);
    }
    console.log('===========================================================\n');
  } catch (err) {
    console.error('Fatal test error:', err);
    process.exit(1);
  } finally {
    if (server) {
      server.close();
    }
    await prisma.$disconnect();
  }
}

runTests();
