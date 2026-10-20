import path from 'path';
import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env from root or apps/api
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const envSchema = z
  .object({
    PORT: z.coerce.number().default(5000),
    NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
    API_PREFIX: z.string().default('/api'),
    CORS_ORIGIN: z.string().default('http://localhost:5173'),
    DATABASE_URL: z.string().optional(),
    STORAGE_LOCAL_PATH: z.string().default('./storage/evidence'),
    STORAGE_REVOCATION_PATH: z.string().optional(),
    MAX_FILE_SIZE_BYTES: z.coerce.number().default(10485760),
    JWT_SECRET: z.string().default('tracegrid-dev-local-secret-key-32charsmin!'),
    JWT_EXPIRES_IN: z.string().default('8h'),
    TRUST_PROXY: z.string().default('false'),
  })
  .refine(
    (data) => {
      if (data.NODE_ENV === 'production' || data.NODE_ENV === 'staging') {
        const isDefaultSecret =
          data.JWT_SECRET.includes('tracegrid-dev') ||
          data.JWT_SECRET.includes('insecure') ||
          data.JWT_SECRET.includes('replace-in-production');
        return !isDefaultSecret && data.JWT_SECRET.length >= 32;
      }
      return true;
    },
    {
      message:
        'Staging and Production deployments must supply a secure, non-default JWT_SECRET of at least 32 characters',
      path: ['JWT_SECRET'],
    }
  );

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment variables:', JSON.stringify(parsedEnv.error.format(), null, 2));
  process.exit(1);
}

export const env = parsedEnv.data;
export type Env = z.infer<typeof envSchema>;
