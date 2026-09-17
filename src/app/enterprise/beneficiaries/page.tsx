'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, Search, Loader2, AlertCircle, CheckCircle2, Edit2, Trash2, Users, Wallet, Mail, Phone } from 'lucide-react';
import { EnterpriseSkeleton } from '@/components/enterprise/EnterpriseSkeleton';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { motion, AnimatePresence } from 'framer-motion';

type Beneficiary = {
  id: string;
  organizationId: string;
  customerId: string;
  legacyPlanId?: string | null;
  name: string;
  email: string;
  phone?: string;
  walletAddress?: string;
  share: number;
  createdAt: string;
  updatedAt: string;
};

export default function EnterpriseBeneficiariesPage() {
  const searchParams = useSearchParams();
  const customerId = searchParams.get('customerId');
  
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ total: 0, withWallet: 0, emailOnly: 0, totalShare: 0 });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingBeneficiary, setEditingBeneficiary] = useState<Beneficiary | null>(null);
  const [deletingBeneficiary, setDeletingBeneficiary] = useState<Beneficiary | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    customerId: customerId || '',
    legacyPlanId: '',
    name: '',
    email: '',
    phone: '',
    walletAddress: '',
    share: 100,
  });

  const fetchBeneficiaries = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: ((page - 1) * pageSize).toString(),
      });
      if (customerId) params.append('customerId', customerId);
      if (search) params.append('email', search);

      const res = await fetch(`/api/v1/beneficiaries?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch beneficiaries');
      const data = await res.json();
      setBeneficiaries(data.data || []);
      setTotal(data.meta?.total || 0);
      
      // Compute stats
      const allRes = await fetch(`/api/v1/beneficiaries${customerId ? `?customerId=${customerId}` : ''}&limit=1000`);
      const allData = await allRes.json();
      const allBeneficiaries = allData.data || [];
      setStats({
        total: allBeneficiaries.length,
        withWallet: allBeneficiaries.filter((b: Beneficiary) => b.walletAddress).length,
        emailOnly: allBeneficiaries.filter((b: Beneficiary) => !b.walletAddress).length,
        totalShare: allBeneficiaries.reduce((sum: number, b: Beneficiary) => sum + (b.share || 0), 0),
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBeneficiaries();
  }, [page, search, customerId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/beneficiaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create beneficiary');
      }
      setShowCreateModal(false);
      resetForm();
      fetchBeneficiaries();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingBeneficiary) return;
    setSubmitting(true);
    try {
      // Would need DELETE endpoint
      alert('Delete endpoint not yet implemented');
      setDeletingBeneficiary(null);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      customerId: customerId || '',
      legacyPlanId: '',
      name: '',
      email: '',
      phone: '',
      walletAddress: '',
      share: 100,
    });
    setEditingBeneficiary(null);
  };

  const openCreateModal = () => {
    resetForm();
    setShowCreateModal(true);
  };

  const openEditModal = (beneficiary: Beneficiary) => {
    setEditingBeneficiary(beneficiary);
    setFormData({
      customerId: beneficiary.customerId,
      legacyPlanId: beneficiary.legacyPlanId || '',
      name: beneficiary.name,
      email: beneficiary.email,
      phone: beneficiary.phone || '',
      walletAddress: beneficiary.walletAddress || '',
      share: beneficiary.share,
    });
    setShowCreateModal(true);
  };

  const getShareBarColor = (share: number) => {
    if (share >= 50) return 'bg-emerald-500';
    if (share >= 25) return 'bg-amber-500';
    return 'bg-blue-500';
  };

  const hasMore = page * pageSize < total;

  const ctaButtons = customerId 
    ? [{ label: '+ Add Beneficiary', variant: 'primary' as const, action: openCreateModal }]
    : [];

  return (
    <EnterpriseSkeleton
      eyebrow="Beneficiaries"
      title={customerId ? `Beneficiaries` : 'Beneficiaries'}
      subtitle={customerId ? 'Manage beneficiaries for this customer' : 'Who inherits, what share, and how funds are distributed. Server-side customerId ∈ organizationId guard prevents cross-org injection.'}
      stats={[
        { label: 'Total', value: stats.total },
        { label: 'With Wallet', value: stats.withWallet, tone: 'positive' },
        { label: 'Email Only', value: stats.emailOnly, tone: 'neutral' },
        { label: 'Total Share', value: `${stats.totalShare}%`, tone: stats.totalShare > 100 ? 'negative' : 'positive' },
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
            placeholder="Search by email..."
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
                <th className="py-3 px-6">Beneficiary</th>
                <th className="py-3 px-6">Customer</th>
                <th className="py-3 px-6">Contact</th>
                <th className="py-3 px-6">Wallet</th>
                <th className="py-3 px-6">Share</th>
                <th className="py-3 px-6">Created</th>
                <th className="py-3 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-gray-300">
              {loading && beneficiaries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-gold mx-auto" />
                  </td>
                </tr>
              ) : beneficiaries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-500">
                    No beneficiaries found. <Button variant="ghost" className="ml-2" onClick={openCreateModal}>Create one</Button>
                  </td>
                </tr>
              ) : (
                beneficiaries.map((beneficiary) => (
                  <tr key={beneficiary.id} className="border-t border-white/5 hover:bg-white/[0.02] transition-colors">
                    <td className="py-4 px-6">
                      <p className="font-semibold text-white">{beneficiary.name}</p>
                      <p className="text-[11px] text-gray-500 truncate max-w-xs font-mono">{beneficiary.id}</p>
                    </td>
                    <td className="py-4 px-6 font-mono text-[11px] text-gray-400">{beneficiary.customerId}</td>
                    <td className="py-4 px-6">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Mail className="h-3 w-3 text-gray-500" />
                          <span className="text-[11px] text-gray-400">{beneficiary.email}</span>
                        </div>
                        {beneficiary.phone && (
                          <div className="flex items-center gap-2">
                            <Phone className="h-3 w-3 text-gray-500" />
                            <span className="text-[11px] text-gray-400">{beneficiary.phone}</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      {beneficiary.walletAddress ? (
                        <div className="flex items-center gap-2 text-emerald-400">
                          <Wallet className="h-4 w-4" />
                          <span className="text-[11px] font-mono truncate max-w-xs">{beneficiary.walletAddress}</span>
                        </div>
                      ) : (
                        <span className="text-gray-500 text-[11px]">No wallet</span>
                      )}
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2">
                        <div className={`h-2 w-20 rounded-full bg-white/10 overflow-hidden`}>
                          <div 
                            className={`h-full ${getShareBarColor(beneficiary.share)} transition-all duration-500`}
                            style={{ width: `${Math.min(beneficiary.share, 100)}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-bold text-white w-10 text-right">{beneficiary.share}%</span>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-[11px] text-gray-500">
                      {new Date(beneficiary.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditModal(beneficiary)}
                          className="text-gray-400 hover:text-gold"
                          title="Edit"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeletingBeneficiary(beneficiary)}
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
              className="relative w-full max-w-md bg-card border border-white/10 rounded-[2.5rem] p-8 shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
            >
              <div className="absolute top-0 right-0 p-8 opacity-5">
                <Users className="h-32 w-32 text-gold" />
              </div>

              <div className="relative z-10 space-y-8">
                <div>
                  <h3 className="text-2xl font-extrabold text-white tracking-tight mb-2">
                    {editingBeneficiary ? 'Edit Beneficiary' : 'Add Beneficiary'}
                  </h3>
                  <p className="text-sm text-gray-500 font-medium">
                    {editingBeneficiary
                      ? 'Update beneficiary details.'
                      : 'Add a new beneficiary to the customer.'}
                  </p>
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
                    <label className="text-[10px] font-black text-gold uppercase tracking-widest">Legacy Plan ID (Optional)</label>
                    <Input
                      value={formData.legacyPlanId}
                      onChange={(e) => setFormData({ ...formData, legacyPlanId: e.target.value })}
                      placeholder="plan_123"
                      className="bg-black border-white/10 h-14"
                    />
                    <p className="text-[10px] text-gray-500">Associate with a specific legacy plan</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gold uppercase tracking-widest">Name</label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="John Doe"
                      required
                      className="bg-black border-white/10 h-14"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gold uppercase tracking-widest">Email</label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="john@example.com"
                      required
                      className="bg-black border-white/10 h-14"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gold uppercase tracking-widest">Phone (Optional)</label>
                    <Input
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="+1 (555) 000-0000"
                      className="bg-black border-white/10 h-14"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gold uppercase tracking-widest">Wallet Address (Optional)</label>
                    <Input
                      value={formData.walletAddress}
                      onChange={(e) => setFormData({ ...formData, walletAddress: e.target.value })}
                      placeholder="0x..."
                      className="bg-black border-white/10 h-14 font-mono text-xs"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gold uppercase tracking-widest">Distribution Share (%)</label>
                    <Input
                      type="number"
                      value={formData.share}
                      onChange={(e) => setFormData({ ...formData, share: parseInt(e.target.value) || 0 })}
                      placeholder="100"
                      min="1"
                      max="100"
                      required
                      className="bg-black border-white/10 h-14"
                    />
                    <p className="text-[10px] text-gray-500">Total shares across all beneficiaries must equal 100%</p>
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
                      {editingBeneficiary ? 'Update Beneficiary' : 'Add Beneficiary'}
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
        {deletingBeneficiary && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[400] flex items-center justify-center p-4"
            onClick={() => setDeletingBeneficiary(null)}
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
                  <h3 className="text-2xl font-extrabold text-white tracking-tight mb-2">Delete Beneficiary</h3>
                  <p className="text-sm text-gray-500 font-medium">
                    Are you sure you want to delete <strong className="text-white">{deletingBeneficiary.name}</strong>?
                    This action cannot be undone.
                  </p>
                </div>
                <div className="flex space-x-3">
                  <Button
                    variant="secondary"
                    className="flex-1 rounded-2xl h-14 font-bold uppercase tracking-widest text-xs"
                    onClick={() => setDeletingBeneficiary(null)}
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

function getShareBarColor(share: number) {
  if (share >= 50) return 'bg-emerald-500';
  if (share >= 25) return 'bg-amber-500';
  return 'bg-blue-500';
}