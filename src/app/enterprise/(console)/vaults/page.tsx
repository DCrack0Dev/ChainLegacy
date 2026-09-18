'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, AlertCircle, CheckCircle2, Search, Filter, Shield, Eye, FileText, Key, RotateCcw } from 'lucide-react';
import { EnterpriseSkeleton } from '@/components/enterprise/EnterpriseSkeleton';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { motion, AnimatePresence } from 'framer-motion';
import { Loading } from '@/components/ui/Loading';

type Vault = {
  id: string;
  organizationId: string;
  customerId: string;
  ownerUid?: string;
  name: string;
  status: 'active' | 'warning' | 'grace' | 'triggered';
  intervalDays: number;
  lastCheckInAt?: string;
  createdAt: string;
  updatedAt: string;
};

type Customer = {
  id: string;
  partnerCustomerId: string;
  fullName: string;
  email: string;
};

function getStatusConfig(status: Vault['status']) {
  const configs = {
    active: { label: 'Active', className: 'bg-emerald-500/20 text-emerald-400' },
    warning: { label: 'Warning', className: 'bg-amber-500/20 text-amber-400' },
    grace: { label: 'Grace Period', className: 'bg-amber-500/20 text-amber-400' },
    triggered: { label: 'Triggered', className: 'bg-red-500/20 text-red-400' },
  };
  return configs[status] || configs.active;
}

function EnterpriseVaultsPageContent() {
  const searchParams = useSearchParams();
  const customerId = searchParams.get('customerId');
  
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [customers, setCustomers] = useState<Record<string, Customer>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ total: 0, active: 0, warning: 0, triggered: 0 });
  const [viewingVault, setViewingVault] = useState<Vault | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: ((page - 1) * pageSize).toString(),
      });
      if (customerId) params.append('customerId', customerId);
      if (statusFilter !== 'all') params.append('status', statusFilter);

      const [vaultsRes, customersRes] = await Promise.all([
        fetch(`/api/v1/vaults?${params.toString()}`),
        fetch(`/api/v1/customers?limit=1000`),
      ]);

      if (!vaultsRes.ok) throw new Error('Failed to fetch vaults');
      if (!customersRes.ok) throw new Error('Failed to fetch customers');

      const vaultsData = await vaultsRes.json();
      const customersData = await customersRes.json();

      setVaults(vaultsData.data || []);
      setTotal(vaultsData.meta?.total || 0);

      // Build customer lookup
      const customerMap: Record<string, Customer> = {};
      (customersData.data || []).forEach((c: any) => {
        customerMap[c.id] = {
          id: c.id,
          partnerCustomerId: c.partnerCustomerId,
          fullName: c.fullName,
          email: c.email,
        };
      });
      setCustomers(customerMap);

      // Compute stats
      const allVaultsRes = await fetch(`/api/v1/vaults${customerId ? `?customerId=${customerId}` : ''}&limit=1000`);
      const allVaultsData = await allVaultsRes.json();
      const allVaults = allVaultsData.data || [];
      setStats({
        total: allVaults.length,
        active: allVaults.filter((v: Vault) => v.status === 'active').length,
        warning: allVaults.filter((v: Vault) => v.status === 'warning' || v.status === 'grace').length,
        triggered: allVaults.filter((v: Vault) => v.status === 'triggered').length,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [page, search, statusFilter, customerId]);

  const openViewModal = (vault: Vault) => {
    setViewingVault(vault);
  };

  const hasMore = page * pageSize < total;

  const renderVaultsBody = () => {
    if (loading && vaults.length === 0) {
      return (
        <tr>
          <td colSpan={8} className="py-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-gold mx-auto" />
          </td>
        </tr>
      );
    }
    if (vaults.length === 0) {
      return (
        <tr>
          <td colSpan={8} className="py-12 text-center text-gray-500">No vaults found</td>
        </tr>
      );
    }
    return vaults.map((vault) => {
      const statusConfig = getStatusConfig(vault.status);
      const { label, className } = statusConfig;
      const customer = customers[vault.customerId];
      
      return (
        <tr key={vault.id} className="border-t border-white/5 hover:bg-white/[0.02] transition-colors">
          <td className="py-4 px-6">
            <p className="font-semibold text-white">{vault.name || 'Primary Legacy Vault'}</p>
            <p className="text-[11px] text-gray-500 font-mono truncate max-w-xs">{vault.id}</p>
          </td>
          <td className="py-4 px-6">
            {customer ? (
              <div>
                <p className="font-medium text-white">{customer.fullName}</p>
                <p className="text-[11px] text-gray-500 font-mono">{customer.partnerCustomerId}</p>
              </div>
            ) : (
              <span className="font-mono text-[11px] text-gray-400">{vault.customerId}</span>
            )}
          </td>
          <td className="py-4 px-6">
            <span className={`px-2 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider ${className}`}>{label}</span>
          </td>
          <td className="py-4 px-6">{vault.intervalDays} days</td>
          <td className="py-4 px-6 text-[11px] text-gray-500">
            {vault.lastCheckInAt ? new Date(vault.lastCheckInAt).toLocaleString() : 'Never'}
          </td>
          <td className="py-4 px-6 text-[11px] text-gray-500">
            {vault.ownerUid ? <span className="font-mono text-gray-400">{vault.ownerUid.slice(0, 12)}...</span> : '—'}
          </td>
          <td className="py-4 px-6 text-[11px] text-gray-500">
            {new Date(vault.createdAt).toLocaleDateString()}
          </td>
          <td className="py-4 px-6 text-right">
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => openViewModal(vault)}
                className="text-gray-400 hover:text-gold"
                title="View Details"
              >
                <Eye className="h-4 w-4" />
              </Button>
              {customer && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.open(`/enterprise/customers/${customer.id}/vault`, '_blank')}
                  className="text-gray-400 hover:text-gold"
                  title="Open in Legacy System"
                >
                  <FileText className="h-4 w-4" />
                </Button>
              )}
            </div>
          </td>
        </tr>
      );
    });
  };

  return (
    <EnterpriseSkeleton
      eyebrow="Vaults"
      title={customerId ? `Vaults for Customer` : 'All Vaults'}
      subtitle={customerId ? 'Manage vaults for this customer' : 'Overview of all legacy vaults across your organization. Each vault belongs to exactly one customer.'}
      stats={[
        { label: 'Total Vaults', value: stats.total },
        { label: 'Active', value: stats.active, tone: 'positive' },
        { label: 'Warning/Grace', value: stats.warning, tone: stats.warning > 0 ? 'neutral' : 'positive' },
        { label: 'Triggered', value: stats.triggered, tone: stats.triggered > 0 ? 'negative' : 'positive' },
      ]}
      cta={[
        { label: 'Refresh', variant: 'secondary', action: fetchData },
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
            placeholder="Search by vault name or customer..."
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
            <option value="grace">Grace Period</option>
            <option value="triggered">Triggered</option>
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
                <th className="py-3 px-6">Vault</th>
                <th className="py-3 px-6">Customer</th>
                <th className="py-3 px-6">Status</th>
                <th className="py-3 px-6">Interval</th>
                <th className="py-3 px-6">Last Check-in</th>
                <th className="py-3 px-6">Owner UID</th>
                <th className="py-3 px-6">Created</th>
                <th className="py-3 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-gray-300">
              {renderVaultsBody()}
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

      {/* View Vault Modal */}
      <AnimatePresence>
        {viewingVault && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[400] flex items-center justify-center p-4"
            onClick={() => setViewingVault(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-3xl bg-card border border-white/10 rounded-[2.5rem] p-8 shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
            >
              <div className="absolute top-0 right-0 p-8 opacity-5">
                <Shield className="h-32 w-32 text-gold" />
              </div>

              <div className="relative z-10 space-y-8">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-2xl font-extrabold text-white tracking-tight mb-2">Vault Details</h3>
                    <p className="text-sm text-gray-500 font-medium">{viewingVault.id}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setViewingVault(null)}
                  >
                    ✕
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
                      <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Status</h4>
                      {(() => {
                        const { label, className } = getStatusConfig(viewingVault.status);
                        return (
                          <span className={`px-3 py-1.5 rounded-full text-sm font-semibold uppercase tracking-wider ${className}`}>
                            {label}
                          </span>
                        );
                      })()}
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
                      <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Vault ID</h4>
                      <p className="font-mono text-lg text-white break-all">{viewingVault.id}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
                      <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Customer</h4>
                      {customers[viewingVault.customerId] ? (
                        <div>
                          <p className="font-bold text-white">{customers[viewingVault.customerId].fullName}</p>
                          <p className="text-sm text-gray-500">{customers[viewingVault.customerId].partnerCustomerId}</p>
                        </div>
                      ) : (
                        <p className="font-mono text-lg text-white">{viewingVault.customerId}</p>
                      )}
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
                      <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Check-in Interval</h4>
                      <p className="text-2xl font-bold text-white">{viewingVault.intervalDays} days</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
                      <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Last Check-in</h4>
                      <p className="text-white">{viewingVault.lastCheckInAt ? new Date(viewingVault.lastCheckInAt).toLocaleString() : 'Never'}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
                      <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Owner UID</h4>
                      <p className="font-mono text-white">{viewingVault.ownerUid || 'Not set'}</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
                      <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Created</h4>
                      <p className="text-white">{new Date(viewingVault.createdAt).toLocaleString()}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
                      <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Last Updated</h4>
                      <p className="text-white">{new Date(viewingVault.updatedAt).toLocaleString()}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
                      <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Vault Name</h4>
                      <p className="text-white">{viewingVault.name || 'Primary Legacy Vault'}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
                      <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Organization</h4>
                      <p className="font-mono text-white">{viewingVault.organizationId}</p>
                    </div>
                    {customers[viewingVault.customerId] && (
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
                        <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Customer Email</h4>
                        <p className="text-white">{customers[viewingVault.customerId].email}</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t border-white/10">
                  <Button variant="secondary" onClick={() => setViewingVault(null)}>
                    Close
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

export default function EnterpriseVaultsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <EnterpriseVaultsPageContent />
    </Suspense>
  );
}