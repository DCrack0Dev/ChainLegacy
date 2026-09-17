'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, Search, Loader2, AlertCircle, CheckCircle2, Edit2, Trash2, FileCheck2, Shield, Clock, ArrowRight, Play, Eye, Users, AlertTriangle } from 'lucide-react';
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
  guardianApprovals: Record<string, boolean>;
  transitions: Array<{ from: string; to: string; at: string; actor: string }>;
  disputeReason?: string;
  completedAt?: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
};

export default function EnterpriseClaimsPage() {
  const searchParams = useSearchParams();
  const customerId = searchParams.get('customerId');
  const legacyPlanId = searchParams.get('legacyPlanId');
  
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ total: 0, pending: 0, inReview: 0, completed: 0 });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [viewingClaim, setViewingClaim] = useState<Claim | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    customerId: customerId || '',
    legacyPlanId: legacyPlanId || '',
    initiator: '',
    reason: '',
  });

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
      if (search) params.append('status', search);

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

  useEffect(() => {
    fetchClaims();
  }, [page, search, customerId, legacyPlanId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create claim');
      }
      setShowCreateModal(false);
      resetForm();
      fetchClaims();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!viewingClaim) return;
    setSubmitting(true);
    try {
      alert('Delete endpoint not yet implemented');
      setViewingClaim(null);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      customerId: customerId || '',
      legacyPlanId: legacyPlanId || '',
      initiator: '',
      reason: '',
    });
    setViewingClaim(null);
  };

  const openCreateModal = () => {
    resetForm();
    setShowCreateModal(true);
  };

  const openViewModal = (claim: Claim) => {
    setViewingClaim(claim);
  };

  const getStatusConfig = (status: Claim['status']) => {
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
  };

  const getApprovalsCount = (claim: Claim) => {
    return Object.values(claim.guardianApprovals || {}).filter(Boolean).length;
  };

  const hasMore = page * pageSize < total;

  const ctaButtons = (customerId || legacyPlanId) 
    ? [{ label: '+ Create Claim', variant: 'primary' as const, action: openCreateModal }]
    : [];

  return (
    <EnterpriseSkeleton
      eyebrow="Claims"
      title={customerId ? `Claims for Customer` : legacyPlanId ? `Claims for Plan` : 'Claims'}
      subtitle={customerId ? 'Manage claims for this customer' : '9-state claim lifecycle: pending → verification → guardian_review → grace_period → approved/rejected/disputed → completed/cancelled'}
      stats={[
        { label: 'Total Claims', value: stats.total },
        { label: 'Pending', value: stats.pending, tone: 'neutral' },
        { label: 'In Review', value: stats.inReview, tone: 'neutral' },
        { label: 'Completed', value: stats.completed, tone: 'positive' },
      ]}
      cta={ctaButtons}
    >
      {error && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center space-x-3">
          <AlertCircle className="h-5 w-5 text-red-500" />
          <p className="text-red-500 text-sm font-medium">{error}</p>
        </motion.div>
      )}

      {/* Search */}
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
                <th className="py-3 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-gray-300">
              {(() => {
                if (loading && claims.length === 0) {
                  return (
                    <tr>
                      <td colSpan={7} className="py-12 text-center">
                        <Loader2 className="h-8 w-8 animate-spin text-gold mx-auto" />
                      </td>
                    </tr>
                  );
                }
                if (claims.length === 0) {
                  return (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-gray-500">
                        No claims found. <Button variant="ghost" className="ml-2" onClick={openCreateModal}>Create one</Button>
                      </td>
                    </tr>
                  );
                }
                return claims.map((claim) => {
                  const statusConfig = getStatusConfig(claim.status);
                  const approvals = getApprovalsCount(claim);
                  const { label, icon, className } = statusConfig;
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
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openViewModal(claim)}
                            className="text-gray-400 hover:text-gold"
                            title="View"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setViewingClaim(claim)}
                            className="text-red-500 hover:text-red-400"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                });
              })()}
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

      {/* View Claim Modal */}
      <AnimatePresence>
        {viewingClaim && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[400] flex items-center justify-center p-4"
            onClick={() => setViewingClaim(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-3xl bg-card border border-white/10 rounded-[2.5rem] p-8 shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
            >
              <div className="absolute top-0 right-0 p-8 opacity-5">
                <FileCheck2 className="h-32 w-32 text-gold" />
              </div>

              <div className="relative z-10 space-y-8">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-2xl font-extrabold text-white tracking-tight mb-2">Claim Details</h3>
                    <p className="text-sm text-gray-500 font-medium">{viewingClaim.id}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setViewingClaim(null)}
                  >
                    ✕
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
                      <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Status</h4>
                      {(() => {
                        const { label, icon, className } = getStatusConfig(viewingClaim.status);
                        return (
                          <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold uppercase tracking-wider ${className}`}>
                            {icon} {label}
                          </span>
                        );
                      })()}
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
                      <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Approvals</h4>
                      <p className="text-3xl font-bold text-emerald-400">{getApprovalsCount(viewingClaim)}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
                      <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Customer</h4>
                      <p className="font-mono text-lg text-white">{viewingClaim.customerId}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
                      <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Legacy Plan</h4>
                      <p className="font-mono text-lg text-white">{viewingClaim.legacyPlanId}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
                      <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Initiator</h4>
                      <p className="text-white">{viewingClaim.initiator}</p>
                    </div>
                    {viewingClaim.reason && (
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
                        <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Reason</h4>
                        <p className="text-white">{viewingClaim.reason}</p>
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
                      <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Transitions</h4>
                      <div className="space-y-2">
                        {viewingClaim.transitions.map((t, i) => (
                          <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5">
                            <div className="flex flex-col">
                              <span className="text-[10px] text-gray-500 uppercase tracking-wider">{t.from || 'START'}</span>
                              <ArrowRight className="h-3 w-3 text-gray-500 mx-auto" />
                              <span className="text-[10px] text-gray-500 uppercase tracking-wider">{t.to}</span>
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-semibold text-white">{t.actor}</p>
                              <p className="text-[10px] text-gray-500">{new Date(t.at).toLocaleString()}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {viewingClaim.guardianApprovals && Object.keys(viewingClaim.guardianApprovals).length > 0 && (
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
                        <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Guardian Approvals</h4>
                        <div className="space-y-2">
                          {Object.entries(viewingClaim.guardianApprovals).map(([gid, approved]) => (
                            <div key={gid} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
                              <span className="font-mono text-sm text-gray-400">{gid}</span>
                              <span className={`px-2 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider ${approved ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                                {approved ? 'Approved' : 'Pending'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {viewingClaim.disputeReason && (
                      <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 space-y-4">
                        <h4 className="text-sm font-bold text-red-400 uppercase tracking-wider">Dispute Reason</h4>
                        <p className="text-white">{viewingClaim.disputeReason}</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t border-white/10">
                  <Button variant="secondary" onClick={() => setViewingClaim(null)}>
                    Close
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Claim Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[400] flex items-center justify-center p-4"
            onClick={() => { setShowCreateModal(false); resetForm(); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-md bg-card border border-white/10 rounded-[2.5rem] p-8 shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
            >
              <div className="absolute top-0 right-0 p-8 opacity-5">
                <FileCheck2 className="h-32 w-32 text-gold" />
              </div>

              <div className="relative z-10 space-y-8">
                <div>
                  <h3 className="text-2xl font-extrabold text-white tracking-tight mb-2">Create Claim</h3>
                  <p className="text-sm text-gray-500 font-medium">Initiate a new claim for a legacy plan.</p>
                </div>

                <form onSubmit={handleCreate} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gold uppercase tracking-widest">Customer ID</label>
                    <Input
                      value={formData.customerId}
                      onChange={(e) => setFormData({ ...formData, customerId: e.target.value })}
                      placeholder="cust_123"
                      required
                      className="bg-black border-white/10 h-14"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gold uppercase tracking-widest">Legacy Plan ID</label>
                    <Input
                      value={formData.legacyPlanId}
                      onChange={(e) => setFormData({ ...formData, legacyPlanId: e.target.value })}
                      placeholder="plan_123"
                      required
                      className="bg-black border-white/10 h-14"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gold uppercase tracking-widest">Initiator</label>
                    <Input
                      value={formData.initiator}
                      onChange={(e) => setFormData({ ...formData, initiator: e.target.value })}
                      placeholder="beneficiary_email@example.com"
                      required
                      className="bg-black border-white/10 h-14"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gold uppercase tracking-widest">Reason (Optional)</label>
                    <Input
                      value={formData.reason}
                      onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                      placeholder="Reason for claim..."
                      className="bg-black border-white/10 h-14"
                    />
                  </div>

                  <div className="flex space-x-3 pt-4">
                    <Button
                      type="button"
                      variant="secondary"
                      className="flex-1 rounded-2xl h-14 font-bold uppercase tracking-widest text-xs"
                      onClick={() => { setShowCreateModal(false); resetForm(); }}
                      disabled={submitting}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      variant="accent"
                      className="flex-1 bg-gold hover:bg-gold-dark text-black rounded-2xl h-14 font-bold uppercase tracking-widest text-xs shadow-lg shadow-gold/20"
                      isLoading={submitting}
                    >
                      Create Claim
                    </Button>
                  </div>
                </form>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </EnterpriseSkeleton>
  );
}

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
  return Object.values(claim.guardianApprovals || {}).filter(Boolean).length;
}