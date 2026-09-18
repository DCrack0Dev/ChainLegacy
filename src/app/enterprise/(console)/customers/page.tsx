'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, Search, MoreVertical, Edit2, Trash2, Shield, AlertCircle, CheckCircle2, ExternalLink, Loader2 } from 'lucide-react';
import { EnterpriseSkeleton } from '@/components/enterprise/EnterpriseSkeleton';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/Card';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

type Customer = {
  id: string;
  organizationId: string;
  partnerCustomerId: string;
  email: string;
  fullName: string;
  phone?: string;
  walletAddress?: string;
  firebaseUid?: string;
  vaultId?: string;
  verificationStatus: 'not_started' | 'pending' | 'verified' | 'rejected' | 'manual_review';
  createdAt: string;
  updatedAt: string;
};

type CustomerStats = {
  total: number;
  verified: number;
  pending: number;
  withVault: number;
};

export default function EnterpriseCustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<CustomerStats>({ total: 0, verified: 0, pending: 0, withVault: 0 });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Create/Edit form state
  const [formData, setFormData] = useState({
    partnerCustomerId: '',
    email: '',
    fullName: '',
    phone: '',
    walletAddress: '',
    firebaseUid: '',
  });

  const fetchCustomers = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: ((page - 1) * pageSize).toString(),
      });
      if (search) params.append('email', search);

      const res = await fetch(`/api/v1/customers?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch customers');
      const data = await res.json();
      setCustomers(data.data || []);
      setTotal(data.meta?.total || 0);
      
      // Compute stats from current page (approximate)
      const allRes = await fetch(`/api/v1/customers?limit=1000`);
      const allData = await allRes.json();
      const allCustomers = allData.data || [];
      setStats({
        total: allCustomers.length,
        verified: allCustomers.filter((c: Customer) => c.verificationStatus === 'verified').length,
        pending: allCustomers.filter((c: Customer) => c.verificationStatus === 'pending').length,
        withVault: allCustomers.filter((c: Customer) => c.vaultId).length,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, [page, search]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create customer');
      }
      setShowCreateModal(false);
      resetForm();
      fetchCustomers();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingCustomer) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/customers/${deletingCustomer.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete customer');
      setDeletingCustomer(null);
      fetchCustomers();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      partnerCustomerId: '',
      email: '',
      fullName: '',
      phone: '',
      walletAddress: '',
      firebaseUid: '',
    });
    setEditingCustomer(null);
  };

  const openCreateModal = () => {
    resetForm();
    setShowCreateModal(true);
  };

  const openEditModal = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormData({
      partnerCustomerId: customer.partnerCustomerId,
      email: customer.email,
      fullName: customer.fullName,
      phone: customer.phone || '',
      walletAddress: customer.walletAddress || '',
      firebaseUid: customer.firebaseUid || '',
    });
    setShowCreateModal(true);
  };

  const getStatusBadge = (status: Customer['verificationStatus']) => {
    const configs = {
      not_started: { label: 'Not Started', className: 'bg-gray-500/20 text-gray-400' },
      pending: { label: 'Pending', className: 'bg-amber-500/20 text-amber-400' },
      verified: { label: 'Verified', className: 'bg-emerald-500/20 text-emerald-400' },
      rejected: { label: 'Rejected', className: 'bg-red-500/20 text-red-400' },
      manual_review: { label: 'Manual Review', className: 'bg-blue-500/20 text-blue-400' },
    };
    const config = configs[status];
    return <span className={`px-2 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider ${config.className}`}>{config.label}</span>;
  };

  const hasMore = page * pageSize < total;

  return (
    <EnterpriseSkeleton
      eyebrow="Customers"
      title="Customer Directory"
      subtitle="Create, search, and filter your organization's customers. Every row is scoped to your orgId server-side."
      stats={[
        { label: 'Total Customers', value: stats.total },
        { label: 'Verified', value: stats.verified, tone: 'positive' },
        { label: 'Pending Verification', value: stats.pending, tone: 'neutral' },
        { label: 'With Vault', value: stats.withVault, tone: 'positive' },
      ]}
      cta={[
        { label: '+ Add Customer', variant: 'primary', action: openCreateModal },
        { label: 'Refresh', variant: 'secondary', action: fetchCustomers },
      ]}
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
                <th className="py-3 px-6">Customer</th>
                <th className="py-3 px-6">Partner ID</th>
                <th className="py-3 px-6">Verification</th>
                <th className="py-3 px-6">Vault</th>
                <th className="py-3 px-6">Created</th>
                <th className="py-3 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-gray-300">
              {loading && customers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-gold mx-auto" />
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-500">
                    No customers found. <Button variant="ghost" className="ml-2" onClick={openCreateModal}>Create one</Button>
                  </td>
                </tr>
              ) : (
                customers.map((customer) => (
                  <tr key={customer.id} className="border-t border-white/5 hover:bg-white/[0.02] transition-colors">
                    <td className="py-4 px-6">
                      <div>
                        <p className="font-semibold text-white">{customer.fullName}</p>
                        <p className="text-[11px] text-gray-500 truncate max-w-xs">{customer.email}</p>
                      </div>
                    </td>
                    <td className="py-4 px-6 font-mono text-[11px] text-gray-400">{customer.partnerCustomerId}</td>
                    <td className="py-4 px-6">{getStatusBadge(customer.verificationStatus)}</td>
                    <td className="py-4 px-6">
                      {customer.vaultId ? (
                        <span className="flex items-center gap-1.5 text-emerald-400 text-[11px] font-semibold">
                          <CheckCircle2 className="h-3 w-3" /> Linked
                        </span>
                      ) : (
                        <span className="text-gray-500 text-[11px]">Not created</span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-[11px] text-gray-500">
                      {new Date(customer.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditModal(customer)}
                          className="text-gray-400 hover:text-gold"
                          title="Edit"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        {!customer.vaultId && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => window.open(`/enterprise/customers/${customer.id}/vault`, '_blank')}
                            className="text-xs"
                            title="Create Vault"
                          >
                            <Shield className="h-3 w-3 mr-1" /> Create Vault
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeletingCustomer(customer)}
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
              className="relative w-full max-w-md bg-card border border-white/10 rounded-[2.5rem] p-8 shadow-2xl overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-8 opacity-5">
                <Shield className="h-32 w-32 text-gold" />
              </div>

              <div className="relative z-10 space-y-8">
                <div>
                  <h3 className="text-2xl font-extrabold text-white tracking-tight mb-2">
                    {editingCustomer ? 'Edit Customer' : 'Create Customer'}
                  </h3>
                  <p className="text-sm text-gray-500 font-medium">
                    {editingCustomer
                      ? 'Update customer details. Partner ID cannot be changed.'
                      : 'Create a new customer in your organization.'}
                  </p>
                </div>

                <form onSubmit={handleCreate} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gold uppercase tracking-widest">Partner Customer ID</label>
                    <Input
                      value={formData.partnerCustomerId}
                      onChange={(e) => setFormData({ ...formData, partnerCustomerId: e.target.value })}
                      placeholder="partner_123"
                      disabled={!!editingCustomer}
                      className="bg-black border-white/10 h-14"
                    />
                    <p className="text-[10px] text-gray-500">Unique identifier from your system. Immutable after creation.</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gold uppercase tracking-widest">Full Name</label>
                    <Input
                      value={formData.fullName}
                      onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
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
                    <label className="text-[10px] font-black text-gold uppercase tracking-widest">Firebase UID (Optional)</label>
                    <Input
                      value={formData.firebaseUid}
                      onChange={(e) => setFormData({ ...formData, firebaseUid: e.target.value })}
                      placeholder="firebase_uid_123"
                      className="bg-black border-white/10 h-14"
                    />
                    <p className="text-[10px] text-gray-500">Link to authenticated user. Must be unique within organization.</p>
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
                      {editingCustomer ? 'Update Customer' : 'Create Customer'}
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
        {deletingCustomer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[400] flex items-center justify-center p-4"
            onClick={() => setDeletingCustomer(null)}
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
                  <h3 className="text-2xl font-extrabold text-white tracking-tight mb-2">Delete Customer</h3>
                  <p className="text-sm text-gray-500 font-medium">
                    Are you sure you want to delete <strong className="text-white">{deletingCustomer.fullName}</strong>?
                    This action cannot be undone and will remove all associated data.
                  </p>
                </div>
                <div className="flex space-x-3">
                  <Button
                    variant="secondary"
                    className="flex-1 rounded-2xl h-14 font-bold uppercase tracking-widest text-xs"
                    onClick={() => setDeletingCustomer(null)}
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