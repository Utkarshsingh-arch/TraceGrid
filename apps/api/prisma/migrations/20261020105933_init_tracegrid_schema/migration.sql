-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CASE_OFFICER', 'SUPERVISOR', 'DATA_CLERK', 'SYSTEM_ADMIN', 'READ_ONLY_REVIEWER');

-- CreateEnum
CREATE TYPE "BiologicalSex" AS ENUM ('MALE', 'FEMALE', 'NON_BINARY', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "CaseState" AS ENUM ('REPORTED', 'UNDER_REVIEW', 'OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "TracingOutcome" AS ENUM ('NOT_TRACED', 'LOCATION_REPORTED', 'LOCATED_VERIFICATION_PENDING', 'TRACED_VERIFIED', 'OTHER_OUTCOME');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AssignmentRole" AS ENUM ('PRIMARY_OFFICER', 'ASSISTING_OFFICER', 'SUPERVISING_OFFICER');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'UNDER_REVIEW', 'ASSIGNED', 'VERIFIED', 'DISPROVED', 'INCONCLUSIVE', 'DUPLICATE');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('CITIZEN_TIP', 'WITNESS_STATEMENT', 'OFFICER_PATROL', 'CCTV_REVIEW', 'SYNTHETIC_TELCO', 'SYNTHETIC_FINANCIAL');

-- CreateEnum
CREATE TYPE "EvidenceType" AS ENUM ('PHYSICAL', 'DIGITAL_IMAGE', 'CCTV_FOOTAGE', 'DOCUMENT', 'FORENSIC_REPORT', 'TRANSCRIPT');

-- CreateEnum
CREATE TYPE "AccessClassification" AS ENUM ('INTERNAL', 'RESTRICTED', 'CONFIDENTIAL');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ObservationType" AS ENUM ('WITNESS_SIGHTING', 'CCTV_CONFIRMED', 'SYNTHETIC_TELCO_CELL', 'SYNTHETIC_POS_TRANSACTION', 'LAST_KNOWN_RESIDENCE');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('CASE_CREATED', 'STATE_TRANSITION', 'OUTCOME_UPDATED', 'ASSIGNMENT_CHANGED', 'LEAD_REGISTERED', 'LEAD_VERIFIED', 'EVIDENCE_LOGGED', 'TASK_COMPLETED', 'HYPOTHESIS_GENERATED', 'NOTE_ADDED');

-- CreateTable
CREATE TABLE "jurisdictions" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "region" VARCHAR(64) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "jurisdictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(128) NOT NULL,
    "badge_number" VARCHAR(32),
    "password_hash" VARCHAR(255) NOT NULL,
    "role" "Role" NOT NULL,
    "jurisdiction_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_profiles" (
    "id" UUID NOT NULL,
    "synthetic_id" VARCHAR(32) NOT NULL,
    "full_name" VARCHAR(128) NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "estimated_age" INTEGER,
    "birth_date" DATE,
    "biological_sex" "BiologicalSex" NOT NULL DEFAULT 'UNKNOWN',
    "identifying_features" TEXT,
    "primary_photo_key" VARCHAR(128),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "person_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investigation_cases" (
    "id" UUID NOT NULL,
    "case_reference" VARCHAR(32) NOT NULL,
    "person_profile_id" UUID NOT NULL,
    "jurisdiction_id" UUID NOT NULL,
    "reported_at" TIMESTAMPTZ(6) NOT NULL,
    "missing_since" TIMESTAMPTZ(6) NOT NULL,
    "case_state" "CaseState" NOT NULL DEFAULT 'REPORTED',
    "tracing_outcome" "TracingOutcome" NOT NULL DEFAULT 'NOT_TRACED',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "incident_summary" TEXT NOT NULL,
    "last_activity_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(6),
    "closure_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "investigation_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_assignments" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "assignment_role" "AssignmentRole" NOT NULL DEFAULT 'PRIMARY_OFFICER',
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassigned_at" TIMESTAMPTZ(6),
    "reassignment_reason" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_sightings" (
    "id" UUID NOT NULL,
    "lead_reference" VARCHAR(32) NOT NULL,
    "case_id" UUID NOT NULL,
    "source_type" "LeadSource" NOT NULL,
    "source_contact" TEXT,
    "narrative" TEXT NOT NULL,
    "observed_at" TIMESTAMPTZ(6),
    "reported_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "location_uncertainty_meters" DOUBLE PRECISION,
    "location_description" TEXT,
    "verification_status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "assigned_user_id" UUID,
    "findings" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "lead_sightings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_items" (
    "id" UUID NOT NULL,
    "evidence_reference" VARCHAR(32) NOT NULL,
    "case_id" UUID NOT NULL,
    "lead_id" UUID,
    "evidence_type" "EvidenceType" NOT NULL,
    "title" VARCHAR(128) NOT NULL,
    "description" TEXT NOT NULL,
    "source_provenance" TEXT NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "event_timestamp" TIMESTAMPTZ(6),
    "access_classification" "AccessClassification" NOT NULL DEFAULT 'INTERNAL',
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "evidence_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "evidence_item_id" UUID NOT NULL,
    "storage_key" VARCHAR(128) NOT NULL,
    "original_file_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(128) NOT NULL,
    "file_size_bytes" BIGINT NOT NULL,
    "sha256_checksum" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investigation_tasks" (
    "id" UUID NOT NULL,
    "task_reference" VARCHAR(32) NOT NULL,
    "case_id" UUID NOT NULL,
    "lead_id" UUID,
    "assigned_user_id" UUID,
    "title" VARCHAR(128) NOT NULL,
    "description" TEXT NOT NULL,
    "due_date" TIMESTAMPTZ(6) NOT NULL,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "outcome_notes" TEXT,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "investigation_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location_observations" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "lead_id" UUID,
    "observation_type" "ObservationType" NOT NULL,
    "source_description" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "location_uncertainty_meters" DOUBLE PRECISION NOT NULL DEFAULT 100.0,
    "observed_at" TIMESTAMPTZ(6) NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verification_status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "reliability_score" DOUBLE PRECISION,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "location_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_zone_hypotheses" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "title" VARCHAR(128) NOT NULL,
    "supporting_observation_ids" TEXT[],
    "excluded_observation_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "geometry_geojson" JSONB NOT NULL,
    "calculation_method" VARCHAR(64) NOT NULL,
    "assumptions" TEXT[],
    "human_readable_rationale" TEXT NOT NULL,
    "uncertainty_representation" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_zone_hypotheses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_events" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "event_type" "EventType" NOT NULL,
    "actor_user_id" UUID,
    "event_timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT NOT NULL,
    "metadata_json" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "action" VARCHAR(64) NOT NULL,
    "entity_type" VARCHAR(32) NOT NULL,
    "entity_id" UUID NOT NULL,
    "case_id" UUID,
    "previous_state_json" JSONB,
    "new_state_json" JSONB,
    "reason" TEXT,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "jurisdictions_code_key" ON "jurisdictions"("code");

-- CreateIndex
CREATE INDEX "jurisdictions_region_is_active_idx" ON "jurisdictions"("region", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_is_active_idx" ON "users"("role", "is_active");

-- CreateIndex
CREATE INDEX "users_jurisdiction_id_idx" ON "users"("jurisdiction_id");

-- CreateIndex
CREATE UNIQUE INDEX "person_profiles_synthetic_id_key" ON "person_profiles"("synthetic_id");

-- CreateIndex
CREATE INDEX "person_profiles_full_name_idx" ON "person_profiles"("full_name");

-- CreateIndex
CREATE UNIQUE INDEX "investigation_cases_case_reference_key" ON "investigation_cases"("case_reference");

-- CreateIndex
CREATE INDEX "investigation_cases_jurisdiction_id_case_state_idx" ON "investigation_cases"("jurisdiction_id", "case_state");

-- CreateIndex
CREATE INDEX "investigation_cases_tracing_outcome_idx" ON "investigation_cases"("tracing_outcome");

-- CreateIndex
CREATE INDEX "investigation_cases_priority_idx" ON "investigation_cases"("priority");

-- CreateIndex
CREATE INDEX "investigation_cases_last_activity_at_idx" ON "investigation_cases"("last_activity_at");

-- CreateIndex
CREATE INDEX "case_assignments_case_id_is_active_idx" ON "case_assignments"("case_id", "is_active");

-- CreateIndex
CREATE INDEX "case_assignments_user_id_is_active_idx" ON "case_assignments"("user_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "lead_sightings_lead_reference_key" ON "lead_sightings"("lead_reference");

-- CreateIndex
CREATE INDEX "lead_sightings_case_id_verification_status_idx" ON "lead_sightings"("case_id", "verification_status");

-- CreateIndex
CREATE INDEX "lead_sightings_assigned_user_id_idx" ON "lead_sightings"("assigned_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "evidence_items_evidence_reference_key" ON "evidence_items"("evidence_reference");

-- CreateIndex
CREATE INDEX "evidence_items_case_id_evidence_type_idx" ON "evidence_items"("case_id", "evidence_type");

-- CreateIndex
CREATE INDEX "evidence_items_lead_id_idx" ON "evidence_items"("lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "attachments_storage_key_key" ON "attachments"("storage_key");

-- CreateIndex
CREATE INDEX "attachments_evidence_item_id_idx" ON "attachments"("evidence_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "investigation_tasks_task_reference_key" ON "investigation_tasks"("task_reference");

-- CreateIndex
CREATE INDEX "investigation_tasks_case_id_status_idx" ON "investigation_tasks"("case_id", "status");

-- CreateIndex
CREATE INDEX "investigation_tasks_assigned_user_id_status_idx" ON "investigation_tasks"("assigned_user_id", "status");

-- CreateIndex
CREATE INDEX "investigation_tasks_due_date_idx" ON "investigation_tasks"("due_date");

-- CreateIndex
CREATE INDEX "location_observations_case_id_observed_at_idx" ON "location_observations"("case_id", "observed_at");

-- CreateIndex
CREATE INDEX "location_observations_latitude_longitude_idx" ON "location_observations"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "search_zone_hypotheses_case_id_is_active_idx" ON "search_zone_hypotheses"("case_id", "is_active");

-- CreateIndex
CREATE INDEX "case_events_case_id_event_timestamp_idx" ON "case_events"("case_id", "event_timestamp" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_case_id_idx" ON "audit_logs"("case_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_jurisdiction_id_fkey" FOREIGN KEY ("jurisdiction_id") REFERENCES "jurisdictions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investigation_cases" ADD CONSTRAINT "investigation_cases_person_profile_id_fkey" FOREIGN KEY ("person_profile_id") REFERENCES "person_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investigation_cases" ADD CONSTRAINT "investigation_cases_jurisdiction_id_fkey" FOREIGN KEY ("jurisdiction_id") REFERENCES "jurisdictions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_assignments" ADD CONSTRAINT "case_assignments_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "investigation_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_assignments" ADD CONSTRAINT "case_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_sightings" ADD CONSTRAINT "lead_sightings_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "investigation_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_sightings" ADD CONSTRAINT "lead_sightings_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "investigation_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "lead_sightings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_evidence_item_id_fkey" FOREIGN KEY ("evidence_item_id") REFERENCES "evidence_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investigation_tasks" ADD CONSTRAINT "investigation_tasks_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "investigation_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investigation_tasks" ADD CONSTRAINT "investigation_tasks_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "lead_sightings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investigation_tasks" ADD CONSTRAINT "investigation_tasks_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_observations" ADD CONSTRAINT "location_observations_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "investigation_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_observations" ADD CONSTRAINT "location_observations_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "lead_sightings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_zone_hypotheses" ADD CONSTRAINT "search_zone_hypotheses_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "investigation_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_zone_hypotheses" ADD CONSTRAINT "search_zone_hypotheses_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_events" ADD CONSTRAINT "case_events_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "investigation_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_events" ADD CONSTRAINT "case_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "investigation_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
