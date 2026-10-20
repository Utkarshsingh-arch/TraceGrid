-- CreateTable
CREATE TABLE "observation_exclusions" (
    "id" UUID NOT NULL,
    "observation_id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "hypothesis_id" UUID,
    "reason" TEXT NOT NULL,
    "is_case_level" BOOLEAN NOT NULL DEFAULT false,
    "excluded_by_user_id" UUID NOT NULL,
    "excluded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reconsidered_at" TIMESTAMPTZ(6),
    "reconsidered_by_user_id" UUID,
    "reconsideration_reason" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "observation_exclusions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "observation_exclusions_case_id_is_active_idx" ON "observation_exclusions"("case_id", "is_active");

-- CreateIndex
CREATE INDEX "observation_exclusions_observation_id_is_active_idx" ON "observation_exclusions"("observation_id", "is_active");

-- CreateIndex
CREATE INDEX "observation_exclusions_hypothesis_id_idx" ON "observation_exclusions"("hypothesis_id");

-- AddForeignKey
ALTER TABLE "observation_exclusions" ADD CONSTRAINT "observation_exclusions_observation_id_fkey" FOREIGN KEY ("observation_id") REFERENCES "location_observations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observation_exclusions" ADD CONSTRAINT "observation_exclusions_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "investigation_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observation_exclusions" ADD CONSTRAINT "observation_exclusions_hypothesis_id_fkey" FOREIGN KEY ("hypothesis_id") REFERENCES "search_zone_hypotheses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observation_exclusions" ADD CONSTRAINT "observation_exclusions_excluded_by_user_id_fkey" FOREIGN KEY ("excluded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observation_exclusions" ADD CONSTRAINT "observation_exclusions_reconsidered_by_user_id_fkey" FOREIGN KEY ("reconsidered_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
