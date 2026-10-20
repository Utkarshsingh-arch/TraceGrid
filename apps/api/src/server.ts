import { app } from './app';
import { env } from './config/env';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function startServer() {
  // 1. Verify database connectivity before opening network listener
  try {
    await prisma.$connect();
    console.log('[TraceGrid API] Database connectivity verified successfully.');
  } catch (dbErr: any) {
    console.error('[TraceGrid API] FATAL: Unable to connect to PostgreSQL database:', dbErr.message);
    if (env.NODE_ENV === 'production' || env.NODE_ENV === 'staging') {
      console.error('[TraceGrid API] Exiting process due to database connection failure in non-dev mode.');
      process.exit(1);
    }
  }

  // 2. Start HTTP listener
  const server = app.listen(env.PORT, () => {
    console.log(`====================================================`);
    console.log(`  TraceGrid API Service Running`);
    console.log(`  Environment: ${env.NODE_ENV}`);
    console.log(`  Port:        ${env.PORT}`);
    console.log(`  Health:      http://localhost:${env.PORT}${env.API_PREFIX}/health`);
    console.log(`====================================================`);
  });

  // 3. Graceful shutdown handler
  function handleShutdown(signal: string) {
    console.log(`\nReceived ${signal}. Shutting down TraceGrid API gracefully...`);
    server.close(async () => {
      try {
        await prisma.$disconnect();
      } catch (discErr: any) {
        console.warn(`[TraceGrid API] Warning during database disconnect: ${discErr.message}`);
      }
      console.log('TraceGrid API server closed successfully.');
      process.exit(0);
    });

    // Force exit after 10s if hanging
    setTimeout(() => {
      console.error('Forcefully terminating TraceGrid API after timeout.');
      process.exit(1);
    }, 10000);
  }

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));

  return server;
}

const serverPromise = startServer();
export { serverPromise };
