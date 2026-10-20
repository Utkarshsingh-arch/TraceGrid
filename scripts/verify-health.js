/**
 * TraceGrid Health Verification Script
 * Validates backend API availability and response structure.
 * Pings running server, or falls back to ephemeral server instance.
 */

const http = require('http');

const PORT = process.env.PORT || 5000;
const HEALTH_URL = `http://localhost:${PORT}/api/health`;

console.log(`[TraceGrid Test] Pinging health endpoint: ${HEALTH_URL}`);

function verifyPayload(data, callback) {
  try {
    const parsed = JSON.parse(data);
    console.log('✅ Health Check Passed successfully!');
    console.log('Response Payload:');
    console.log(JSON.stringify(parsed, null, 2));

    if (parsed.status === 'ok' && parsed.service === 'tracegrid-api') {
      console.log('\n[PASS] Verified status="ok" and service="tracegrid-api".');
      callback(null);
    } else {
      callback(new Error('Unexpected payload structure: ' + JSON.stringify(parsed)));
    }
  } catch (err) {
    callback(err);
  }
}

const req = http.get(HEALTH_URL, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    if (res.statusCode !== 200) {
      console.error(`❌ Health check failed with HTTP status ${res.statusCode}`);
      process.exit(1);
    }
    verifyPayload(data, (err) => {
      if (err) {
        console.error('❌', err.message);
        process.exit(1);
      }
      process.exit(0);
    });
  });
});

req.on('error', () => {
  console.log(`ℹ️ No standalone server running on port ${PORT}. Spawning ephemeral instance for health check...`);
  try {
    const { createApp } = require('../apps/api/dist/app');
    const app = createApp();
    const server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const ephemeralUrl = `http://127.0.0.1:${addr.port}/api/health`;
      http.get(ephemeralUrl, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          server.close();
          verifyPayload(data, (err) => {
            if (err) {
              console.error('❌', err.message);
              process.exit(1);
            }
            process.exit(0);
          });
        });
      });
    });
  } catch (spawnErr) {
    console.error('❌ Could not start ephemeral instance:', spawnErr.message);
    process.exit(1);
  }
});
