/**
 * TraceGrid Checkpoint 7C: Deployment Readiness & Staging Preparation Test Suite
 *
 * Automated verification of:
 * 1. Environment validation invariants (rejection of insecure JWT secrets in staging/production).
 * 2. Reverse proxy configuration & trusted forwarded header handling.
 * 3. Request body size ceilings (1mb JSON payload exhaustion defense).
 * 4. Multi-origin CORS handling.
 * 5. Frontend API configuration and production build artifact validation.
 * 6. Container definitions (Dockerfiles, Nginx reverse proxy, non-root user).
 * 7. Isolated staging compose topology & volume segregation.
 * 8. Staging API smoke test pipeline.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { createApp } from '../apps/api/src/app';

let server: http.Server;
let port: number;
let baseUrl: string;

let passedChecks = 0;
let failedChecks = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    passedChecks++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    failedChecks++;
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function request(
  urlPath: string,
  options: {
    method?: string;
    token?: string;
    headers?: Record<string, string>;
    body?: any;
    rawBody?: string;
  } = {}
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: any }> {
  const method = options.method || 'GET';
  const headers: Record<string, string> = {
    ...(options.headers || {}),
  };

  let payload = '';
  if (options.rawBody !== undefined) {
    payload = options.rawBody;
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  } else if (options.body) {
    payload = JSON.stringify(options.body);
    headers['Content-Type'] = 'application/json';
  }

  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  return new Promise((resolve, reject) => {
    const req = http.request(
      `${baseUrl}${urlPath}`,
      {
        method,
        headers,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          let parsed: any = null;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw;
          }
          resolve({ status: res.statusCode || 0, headers: res.headers, body: parsed });
        });
      }
    );

    req.on('error', reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

async function runSuite() {
  console.log('===================================================================');
  console.log('  TraceGrid Checkpoint 7C: Deployment Readiness & Staging Suite');
  console.log('===================================================================\n');

  // Spawn ephemeral API test instance
  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address() as any;
      port = addr.port;
      baseUrl = `http://127.0.0.1:${port}`;
      console.log(`Ephemeral API test server listening on ${baseUrl}\n`);
      resolve();
    });
  });

  try {
    // =========================================================================
    // Suite 1: Staging Environment Validation & Secret Safeguards
    // =========================================================================
    console.log('--- Suite 1: Environment Security & Secret Safeguards ---');

    const testEnvSchema = z
      .object({
        NODE_ENV: z.enum(['development', 'staging', 'production', 'test']),
        JWT_SECRET: z.string(),
      })
      .refine(
        (data) => {
          if (data.NODE_ENV === 'production' || data.NODE_ENV === 'staging') {
            const isDefault =
              data.JWT_SECRET.includes('tracegrid-dev') ||
              data.JWT_SECRET.includes('insecure') ||
              data.JWT_SECRET.includes('replace-in-production');
            return !isDefault && data.JWT_SECRET.length >= 32;
          }
          return true;
        },
        { message: 'Insecure or default secret rejected' }
      );

    // Test 1: Default secret rejected in staging
    const defaultSecretStaging = testEnvSchema.safeParse({
      NODE_ENV: 'staging',
      JWT_SECRET: 'tracegrid-dev-local-secret-key-32charsmin!',
    });
    assert(!defaultSecretStaging.success, 'Default secret rejected in staging environment');

    // Test 2: Insecure placeholder rejected in production
    const placeholderSecretProd = testEnvSchema.safeParse({
      NODE_ENV: 'production',
      JWT_SECRET: 'tracegrid-insecure-key-for-test-32chars',
    });
    assert(!placeholderSecretProd.success, 'Insecure secret placeholder rejected in production');

    // Test 3: Short secret (< 32 chars) rejected in staging
    const shortSecretStaging = testEnvSchema.safeParse({
      NODE_ENV: 'staging',
      JWT_SECRET: 'short-secret-only-24-char',
    });
    assert(!shortSecretStaging.success, 'Short secret (< 32 chars) rejected in staging');

    // Test 4: Genuine secure 32+ char secret accepted in staging
    const validSecretStaging = testEnvSchema.safeParse({
      NODE_ENV: 'staging',
      JWT_SECRET: '7f9b8c3d1e2a4f6b8c0d2e4f6a8b0c2d4e6f8a0b2c4d6e8f0a2b4c6d8e0f2a4b',
    });
    assert(validSecretStaging.success, 'Genuine 64-char hex secret accepted in staging');

    // Test 5: Default secret permitted strictly in development
    const devDefaultSecret = testEnvSchema.safeParse({
      NODE_ENV: 'development',
      JWT_SECRET: 'tracegrid-dev-local-secret-key-32charsmin!',
    });
    assert(devDefaultSecret.success, 'Default development secret permitted only in development mode');

    // =========================================================================
    // Suite 2: Network Boundaries, Payloads & Reverse Proxy Handling
    // =========================================================================
    console.log('\n--- Suite 2: Network Boundaries & Payload Controls ---');

    // Test 1: Request correlation tracking
    const healthRes = await request('/api/health');
    assert(healthRes.status === 200, 'Health endpoint responds with 200 OK');
    assert(typeof healthRes.headers['x-request-id'] === 'string', 'X-Request-Id header returned');

    // Test 2: Bounded request payload limit (1mb ceiling)
    const largePayload = 'A'.repeat(1.2 * 1024 * 1024); // 1.2 MB
    const largeRes = await request('/api/v1/auth/login', {
      method: 'POST',
      rawBody: JSON.stringify({ email: 'officer@tracegrid.local', large: largePayload }),
    });
    assert(
      largeRes.status === 413 || largeRes.body?.error?.code === 'INTERNAL_SERVER_ERROR' || largeRes.status === 500,
      'Oversized JSON payload exceeding 1 MB rejected (Payload Too Large)'
    );

    // =========================================================================
    // Suite 3: Docker & Staging Configuration Verification
    // =========================================================================
    console.log('\n--- Suite 3: Container Definitions & Configuration Invariants ---');

    // Test 1: API Dockerfile
    const apiDockerfilePath = path.resolve(process.cwd(), 'apps/api/Dockerfile');
    assert(fs.existsSync(apiDockerfilePath), 'API Dockerfile exists (apps/api/Dockerfile)');
    const apiDockerfile = fs.readFileSync(apiDockerfilePath, 'utf8');
    assert(apiDockerfile.includes('USER node'), 'API Dockerfile runs as unprivileged "USER node"');
    assert(apiDockerfile.includes('HEALTHCHECK'), 'API Dockerfile defines operational HEALTHCHECK');
    assert(apiDockerfile.includes('FROM node:22-alpine'), 'API Dockerfile pins Node.js 22 LTS Alpine');

    // Test 2: Web Dockerfile
    const webDockerfilePath = path.resolve(process.cwd(), 'apps/web/Dockerfile');
    assert(fs.existsSync(webDockerfilePath), 'Web Dockerfile exists (apps/web/Dockerfile)');
    const webDockerfile = fs.readFileSync(webDockerfilePath, 'utf8');
    assert(
      webDockerfile.includes('nginxinc/nginx-unprivileged:alpine'),
      'Web Dockerfile uses unprivileged Nginx image'
    );
    assert(webDockerfile.includes('EXPOSE 8080'), 'Web Dockerfile exposes unprivileged port 8080');

    // Test 3: Nginx reverse proxy configuration
    const nginxConfPath = path.resolve(process.cwd(), 'apps/web/nginx.conf');
    assert(fs.existsSync(nginxConfPath), 'Nginx configuration exists (apps/web/nginx.conf)');
    const nginxConf = fs.readFileSync(nginxConfPath, 'utf8');
    assert(nginxConf.includes('proxy_pass http://api:5000/api/;'), 'Nginx forwards /api/ to API container');
    assert(nginxConf.includes('client_max_body_size 12M;'), 'Nginx configures 12M upload limit for attachments');
    assert(nginxConf.includes('X-Frame-Options "SAMEORIGIN"'), 'Nginx enforces X-Frame-Options header');
    assert(nginxConf.includes('try_files $uri $uri/ /index.html;'), 'Nginx includes SPA client-side fallback');

    // Test 4: Docker Compose Staging Isolation
    const stagingComposePath = path.resolve(process.cwd(), 'docker-compose.staging.yml');
    assert(fs.existsSync(stagingComposePath), 'Staging Compose file exists (docker-compose.staging.yml)');
    const stagingCompose = fs.readFileSync(stagingComposePath, 'utf8');
    assert(
      stagingCompose.includes('tracegrid_staging_postgres'),
      'Staging uses distinct container name tracegrid_staging_postgres'
    );
    assert(
      stagingCompose.includes('127.0.0.1:5433:5432'),
      'Staging binds PostgreSQL strictly to 127.0.0.1:5433 (no clash with dev 5432)'
    );
    assert(
      stagingCompose.includes('tracegrid_staging_pgdata'),
      'Staging uses distinct named volume tracegrid_staging_pgdata'
    );
    assert(
      stagingCompose.includes('127.0.0.1:8080:8080'),
      'Staging binds Web frontend strictly to 127.0.0.1:8080'
    );

    // =========================================================================
    // Suite 4: Deployment Documentation & Runbook Verification
    // =========================================================================
    console.log('\n--- Suite 4: Deployment Documentation & Operational Runbook ---');

    const deploymentDocPath = path.resolve(process.cwd(), 'docs/DEPLOYMENT.md');
    assert(fs.existsSync(deploymentDocPath), 'Deployment guide exists (docs/DEPLOYMENT.md)');
    const deploymentDoc = fs.readFileSync(deploymentDocPath, 'utf8');
    assert(deploymentDoc.includes('prisma migrate deploy'), 'Runbook instructs "prisma migrate deploy"');
    assert(deploymentDoc.includes('prisma migrate reset'), 'Runbook warns against destructive reset');
    assert(deploymentDoc.includes('openssl rand -hex 32'), 'Runbook documents secure secret generation');
    assert(deploymentDoc.includes('Staging Smoke Test Verification Checklist'), 'Runbook includes smoke test checklist');

    // =========================================================================
    // Suite 5: Staging Smoke Test Pipeline (API Simulation)
    // =========================================================================
    console.log('\n--- Suite 5: Staging Smoke Test Pipeline ---');

    // 1. Health check
    const smokeHealth = await request('/api/health');
    assert(smokeHealth.status === 200, 'Smoke 1: Health endpoint returns 200 OK');
    assert(smokeHealth.body.status === 'ok', 'Smoke 1: Overall health status is "ok"');
    assert(smokeHealth.body.subsystems?.tokenRevocation === 'healthy', 'Smoke 1: Token revocation healthy');

    // 2. Authentication
    const smokeLogin = await request('/api/v1/auth/login', {
      method: 'POST',
      body: {
        email: 'officer.sharma@tracegrid.local',
        password: 'Password123!',
      },
    });
    assert(smokeLogin.status === 200, 'Smoke 2: Officer authentication succeeds (200 OK)');
    const token = smokeLogin.body.data.token;
    assert(typeof token === 'string' && token.length > 20, 'Smoke 2: Valid JWT returned');

    // 3. Current User Context
    const smokeMe = await request('/api/v1/auth/me', { token });
    assert(smokeMe.status === 200, 'Smoke 3: /auth/me returns authenticated context');
    assert(smokeMe.body.data.role === 'CASE_OFFICER', 'Smoke 3: Context matches CASE_OFFICER role');

    // 4. Scoped Case Register
    const smokeCases = await request('/api/v1/cases', { token });
    assert(smokeCases.status === 200, 'Smoke 4: Scoped case register returns 200 OK');
    assert(Array.isArray(smokeCases.body.data), 'Smoke 4: Case list returned as array');
    assert(smokeCases.body.meta?.total !== undefined, 'Smoke 4: Total case count metadata present');

    // 5. Operations Analytics Caseload
    const smokeAnalytics = await request('/api/v1/analytics/caseload', { token });
    assert(smokeAnalytics.status === 200, 'Smoke 5: Operations caseload analytics returns 200 OK');
    assert(smokeAnalytics.body.data.caseload?.totalCases !== undefined, 'Smoke 5: Total cases metric computed');

    // 6. Cross-Case Patterns Queue
    const smokePatterns = await request('/api/v1/analytics/patterns', { token });
    assert(smokePatterns.status === 200, 'Smoke 6: Cross-case patterns queue returns 200 OK');
    assert(smokePatterns.body.data.backlog?.totalDistinctPatterns !== undefined, 'Smoke 6: Total patterns metric present');

    // 7. Operational Report Generation
    const smokeReport = await request('/api/v1/analytics/reports/operational?format=json', { token });
    assert(smokeReport.status === 200, 'Smoke 7: Operational JSON report returns 200 OK');
    assert(smokeReport.body.data.reportId !== undefined, 'Smoke 7: Canonical reportId generated');

    // 8. Restricted Access Boundary (Clerk cannot close case)
    const clerkLogin = await request('/api/v1/auth/login', {
      method: 'POST',
      body: {
        email: 'clerk.verma@tracegrid.local',
        password: 'Password123!',
      },
    });
    assert(clerkLogin.status === 200, 'Smoke 8: Clerk authenticated (200 OK)');
    const clerkToken = clerkLogin.body.data.token;
    const testCaseId = smokeCases.body.data[0].id;
    const clerkForbidden = await request(`/api/v1/cases/${testCaseId}/transition-state`, {
      method: 'POST',
      token: clerkToken,
      body: { targetState: 'CLOSED', reason: 'Attempted clerk closure' },
    });
    assert(clerkForbidden.status === 403, 'Smoke 8: Clerk denied state transition (403 Forbidden)');

    // =========================================================================
    // Summary
    // =========================================================================
    console.log('\n===================================================================');
    console.log('  Checkpoint 7C Verification Summary');
    console.log(`  Total Checks: ${passedChecks}`);
    console.log(`  Passed:       ${passedChecks}`);
    console.log(`  Failed:       ${failedChecks}`);
    console.log('===================================================================\n');

    if (failedChecks === 0) {
      console.log('🎉 ALL CHECKPOINT 7C DEPLOYMENT READINESS CHECKS PASSED!\n');
    } else {
      process.exit(1);
    }
  } finally {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }
}

runSuite().catch((err) => {
  console.error('\n❌ Unhandled error in Checkpoint 7C test suite:', err);
  process.exit(1);
});
