'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, Search, Loader2, AlertCircle, CheckCircle2, Edit2, Trash2, FileCheck2, Settings } from 'lucide-react';
import { EnterpriseSkeleton } from '@/components/enterprise/EnterpriseSkeleton';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/Card';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
import { motion, AnimatePresence } from 'framer-motion';

type LegacyPlan = {
  id: string;
  organizationId: string;
  customerId: string;
  vaultId: string;
  name: string;
  intervalDays: number;
  guardianQuorum: number;
  walletSignatureRequired: boolean;
  encryptionConfig: {
    algorithm: string;
    kdf: string;
    shamirThreshold: number;
    shamirShares: number;
  };
  status: 'draft' | 'active' | 'warning' | 'escalating' | 'claim_in_progress' | 'completed' | 'cancelled';
  lastCheckInAt?: string;
  nextEscalationAt?: string;
  suspicionScore: number;
  createdAt: string;
  updatedAt: string;
};

function getStatusConfig(status: LegacyPlan['status']) {
  const configs = {
    draft: { label: 'Draft', className: 'bg-gray-500/20 text-gray-400' },
    active: { label: 'Active', className: 'bg-emerald-500/20 text-emerald-400' },
    warning: { label: 'Warning', className: 'bg-amber-500/20 text-amber-400' },
    escalating: { label: 'Escalating', className: 'bg-orange-500/20 text-orange-400' },
    claim_in_progress: { label: 'Claim in Progress', className: 'bg-blue-500/20 text-blue-400' },
    completed: { label: 'Completed', className: 'bg-emerald-500/20 text-emerald-400' },
    cancelled: { label: 'Cancelled', className: 'bg-red-500/20 text-red-400' },
  };
  return configs[status] || configs.draft;
}

export function EnterprisePlansContent() {
  const searchParams = useSearchParams();
  const customerId = searchParams.get('customerId');
  
  const [plans, setPlans] = useState<LegacyPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ total: 0, active: 0, draft: 0, completed: 0 });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<LegacyPlan | null>(null);
  const [deletingPlan, setDeletingPlan] = useState<LegacyPlan | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    customerId: customerId || '',
    vaultId: '',
    name: 'Legacy Plan',
    intervalDays: 30,
    guardianQuorum: 0,
    walletSignatureRequired: false,
    encryptionConfig: {
      algorithm: 'AES-256-GCM',
      kdf: 'argon2id',
      shamirThreshold: 0,
      shamirShares: 0,
    },
  });

  const fetchPlans = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: ((page - 1) * pageSize).toString(),
      });
      if (customerId) params.append('customerId', customerId);
      if (search) params.append('search', search);

      const res = await fetch(`/api/v1/legacy-plans?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch plans');
      const data = await res.json();
      setPlans(data.data || []);
      setTotal(data.meta?.total || 0);
      
      // Compute stats
      const allRes = await fetch(`/api/v1/legacy-plans${customerId ? `?customerId=${customerId}` : ''}&limit=1000`);
      const allData = await allRes.json();
      const allPlans = allData.data || [];
      setStats({
        total: allPlans.length,
        active: allPlans.filter((p: LegacyPlan) => p.status === 'active').length,
        draft: allPlans.filter((p: LegacyPlan) => p.status === 'draft').length,
        completed: allPlans.filter((p: LegacyPlan) => p.status === 'completed').length,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, [page, search, customerId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/legacy-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create plan');
      }
      setShowCreateModal(false);
      resetForm();
      fetchPlans();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingPlan) return;
    setSubmitting(true);
    try {
      // Would need DELETE endpoint
      alert('Delete endpoint not yet implemented');
      setDeletingPlan(null);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      customerId: customerId || '',
      vaultId: '',
      name: 'Legacy Plan',
      intervalDays: 30,
      guardianQuorum: 0,
      walletSignatureRequired: false,
      encryptionConfig: {
        algorithm: 'AES-256-GCM',
        kdf: 'argon2id',
        shamirThreshold: 0,
        shamirShares: 0,
      },
    });
    setEditingPlan(null);
  };

  const openCreateModal = () => {
    resetForm();
    setShowCreateModal(true);
  };

  const openEditModal = (plan: LegacyPlan) => {
    setEditingPlan(plan);
    setFormData({
      customerId: plan.customerId,
      vaultId: plan.vaultId,
      name: plan.name,
      intervalDays: plan.intervalDays,
      guardianQuorum: plan.guardianQuorum,
      walletSignatureRequired: plan.walletSignatureRequired,
      encryptionConfig: plan.encryptionConfig,
    });
    setShowCreateModal(true);
  };

  const hasMore = page * pageSize < total;

  const ctaButtons = customerId 
    ? [{ label: '+ Create Plan', variant: 'primary' as const, action: openCreateModal }]
    : [];

  return (
    <EnterpriseSkeleton
      eyebrow="Legacy Plans"
      title={customerId ? `Plans for Customer` : 'Legacy Plans'}
      subtitle={customerId ? 'Manage legacy plans for this customer' : 'Configure liveness cadence, guardian quorum, and encryption settings per legacy plan.'}
      stats={[
        { label: 'Total Plans', value: stats.total },
        { label: 'Active', value: stats.active, tone: 'positive' },
        { label: 'Draft', value: stats.draft, tone: 'neutral' },
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
            placeholder="Search by name..."
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
                <th className="py-3 px-6">Plan</th>
                <th className="py-3 px-6">Customer</th>
                <th className="py-3 px-6">Status</th>
                <th className="py-3 px-6">Interval</th>
                <th className="py-3 px-6">Quorum</th>
                <th className="py-3 px-6">Created</th>
                <th className="py-3 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-gray-300">
              {loading && plans.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-gold mx-auto" />
                  </td>
                </tr>
              ) : plans.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-500">
                    No plans found. <Button variant="ghost" className="ml-2" onClick={openCreateModal}>Create one</Button>
                  </td>
                </tr>
              ) : (
                plans.map((plan) => (
                  <tr key={plan.id} className="border-t border-white/5 hover:bg-white/[0.02] transition-colors">
                    <td className="py-4 px-6">
                      <p className="font-semibold text-white">{plan.name}</p>
                      <p className="text-[11px] text-gray-500 truncate max-w-xs font-mono">{plan.id}</p>
                    </td>
                    <td className="py-4 px-6 font-mono text-[11px] text-gray-400">{plan.customerId}</td>
                    <td className="py-4 px-6">
                      {(() => { const { label, className } = getStatusConfig(plan.status); return <span className={`px-2 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider ${className}`}>{label}</span>; })()}
                    </td>
                    <td className="py-4 px-6">{plan.intervalDays} days</td>
                    <td className="py-4 px-6">
                      {plan.guardianQuorum > 0 ? (
                        <span className="flex items-center gap-1 text-emerald-400 text-[11px] font-semibold">
                          <CheckCircle2 className="h-3 w-3" /> {plan.guardianQuorum}-of-N
                        </span>
                      ) : (
                        <span className="text-gray-500 text-[11px]">None</span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-[11px] text-gray-500">
                      {new Date(plan.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditModal(plan)}
                          className="text-gray-400 hover:text-gold"
                          title="Edit"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeletingPlan(plan)}
                          className="text-red-500 hover:text-red-400"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
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

      {/* Create/Edit Modal */}
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
              className="relative w-full max-w-2xl bg-card border border-white/10 rounded-[2.5rem] p-8 shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
            >
              <div className="absolute top-0 right-0 p-8 opacity-5">
                <FileCheck2 className="h-32 w-32 text-gold" />
              </div>

              <div className="relative z-10 space-y-8">
                <div>
                  <h3 className="text-2xl font-extrabold text-white tracking-tight mb-2">
                    {editingPlan ? 'Edit Plan' : 'Create Legacy Plan'}
                  </h3>
                  <p className="text-sm text-gray-500 font-medium">
                    {editingPlan
                      ? 'Update legacy plan configuration.'
                      : 'Create a new legacy plan for a customer.'}
                  </p>
                </div>

                <form onSubmit={handleCreate} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                      <label className="text-[10px] font-black text-gold uppercase tracking-widest">Vault ID</label>
                      <Input
                        value={formData.vaultId}
                        onChange={(e) => setFormData({ ...formData, vaultId: e.target.value })}
                        placeholder="vlt_123"
                        className="bg-black border-white/10 h-14"
                      />
                      <p className="text-[10px] text-gray-500">Optional - will use customer's vault if not specified</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gold uppercase tracking-widest">Plan Name</label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Primary Legacy Plan"
                      required
                      className="bg-black border-white/10 h-14"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gold uppercase tracking-widest">Check-in Interval (Days)</label>
                      <Input
                        type="number"
                        value={formData.intervalDays}
                        onChange={(e) => setFormData({ ...formData, intervalDays: parseInt(e.target.value) || 30 })}
                        placeholder="30"
                        min="1"
                        max="365"
                        required
                        className="bg-black border-white/10 h-14"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gold uppercase tracking-widest">Guardian Quorum</label>
                      <Input
                        type="number"
                        value={formData.guardianQuorum}
                        onChange={(e) => setFormData({ ...formData, guardianQuorum: parseInt(e.target.value) || 0 })}
                        placeholder="0"
                        min="0"
                        max="10"
                        className="bg-black border-white/10 h-14"
                      />
                      <p className="text-[10px] text-gray-500">0 = no guardian approval required</p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gold uppercase tracking-widest">Wallet Signature</label>
                      <div className="flex items-center gap-3">
                        <Input
                          type="checkbox"
                          checked={formData.walletSignatureRequired}
                          onChange={(e) => setFormData({ ...formData, walletSignatureRequired: e.target.checked })}
                          className="w-5 h-5 accent-gold"
                        />
                        <span className="text-sm text-gray-400">Required</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gold uppercase tracking-widest">Plan Name</label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Primary Legacy Plan"
                      required
                      className="bg-black border-white/10 h-14"
                    />
                  </div>

                  <div className="pt-4 border-t border-white/10">
                    <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Encryption Configuration</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-gold uppercase tracking-widest">Algorithm</label>
                        <Input
                          value={formData.encryptionConfig.algorithm}
                          onChange={(e) => setFormData({ ...formData, encryptionConfig: { ...formData.encryptionConfig, algorithm: e.target.value } })}
                          placeholder="AES-256-GCM"
                          className="bg-black border-white/10 h-14"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-gold uppercase tracking-widest">KDF</label>
                        <Input
                          value={formData.encryptionConfig.kdf}
                          onChange={(e) => setFormData({ ...formData, encryptionConfig: { ...formData.encryptionConfig, kdf: e.target.value } })}
                          placeholder="argon2id"
                          className="bg-black border-white/10 h-14"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-gold uppercase tracking-widest">Shamir Threshold</label>
                        <Input
                          type="number"
                          value={formData.encryptionConfig.shamirThreshold}
                          onChange={(e) => setFormData({ ...formData, encryptionConfig: { ...formData.encryptionConfig, shamirThreshold: parseInt(e.target.value) || 0 } })}
                          placeholder="0"
                          min="0"
                          className="bg-black border-white/10 h-14"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-gold uppercase tracking-widest">Shamir Shares</label>
                        <Input
                          type="number"
                          value={formData.encryptionConfig.shamirShares}
                          onChange={(e) => setFormData({ ...formData, encryptionConfig: { ...formData.encryptionConfig, shamirShares: parseInt(e.target.value) || 0 } })}
                          placeholder="0"
                          min="0"
                          className="bg-black border-white/10 h-14"
                        />
                      </div>
                    </div>
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
                      {editingPlan ? 'Update Plan' : 'Create Plan'}
                    </Button>
                  </div>
                </form>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deletingPlan && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[400] flex items-center justify-center p-4"
            onClick={() => setDeletingPlan(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-md bg-card border border-white/10 rounded-[2.5rem] p-8 shadow-2xl overflow-hidden"
            >
              <div className="relative z-10 space-y-8 text-center">
                <div className="h-16 w-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="h-8 w-8 text-red-500" />
                </div>
                <div>
                  <h3 className="text-2xl font-extrabold text-white tracking-tight mb-2">Delete Plan</h3>
                  <p className="text-sm text-gray-500 font-medium">
                    Are you sure you want to delete <strong className="text-white">{deletingPlan.name}</strong>?
                    This action cannot be undone.
                  </p>
                </div>
                <div className="flex space-x-3">
                  <Button
                    variant="secondary"
                    className="flex-1 rounded-2xl h-14 font-bold uppercase tracking-widest text-xs"
                    onClick={() => setDeletingPlan(null)}
                    disabled={submitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="secondary"
                    className="flex-1 bg-red-500 hover:bg-red-600 text-black rounded-2xl h-14 font-bold uppercase tracking-widest text-xs shadow-lg"
                    onClick={handleDelete}
                    isLoading={submitting}
                  >
                    Delete Permanently
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </EnterpriseSkeleton>
  );
}