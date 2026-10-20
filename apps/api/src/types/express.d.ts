import { Role } from '@prisma/client';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  jurisdictionId: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      token?: string;
    }
  }
}
