'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, AlertCircle, CheckCircle2, Search, Filter, Shield, Clock, ArrowRight, Play, Eye, Users, AlertTriangle, RotateCcw, Key, Mail, Hash, Fingerprint, FileText } from 'lucide-react';
import { EnterpriseSkeleton } from '@/components/enterprise/EnterpriseSkeleton';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { motion, AnimatePresence } from 'framer-motion';

type Claim = {
  id: string;
  organizationId: string;
  customerId: string;
  legacyPlanId: string;
  status: 'pending' | 'verification' | 'guardian_review' | 'grace_period' | 'approved' | 'rejected' | 'disputed' | 'completed' | 'cancelled';
  initiator: string;
  reason?: string;
  guardianApprovals: Record<string, { approved: boolean; at: number; proofScheme?: string }>;
  transitions: Array<{ from: string; to: string; at: string; actor: string }>;
  disputeReason?: string;
  completedAt?: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
};

type LegacyPlan = {
  id: string;
  guardianQuorum: number;
};

function getStatusConfig(status: Claim['status']) {
  const configs = {
    pending: { label: 'Pending', icon: <Clock className="h-3 w-3" />, className: 'bg-blue-500/20 text-blue-400' },
    verification: { label: 'Verification', icon: <Shield className="h-3 w-3" />, className: 'bg-purple-500/20 text-purple-400' },
    guardian_review: { label: 'Guardian Review', icon: <Users className="h-3 w-3" />, className: 'bg-amber-500/20 text-amber-400' },
    grace_period: { label: 'Grace Period', icon: <Clock className="h-3 w-3" />, className: 'bg-orange-500/20 text-orange-400' },
    approved: { label: 'Approved', icon: <CheckCircle2 className="h-3 w-3" />, className: 'bg-emerald-500/20 text-emerald-400' },
    rejected: { label: 'Rejected', icon: <AlertTriangle className="h-3 w-3" />, className: 'bg-red-500/20 text-red-400' },
    disputed: { label: 'Disputed', icon: <AlertTriangle className="h-3 w-3" />, className: 'bg-red-500/20 text-red-400' },
    completed: { label: 'Completed', icon: <CheckCircle2 className="h-3 w-3" />, className: 'bg-emerald-500/20 text-emerald-400' },
    cancelled: { label: 'Cancelled', icon: <AlertTriangle className="h-3 w-3" />, className: 'bg-gray-500/20 text-gray-400' },
  };
  return configs[status] || configs.pending;
}

function getApprovalsCount(claim: Claim) {
  return Object.values(claim.guardianApprovals || {}).filter((a: any) => a && a.approved).length;
}

const VALID_TRANSITIONS: Record<Claim['status'], Claim['status'][]> = {
  pending: ['verification', 'cancelled'],
  verification: ['guardian_review', 'rejected', 'cancelled'],
  guardian_review: ['grace_period', 'rejected', 'cancelled'],
  grace_period: ['approved', 'rejected', 'cancelled'],
  approved: ['completed', 'disputed'],
  rejected: ['cancelled'],
  disputed: ['rejected', 'cancelled'],
  completed: [],
  cancelled: [],
};

export default function EnterpriseClaimsTransitionsPage() {
  const searchParams = useSearchParams();
  const customerId = searchParams.get('customerId');
  const legacyPlanId = searchParams.get('legacyPlanId');
  
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ total: 0, pending: 0, inReview: 0, completed: 0 });
  const [transitioningClaim, setTransitioningClaim] = useState<Claim | null>(null);
  const [targetStatus, setTargetStatus] = useState<Claim['status'] | null>(null);
  const [guardianId, setGuardianId] = useState('');
  const [guardianApproved, setGuardianApproved] = useState(false);
  const [guardianProof, setGuardianProof] = useState<{ scheme: string; nonce?: string; signature?: string; messageHash?: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showGuardianProofModal, setShowGuardianProofModal] = useState(false);
  const [availableGuardians, setAvailableGuardians] = useState<Array<{ id: string; name: string; email: string }>>([]);

  const fetchClaims = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: ((page - 1) * pageSize).toString(),
      });
      if (customerId) params.append('customerId', customerId);
      if (legacyPlanId) params.append('legacyPlanId', legacyPlanId);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (search) params.append('search', search);

      const res = await fetch(`/api/v1/claims?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch claims');
      const data = await res.json();
      setClaims(data.data || []);
      setTotal(data.meta?.total || 0);
      
      // Compute stats
      const allRes = await fetch(`/api/v1/claims${customerId ? `?customerId=${customerId}` : legacyPlanId ? `?legacyPlanId=${legacyPlanId}` : ''}&limit=1000`);
      const allData = await allRes.json();
      const allClaims = allData.data || [];
      setStats({
        total: allClaims.length,
        pending: allClaims.filter((c: Claim) => c.status === 'pending').length,
        inReview: allClaims.filter((c: Claim) => c.status === 'verification' || c.status === 'guardian_review' || c.status === 'grace_period').length,
        completed: allClaims.filter((c: Claim) => c.status === 'completed').length,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchGuardians = async (organizationId: string) => {
    try {
      const res = await fetch(`/api/v1/guardians?limit=100`);
      if (!res.ok) return;
      const data = await res.json();
      const guardians = data.data || [];
      setAvailableGuardians(guardians.map((g: any) => ({ id: g.id, name: g.name, email: g.email })));
    } catch {
      // ignore
    }
  };

  const fetchLegacyPlan = async (organizationId: string, planId: string): Promise<LegacyPlan | null> => {
    try {
      const res = await fetch(`/api/v1/legacy-plans?limit=1&search=${planId}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.data?.[0] || null;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    fetchClaims();
  }, [page, search, statusFilter, customerId, legacyPlanId]);

  const handleTransition = async () => {
    if (!transitioningClaim || !targetStatus) return;
    setSubmitting(true);
    try {
      const orgId = transitioningClaim.organizationId;
      
      // Fetch guardians for this org if not already loaded
      if (availableGuardians.length === 0) {
        await fetchGuardians(orgId);
      }

      const body: any = {
        claimId: transitioningClaim.id,
        to: targetStatus,
      };

      // If transitioning to guardian_review or approving in guardian_review, we need guardian proof
      if (targetStatus === 'guardian_review' || (transitioningClaim.status === 'guardian_review' && guardianApproved)) {
        if (!guardianId) {
          throw new Error('Guardian ID is required for this transition');
        }
        body.guardianId = guardianId;
        body.guardianApproved = guardianApproved;
        
        if (guardianApproved) {
          // For guardian approval, we need a proof
          // In a real app, this would come from the guardian signing
          // For now, we'll use firebase_uid_match as a simple proof
          body.guardianProof = {
            scheme: 'firebase_uid_match',
            nonce: `nonce_${Date.now()}`,
            signedAt: new Date().toISOString(),
          };
        }
      }

      const res = await fetch('/api/v1/claims/transition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to transition claim');
      }
      
      setTransitioningClaim(null);
      setTargetStatus(null);
      setGuardianId('');
      setGuardianApproved(false);
      setGuardianProof(null);
      fetchClaims();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const openTransitionModal = (claim: Claim) => {
    const validNext = VALID_TRANSITIONS[claim.status] || [];
    if (validNext.length === 0) {
      alert('No valid transitions available for this claim status');
      return;
    }
    setTransitioningClaim(claim);
    setTargetStatus(validNext[0]);
  };

  const hasMore = page * pageSize < total;

  const renderClaimsBody = () => {
    if (loading && claims.length === 0) {
      return (
        <tr>
          <td colSpan={8} className="py-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-gold mx-auto" />
          </td>
        </tr>
      );
    }
    if (claims.length === 0) {
      return (
        <tr>
          <td colSpan={8} className="py-12 text-center text-gray-500">No claims found</td>
        </tr>
      );
    }
    return claims.map((claim) => {
      const statusConfig = getStatusConfig(claim.status);
      const approvals = getApprovalsCount(claim);
      const { label, icon, className } = statusConfig;
      const validNext = VALID_TRANSITIONS[claim.status] || [];
      
      return (
        <tr key={claim.id} className="border-t border-white/5 hover:bg-white/[0.02] transition-colors">
          <td className="py-4 px-6">
            <p className="font-semibold text-white">{claim.id}</p>
            <p className="text-[11px] text-gray-500 font-mono">{claim.legacyPlanId}</p>
          </td>
          <td className="py-4 px-6 font-mono text-[11px] text-gray-400">{claim.customerId}</td>
          <td className="py-4 px-6">
            <span className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider ${className}`}>
              {icon} {label}
            </span>
          </td>
          <td className="py-4 px-6">
            <span className="flex items-center gap-1 text-emerald-400 text-[11px] font-semibold">
              <CheckCircle2 className="h-3 w-3" /> {approvals}
            </span>
          </td>
          <td className="py-4 px-6 text-[11px] text-gray-400">{claim.initiator}</td>
          <td className="py-4 px-6 text-[11px] text-gray-500">
            {new Date(claim.createdAt).toLocaleDateString()}
          </td>
          <td className="py-4 px-6 text-center">
            {validNext.length > 0 ? (
              <span className="px-2 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-green-500/20 text-emerald-400">
                {validNext.map(s => s.replace('_', ' ')).join(', ')}
              </span>
            ) : (
              <span className="text-gray-500 text-[11px]">Terminal</span>
            )}
          </td>
          <td className="py-4 px-6 text-right">
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => openTransitionModal(claim)}
                disabled={validNext.length === 0 || loading}
                className="text-gray-400 hover:text-gold"
                title="Transition"
              >
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTransitioningClaim(claim)} // Reuse for view
                className="text-gray-400 hover:text-gold"
                title="View"
              >
                <Eye className="h-4 w-4" />
              </Button>
            </div>
          </td>
        </tr>
      );
    });
  };

  return (
    <EnterpriseSkeleton
      eyebrow="Claims Transitions"
      title={customerId ? `Claims for Customer` : legacyPlanId ? `Claims for Plan` : 'Claim Transitions'}
      subtitle={customerId ? 'Manage claim state transitions for this customer' : 'Server-authoritative claim lifecycle transitions with guardian quorum enforcement.'}
      stats={[
        { label: 'Total Claims', value: stats.total },
        { label: 'Pending', value: stats.pending, tone: 'neutral' },
        { label: 'In Review', value: stats.inReview, tone: 'neutral' },
        { label: 'Completed', value: stats.completed, tone: 'positive' },
      ]}
      cta={[
        { label: 'Refresh', variant: 'secondary', action: fetchClaims },
      ]}
    >
      {error && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center space-x-3">
          <AlertCircle className="h-5 w-5 text-red-500" />
          <p className="text-red-500 text-sm font-medium">{error}</p>
        </motion.div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <Input
            placeholder="Filter by status..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-10 pr-4"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="pl-10 pr-10 bg-black border border-white/10 h-14 text-white rounded-2xl appearance-none"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="verification">Verification</option>
            <option value="guardian_review">Guardian Review</option>
            <option value="grace_period">Grace Period</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="disputed">Disputed</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <Filter className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none" />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-gray-500 uppercase tracking-widest text-[11px] bg-white/[0.02]">
              <tr>
                <th className="py-3 px-6">Claim</th>
                <th className="py-3 px-6">Customer</th>
                <th className="py-3 px-6">Status</th>
                <th className="py-3 px-6">Approvals</th>
                <th className="py-3 px-6">Initiator</th>
                <th className="py-3 px-6">Created</th>
                <th className="py-3 px-6">Valid Transitions</th>
                <th className="py-3 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-gray-300">
              {renderClaimsBody()}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {(total > pageSize || page > 1) && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-white/10">
            <p className="text-[11px] text-gray-500">
              Showing {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, total)} of {total}
            </p>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1 || loading}
              >
                Previous
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPage(p => p + 1)}
                disabled={!hasMore || loading}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Transition Modal */}
      <AnimatePresence>
        {transitioningClaim && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[400] flex items-center justify-center p-4"
            onClick={() => { setTransitioningClaim(null); setTargetStatus(null); setGuardianId(''); setGuardianApproved(false); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-2xl bg-card border border-white/10 rounded-[2.5rem] p-8 shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
            >
              <div className="absolute top-0 right-0 p-8 opacity-5">
                <ArrowRight className="h-32 w-32 text-gold" />
              </div>

              <div className="relative z-10 space-y-8">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-2xl font-extrabold text-white tracking-tight mb-2">Transition Claim</h3>
                    <p className="text-sm text-gray-500 font-medium">{transitioningClaim.id}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setTransitioningClaim(null); setTargetStatus(null); setGuardianId(''); setGuardianApproved(false); }}
                  >
                    ✕
                  </Button>
                </div>

                <div className="space-y-6">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
                    <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Current Status</h4>
                    {(() => {
                      const { label, icon, className } = getStatusConfig(transitioningClaim.status);
                      return (
                        <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold uppercase tracking-wider ${className}`}>
                          {icon} {label}
                        </span>
                      );
                    })()}
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
                    <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Valid Next Transitions</h4>
                    <div className="flex flex-wrap gap-2">
                      {(VALID_TRANSITIONS[transitioningClaim.status] || []).map((status) => (
                        <Button
                          key={status}
                          variant={targetStatus === status ? 'accent' : 'secondary'}
                          size="sm"
                          onClick={() => setTargetStatus(status)}
                          className="h-10"
                        >
                          {status.replace('_', ' ')}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {targetStatus === 'guardian_review' || (transitioningClaim.status === 'guardian_review' && targetStatus === 'grace_period') ? (
                    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6 space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                          <Users className="h-5 w-5 text-amber-400" />
                        </div>
                        <div>
                          <p className="font-semibold text-amber-300">Guardian Quorum Required</p>
                          <p className="text-sm text-gray-500">This transition requires guardian approval</p>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-gold uppercase tracking-widest">Guardian</label>
                        <select
                          value={guardianId}
                          onChange={(e) => setGuardianId(e.target.value)}
                          className="w-full bg-black border border-white/10 h-14 text-white rounded-2xl appearance-none"
                        >
                          <option value="">Select Guardian</option>
                          {availableGuardians.map((g) => (
                            <option key={g.id} value={g.id}>{g.name} ({g.email})</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-gold uppercase tracking-widest">Action</label>
                        <div className="flex gap-3">
                          {(['approve', 'reject'] as const).map((action) => (
                            <Button
                              key={action}
                              variant={guardianApproved && action === 'approve' ? 'accent' : !guardianApproved && action === 'reject' ? 'secondary' : 'ghost'}
                              className="flex-1"
                              onClick={() => { setGuardianApproved(action === 'approve'); }}
                            >
                              {action === 'approve' ? 'Approve' : 'Reject'}
                            </Button>
                          ))}
                        </div>
                      </div>

                      {guardianApproved && (
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-gold uppercase tracking-widest">Proof Scheme</label>
                          <select
                            value={guardianProof?.scheme || 'firebase_uid_match'}
                            onChange={(e) => setGuardianProof({ ...(guardianProof || {}), scheme: e.target.value })}
                            className="w-full bg-black border border-white/10 h-14 text-white rounded-2xl appearance-none"
                          >
                            <option value="firebase_uid_match">Firebase UID Match</option>
                            <option value="eip712">EIP-712 Signature</option>
                            <option value="eth_sign">eth_sign Signature</option>
                          </select>
                          <p className="text-[10px] text-gray-500">Guardian must provide identity proof for approval</p>
                        </div>
                      )}
                    </div>
                  ) : null}

                  {transitioningClaim.status === 'verification' && targetStatus === 'guardian_review' ? (
                    <div className="rounded-2xl border border-purple-500/30 bg-purple-500/5 p-6 space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                          <Fingerprint className="h-5 w-5 text-purple-400" />
                        </div>
                        <div>
                          <p className="font-semibold text-purple-300">Identity Verification Required</p>
                          <p className="text-sm text-gray-500">Customer must be verified before guardian review</p>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="flex space-x-3 pt-4">
                    <Button
                      variant="secondary"
                      className="flex-1 rounded-2xl h-14 font-bold uppercase tracking-widest text-xs"
                      onClick={() => { setTransitioningClaim(null); setTargetStatus(null); setGuardianId(''); setGuardianApproved(false); }}
                      disabled={submitting}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="accent"
                      className="flex-1 bg-gold hover:bg-gold-dark text-black rounded-2xl h-14 font-bold uppercase tracking-widest text-xs shadow-lg shadow-gold/20"
                      onClick={handleTransition}
                      isLoading={submitting}
                    >
                      Execute Transition
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </EnterpriseSkeleton>
  );
}