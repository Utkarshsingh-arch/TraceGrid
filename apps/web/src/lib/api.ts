/**
 * TraceGrid API Client Library
 * Authoritative interface between React Web Client and TraceGrid Express REST API.
 */

export type Role = 'SYSTEM_ADMIN' | 'SUPERVISOR' | 'CASE_OFFICER' | 'DATA_CLERK' | 'READ_ONLY_REVIEWER';

export type CaseState = 'REPORTED' | 'UNDER_REVIEW' | 'OPEN' | 'CLOSED';

export type TracingOutcome = 
  | 'NOT_TRACED' 
  | 'LOCATION_REPORTED' 
  | 'LOCATED_VERIFICATION_PENDING' 
  | 'TRACED_VERIFIED' 
  | 'OTHER_OUTCOME';

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type BiologicalSex = 'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN';

export type AssignmentRole = 'PRIMARY_OFFICER' | 'ASSISTING_OFFICER' | 'SUPERVISING_OFFICER';

export type LeadSource = 
  | 'CITIZEN_TIP' 
  | 'WITNESS_STATEMENT' 
  | 'OFFICER_PATROL' 
  | 'CCTV_REVIEW' 
  | 'SYNTHETIC_TELCO' 
  | 'SYNTHETIC_FINANCIAL';

export type LeadStatus = 
  | 'NEW' 
  | 'UNDER_REVIEW' 
  | 'ASSIGNED' 
  | 'VERIFIED' 
  | 'DISPROVED' 
  | 'INCONCLUSIVE' 
  | 'DUPLICATE';

export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type EvidenceType = 
  | 'PHYSICAL' 
  | 'DIGITAL_IMAGE' 
  | 'CCTV_FOOTAGE' 
  | 'DOCUMENT' 
  | 'FORENSIC_REPORT' 
  | 'TRANSCRIPT';

export type AccessClassification = 'INTERNAL' | 'RESTRICTED' | 'CONFIDENTIAL';

export interface User {
  id: string;
  email: string;
  displayName: string;
  badgeNumber: string | null;
  role: Role;
  jurisdictionId: string | null;
  jurisdiction?: {
    id: string;
    code: string;
    name: string;
    region: string;
  } | null;
}

export interface Jurisdiction {
  id: string;
  code: string;
  name: string;
  region: string;
}

export interface PersonProfile {
  id: string;
  syntheticId: string;
  fullName: string;
  aliases: string[];
  estimatedAge: number | null;
  birthDate: string | null;
  biologicalSex: BiologicalSex;
  identifyingFeatures: string | null;
}

export interface CaseAssignment {
  id: string;
  caseId: string;
  userId: string;
  assignmentRole: AssignmentRole;
  isActive: boolean;
  assignedAt: string;
  unassignedAt: string | null;
  reassignmentReason: string | null;
  user: {
    id: string;
    displayName: string;
    badgeNumber: string | null;
    role: Role;
    email: string;
  };
}

export interface CaseEvent {
  id: string;
  caseId: string;
  eventType: string;
  actorUserId: string | null;
  eventTimestamp: string;
  description: string;
  actorUser?: {
    displayName: string;
    badgeNumber: string | null;
    role: Role;
  } | null;
}

export interface LocationObservation {
  id: string;
  caseId: string;
  observationType: string;
  latitude: number;
  longitude: number;
  locationUncertaintyMeters: number;
  observedAt: string;
  sourceDescription: string;
  isVerified: boolean;
  notes: string | null;
}

export interface SearchZoneHypothesis {
  id: string;
  caseId: string;
  title: string;
  supportingObservationIds: string[];
  excludedObservationIds: string[];
  geometryGeojson: any;
  calculationMethod: string;
  assumptions: string[];
  humanReadableRationale: string;
  uncertaintyRepresentation: string;
  isActive: boolean;
  createdAt: string;
}

export interface InvestigationCase {
  id: string;
  caseReference: string;
  personProfileId: string;
  jurisdictionId: string;
  caseState: CaseState;
  tracingOutcome: TracingOutcome;
  priority: Priority;
  reportedAt: string;
  missingSince: string;
  closedAt: string | null;
  closureReason: string | null;
  incidentSummary: string;
  lastActivityAt: string;
  personProfile: PersonProfile;
  jurisdiction: Jurisdiction;
  assignments?: CaseAssignment[];
  primaryAssignment?: CaseAssignment | null;
  events?: CaseEvent[];
  observations?: LocationObservation[];
  hypotheses?: SearchZoneHypothesis[];
  overdueTasksCount?: number;
  _count?: {
    leads: number;
    tasks: number;
    evidence: number;
    observations: number;
  };
}

export interface CaseQueryParams {
  page?: number;
  limit?: number;
  caseState?: CaseState;
  tracingOutcome?: TracingOutcome;
  priority?: Priority;
  jurisdictionId?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ContradictionReport {
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
}

export interface SearchRadiusResult {
  hypothesis: SearchZoneHypothesis;
  contradictions: ContradictionReport[];
  calculationDetails: {
    anchorObservation: {
      id: string;
      latitude: number;
      longitude: number;
      uncertaintyMeters: number;
      observedAt: string;
      sourceDescription: string;
    };
    assumedTravelMode: string;
    maxSpeedKmh: number;
    elapsedHours: number;
    travelDistanceMeters: number;
    candidateRadiusMeters: number;
    assumptions: string[];
    rationale: string;
    warning: string;
  };
}

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
  environment: string;
  timestamp: string;
  uptimeSeconds: number;
  system: {
    nodeVersion: string;
    platform: string;
    memoryRssMb: number;
    memoryHeapUsedMb: number;
  };
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

let activeToken: string | null = localStorage.getItem('tracegrid_token');

let onUnauthorizedCallback: (() => void) | null = null;

export function setOnUnauthorizedCallback(cb: (() => void) | null): void {
  onUnauthorizedCallback = cb;
}

export function setAuthToken(token: string | null): void {
  activeToken = token;
  if (token) {
    localStorage.setItem('tracegrid_token', token);
  } else {
    localStorage.removeItem('tracegrid_token');
  }
}

export function getAuthToken(): string | null {
  return activeToken;
}

async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (activeToken) {
    headers['Authorization'] = `Bearer ${activeToken}`;
  }

  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const text = await response.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  if (!response.ok) {
    if (response.status === 401) {
      setAuthToken(null);
      if (onUnauthorizedCallback) {
        onUnauthorizedCallback();
      }
    }
    const errorMsg = json?.error?.message || json?.message || `API error HTTP ${response.status}: ${response.statusText}`;
    throw new Error(errorMsg);
  }

  return json;
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
export async function fetchHealth(): Promise<HealthResponse> {
  return apiRequest<HealthResponse>('/health');
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------
export async function login(email: string, password: string): Promise<{ token: string; user: User }> {
  const res = await apiRequest<{ success: boolean; data: { token: string; user: User } }>('/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setAuthToken(res.data.token);
  return res.data;
}

export async function logout(): Promise<void> {
  try {
    if (activeToken) {
      await apiRequest('/v1/auth/logout', { method: 'POST' });
    }
  } finally {
    setAuthToken(null);
  }
}

export async function getMe(): Promise<User> {
  const res = await apiRequest<{ success: boolean; data: User }>('/v1/auth/me');
  return res.data;
}

// ---------------------------------------------------------------------------
// Jurisdictions
// ---------------------------------------------------------------------------
export async function getJurisdictions(): Promise<Jurisdiction[]> {
  const res = await apiRequest<{ success: boolean; data: Jurisdiction[] }>('/v1/jurisdictions');
  return res.data;
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------
export async function getCases(params: CaseQueryParams = {}): Promise<PaginatedResponse<InvestigationCase>> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.caseState) query.set('caseState', params.caseState);
  if (params.tracingOutcome) query.set('tracingOutcome', params.tracingOutcome);
  if (params.priority) query.set('priority', params.priority);
  if (params.jurisdictionId) query.set('jurisdictionId', params.jurisdictionId);
  if (params.search) query.set('search', params.search);
  if (params.sortBy) query.set('sortBy', params.sortBy);
  if (params.sortOrder) query.set('sortOrder', params.sortOrder);

  const queryString = query.toString();
  return apiRequest<PaginatedResponse<InvestigationCase>>(`/v1/cases${queryString ? `?${queryString}` : ''}`);
}

export async function getCaseById(id: string): Promise<InvestigationCase> {
  const res = await apiRequest<{ success: boolean; data: InvestigationCase }>(`/v1/cases/${id}`);
  return res.data;
}

export interface CreateCasePayload {
  personProfile: {
    fullName: string;
    aliases?: string[];
    estimatedAge?: number;
    birthDate?: string;
    biologicalSex?: BiologicalSex;
    identifyingFeatures?: string;
  };
  case: {
    jurisdictionId: string;
    reportedAt: string;
    missingSince: string;
    priority: Priority;
    incidentSummary: string;
  };
}

export async function createCase(payload: CreateCasePayload): Promise<InvestigationCase> {
  const res = await apiRequest<{ success: boolean; data: InvestigationCase }>('/v1/cases', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res.data;
}

export interface UpdateCasePayload {
  priority?: Priority;
  incidentSummary?: string;
}

export async function updateCase(id: string, payload: UpdateCasePayload): Promise<InvestigationCase> {
  const res = await apiRequest<{ success: boolean; data: InvestigationCase }>(`/v1/cases/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function transitionCaseState(id: string, targetState: CaseState, reason: string): Promise<InvestigationCase> {
  const res = await apiRequest<{ success: boolean; data: InvestigationCase }>(`/v1/cases/${id}/transition-state`, {
    method: 'POST',
    body: JSON.stringify({ targetState, reason }),
  });
  return res.data;
}

export async function reopenCase(id: string, reason: string): Promise<InvestigationCase> {
  const res = await apiRequest<{ success: boolean; data: InvestigationCase }>(`/v1/cases/${id}/reopen`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
  return res.data;
}

export async function assignCase(
  id: string, 
  userId: string, 
  assignmentRole: AssignmentRole, 
  reassignmentReason?: string
): Promise<CaseAssignment> {
  const res = await apiRequest<{ success: boolean; data: CaseAssignment }>(`/v1/cases/${id}/assignments`, {
    method: 'POST',
    body: JSON.stringify({ userId, assignmentRole, reassignmentReason }),
  });
  return res.data;
}

export async function getEligibleAssignees(caseId: string): Promise<Array<{
  id: string;
  displayName: string;
  badgeNumber: string | null;
  role: Role;
  email: string;
}>> {
  const res = await apiRequest<{ success: boolean; data: any[] }>(`/v1/cases/${caseId}/eligible-assignees`);
  return res.data;
}

export async function updateCaseOutcome(id: string, tracingOutcome: TracingOutcome, notes: string): Promise<InvestigationCase> {
  const res = await apiRequest<{ success: boolean; data: InvestigationCase }>(`/v1/cases/${id}/update-outcome`, {
    method: 'POST',
    body: JSON.stringify({ tracingOutcome, notes }),
  });
  return res.data;
}

export interface CalculateSearchRadiusPayload {
  anchorObservationId: string;
  assumedTravelMode: 'PEDESTRIAN' | 'TRANSIT' | 'VEHICULAR';
  maxSpeedKmh?: number;
  analysisTime?: string;
  excludedObservationIds?: string[];
  exclusionReasons?: Record<string, string>;
}

export async function calculateSearchRadius(id: string, payload: CalculateSearchRadiusPayload): Promise<SearchRadiusResult> {
  const res = await apiRequest<{ success: boolean; data: SearchRadiusResult }>(`/v1/cases/${id}/search-radius`, {
    method: 'POST',
    body: JSON.stringify({
      ...payload,
      excludedObservationIds: payload.excludedObservationIds || [],
      exclusionReasons: payload.exclusionReasons || {},
    }),
  });
  return res.data;
}

// ---------------------------------------------------------------------------
// Leads & Sightings
// ---------------------------------------------------------------------------

export interface LeadSighting {
  id: string;
  leadReference: string;
  caseId: string;
  sourceType: LeadSource;
  sourceContact: string | null;
  narrative: string;
  observedAt: string | null;
  reportedAt: string;
  latitude: number | null;
  longitude: number | null;
  locationUncertaintyMeters: number | null;
  locationDescription: string | null;
  verificationStatus: LeadStatus;
  assignedUserId: string | null;
  findings: string | null;
  createdAt: string;
  updatedAt: string;
  assignedUser?: {
    id: string;
    displayName: string;
    badgeNumber: string | null;
    role: Role;
    email?: string;
  } | null;
  observations?: LocationObservation[];
  evidenceItems?: Array<{
    id: string;
    evidenceReference: string;
    title: string;
    evidenceType: EvidenceType;
    accessClassification: AccessClassification;
    isVerified: boolean;
  }>;
  tasks?: Array<{
    id: string;
    taskReference: string;
    title: string;
    status: TaskStatus;
    priority: TaskPriority;
    dueDate: string;
  }>;
  _count?: {
    evidenceItems: number;
    tasks: number;
    observations: number;
  };
}

export interface LeadQueryParams {
  page?: number;
  limit?: number;
  verificationStatus?: LeadStatus;
  assignedUserId?: string;
  sourceType?: LeadSource;
  search?: string;
}

export interface CreateLeadPayload {
  sourceType: LeadSource;
  sourceContact?: string;
  narrative: string;
  observedAt?: string;
  reportedAt?: string;
  latitude?: number;
  longitude?: number;
  locationUncertaintyMeters?: number;
  locationDescription?: string;
  assignedUserId?: string;
}

export interface UpdateLeadMetadataPayload {
  narrative?: string;
  sourceContact?: string;
  locationDescription?: string;
  findings?: string;
}

export interface AssignLeadPayload {
  assignedUserId: string;
  reassignmentReason?: string;
}

export interface RecordLeadOutcomePayload {
  verificationStatus: LeadStatus;
  findings: string;
  duplicateOfLeadId?: string;
}

export async function getCaseLeads(caseId: string, params: LeadQueryParams = {}): Promise<PaginatedResponse<LeadSighting>> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.verificationStatus) query.set('verificationStatus', params.verificationStatus);
  if (params.assignedUserId) query.set('assignedUserId', params.assignedUserId);
  if (params.sourceType) query.set('sourceType', params.sourceType);
  if (params.search) query.set('search', params.search);

  const queryString = query.toString();
  return apiRequest<PaginatedResponse<LeadSighting>>(`/v1/cases/${caseId}/leads${queryString ? `?${queryString}` : ''}`);
}

export async function getLeadById(id: string): Promise<LeadSighting> {
  const res = await apiRequest<{ success: boolean; data: LeadSighting }>(`/v1/leads/${id}`);
  return res.data;
}

export async function createCaseLead(caseId: string, payload: CreateLeadPayload): Promise<LeadSighting> {
  const res = await apiRequest<{ success: boolean; data: LeadSighting }>(`/v1/cases/${caseId}/leads`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function updateLeadMetadata(id: string, payload: UpdateLeadMetadataPayload): Promise<LeadSighting> {
  const res = await apiRequest<{ success: boolean; data: LeadSighting }>(`/v1/leads/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function assignLead(id: string, payload: AssignLeadPayload): Promise<LeadSighting> {
  const res = await apiRequest<{ success: boolean; data: LeadSighting }>(`/v1/leads/${id}/assignments`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function recordLeadOutcome(id: string, payload: RecordLeadOutcomePayload): Promise<LeadSighting> {
  const res = await apiRequest<{ success: boolean; data: LeadSighting }>(`/v1/leads/${id}/verification-outcome`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res.data;
}

// ---------------------------------------------------------------------------
// Investigation Tasks
// ---------------------------------------------------------------------------

export interface InvestigationTask {
  id: string;
  taskReference: string;
  caseId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string;
  assignedUserId: string | null;
  leadId: string | null;
  completedAt: string | null;
  outcomeNotes: string | null;
  cancellationReason: string | null;
  isOverdue: boolean;
  createdAt: string;
  updatedAt: string;
  assignedUser?: {
    id: string;
    displayName: string;
    badgeNumber: string | null;
    role: Role;
    email?: string;
  } | null;
  lead?: {
    id: string;
    leadReference: string;
    narrative: string;
  } | null;
}

export interface TaskQueryParams {
  page?: number;
  limit?: number;
  status?: TaskStatus;
  priority?: TaskPriority;
  assignedUserId?: string;
  search?: string;
}

export interface CreateTaskPayload {
  title: string;
  description: string;
  priority?: TaskPriority;
  dueDate: string;
  assignedUserId?: string;
  leadId?: string;
}

export interface UpdateTaskPayload {
  title?: string;
  description?: string;
  priority?: TaskPriority;
  dueDate?: string;
}

export interface AssignTaskPayload {
  assignedUserId: string;
  reassignmentReason?: string;
}

export interface CompleteTaskPayload {
  outcomeNotes: string;
}

export interface CancelTaskPayload {
  cancellationReason: string;
}

export async function getCaseTasks(caseId: string, params: TaskQueryParams = {}): Promise<PaginatedResponse<InvestigationTask>> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.status) query.set('status', params.status);
  if (params.priority) query.set('priority', params.priority);
  if (params.assignedUserId) query.set('assignedUserId', params.assignedUserId);
  if (params.search) query.set('search', params.search);

  const queryString = query.toString();
  return apiRequest<PaginatedResponse<InvestigationTask>>(`/v1/cases/${caseId}/tasks${queryString ? `?${queryString}` : ''}`);
}

export async function getTaskById(id: string): Promise<InvestigationTask> {
  const res = await apiRequest<{ success: boolean; data: InvestigationTask }>(`/v1/tasks/${id}`);
  return res.data;
}

export async function createCaseTask(caseId: string, payload: CreateTaskPayload): Promise<InvestigationTask> {
  const res = await apiRequest<{ success: boolean; data: InvestigationTask }>(`/v1/cases/${caseId}/tasks`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function updateTask(id: string, payload: UpdateTaskPayload): Promise<InvestigationTask> {
  const res = await apiRequest<{ success: boolean; data: InvestigationTask }>(`/v1/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function assignTask(id: string, payload: AssignTaskPayload): Promise<InvestigationTask> {
  const res = await apiRequest<{ success: boolean; data: InvestigationTask }>(`/v1/tasks/${id}/assignments`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function completeTask(id: string, payload: CompleteTaskPayload): Promise<InvestigationTask> {
  const res = await apiRequest<{ success: boolean; data: InvestigationTask }>(`/v1/tasks/${id}/complete`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function cancelTask(id: string, payload: CancelTaskPayload): Promise<InvestigationTask> {
  const res = await apiRequest<{ success: boolean; data: InvestigationTask }>(`/v1/tasks/${id}/cancel`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res.data;
}

// ---------------------------------------------------------------------------
// Evidence & Private Attachments
// ---------------------------------------------------------------------------

export interface Attachment {
  id: string;
  evidenceItemId: string;
  storageKey?: string;
  evidenceReference?: string;
  originalFileName: string;
  mimeType: string;
  fileSizeBytes: number;
  sha256Checksum: string;
  createdAt: string;
}

export interface EvidenceItem {
  id: string;
  evidenceReference: string;
  caseId: string;
  leadId: string | null;
  evidenceType: EvidenceType;
  title: string;
  description: string;
  sourceProvenance: string;
  recordedAt: string;
  eventTimestamp: string | null;
  accessClassification: AccessClassification;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
  lead?: {
    id: string;
    leadReference: string;
  } | null;
  attachments?: Attachment[];
  _count?: {
    attachments: number;
  };
}

export interface EvidenceQueryParams {
  page?: number;
  limit?: number;
  evidenceType?: EvidenceType;
  accessClassification?: AccessClassification;
  leadId?: string;
  search?: string;
}

export interface CreateEvidencePayload {
  title: string;
  description: string;
  evidenceType: EvidenceType;
  sourceProvenance: string;
  eventTimestamp?: string;
  accessClassification?: AccessClassification;
  leadId?: string;
}

export interface UpdateEvidencePayload {
  title?: string;
  description?: string;
  sourceProvenance?: string;
  accessClassification?: AccessClassification;
  isVerified?: boolean;
}

export async function getCaseEvidence(caseId: string, params: EvidenceQueryParams = {}): Promise<PaginatedResponse<EvidenceItem>> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.evidenceType) query.set('evidenceType', params.evidenceType);
  if (params.accessClassification) query.set('accessClassification', params.accessClassification);
  if (params.leadId) query.set('leadId', params.leadId);
  if (params.search) query.set('search', params.search);

  const queryString = query.toString();
  return apiRequest<PaginatedResponse<EvidenceItem>>(`/v1/cases/${caseId}/evidence${queryString ? `?${queryString}` : ''}`);
}

export async function getEvidenceById(id: string): Promise<EvidenceItem> {
  const res = await apiRequest<{ success: boolean; data: EvidenceItem }>(`/v1/evidence/${id}`);
  return res.data;
}

export async function createCaseEvidence(caseId: string, payload: CreateEvidencePayload): Promise<EvidenceItem> {
  const res = await apiRequest<{ success: boolean; data: EvidenceItem }>(`/v1/cases/${caseId}/evidence`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function updateEvidence(id: string, payload: UpdateEvidencePayload): Promise<EvidenceItem> {
  const res = await apiRequest<{ success: boolean; data: EvidenceItem }>(`/v1/evidence/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function uploadAttachment(evidenceId: string, file: File): Promise<Attachment> {
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };
  if (activeToken) {
    headers['Authorization'] = `Bearer ${activeToken}`;
  }
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE}/v1/evidence/${evidenceId}/attachments`, {
    method: 'POST',
    headers,
    body: formData,
  });

  const text = await response.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  if (!response.ok) {
    const errorMsg = json?.error?.message || json?.message || `Upload failed HTTP ${response.status}`;
    throw new Error(errorMsg);
  }

  return json.data;
}

export async function getAttachmentMetadata(id: string): Promise<Attachment> {
  const res = await apiRequest<{ success: boolean; data: Attachment }>(`/v1/attachments/${id}`);
  return res.data;
}

export async function downloadAttachment(id: string): Promise<{ blob: Blob; filename: string; contentType: string }> {
  const headers: Record<string, string> = {};
  if (activeToken) {
    headers['Authorization'] = `Bearer ${activeToken}`;
  }

  const response = await fetch(`${API_BASE}/v1/attachments/${id}/download`, {
    headers,
  });

  if (!response.ok) {
    let errorMsg = `Download failed HTTP ${response.status}`;
    try {
      const json = await response.json();
      errorMsg = json.error?.message || json.message || errorMsg;
    } catch {}
    throw new Error(errorMsg);
  }

  const blob = await response.blob();
  const contentType = response.headers.get('content-type') || 'application/octet-stream';
  const disposition = response.headers.get('content-disposition');
  let filename = `attachment-${id}`;
  if (disposition && disposition.includes('filename=')) {
    const match = disposition.match(/filename="?([^";\n]+)"?/);
    if (match && match[1]) {
      filename = match[1];
    }
  }

  return { blob, filename, contentType };
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => window.URL.revokeObjectURL(url), 100);
}

// ---------------------------------------------------------------------------
// Activity & Supervisory Audit Logs
// ---------------------------------------------------------------------------

export interface AuditLog {
  id: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  caseId: string | null;
  previousStateJson: any;
  newStateJson: any;
  reason: string | null;
  timestamp: string;
  actorUser?: {
    displayName: string;
    badgeNumber: string | null;
    role: Role;
  } | null;
}

export async function getCaseEvents(caseId: string): Promise<CaseEvent[]> {
  const res = await apiRequest<{ success: boolean; data: CaseEvent[] }>(`/v1/cases/${caseId}/events`);
  return res.data;
}

export async function getCaseAuditLogs(caseId: string): Promise<AuditLog[]> {
  const res = await apiRequest<{ success: boolean; data: AuditLog[] }>(`/v1/cases/${caseId}/audit-logs`);
  return res.data;
}

// ---------------------------------------------------------------------------
// Geospatial Intelligence, Exclusions & Coordination Recommendations (Checkpoint 5A/5B)
// ---------------------------------------------------------------------------

export type TravelMode = 'PEDESTRIAN' | 'TRANSIT' | 'VEHICULAR';

export type ContradictionClassification =
  | 'NO_CONFLICT_DETECTED'
  | 'POTENTIAL_VELOCITY_CONTRADICTION'
  | 'INSUFFICIENT_INFORMATION'
  | 'INVALID_OBSERVATION'
  | 'DUPLICATE_CANDIDATE';

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

export interface ObservationExclusion {
  id: string;
  observationId: string;
  caseId: string;
  hypothesisId?: string | null;
  reason: string;
  isCaseLevel: boolean;
  excludedByUserId: string;
  excludedAt: string;
  reconsideredAt?: string | null;
  reconsideredByUserId?: string | null;
  reconsiderationReason?: string | null;
  isActive: boolean;
  excludedByUser?: {
    displayName: string;
    badgeNumber: string | null;
    role: Role;
  };
}

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

export interface CaseRecommendationsResult {
  caseId: string;
  totalRecommendations: number;
  recommendations: InvestigationTaskRecommendation[];
  disclaimer: string;
}

export interface CalculateSearchZoneInput {
  anchorObservationId?: string;
  assumedTravelMode?: TravelMode;
  maxSpeedKmh?: number;
  analysisTime?: string;
  selectedObservationIds?: string[];
  excludedObservationIds?: string[];
  exclusionReasons?: Record<string, string>;
  generateAlternateHypotheses?: boolean;
}

export interface SearchZoneHypothesisResult {
  hypothesis: SearchZoneHypothesis;
  alternateHypotheses?: SearchZoneHypothesis[];
  contradictions: ContradictionReport[];
  calculationDetails: {
    anchorObservation: {
      id: string;
      latitude: number;
      longitude: number;
      uncertaintyMeters: number;
      observedAt: string;
      sourceDescription: string;
    };
    assumedTravelMode: string;
    maxSpeedKmh: number;
    elapsedHours: number;
    travelDistanceMeters: number;
    candidateRadiusMeters: number;
    assumptions: string[];
    rationale: string;
    warning: string;
  };
}

export interface AcceptRecommendationInput {
  recommendationId: string;
  title: string;
  description: string;
  dueDate: string;
  priority: Priority;
  assignedUserId?: string;
  leadId?: string;
}

export async function getCaseContradictions(
  caseId: string,
  params?: { assumedTravelMode?: TravelMode; maxSpeedKmh?: number; primaryAnchorId?: string }
): Promise<MultiObservationAnalysisResult> {
  const query = new URLSearchParams();
  if (params?.assumedTravelMode) query.set('assumedTravelMode', params.assumedTravelMode);
  if (params?.maxSpeedKmh) query.set('maxSpeedKmh', String(params.maxSpeedKmh));
  if (params?.primaryAnchorId) query.set('primaryAnchorId', params.primaryAnchorId);
  const qStr = query.toString();
  const res = await apiRequest<{ success: boolean; data: MultiObservationAnalysisResult }>(
    `/v1/cases/${caseId}/contradictions${qStr ? `?${qStr}` : ''}`
  );
  return res.data;
}

export async function calculateSearchZones(
  caseId: string,
  input: CalculateSearchZoneInput
): Promise<SearchZoneHypothesisResult> {
  const res = await apiRequest<{ success: boolean; data: SearchZoneHypothesisResult }>(
    `/v1/cases/${caseId}/search-zones`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    }
  );
  return res.data;
}

export async function getCaseHypotheses(caseId: string): Promise<SearchZoneHypothesis[]> {
  const res = await apiRequest<{ success: boolean; data: SearchZoneHypothesis[] }>(
    `/v1/cases/${caseId}/hypotheses`
  );
  return res.data;
}

export async function excludeCaseObservation(
  caseId: string,
  observationId: string,
  input: { reason: string; hypothesisId?: string; isCaseLevel?: boolean }
): Promise<ObservationExclusion> {
  const res = await apiRequest<{ success: boolean; data: ObservationExclusion }>(
    `/v1/cases/${caseId}/observations/${observationId}/exclusions`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    }
  );
  return res.data;
}

export async function reconsiderCaseObservation(
  caseId: string,
  observationId: string,
  input: { reason: string }
): Promise<{ observationId: string; isRestored: boolean; reconsideredExclusionsCount: number; message: string }> {
  const res = await apiRequest<{
    success: boolean;
    data: { observationId: string; isRestored: boolean; reconsideredExclusionsCount: number; message: string };
  }>(`/v1/cases/${caseId}/observations/${observationId}/reconsiderations`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function getCaseRecommendations(caseId: string): Promise<CaseRecommendationsResult> {
  const res = await apiRequest<{ success: boolean; data: CaseRecommendationsResult }>(
    `/v1/cases/${caseId}/recommendations`
  );
  return res.data;
}

export async function acceptCaseRecommendation(
  caseId: string,
  input: AcceptRecommendationInput
): Promise<InvestigationTask> {
  const res = await apiRequest<{ success: boolean; data: InvestigationTask }>(
    `/v1/cases/${caseId}/recommendations/accept`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    }
  );
  return res.data;
}

// ---------------------------------------------------------------------------
// Checkpoint 6B/6C: Operations Analytics & Cross-Case Patterns
// ---------------------------------------------------------------------------

export type PatternReviewDecision = 'RELEVANT_FOR_FOLLOWUP' | 'NOT_RELEVANT' | 'UNDER_REVIEW';

export interface CaseloadAnalyticsResult {
  metadata: {
    generatedAt: string;
    isPlatformWide: boolean;
    jurisdictionScope: string;
    reportingInterval: {
      startDate: string;
      endDate: string;
    };
  };
  caseload: {
    totalCases: number;
    byState: Record<CaseState, number>;
    byPriority: Record<Priority, number>;
    byOutcome: Record<TracingOutcome, number>;
    byJurisdiction?: Record<string, { code: string; name: string; totalCases: number; openCases: number; closedCases: number }>;
    newCasesInPeriod: number;
    closedCasesInPeriod: number;
  };
  definitions: Record<string, string>;
}

export interface TimeBucketTrend {
  bucketIndex: number;
  startDate: string;
  endDate: string;
  label: string;
  reportedCasesCount: number;
  closedCasesCount: number;
  reportedLeadsCount: number;
  completedTasksCount: number;
}

export interface TrendsAnalyticsResult {
  metadata: {
    generatedAt: string;
    isPlatformWide: boolean;
    jurisdictionScope: string;
    windowDays: number;
    bucketType: 'day' | 'week' | 'month';
    startDate: string;
    endDate: string;
    timezone: string;
  };
  summary: {
    totalReportedInPeriod: number;
    totalClosedInPeriod: number;
    totalLeadsInPeriod: number;
    totalTasksCompletedInPeriod: number;
    averageResolutionDays: number | null;
    medianResolutionDays: number | null;
  };
  timeSeries: TimeBucketTrend[];
  definitions: Record<string, string>;
}

export interface TaskAnalyticsResult {
  metadata: {
    generatedAt: string;
    isPlatformWide: boolean;
    jurisdictionScope: string;
  };
  tasks: {
    totalTasks: number;
    byStatus: Record<TaskStatus, number>;
    openTasksCount: number;
    overdueTasksCount: number;
    openByPriority: Record<Priority, number>;
    openByAssignee: Array<{
      userId: string;
      displayName: string;
      badgeNumber: string | null;
      role: Role;
      openTasksCount: number;
    }>;
    unassignedOpenTasksCount: number;
    completedInPeriod: number;
    averageCompletionHours: number | null;
    medianCompletionHours: number | null;
  };
  definitions: Record<string, string>;
}

export interface PatternQueueItem {
  patternId: string;
  primaryCategory: string;
  reviewPriority: 'HIGH' | 'MEDIUM' | 'LOW';
  reviewStatus: 'UNVERIFIED_CANDIDATE' | 'RELEVANT_FOR_FOLLOWUP' | 'UNDER_REVIEW' | 'NOT_RELEVANT';
  signalsCount: number;
  initiatingCaseId: string;
  initiatingCaseReference: string;
  candidateCaseId: string;
  candidateCaseReference: string;
  lastReviewedAt: string | null;
  reviewedBy: string | null;
  disclaimer: string;
}

export interface PatternAnalyticsResult {
  metadata: {
    generatedAt: string;
    isPlatformWide: boolean;
    jurisdictionScope: string;
    casesEvaluatedCount: number;
  };
  backlog: {
    totalDistinctPatterns: number;
    unverifiedCandidates: number;
    relevantForFollowup: number;
    underReview: number;
    notRelevant: number;
    byPriority: Record<Priority, number>;
    byCategory: Record<string, number>;
  };
  reviewQueueItems: PatternQueueItem[];
  definitions?: Record<string, string>;
}

export interface ContributingSignal {
  category: string;
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

export interface CandidatePatternDetail {
  id: string;
  initiatingCaseId: string;
  initiatingCaseReference: string;
  candidateCaseId: string;
  candidateCaseReference: string;
  primaryCategory: string;
  reviewPriority: 'HIGH' | 'MEDIUM' | 'LOW';
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
  reviewStatus: 'UNVERIFIED_CANDIDATE' | 'RELEVANT_FOR_FOLLOWUP' | 'UNDER_REVIEW' | 'NOT_RELEVANT';
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
  humanReviewRequired: boolean;
  disclaimer: string;
}

export interface OperationalReportJsonResult {
  reportId: string;
  generatedAt: string;
  generatedBy: {
    id: string;
    displayName: string;
    role: string;
    badgeNumber: string | null;
  };
  scope: {
    isPlatformWide: boolean;
    jurisdictionScope: string;
    jurisdictionCode: string | null;
    jurisdictionName: string | null;
  };
  reportingInterval: {
    windowDays: number;
    startDate: string;
    endDate: string;
  };
  caseload: any;
  tasks: any;
  patterns: any;
  disclaimer: string;
}

export async function getCaseloadSummary(params: {
  jurisdictionId?: string;
  startDate?: string;
  endDate?: string;
} = {}): Promise<CaseloadAnalyticsResult> {
  const query = new URLSearchParams();
  if (params.jurisdictionId) query.set('jurisdictionId', params.jurisdictionId);
  if (params.startDate) query.set('startDate', params.startDate);
  if (params.endDate) query.set('endDate', params.endDate);
  const qStr = query.toString();
  const res = await apiRequest<{ success: boolean; data: CaseloadAnalyticsResult }>(
    `/v1/analytics/caseload${qStr ? `?${qStr}` : ''}`
  );
  return res.data;
}

export async function getActivityAndResolutionTrends(params: {
  jurisdictionId?: string;
  windowDays?: number;
  bucket?: 'day' | 'week' | 'month';
  startDate?: string;
  endDate?: string;
} = {}): Promise<TrendsAnalyticsResult> {
  const query = new URLSearchParams();
  if (params.jurisdictionId) query.set('jurisdictionId', params.jurisdictionId);
  if (params.windowDays) query.set('windowDays', String(params.windowDays));
  if (params.bucket) query.set('bucket', params.bucket);
  if (params.startDate) query.set('startDate', params.startDate);
  if (params.endDate) query.set('endDate', params.endDate);
  const qStr = query.toString();
  const res = await apiRequest<{ success: boolean; data: TrendsAnalyticsResult }>(
    `/v1/analytics/trends${qStr ? `?${qStr}` : ''}`
  );
  return res.data;
}

export async function getTaskBacklogMetrics(params: {
  jurisdictionId?: string;
  startDate?: string;
  endDate?: string;
} = {}): Promise<TaskAnalyticsResult> {
  const query = new URLSearchParams();
  if (params.jurisdictionId) query.set('jurisdictionId', params.jurisdictionId);
  if (params.startDate) query.set('startDate', params.startDate);
  if (params.endDate) query.set('endDate', params.endDate);
  const qStr = query.toString();
  const res = await apiRequest<{ success: boolean; data: TaskAnalyticsResult }>(
    `/v1/analytics/tasks${qStr ? `?${qStr}` : ''}`
  );
  return res.data;
}

export async function getPatternReviewBacklog(params: {
  jurisdictionId?: string;
  maxDistanceKm?: number;
  maxTimeDeltaHours?: number;
} = {}): Promise<PatternAnalyticsResult> {
  const query = new URLSearchParams();
  if (params.jurisdictionId) query.set('jurisdictionId', params.jurisdictionId);
  if (params.maxDistanceKm) query.set('maxDistanceKm', String(params.maxDistanceKm));
  if (params.maxTimeDeltaHours) query.set('maxTimeDeltaHours', String(params.maxTimeDeltaHours));
  const qStr = query.toString();
  const res = await apiRequest<{ success: boolean; data: PatternAnalyticsResult }>(
    `/v1/analytics/patterns${qStr ? `?${qStr}` : ''}`
  );
  return res.data;
}

export async function getCasePatternById(caseId: string, patternId: string): Promise<CandidatePatternDetail> {
  const res = await apiRequest<{ success: boolean; data: CandidatePatternDetail }>(
    `/v1/cases/${caseId}/patterns/${patternId}`
  );
  return res.data;
}

export async function recordPatternReview(
  caseId: string,
  patternId: string,
  input: { decision: PatternReviewDecision; rationale: string }
): Promise<CandidatePatternDetail> {
  const res = await apiRequest<{ success: boolean; data: CandidatePatternDetail }>(
    `/v1/cases/${caseId}/patterns/${patternId}/review`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    }
  );
  return res.data;
}

export async function getOperationalReportJson(params: {
  jurisdictionId?: string;
  windowDays?: number;
} = {}): Promise<OperationalReportJsonResult> {
  const query = new URLSearchParams();
  if (params.jurisdictionId) query.set('jurisdictionId', params.jurisdictionId);
  if (params.windowDays) query.set('windowDays', String(params.windowDays));
  query.set('format', 'json');
  const res = await apiRequest<{ success: boolean; data: OperationalReportJsonResult }>(
    `/v1/analytics/reports/operational?${query.toString()}`
  );
  return res.data;
}

export async function downloadOperationalReportCsv(params: {
  jurisdictionId?: string;
  windowDays?: number;
} = {}): Promise<{ filename: string; sizeBytes: number }> {
  const query = new URLSearchParams();
  if (params.jurisdictionId) query.set('jurisdictionId', params.jurisdictionId);
  if (params.windowDays) query.set('windowDays', String(params.windowDays));
  query.set('format', 'csv');

  const headers: Record<string, string> = {
    'Accept': 'text/csv',
  };
  if (activeToken) {
    headers['Authorization'] = `Bearer ${activeToken}`;
  }

  const response = await fetch(`${API_BASE}/v1/analytics/reports/operational?${query.toString()}`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    let errorMsg = `HTTP ${response.status}: ${response.statusText}`;
    try {
      const errJson = await response.json();
      errorMsg = errJson.error?.message || errJson.message || errorMsg;
    } catch {
      // not JSON
    }
    throw new Error(errorMsg);
  }

  const blob = await response.blob();
  const contentDisposition = response.headers.get('Content-Disposition');
  let filename = `tracegrid-operations-report-${new Date().toISOString().slice(0, 10)}.csv`;
  if (contentDisposition) {
    const match = contentDisposition.match(/filename="?([^";]+)"?/);
    if (match && match[1]) {
      filename = match[1].trim();
    }
  }

  const blobUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }

  return { filename, sizeBytes: blob.size };
}


