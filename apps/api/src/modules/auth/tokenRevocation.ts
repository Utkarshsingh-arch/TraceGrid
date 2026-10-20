import fs from 'fs';
import path from 'path';
import { AppError } from '../../utils/errors';

/**
 * Token Revocation Store with In-Memory Fast Lookup and Persistent Disk Backing.
 * Enforces actual server-side logout semantics for stateless JWTs.
 * Retains revoked tokens until their natural expiration time and persists them to disk
 * via atomic writes so that revoked tokens survive server process restarts.
 *
 * Reliability & Fail-Safe Invariants:
 * - Deterministic path resolution anchoring to project root storage directory.
 * - Atomic write pattern (write to tmp file in same directory + renameSync) prevents partial/corrupt files.
 * - Fail-closed security: If the store file is unreadable or corrupted, it refuses to silently
 *   allow previously revoked tokens to be accepted.
 * - Clean pruning: Naturally expired tokens are pruned automatically during maintenance.
 * - Operational diagnostics without leaking sensitive token hashes or secrets.
 * - Single-instance boundary: Documented for local filesystem; distributed clusters require Redis.
 */

export interface RevokedTokenEntry {
  revokedAt: number;
  expiresAt: number;
}

function resolveStorePath(customPath?: string): string {
  if (customPath) {
    return path.resolve(customPath);
  }
  if (process.env.STORAGE_REVOCATION_PATH) {
    return path.resolve(process.env.STORAGE_REVOCATION_PATH);
  }

  // Deterministically find project root storage
  let curr = __dirname;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(curr, 'storage', 'revoked_tokens.json');
    if (fs.existsSync(path.join(curr, 'package.json')) && fs.existsSync(path.join(curr, 'docker-compose.yml'))) {
      return candidate;
    }
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }

  return path.resolve(process.cwd(), 'storage/revoked_tokens.json');
}

export class TokenRevocationStore {
  private revokedTokens = new Map<string, RevokedTokenEntry>();
  private readonly storeFilePath: string;
  private isCorrupted = false;
  private corruptionReason: string | null = null;

  constructor(customPath?: string) {
    this.storeFilePath = resolveStorePath(customPath);
    this.ensureDirectory();
    this.loadFromDisk();
  }

  public getStorePath(): string {
    return this.storeFilePath;
  }

  public isHealthy(): boolean {
    return !this.isCorrupted;
  }

  public getCorruptionReason(): string | null {
    return this.corruptionReason;
  }

  public getCount(): number {
    return this.revokedTokens.size;
  }

  private ensureDirectory(): void {
    try {
      const dir = path.dirname(this.storeFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch (err: any) {
      console.error(`[TokenRevocationStore] Failed to initialize storage directory: ${err.message}`);
    }
  }

  private loadFromDisk(): void {
    try {
      if (!fs.existsSync(this.storeFilePath)) {
        this.isCorrupted = false;
        this.corruptionReason = null;
        return;
      }

      const raw = fs.readFileSync(this.storeFilePath, 'utf8');
      if (!raw.trim()) {
        // Empty file initialized
        this.isCorrupted = false;
        this.corruptionReason = null;
        return;
      }

      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch (parseErr: any) {
        throw new Error(`JSON parse syntax error: ${parseErr.message}`);
      }

      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('Persisted revocation store is not a key-value object');
      }

      const now = Date.now();
      for (const [token, entry] of Object.entries(parsed as Record<string, RevokedTokenEntry>)) {
        if (entry && typeof entry.expiresAt === 'number' && entry.expiresAt > now) {
          this.revokedTokens.set(token, entry);
        }
      }

      this.isCorrupted = false;
      this.corruptionReason = null;
    } catch (err: any) {
      this.isCorrupted = true;
      this.corruptionReason = err.message;
      console.error(`[TokenRevocationStore] CRITICAL ALERT: Revocation store at ${this.storeFilePath} is corrupted or unreadable. Entering fail-safe mode. Error: ${err.message}`);

      // Attempt non-destructive backup for forensic inspection
      try {
        const backupPath = `${this.storeFilePath}.corrupted.${Date.now()}`;
        if (fs.existsSync(this.storeFilePath)) {
          fs.copyFileSync(this.storeFilePath, backupPath);
          console.error(`[TokenRevocationStore] Corrupted store preserved at ${backupPath}`);
        }
      } catch {
        // Best effort
      }
    }
  }

  private persistToDisk(): void {
    if (this.isCorrupted) {
      console.warn('[TokenRevocationStore] Persistence skipped while store is in corrupted fail-safe state.');
      return;
    }

    try {
      this.ensureDirectory();
      const data: Record<string, RevokedTokenEntry> = {};
      for (const [token, entry] of this.revokedTokens.entries()) {
        data[token] = entry;
      }
      const jsonContent = JSON.stringify(data, null, 2);

      // Atomic write pattern: Write to temp file then rename atomically within the same filesystem
      const dir = path.dirname(this.storeFilePath);
      const tmpFile = path.join(dir, `.revoked_tokens.tmp.${Date.now()}.${Math.random().toString(36).substring(2, 8)}`);
      fs.writeFileSync(tmpFile, jsonContent, { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(tmpFile, this.storeFilePath);
    } catch (err: any) {
      console.error(`[TokenRevocationStore] Failed to atomically persist revoked tokens to disk: ${err.message}`);
    }
  }

  public revoke(token: string, expiresAtSec: number): void {
    if (this.isCorrupted) {
      throw new AppError(
        'Token revocation service is currently unavailable due to store integrity failure',
        503
      );
    }

    const expiresAt = expiresAtSec * 1000;
    this.revokedTokens.set(token, {
      revokedAt: Date.now(),
      expiresAt,
    });
    this.cleanup();
    this.persistToDisk();
  }

  public isRevoked(token: string): boolean {
    if (this.isCorrupted) {
      // FAIL-SAFE INVARIANT: Corrupted store MUST NOT permit revoked tokens to silently become valid.
      // Throwing 503 fails closed and stops unauthorized access.
      throw new AppError(
        'Authentication verification unavailable: token revocation store integrity failure',
        503
      );
    }

    const entry = this.revokedTokens.get(token);
    if (!entry) return false;

    if (Date.now() > entry.expiresAt) {
      this.revokedTokens.delete(token);
      this.persistToDisk();
      return false;
    }

    return true;
  }

  public cleanup(): void {
    const now = Date.now();
    let modified = false;
    for (const [token, entry] of this.revokedTokens.entries()) {
      if (now > entry.expiresAt) {
        this.revokedTokens.delete(token);
        modified = true;
      }
    }
    if (modified && !this.isCorrupted) {
      this.persistToDisk();
    }
  }

  public clear(): void {
    this.revokedTokens.clear();
    this.isCorrupted = false;
    this.corruptionReason = null;
    this.persistToDisk();
  }

  public reload(): void {
    this.revokedTokens.clear();
    this.loadFromDisk();
  }

  public resetCorruption(): void {
    this.isCorrupted = false;
    this.corruptionReason = null;
  }
}

export const tokenRevocationStore = new TokenRevocationStore();
