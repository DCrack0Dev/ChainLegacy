'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { Loader2, AlertCircle, CheckCircle2, RotateCcw, Shield, Clock, AlertTriangle, HeartPulse, Zap, RefreshCw, Search, Filter } from 'lucide-react';
import { EnterpriseSkeleton } from '@/components/enterprise/EnterpriseSkeleton';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { motion, AnimatePresence } from 'framer-motion';

type LegacyPlan = {
  id: string;
  organizationId: string;
  customerId: string;
  vaultId: string;
  name: string;
  intervalDays: number;
  guardianQuorum: number;
  encryptionConfig: any;
  walletSignatureRequired: boolean;
  status: 'draft' | 'active' | 'warning' | 'escalating' | 'claim_in_progress' | 'completed' | 'cancelled';
  lastCheckInAt?: string;
  nextEscalationAt?: string;
  suspicionScore: number;
  createdAt: string;
  updatedAt: string;
};

export default function EnterpriseLivenessPage() {
  const [plans, setPlans] = useState<LegacyPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ healthy: 0, warning: 0, escalating: 0, triggered: 0 });
  const [resettingPlan, setResettingPlan] = useState<LegacyPlan | null>(null);
  const [resetReason, setResetReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchPlans = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: ((page - 1) * pageSize).toString(),
      });
      if (statusFilter !== 'all') params.append('status', statusFilter);

      const res = await fetch(`/api/v1/liveness?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch liveness plans');
      const data = await res.json();
      setPlans(data.data || []);
      setTotal(data.meta?.total || 0);
      
      // Compute stats
      const allRes = await fetch(`/api/v1/liveness${statusFilter !== 'all' ? `?status=${statusFilter}` : ''}&limit=1000`);
      const allData = await allRes.json();
      const allPlans = allData.data || [];
      setStats({
        healthy: allPlans.filter((p: LegacyPlan) => p.status === 'active').length,
        warning: allPlans.filter((p: LegacyPlan) => p.status === 'warning').length,
        escalating: allPlans.filter((p: LegacyPlan) => p.status === 'escalating' || p.status === 'claim_in_progress').length,
        triggered: allPlans.filter((p: LegacyPlan) => p.status === 'completed' || p.status === 'cancelled').length,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, [page, statusFilter]);

  const handleReset = async () => {
    if (!resettingPlan || !resetReason.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/liveness', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          legacyPlanId: resettingPlan.id,
          reason: resetReason,
          actor: 'admin',
        }),
      });
      if (!res.ok) throw new Error('Failed to reset liveness');
      setResettingPlan(null);
      setResetReason('');
      fetchPlans();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const openResetModal = (plan: LegacyPlan) => {
    setResettingPlan(plan);
    setResetReason('Manual liveness reset by admin');
  };

  const getStatusConfig = (status: LegacyPlan['status']) => {
    const configs = {
      active: { label: 'Active', icon: <HeartPulse className="h-3 w-3" />, className: 'bg-emerald-500/20 text-emerald-400' },
      warning: { label: 'Warning', icon: <AlertTriangle className="h-3 w-3" />, className: 'bg-amber-500/20 text-amber-400' },
      escalating: { label: 'Escalating', icon: <Zap className="h-3 w-3" />, className: 'bg-orange-500/20 text-orange-400' },
      claim_in_progress: { label: 'Claim in Progress', icon: <Shield className="h-3 w-3" />, className: 'bg-blue-500/20 text-blue-400' },
      completed: { label: 'Completed', icon: <CheckCircle2 className="h-3 w-3" />, className: 'bg-emerald-500/20 text-emerald-400' },
      cancelled: { label: 'Cancelled', icon: <AlertTriangle className="h-3 w-3" />, className: 'bg-gray-500/20 text-gray-400' },
      draft: { label: 'Draft', icon: <Shield className="h-3 w-3" />, className: 'bg-gray-500/20 text-gray-400' },
    };
    return configs[status] || configs.draft;
  };

  const getTimeRemaining = (plan: LegacyPlan) => {
    if (!plan.lastCheckInAt) return 'Never checked in';
    const lastCheckIn = new Date(plan.lastCheckInAt).getTime();
    const interval = plan.intervalDays * 24 * 60 * 60 * 1000;
    const nextCheckIn = lastCheckIn + interval;
    const now = Date.now();
    const diff = nextCheckIn - now;
    
    if (diff <= 0) return 'Overdue';
    
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    if (days > 0) return `${days}d ${hours}h`;
    return `${hours}h`;
  };

  const getSuspicionColor = (score: number) => {
    if (score >= 80) return 'text-red-500';
    if (score >= 50) return 'text-amber-500';
    return 'text-emerald-500';
  };

  const hasMore = page * pageSize < total;

  return (
    <EnterpriseSkeleton
      eyebrow="Liveness"
      title="Liveness Monitoring"
      subtitle="Monitor check-in cadence, escalation status, and suspicion scores across all legacy plans."
      stats={[
        { label: 'Healthy', value: stats.healthy, tone: 'positive' },
        { label: 'Warning', value: stats.warning, tone: 'neutral' },
        { label: 'Escalating', value: stats.escalating, tone: 'negative' },
        { label: 'Resolved', value: stats.triggered, tone: 'neutral' },
      ]}
      cta={[
        { label: 'Refresh', variant: 'secondary', action: fetchPlans },
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
            placeholder="Search by plan name or customer..."
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
            <option value="active">Active</option>
            <option value="warning">Warning</option>
            <option value="escalating">Escalating</option>
            <option value="claim_in_progress">Claim in Progress</option>
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
                <th className="py-3 px-6">Plan</th>
                <th className="py-3 px-6">Status</th>
                <th className="py-3 px-6">Last Check-in</th>
                <th className="py-3 px-6">Time Remaining</th>
                <th className="py-3 px-6">Interval</th>
                <th className="py-3 px-6">Suspicion</th>
                <th className="py-3 px-6">Actions</th>
              </tr>
            </thead>
            <tbody className="text-gray-300">
              {(() => {
                if (loading && plans.length === 0) {
                  return (
                    <tr>
                      <td colSpan={7} className="py-12 text-center">
                        <Loader2 className="h-8 w-8 animate-spin text-gold mx-auto" />
                      </td>
                    </tr>
                  );
                }
                if (plans.length === 0) {
                  return (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-gray-500">No legacy plans found</td>
                    </tr>
                  );
                }
                return plans.map((plan) => {
                  const statusConfig = getStatusConfig(plan.status);
                  const timeRemaining = getTimeRemaining(plan);
                  const suspicionColor = getSuspicionColor(plan.suspicionScore);
                  return (
                    <tr key={plan.id} className="border-t border-white/5 hover:bg-white/[0.02] transition-colors">
                      <td className="py-4 px-6">
                        <p className="font-semibold text-white">{plan.name}</p>
                        <p className="text-[11px] text-gray-500 font-mono">{plan.id}</p>
                      </td>
                      <td className="py-4 px-6">
                        <span className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider ${statusConfig.className}`}>
                          {statusConfig.icon} {statusConfig.label}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-[11px] text-gray-400">
                        {plan.lastCheckInAt ? new Date(plan.lastCheckInAt).toLocaleString() : 'Never'}
                      </td>
                      <td className="py-4 px-6">
                        <span className={`font-mono ${timeRemaining === 'Overdue' ? 'text-red-500' : 'text-white'}`}>
                          {timeRemaining}
                        </span>
                      </td>
                      <td className="py-4 px-6">{plan.intervalDays} days</td>
                      <td className="py-4 px-6">
                        <span className={`font-bold ${suspicionColor}`}>{plan.suspicionScore}</span>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openResetModal(plan)}
                            className="text-gray-400 hover:text-gold"
                            title="Reset Liveness"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })
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

      {/* Reset Modal */}
      <AnimatePresence>
        {resettingPlan && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[400] flex items-center justify-center p-4"
            onClick={() => { setResettingPlan(null); setResetReason(''); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-md bg-card border border-white/10 rounded-[2.5rem] p-8 shadow-2xl overflow-hidden"
            >
              <div className="relative z-10 space-y-8 text-center">
                <div className="h-16 w-16 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
                  <RotateCcw className="h-8 w-8 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-2xl font-extrabold text-white tracking-tight mb-2">Reset Liveness</h3>
                  <p className="text-sm text-gray-500 font-medium">
                    Reset liveness for <strong className="text-white">{resettingPlan.name}</strong>?
                    This will set last check-in to now and status to active.
                  </p>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gold uppercase tracking-widest">Reason</label>
                    <Input
                      value={resetReason}
                      onChange={(e) => setResetReason(e.target.value)}
                      placeholder="Reason for reset..."
                      className="bg-black border-white/10 h-14"
                    />
                  </div>
                </div>
                <div className="flex space-x-3 pt-4">
                  <Button
                    variant="secondary"
                    className="flex-1 rounded-2xl h-14 font-bold uppercase tracking-widest text-xs"
                    onClick={() => { setResettingPlan(null); setResetReason(''); }}
                    disabled={submitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="accent"
                    className="flex-1 bg-amber-500 hover:bg-amber-600 text-black rounded-2xl h-14 font-bold uppercase tracking-widest text-xs shadow-lg shadow-amber-500/20"
                    onClick={handleReset}
                    isLoading={submitting}
                  >
                    Reset Liveness
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

function getStatusConfig(status: LegacyPlan['status']) {
  const configs = {
    active: { label: 'Active', icon: <HeartPulse className="h-3 w-3" />, className: 'bg-emerald-500/20 text-emerald-400' },
    warning: { label: 'Warning', icon: <AlertTriangle className="h-3 w-3" />, className: 'bg-amber-500/20 text-amber-400' },
    escalating: { label: 'Escalating', icon: <Zap className="h-3 w-3" />, className: 'bg-orange-500/20 text-orange-400' },
    claim_in_progress: { label: 'Claim in Progress', icon: <Shield className="h-3 w-3" />, className: 'bg-blue-500/20 text-blue-400' },
    completed: { label: 'Completed', icon: <CheckCircle2 className="h-3 w-3" />, className: 'bg-emerald-500/20 text-emerald-400' },
    cancelled: { label: 'Cancelled', icon: <AlertTriangle className="h-3 w-3" />, className: 'bg-gray-500/20 text-gray-400' },
    draft: { label: 'Draft', icon: <Shield className="h-3 w-3" />, className: 'bg-gray-500/20 text-gray-400' },
  };
  return configs[status] || configs.draft;
}

function getTimeRemaining(plan: LegacyPlan) {
  if (!plan.lastCheckInAt) return 'Never checked in';
  const lastCheckIn = new Date(plan.lastCheckInAt).getTime();
  const interval = plan.intervalDays * 24 * 60 * 60 * 1000;
  const nextCheckIn = lastCheckIn + interval;
  const now = Date.now();
  const diff = nextCheckIn - now;
  
  if (diff <= 0) return 'Overdue';
  
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h`;
}

function getSuspicionColor(score: number) {
  if (score >= 80) return 'text-red-500';
  if (score >= 50) return 'text-amber-500';
  return 'text-emerald-500';
}