'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Shield, CheckCircle2, AlertCircle, Loader2, Settings, ExternalLink, Plus, Trash2, Edit2, ArrowLeft } from 'lucide-react';
import { EnterpriseSkeleton } from '@/components/enterprise/EnterpriseSkeleton';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/Card';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

type Vault = {
  id: string;
  organizationId: string;
  customerId: string;
  ownerUid?: string;
  name: string;
  status: 'active' | 'warning' | 'grace' | 'triggered';
  intervalDays: number;
  createdAt: string;
  updatedAt: string;
};

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

export default function EnterpriseCustomerVaultPage() {
  const params = useParams();
  const customerId = params.customerId as string;
  
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [vault, setVault] = useState<Vault | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formData, setFormData] = useState<{ name: string; intervalDays: number }>({ name: 'Primary Legacy Vault', intervalDays: 30 });

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [custRes, vaultRes] = await Promise.all([
        fetch(`/api/v1/customers/${customerId}`),
        fetch(`/api/v1/customers/${customerId}/vault`),
      ]);

      if (!custRes.ok) throw new Error('Customer not found');
      const custData = await custRes.json();
      const customerData = custData.customer;

      const vaultResData = await vaultRes.json();
      const vaultData = vaultResData.vault;

      return { customer: customerData, vault: vaultData };
    } catch (err: any) {
      throw new Error(err.message || 'Failed to fetch data');
    }
  };

  useEffect(() => {
    fetchData().then(data => {
      setCustomer(data.customer);
      setVault(data.vault);
      setLoading(false);
    }).catch(err => {
      setError(err.message);
      setLoading(false);
    });
  }, []);

  const handleCreateVault = async () => {
    setError(null);
    setCreating(true);
    try {
      const res = await fetch(`/api/v1/customers/${customerId}/vault`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          intervalDays: formData.intervalDays,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create vault');
      setVault(data.vault);
      setShowCreateModal(false);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleUpdateInterval = async (newInterval: number) => {
    // Would need PATCH endpoint - for now just show
    alert('Interval update requires PATCH endpoint');
  };

  const getStatusConfig = (status: string) => {
    const configs = {
      active: { label: 'Active', icon: <CheckCircle2 className="h-4 w-4" />, className: 'bg-emerald-500/20 text-emerald-400' },
      warning: { label: 'Warning', icon: <AlertCircle className="h-4 w-4" />, className: 'bg-amber-500/20 text-amber-400' },
      grace: { label: 'Grace Period', icon: <AlertCircle className="h-4 w-4" />, className: 'bg-amber-500/20 text-amber-400' },
      triggered: { label: 'Triggered', icon: <AlertCircle className="h-4 w-4" />, className: 'bg-red-500/20 text-red-400' },
    };
    return configs[status as keyof typeof configs] || configs.active;
  };

  const goBack = () => window.history.back();

  if (loading) {
    return (
      <EnterpriseSkeleton
        eyebrow="Vault"
        title="Loading..."
        subtitle="Fetching vault data..."
      >
        <div className="h-64 bg-white/[0.02] rounded-[2rem] animate-pulse" />
      </EnterpriseSkeleton>
    );
  }

  const statusConfig = vault ? getStatusConfig(vault.status) : { label: 'None', icon: null, className: 'bg-gray-500/20 text-gray-400' };

  return (
    <EnterpriseSkeleton
      eyebrow="Vault"
      title={vault?.name || 'Vault Management'}
      subtitle={customer ? `Customer: ${customer.fullName} (${customer.partnerCustomerId})` : 'Loading...'}
      stats={vault ? [
        { label: 'Status', value: statusConfig.label, tone: vault.status === 'active' ? 'positive' : 'neutral' },
        { label: 'Interval', value: `${vault.intervalDays} days` },
        { label: 'Created', value: new Date(vault.createdAt).toLocaleDateString() },
        { label: 'Customer', value: customer?.fullName || '—' },
      ] : [
        { label: 'Vault', value: 'Not Created', tone: 'negative' },
      ]}
      cta={vault ? [
        { label: 'Back to Customer', variant: 'secondary', action: () => window.history.back() },
      ] : [
        { label: '+ Create Vault', variant: 'primary', action: () => setShowCreateModal(true) },
      ]}
    >
      <div className="flex items-center justify-between mb-6">
        <Button variant="ghost" size="sm" onClick={goBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back to Customer
        </Button>
      </div>

      {vault ? (
        <div className="space-y-8">
          {/* Vault Status Card */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                  <Shield className="h-6 w-6 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-500 uppercase tracking-wider">Vault Status</h3>
                  <p className="text-2xl font-bold text-white tracking-tight">{statusConfig.icon && <span className="inline-flex items-center gap-1.5 text-emerald-400 text-base font-semibold">{statusConfig.icon} {statusConfig.label}</span>}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 pt-4 border-t border-white/5">
                <Button variant="secondary" size="sm" onClick={() => handleUpdateInterval(vault.intervalDays)}>
                  <Settings className="h-4 w-4 mr-1" /> Update Interval
                </Button>
              </div>
            </div>

            {/* Vault Details */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-white/5 flex items-center justify-center">
                    <Shield className="h-5 w-5 text-gray-400" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Vault ID</p>
                    <p className="font-mono text-sm text-white break-all">{vault.id}</p>
                  </div>
                </div>
                <div className="pt-4 border-t border-white/5 space-y-1">
                  <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">Customer ID</p>
                  <p className="font-mono text-sm text-white">{customer?.id}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-white/5 flex items-center justify-center">
                    <Shield className="h-5 w-5 text-gray-400" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Check-in Interval</p>
                    <p className="font-bold text-white text-lg">{vault.intervalDays} days</p>
                  </div>
                </div>
                <div className="pt-4 border-t border-white/5 space-y-1">
                  <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">Status</p>
                  <p className="font-bold text-white">{vault.status}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-white/5 flex items-center justify-center">
                    <Shield className="h-5 w-5 text-gray-400" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Created</p>
                    <p className="font-bold text-white">{new Date(vault.createdAt).toLocaleString()}</p>
                  </div>
                </div>
                <div className="pt-4 border-t border-white/5 space-y-1">
                  <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">Last Updated</p>
                  <p className="font-bold text-white">{new Date(vault.updatedAt).toLocaleString()}</p>
                </div>
              </div>
            </div>

            {/* Related Resources */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
              <h3 className="text-base font-bold uppercase tracking-wider">Related Resources</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Button variant="secondary" className="h-14 justify-start gap-3" onClick={() => window.open(`/enterprise/customers/${customerId}/vault`, '_blank')}>
                  <Shield className="h-5 w-5" /> View in Legacy System
                </Button>
                <Button variant="secondary" className="h-14 justify-start gap-3" onClick={() => customer && window.open(`/enterprise/beneficiaries?customerId=${customer.id}`, '_blank')}>
                  <Shield className="h-5 w-5" /> Beneficiaries
                </Button>
                <Button variant="secondary" className="h-14 justify-start gap-3" onClick={() => customer && window.open(`/enterprise/claims?customerId=${customer.id}`, '_blank')}>
                  <Shield className="h-5 w-5" /> Claims
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        // No vault - show create modal trigger
        <div className="rounded-2xl border-2 border-dashed border-white/10 bg-white/[0.02] p-12 text-center space-y-6">
          <div className="h-20 w-20 rounded-2xl bg-white/5 flex items-center justify-center mx-auto border border-white/10">
            <Shield className="h-10 w-10 text-gray-500" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-white">No Vault Created</h3>
            <p className="text-gray-500 max-w-md mx-auto">
              This customer doesn't have a legacy vault yet. Create one to start protecting their digital inheritance.
            </p>
          </div>
          <Button variant="primary" size="lg" onClick={() => setShowCreateModal(true)} className="w-full max-w-xs mx-auto">
            <Shield className="h-5 w-5 mr-2" /> Create Vault
          </Button>
        </div>
      )}

      {/* Create Vault Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[400] flex items-center justify-center p-4"
            onClick={() => setShowCreateModal(false)}
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
                  <h3 className="text-2xl font-extrabold text-white tracking-tight mb-2">Create Vault</h3>
                  <p className="text-sm text-gray-500 font-medium">Create a new legacy vault for this customer.</p>
                </div>

                <form onSubmit={handleCreateVault} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gold uppercase tracking-widest">Vault Name</label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Primary Legacy Vault"
                      required
                      className="bg-black border-white/10 h-14"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gold uppercase tracking-widest">Check-in Interval (Days)</label>
                    <Input
                      type="number"
                      value={formData.intervalDays}
                      onChange={(e) => setFormData({ ...formData, intervalDays: parseInt(e.target.value) || 0 })}
                      placeholder="30"
                      min="1"
                      max="365"
                      required
                      className="bg-black border-white/10 h-14"
                    />
                    <p className="text-[10px] text-gray-500">How often the customer must check in to prove liveness.</p>
                  </div>

                  <div className="flex space-x-3 pt-4">
                    <Button
                      type="button"
                      variant="secondary"
                      className="flex-1 rounded-2xl h-14 font-bold uppercase tracking-widest text-xs"
                      onClick={() => setShowCreateModal(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      variant="accent"
                      className="flex-1 bg-gold hover:bg-gold-dark text-black rounded-2xl h-14 font-bold uppercase tracking-widest text-xs shadow-lg shadow-gold/20"
                      isLoading={creating}
                    >
                      Create Vault
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