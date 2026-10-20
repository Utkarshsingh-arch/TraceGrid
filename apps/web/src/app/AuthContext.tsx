import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, Role, login, logout, getMe, setAuthToken, getAuthToken, setOnUnauthorizedCallback } from '../lib/api';

export interface DemoUser {
  email: string;
  label: string;
  name: string;
  role: Role;
  jurisdiction: string;
  badge: string;
}

export const DEMO_ACCOUNTS: DemoUser[] = [
  {
    email: 'officer.sharma@tracegrid.local',
    label: 'Case Officer',
    name: 'Insp. Sharma',
    role: 'CASE_OFFICER',
    jurisdiction: 'North District',
    badge: 'ND-7482',
  },
  {
    email: 'supervisor.roy@tracegrid.local',
    label: 'Supervisor',
    name: 'Det. Sup. Roy',
    role: 'SUPERVISOR',
    jurisdiction: 'North District',
    badge: 'ND-8801',
  },
  {
    email: 'clerk.verma@tracegrid.local',
    label: 'Data Clerk',
    name: 'Clerk Verma',
    role: 'DATA_CLERK',
    jurisdiction: 'North District',
    badge: 'DC-1092',
  },
  {
    email: 'admin.root@tracegrid.local',
    label: 'System Admin',
    name: 'Admin Root',
    role: 'SYSTEM_ADMIN',
    jurisdiction: 'Global Scope',
    badge: 'HQ-0001',
  },
  {
    email: 'reviewer.mehta@tracegrid.local',
    label: 'Read-Only Reviewer',
    name: 'Auditor Mehta',
    role: 'READ_ONLY_REVIEWER',
    jurisdiction: 'North District',
    badge: 'REV-5510',
  },
];

interface AuthContextType {
  user: User | null;
  loading: boolean;
  switching: boolean;
  error: string | null;
  loginUser: (email: string, password: string) => Promise<void>;
  switchRole: (email: string) => Promise<void>;
  logoutUser: () => Promise<void>;
  canManageState: boolean;
  canLodgeCase: boolean;
  canEditMetadata: boolean;
  canAssign: boolean;
  canCalculateHypothesis: boolean;
  canLodgeLead: boolean;
  canManageLeads: boolean;
  canCreateTask: boolean;
  canManageTasks: boolean;
  canLogEvidence: boolean;
  canManageEvidence: boolean;
  canUploadAttachment: boolean;
  canViewAuditLogs: boolean;
  canViewConfidential: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [switching, setSwitching] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loginUser = useCallback(async (email: string, password: string) => {
    setError(null);
    const { user: authedUser } = await login(email, password);
    setUser(authedUser);
  }, []);

  const switchRole = useCallback(async (email: string) => {
    setSwitching(true);
    setError(null);
    try {
      const { user: authedUser } = await login(email, 'Password123!');
      setUser(authedUser);
    } catch (err) {
      console.error('Failed to switch demo role:', err);
      setError(err instanceof Error ? err.message : 'Failed to switch role');
      throw err;
    } finally {
      setSwitching(false);
    }
  }, []);

  const logoutUser = useCallback(async () => {
    try {
      await logout();
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setAuthToken(null);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    // Listen for 401 unauthorized notifications from API client
    setOnUnauthorizedCallback(() => {
      setUser(null);
      setAuthToken(null);
    });

    const initAuth = async () => {
      setLoading(true);
      setError(null);
      const token = getAuthToken();
      if (!token) {
        setUser(null);
        setLoading(false);
        return;
      }
      try {
        const currentUser = await getMe();
        setUser(currentUser);
      } catch {
        // Stored token is invalid, expired, or revoked — clear and gate
        setAuthToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    initAuth();

    return () => {
      setOnUnauthorizedCallback(null);
    };
  }, []);

  const role = user?.role;
  const canManageState = role === 'SUPERVISOR' || role === 'SYSTEM_ADMIN';
  const canLodgeCase = role === 'DATA_CLERK' || role === 'CASE_OFFICER' || role === 'SUPERVISOR' || role === 'SYSTEM_ADMIN';
  const canEditMetadata = role === 'CASE_OFFICER' || role === 'SUPERVISOR' || role === 'SYSTEM_ADMIN';
  const canAssign = role === 'SUPERVISOR' || role === 'SYSTEM_ADMIN';
  const canCalculateHypothesis = role === 'CASE_OFFICER' || role === 'SUPERVISOR' || role === 'SYSTEM_ADMIN';

  // Checkpoint 4B Workflow Permissions
  const canLodgeLead = role === 'DATA_CLERK' || role === 'CASE_OFFICER' || role === 'SUPERVISOR' || role === 'SYSTEM_ADMIN';
  const canManageLeads = role === 'CASE_OFFICER' || role === 'SUPERVISOR' || role === 'SYSTEM_ADMIN';
  const canCreateTask = role === 'CASE_OFFICER' || role === 'SUPERVISOR' || role === 'SYSTEM_ADMIN';
  const canManageTasks = role === 'CASE_OFFICER' || role === 'SUPERVISOR' || role === 'SYSTEM_ADMIN';
  const canLogEvidence = role === 'DATA_CLERK' || role === 'CASE_OFFICER' || role === 'SUPERVISOR' || role === 'SYSTEM_ADMIN';
  const canManageEvidence = role === 'CASE_OFFICER' || role === 'SUPERVISOR' || role === 'SYSTEM_ADMIN';
  const canUploadAttachment = role === 'DATA_CLERK' || role === 'CASE_OFFICER' || role === 'SUPERVISOR' || role === 'SYSTEM_ADMIN';
  const canViewAuditLogs = role === 'SUPERVISOR' || role === 'SYSTEM_ADMIN';
  const canViewConfidential = role === 'SUPERVISOR' || role === 'SYSTEM_ADMIN';

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        switching,
        error,
        loginUser,
        switchRole,
        logoutUser,
        canManageState,
        canLodgeCase,
        canEditMetadata,
        canAssign,
        canCalculateHypothesis,
        canLodgeLead,
        canManageLeads,
        canCreateTask,
        canManageTasks,
        canLogEvidence,
        canManageEvidence,
        canUploadAttachment,
        canViewAuditLogs,
        canViewConfidential,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
