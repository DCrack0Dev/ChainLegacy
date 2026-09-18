'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { enterpriseJson } from '@/lib/enterprise-client';

export type OrgSummary = {
  id: string;
  name: string;
  slug: string;
  status: string;
  country?: string;
  createdAt?: string;
};

type OrgContextValue = {
  organizations: OrgSummary[];
  activeOrg: OrgSummary | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setActiveOrgId: (orgId: string) => void;
};

const OrgContext = createContext<OrgContextValue>({
  organizations: [],
  activeOrg: null,
  loading: true,
  error: null,
  refresh: async () => undefined,
  setActiveOrgId: () => undefined,
});

const STORAGE_KEY = 'chainlegacy.activeOrgId';

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [organizations, setOrganizations] = useState<OrgSummary[]>([]);
  const [activeOrgId, setActiveOrgIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setOrganizations([]);
      setActiveOrgIdState(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await enterpriseJson<{ organizations: OrgSummary[] }>('/api/v1/organizations');
      const orgs = data.organizations || [];
      setOrganizations(orgs);

      const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
      const preferred =
        (stored && orgs.find((o) => o.id === stored)?.id) ||
        orgs[0]?.id ||
        null;
      setActiveOrgIdState(preferred);
      if (preferred && typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, preferred);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load organizations');
      setOrganizations([]);
      setActiveOrgIdState(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    void refresh();
  }, [authLoading, refresh]);

  const setActiveOrgId = (orgId: string) => {
    setActiveOrgIdState(orgId);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, orgId);
    }
  };

  const activeOrg = organizations.find((o) => o.id === activeOrgId) || null;

  return (
    <OrgContext.Provider
      value={{ organizations, activeOrg, loading, error, refresh, setActiveOrgId }}
    >
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  return useContext(OrgContext);
}
