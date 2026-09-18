'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { User, Building2, ChevronDown, ChevronUp, Check, Loader2, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/auth/AuthProvider';
import { useOrg } from '@/components/enterprise/OrgContext';
import { Button } from '@/components/ui/Button';

interface WorkspaceContext {
  type: 'personal' | 'organization';
  id: string;
  name: string;
  slug?: string;
}

export function WorkspaceSwitcher() {
  const { user, loading: authLoading } = useAuth();
  const { organizations, activeOrg, loading: orgLoading, setActiveOrgId, refresh } = useOrg();
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceContext[]>([]);

  // Build workspaces list
  useEffect(() => {
    if (!authLoading && user) {
      const ws: WorkspaceContext[] = [
        {
          type: 'personal',
          id: 'personal',
          name: 'Personal Account',
        },
      ];

      // Add organizations
      organizations.forEach((org) => {
        ws.push({
          type: 'organization',
          id: org.id,
          name: org.name,
          slug: org.slug,
        });
      });

      setWorkspaces(ws);
    } else {
      setWorkspaces([]);
    }
  }, [authLoading, user, organizations]);

  // Determine current workspace from pathname
  const getCurrentWorkspace = (): WorkspaceContext | null => {
    if (pathname.startsWith('/enterprise')) {
      if (activeOrg) {
        return {
          type: 'organization',
          id: activeOrg.id,
          name: activeOrg.name,
          slug: activeOrg.slug,
        };
      }
      // In enterprise but no org selected
      if (organizations.length > 0) {
        return {
          type: 'organization',
          id: organizations[0].id,
          name: organizations[0].name,
          slug: organizations[0].slug,
        };
      }
    }
    // Default to personal
    return {
      type: 'personal',
      id: 'personal',
      name: 'Personal Account',
    };
  };

  const currentWorkspace = getCurrentWorkspace();

  const handleSwitchWorkspace = (workspace: WorkspaceContext) => {
    setIsOpen(false);
    if (workspace.type === 'personal') {
      router.push('/dashboard');
    } else {
      setActiveOrgId(workspace.id);
      router.push('/enterprise/overview');
    }
  };

  const handleCreateOrganization = () => {
    setIsOpen(false);
    router.push('/enterprise/onboard');
  };

  if (authLoading || orgLoading) {
    return (
      <div className="flex items-center gap-3">
        <div className="h-10 w-40 bg-white/5 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!user || workspaces.length === 0) {
    return null;
  }

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold uppercase tracking-[0.16em] transition',
          'text-white bg-white/10'
        )}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2">
          {currentWorkspace?.type === 'organization' ? (
            <Building2 className="h-4 w-4 text-gold" />
          ) : (
            <User className="h-4 w-4 text-gold" />
          )}
          <span className="truncate max-w-[140px]">{currentWorkspace?.name || 'Select Workspace'}</span>
          {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </div>
      </Button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute right-0 mt-2 w-72 bg-card border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50"
          >
            <div className="p-4 border-b border-white/10">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Current Workspace</p>
            </div>
            
            <div className="p-2 space-y-1 max-h-80 overflow-y-auto">
              {workspaces.map((ws) => {
                const isActive = currentWorkspace?.id === ws.id;
                return (
                  <Button
                    key={ws.id}
                    variant={isActive ? 'accent' : 'ghost'}
                    size="sm"
                    className={cn(
                      'w-full justify-start gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold uppercase tracking-[0.16em] transition',
                      isActive ? 'text-white bg-white/10' : 'text-gray-400 hover:text-white hover:bg-white/5'
                    )}
                    onClick={() => handleSwitchWorkspace(ws)}
                  >
                    {ws.type === 'organization' ? (
                      <Building2 className="h-4 w-4 text-gold/80" />
                    ) : (
                      <User className="h-4 w-4 text-gold/80" />
                    )}
                    <span className="truncate">{ws.name}</span>
                    {isActive && <Check className="h-3.5 w-3.5 ml-auto text-gold" />}
                  </Button>
                );
              })}
              
              <div className="border-t border-white/10 my-2" />
              
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold uppercase tracking-[0.16em] text-gold hover:bg-gold/10"
                onClick={handleCreateOrganization}
              >
                <Building2 className="h-4 w-4" />
                <span>+ Create Organization</span>
                <ArrowRight className="h-3.5 w-3.5 ml-auto" />
              </Button>
            </div>

            <div className="p-4 border-t border-white/10">
              <p className="text-[10px] text-gray-500 text-center">
                Workspace switching is instant. Organization context is enforced server-side.
              </p>
            </div>
          </motion.div>
        </>
      )}
    </div>
  );
}

import { motion } from 'framer-motion';