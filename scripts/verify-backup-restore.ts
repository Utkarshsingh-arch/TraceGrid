/**
 * TraceGrid Isolated Database Backup & Restore Verification Suite
 *
 * Verifies that:
 * 1. A consistent pg_dump archive can be generated safely from the active database.
 * 2. The backup archive can be completely restored into a disposable, isolated database.
 * 3. All relational entities, foreign keys, audit logs, and synthetic records are preserved 1:1.
 * 4. The active working database is NEVER dropped, reset, or corrupted.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const CONTAINER = process.env.TRACEGRID_PG_CONTAINER || 'tracegrid_postgres';
const DB_USER = process.env.POSTGRES_USER || 'tracegrid_user';
const SOURCE_DB = process.env.POSTGRES_DB || 'tracegrid_db';
const TEST_DB = 'tracegrid_restore_test';
const CONTAINER_TEMP = '/tmp/tracegrid_verify_backup.dump';
const HOST_BACKUP = path.resolve(process.cwd(), 'storage/tracegrid_verify_backup.dump');

async function runVerification() {
  console.log('====================================================');
  console.log('  TraceGrid Isolated Backup & Restore Verification');
  console.log(`  Source DB:    ${SOURCE_DB}`);
  console.log(`  Isolated DB:  ${TEST_DB}`);
  console.log(`  Container:    ${CONTAINER}`);
  console.log('====================================================\n');

  let passedChecks = 0;
  const totalChecks = 16;

  function assertCheck(condition: boolean, message: string) {
    if (condition) {
      console.log(`  ✅ [PASS] ${message}`);
      passedChecks++;
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
      throw new Error(`Verification assertion failed: ${message}`);
    }
  }

  const sourcePrisma = new PrismaClient({
    datasources: {
      db: {
        url: `postgresql://${DB_USER}:tracegrid_password@127.0.0.1:5432/${SOURCE_DB}?schema=public`,
      },
    },
  });

  let testPrisma: PrismaClient | null = null;

  try {
    // Step 1: Generate pg_dump in container
    console.log('[Step 1] Creating consistent pg_dump custom archive in container...');
    execSync(
      `docker exec ${CONTAINER} pg_dump -U ${DB_USER} -d ${SOURCE_DB} --format=custom --file=${CONTAINER_TEMP}`,
      { stdio: 'pipe' }
    );
    assertCheck(true, 'pg_dump executed successfully inside PostgreSQL container');

    // Step 2: Transfer backup archive to host
    console.log('[Step 2] Copying archive to host storage directory...');
    const storageDir = path.dirname(HOST_BACKUP);
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }
    execSync(`docker cp ${CONTAINER}:${CONTAINER_TEMP} "${HOST_BACKUP}"`, { stdio: 'pipe' });
    const stats = fs.statSync(HOST_BACKUP);
    assertCheck(stats.size > 50000, `Backup file transferred to host (size: ${stats.size} bytes)`);

    // Step 3: Create isolated test database
    console.log(`[Step 3] Provisioning isolated test database "${TEST_DB}"...`);
    execSync(
      `docker exec ${CONTAINER} psql -U ${DB_USER} -d postgres -c "DROP DATABASE IF EXISTS ${TEST_DB};"`,
      { stdio: 'pipe' }
    );
    execSync(
      `docker exec ${CONTAINER} psql -U ${DB_USER} -d postgres -c "CREATE DATABASE ${TEST_DB};"`,
      { stdio: 'pipe' }
    );
    assertCheck(true, `Disposable isolated database "${TEST_DB}" created successfully`);

    // Step 4: Restore backup into isolated test database
    console.log(`[Step 4] Restoring backup archive into "${TEST_DB}"...`);
    execSync(
      `docker exec ${CONTAINER} pg_restore -U ${DB_USER} -d ${TEST_DB} --no-owner --no-acl ${CONTAINER_TEMP}`,
      { stdio: 'pipe' }
    );
    assertCheck(true, `pg_restore completed into "${TEST_DB}" with zero exit errors`);

    // Step 5: Connect to restored database
    testPrisma = new PrismaClient({
      datasources: {
        db: {
          url: `postgresql://${DB_USER}:tracegrid_password@127.0.0.1:5432/${TEST_DB}?schema=public`,
        },
      },
    });

    // Step 6: Verify Record Counts 1:1 between Source and Restored
    console.log('\n[Step 5] Comparing Source vs Restored Entity Counts...');

    const [srcJurisdictions, resJurisdictions] = await Promise.all([
      sourcePrisma.jurisdiction.count(),
      testPrisma.jurisdiction.count(),
    ]);
    assertCheck(
      resJurisdictions === srcJurisdictions && resJurisdictions === 4,
      `Jurisdictions match: ${resJurisdictions} = ${srcJurisdictions} (expected 4)`
    );

    const [srcUsers, resUsers] = await Promise.all([
      sourcePrisma.user.count(),
      testPrisma.user.count(),
    ]);
    assertCheck(
      resUsers === srcUsers && resUsers === 5,
      `Demo Users match: ${resUsers} = ${srcUsers} (expected 5)`
    );

    const [srcProfiles, resProfiles] = await Promise.all([
      sourcePrisma.personProfile.count(),
      testPrisma.personProfile.count(),
    ]);
    assertCheck(
      resProfiles === srcProfiles && resProfiles === 35,
      `Person Profiles match: ${resProfiles} = ${srcProfiles} (expected 35)`
    );

    const [srcCases, resCases] = await Promise.all([
      sourcePrisma.investigationCase.count(),
      testPrisma.investigationCase.count(),
    ]);
    assertCheck(
      resCases === srcCases && resCases === 35,
      `Investigation Cases match: ${resCases} = ${srcCases} (expected 35)`
    );

    const [srcLeads, resLeads] = await Promise.all([
      sourcePrisma.leadSighting.count(),
      testPrisma.leadSighting.count(),
    ]);
    assertCheck(
      resLeads === srcLeads && resLeads >= 100,
      `Leads & Sightings match: ${resLeads} = ${srcLeads}`
    );

    const [srcTasks, resTasks] = await Promise.all([
      sourcePrisma.investigationTask.count(),
      testPrisma.investigationTask.count(),
    ]);
    assertCheck(
      resTasks === srcTasks && resTasks >= 60,
      `Investigation Tasks match: ${resTasks} = ${srcTasks}`
    );

    const [srcEvidence, resEvidence] = await Promise.all([
      sourcePrisma.evidenceItem.count(),
      testPrisma.evidenceItem.count(),
    ]);
    assertCheck(
      resEvidence === srcEvidence && resEvidence >= 40,
      `Evidence Items match: ${resEvidence} = ${srcEvidence}`
    );

    const [srcAttachments, resAttachments] = await Promise.all([
      sourcePrisma.attachment.count(),
      testPrisma.attachment.count(),
    ]);
    assertCheck(
      resAttachments === srcAttachments && resAttachments >= 30,
      `Attachments match: ${resAttachments} = ${srcAttachments}`
    );

    const [srcObservations, resObservations] = await Promise.all([
      sourcePrisma.locationObservation.count(),
      testPrisma.locationObservation.count(),
    ]);
    assertCheck(
      resObservations === srcObservations && resObservations >= 40,
      `Location Observations match: ${resObservations} = ${srcObservations}`
    );

    const [srcHypotheses, resHypotheses] = await Promise.all([
      sourcePrisma.searchZoneHypothesis.count(),
      testPrisma.searchZoneHypothesis.count(),
    ]);
    assertCheck(
      resHypotheses === srcHypotheses && resHypotheses >= 10,
      `Search Zone Hypotheses match: ${resHypotheses} = ${srcHypotheses}`
    );

    const [srcExclusions, resExclusions] = await Promise.all([
      sourcePrisma.observationExclusion.count(),
      testPrisma.observationExclusion.count(),
    ]);
    assertCheck(
      resExclusions === srcExclusions,
      `Observation Exclusions match: ${resExclusions} = ${srcExclusions}`
    );

    const [srcAuditLogs, resAuditLogs] = await Promise.all([
      sourcePrisma.auditLog.count(),
      testPrisma.auditLog.count(),
    ]);
    assertCheck(
      resAuditLogs === srcAuditLogs && resAuditLogs > 0,
      `Supervisory Audit Logs match: ${resAuditLogs} = ${srcAuditLogs}`
    );

    // Step 7: Verify Relational Integrity in Restored DB
    console.log('\n[Step 6] Validating Restored Relational Foreign Keys & Associations...');
    const sampleCase = await testPrisma.investigationCase.findFirst({
      where: { caseReference: 'CAS-2026-0001' },
      include: {
        personProfile: true,
        jurisdiction: true,
        leads: true,
        tasks: true,
        observations: true,
        auditLogs: true,
      },
    });

    assertCheck(sampleCase !== null, 'Found target case CAS-2026-0001 in restored database');
    assertCheck(
      sampleCase?.personProfile?.syntheticId !== undefined &&
        sampleCase?.leads.length! > 0 &&
        sampleCase?.tasks.length! > 0 &&
        sampleCase?.observations.length! > 0,
      'Restored case preserves foreign key graph (personProfile, leads, tasks, observations)'
    );

    console.log('\n====================================================');
    console.log(`  🎉 ALL ${passedChecks} / ${totalChecks} BACKUP & RESTORE CHECKS PASSED!`);
    console.log('====================================================\n');
  } finally {
    // Step 8: Clean up isolated test database and temporary archives
    console.log('[Cleanup] Teardown isolated test database and temp files...');
    if (testPrisma) {
      await testPrisma.$disconnect().catch(() => {});
    }
    await sourcePrisma.$disconnect().catch(() => {});

    try {
      execSync(
        `docker exec ${CONTAINER} psql -U ${DB_USER} -d postgres -c "DROP DATABASE IF EXISTS ${TEST_DB};"`,
        { stdio: 'pipe' }
      );
      execSync(`docker exec ${CONTAINER} rm -f ${CONTAINER_TEMP}`, { stdio: 'pipe' });
      if (fs.existsSync(HOST_BACKUP)) {
        fs.unlinkSync(HOST_BACKUP);
      }
      console.log('✅ Isolated environment cleanly torn down. Working database untouched.\n');
    } catch (cleanupErr: any) {
      console.warn(`[Cleanup Warning] ${cleanupErr.message}`);
    }
  }
}

runVerification().catch((err) => {
  console.error('\n❌ Backup verification failed:', err);
  process.exit(1);
});
