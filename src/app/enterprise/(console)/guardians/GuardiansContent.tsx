'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, Search, Loader2, AlertCircle, CheckCircle2, Edit2, Trash2, Users, Shield, Key, Wallet, Mail, Phone } from 'lucide-react';
import { EnterpriseSkeleton } from '@/components/enterprise/EnterpriseSkeleton';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { motion, AnimatePresence } from 'framer-motion';

type Guardian = {
  id: string;
  organizationId: string;
  customerId?: string | null;
  name: string;
  email: string;
  phone?: string;
  firebaseUid?: string;
  walletAddress?: string;
  createdAt: string;
  updatedAt: string;
};

function getIdentityBadge(guardian: Guardian) {
  if (guardian.firebaseUid && guardian.walletAddress) {
    return (
      <span className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-purple-500/20 text-purple-400">
        <Key className="h-3 w-3" /> Firebase + Wallet
      </span>
    );
  }
  if (guardian.firebaseUid) {
    return (
      <span className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-blue-500/20 text-blue-400">
        <Key className="h-3 w-3" /> Firebase UID
      </span>
    );
  }
  if (guardian.walletAddress) {
    return (
      <span className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-emerald-500/20 text-emerald-400">
        <Wallet className="h-3 w-3" /> Wallet
      </span>
    );
  }
  return (
    <span className="px-2 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-gray-500/20 text-gray-400">
      No identity
    </span>
  );
}

export function EnterpriseGuardiansContent() {
  const searchParams = useSearchParams();
  const customerId = searchParams.get('customerId');
  
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ total: 0, withFirebase: 0, withWallet: 0, assigned: 0 });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingGuardian, setEditingGuardian] = useState<Guardian | null>(null);
  const [deletingGuardian, setDeletingGuardian] = useState<Guardian | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    customerId: customerId || '',
    name: '',
    email: '',
    phone: '',
    firebaseUid: '',
    walletAddress: '',
  });

  const fetchGuardians = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: ((page - 1) * pageSize).toString(),
      });
      if (customerId) params.append('customerId', customerId);
      if (search) params.append('email', search);

      const res = await fetch(`/api/v1/guardians?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch guardians');
      const data = await res.json();
      setGuardians(data.data || []);
      setTotal(data.meta?.total || 0);
      
      // Compute stats
      const allRes = await fetch(`/api/v1/guardians${customerId ? `?customerId=${customerId}` : ''}&limit=1000`);
      const allData = await allRes.json();
      const allGuardians = allData.data || [];
      setStats({
        total: allGuardians.length,
        withFirebase: allGuardians.filter((g: Guardian) => g.firebaseUid).length,
        withWallet: allGuardians.filter((g: Guardian) => g.walletAddress).length,
        assigned: allGuardians.filter((g: Guardian) => g.customerId).length,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGuardians();
  }, [page, search, customerId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/guardians', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create guardian');
      }
      setShowCreateModal(false);
      resetForm();
      fetchGuardians();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingGuardian) return;
    setSubmitting(true);
    try {
      alert('Delete endpoint not yet implemented');
      setDeletingGuardian(null);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      customerId: customerId || '',
      name: '',
      email: '',
      phone: '',
      firebaseUid: '',
      walletAddress: '',
    });
    setEditingGuardian(null);
  };

  const openCreateModal = () => {
    resetForm();
    setShowCreateModal(true);
  };

  const openEditModal = (guardian: Guardian) => {
    setEditingGuardian(guardian);
    setFormData({
      customerId: guardian.customerId || '',
      name: guardian.name,
      email: guardian.email,
      phone: guardian.phone || '',
      firebaseUid: guardian.firebaseUid || '',
      walletAddress: guardian.walletAddress || '',
    });
    setShowCreateModal(true);
  };

  const hasMore = page * pageSize < total;

  const ctaButtons = customerId 
    ? [{ label: '+ Invite Guardian', variant: 'primary' as const, action: openCreateModal }]
    : [];

  return (
    <EnterpriseSkeleton
      eyebrow="Guardians"
      title={customerId ? `Guardians` : 'Guardians'}
      subtitle={customerId ? 'Manage guardians for this customer' : 'Trusted contacts who approve claims with M-of-N quorum. Guardian identity authentication via firebase_uid_match, eip712, or eth_sign proofs.'}
      stats={[
        { label: 'Total', value: stats.total },
        { label: 'Firebase UID', value: stats.withFirebase, tone: 'positive' },
        { label: 'Wallet Address', value: stats.withWallet, tone: 'positive' },
        { label: 'Assigned to Customer', value: stats.assigned, tone: 'positive' },
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
                <th className="py-3 px-6">Guardian</th>
                <th className="py-3 px-6">Customer</th>
                <th className="py-3 px-6">Identity</th>
                <th className="py-3 px-6">Contact</th>
                <th className="py-3 px-6">Created</th>
                <th className="py-3 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-gray-300">
              {(() => {
                if (loading && guardians.length === 0) {
                  return (
                    <tr>
                      <td colSpan={6} className="py-12 text-center">
                        <Loader2 className="h-8 w-8 animate-spin text-gold mx-auto" />
                      </td>
                    </tr>
                  );
                }
                if (guardians.length === 0) {
                  return (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-gray-500">
                        No guardians found. <Button variant="ghost" className="ml-2" onClick={openCreateModal}>Invite one</Button>
                      </td>
                    </tr>
                  );
                }
                return guardians.map((guardian) => {
                  const status = getIdentityBadge(guardian);
                  return (
                    <tr key={guardian.id} className="border-t border-white/5 hover:bg-white/[0.02] transition-colors">
                      <td className="py-4 px-6">
                        <p className="font-semibold text-white">{guardian.name}</p>
                        <p className="text-[11px] text-gray-500 truncate max-w-xs font-mono">{guardian.id}</p>
                      </td>
                      <td className="py-4 px-6">
                        {guardian.customerId ? (
                          <span className="font-mono text-[11px] text-gray-400">{guardian.customerId}</span>
                        ) : (
                          <span className="text-gray-500 text-[11px]">Unassigned</span>
                        )}
                      </td>
                      <td className="py-4 px-6">{getIdentityBadge(guardian)}</td>
                      <td className="py-4 px-6">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Mail className="h-3 w-3 text-gray-500" />
                            <span className="text-[11px] text-gray-400">{guardian.email}</span>
                          </div>
                          {guardian.phone && (
                            <div className="flex items-center gap-2">
                              <Phone className="h-3 w-3 text-gray-500" />
                              <span className="text-[11px] text-gray-400">{guardian.phone}</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-6 text-[11px] text-gray-500">
                        {new Date(guardian.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditModal(guardian)}
                            className="text-gray-400 hover:text-gold"
                            title="Edit"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeletingGuardian(guardian)}
                            className="text-red-500 hover:text-red-400"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
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
                <Shield className="h-32 w-32 text-gold" />
              </div>

              <div className="relative z-10 space-y-8">
                <div>
                  <h3 className="text-2xl font-extrabold text-white tracking-tight mb-2">
                    {editingGuardian ? 'Edit Guardian' : 'Invite Guardian'}
                  </h3>
                  <p className="text-sm text-gray-500 font-medium">
                    {editingGuardian
                      ? 'Update guardian details.'
                      : 'Invite a new guardian to the customer.'}
                  </p>
                </div>

                <form onSubmit={handleCreate} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gold uppercase tracking-widest">Customer ID (Optional)</label>
                    <Input
                      value={formData.customerId}
                      onChange={(e) => setFormData({ ...formData, customerId: e.target.value })}
                      placeholder="cust_123"
                      className="bg-black border-white/10 h-14"
                    />
                    <p className="text-[10px] text-gray-500">Leave blank for organization-level guardian</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gold uppercase tracking-widest">Name</label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Guardian Name"
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
                      placeholder="guardian@example.com"
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
                    <label className="text-[10px] font-black text-gold uppercase tracking-widest">Firebase UID (Required if no wallet)</label>
                    <Input
                      value={formData.firebaseUid}
                      onChange={(e) => setFormData({ ...formData, firebaseUid: e.target.value })}
                      placeholder="firebase_uid_123"
                      className="bg-black border-white/10 h-14"
                    />
                    <p className="text-[10px] text-gray-500">Either Firebase UID or Wallet Address is required for identity proofs</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gold uppercase tracking-widest">Wallet Address (Required if no Firebase UID)</label>
                    <Input
                      value={formData.walletAddress}
                      onChange={(e) => setFormData({ ...formData, walletAddress: e.target.value })}
                      placeholder="0x..."
                      className="bg-black border-white/10 h-14 font-mono text-xs"
                    />
                    <p className="text-[10px] text-gray-500">EVM address for eip712/eth_sign identity proofs</p>
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
                      {editingGuardian ? 'Update Guardian' : 'Invite Guardian'}
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
        {deletingGuardian && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[400] flex items-center justify-center p-4"
            onClick={() => setDeletingGuardian(null)}
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
                  <h3 className="text-2xl font-extrabold text-white tracking-tight mb-2">Delete Guardian</h3>
                  <p className="text-sm text-gray-500 font-medium">
                    Are you sure you want to delete <strong className="text-white">{deletingGuardian.name}</strong>?
                    This action cannot be undone.
                  </p>
                </div>
                <div className="flex space-x-3">
                  <Button
                    variant="secondary"
                    className="flex-1 rounded-2xl h-14 font-bold uppercase tracking-widest text-xs"
                    onClick={() => setDeletingGuardian(null)}
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