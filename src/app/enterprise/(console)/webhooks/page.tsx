'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { Plus, Search, Loader2, AlertCircle, CheckCircle2, Edit2, Trash2, ExternalLink, Copy, Shield, AlertTriangle, RotateCcw } from 'lucide-react';
import { EnterpriseSkeleton } from '@/components/enterprise/EnterpriseSkeleton';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { motion, AnimatePresence } from 'framer-motion';

type Webhook = {
  id: string;
  organizationId: string;
  url: string;
  description?: string;
  events: string[];
  secret: string;
  signingAlgo: string;
  enabled: boolean;
  consecutiveFailures: number;
  disabledAt?: string | null;
  lastDeliveredAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

const AVAILABLE_EVENTS = [
  'organization.created',
  'customer.created',
  'legacy_plan.created',
  'beneficiary.added',
  'guardian.updated',
  'liveness.reset',
  'claim.created',
  'claim.transition',
  'claim.guardian_approval',
  'claim.completed',
  'claim.rejected',
  'claim.disputed',
  'webhook.updated',
  'api_key.created',
  'api_key.revoked',
  'anti_takeover.triggered',
  'billing.charge_attempted',
  'system.liveness_cron',
];

export default function EnterpriseWebhooksPage() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ total: 0, enabled: 0, disabled: 0, pendingDeliveries: 0 });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSecretModal, setShowSecretModal] = useState(false);
  const [newSecret, setNewSecret] = useState('');
  const [editingWebhook, setEditingWebhook] = useState<Webhook | null>(null);
  const [deletingWebhook, setDeletingWebhook] = useState<Webhook | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    url: '',
    description: '',
    events: [] as string[],
  });
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchWebhooks = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: ((page - 1) * pageSize).toString(),
      });

      const res = await fetch(`/api/v1/webhooks?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch webhooks');
      const data = await res.json();
      setWebhooks(data.data || []);
      setTotal(data.meta?.total || 0);
      
      // Compute stats
      const allRes = await fetch(`/api/v1/webhooks?limit=1000`);
      const allData = await allRes.json();
      const allWebhooks = allData.data || [];
      setStats({
        total: allWebhooks.length,
        enabled: allWebhooks.filter((w: Webhook) => w.enabled).length,
        disabled: allWebhooks.filter((w: Webhook) => !w.enabled).length,
        pendingDeliveries: allWebhooks.reduce((sum: number, w: Webhook) => sum + (w.consecutiveFailures || 0), 0),
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWebhooks();
  }, [page, search]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create webhook');
      }
      const data = await res.json();
      setNewSecret(data.webhook.secret || '');
      setShowSecretModal(true);
      setShowCreateModal(false);
      resetForm();
      fetchWebhooks();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingWebhook) return;
    setSubmitting(true);
    try {
      alert('Delete endpoint not yet implemented');
      setDeletingWebhook(null);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopySecret = () => {
    if (newSecret) {
      navigator.clipboard.writeText(newSecret);
      setCopiedId('secret');
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const handleCopySecretText = (secret: string) => {
    navigator.clipboard.writeText(secret);
    alert('Secret copied to clipboard');
  };

  const resetForm = () => {
    setFormData({
      url: '',
      description: '',
      events: [],
    });
    setEditingWebhook(null);
  };

  const openCreateModal = () => {
    resetForm();
    setShowCreateModal(true);
  };

  const openDeleteModal = (webhook: Webhook) => {
    setDeletingWebhook(webhook);
  };

  const getStatusConfig = (webhook: Webhook) => {
    if (!webhook.enabled) return { label: 'Disabled', className: 'bg-gray-500/20 text-gray-400', icon: <Shield className="h-3 w-3" /> };
    if (webhook.consecutiveFailures > 0) return { label: 'Failing', className: 'bg-amber-500/20 text-amber-400', icon: <AlertTriangle className="h-3 w-3" /> };
    return { label: 'Active', className: 'bg-emerald-500/20 text-emerald-400', icon: <CheckCircle2 className="h-3 w-3" /> };
  };

  const hasMore = page * pageSize < total;

  return (
    <EnterpriseSkeleton
      eyebrow="Webhooks"
      title="Webhooks"
      subtitle="HMAC-SHA256 signed payloads, 8 attempts exponential backoff (capped 24h), 5-minute replay tolerance. 100% auto-disable at consecutive failure threshold."
      stats={[
        { label: 'Endpoints', value: stats.total },
        { label: 'Enabled', value: stats.enabled, tone: 'positive' },
        { label: 'Disabled', value: stats.disabled, tone: 'neutral' },
        { label: 'Total Failures', value: stats.pendingDeliveries, tone: stats.pendingDeliveries > 0 ? 'negative' : 'positive' },
      ]}
      cta={[{ label: '+ Add Endpoint', variant: 'primary', action: openCreateModal }]}
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
            placeholder="Search by URL..."
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
                <th className="py-3 px-6">Endpoint</th>
                <th className="py-3 px-6">Status</th>
                <th className="py-3 px-6">Events</th>
                <th className="py-3 px-6">Failures</th>
                <th className="py-3 px-6">Last Delivered</th>
                <th className="py-3 px-6">Created</th>
                <th className="py-3 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-gray-300">
              {(() => {
                if (loading && webhooks.length === 0) {
                  return (
                    <tr>
                      <td colSpan={7} className="py-12 text-center">
                        <Loader2 className="h-8 w-8 animate-spin text-gold mx-auto" />
                      </td>
                    </tr>
                  );
                }
                if (webhooks.length === 0) {
                  return (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-gray-500">
                        No webhooks found. <Button variant="ghost" className="ml-2" onClick={openCreateModal}>Create one</Button>
                      </td>
                    </tr>
                  );
                }
                return webhooks.map((webhook) => {
                  const status = getStatusConfig(webhook);
                  return (
                    <tr key={webhook.id} className="border-t border-white/5 hover:bg-white/[0.02] transition-colors">
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-xl bg-white/5 flex items-center justify-center border border-white/10">
                            <ExternalLink className="h-4 w-4 text-gray-400" />
                          </div>
                          <div>
                            <p className="font-semibold text-white truncate max-w-xs">{webhook.url}</p>
                            <p className="text-[11px] text-gray-500 font-mono truncate max-w-xs">{webhook.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <span className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider ${status.className}`}>
                          {status.icon} {status.label}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex flex-wrap gap-1">
                          {webhook.events.slice(0, 3).map((event, i) => (
                            <span key={i} className="px-2 py-0.5 rounded text-[9px] font-mono bg-white/5 text-gray-400">{event}</span>
                          ))}
                          {webhook.events.length > 3 && (
                            <span className="px-2 py-0.5 rounded text-[9px] text-gray-500">+{webhook.events.length - 3} more</span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        {webhook.consecutiveFailures > 0 ? (
                          <span className="flex items-center gap-1 text-amber-500 text-[11px] font-semibold">
                            <AlertTriangle className="h-3 w-3" /> {webhook.consecutiveFailures}
                          </span>
                        ) : (
                          <span className="text-emerald-500 text-[11px] font-semibold">0</span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-[11px] text-gray-500">
                        {webhook.lastDeliveredAt ? new Date(webhook.lastDeliveredAt).toLocaleString() : 'Never'}
                      </td>
                      <td className="py-4 px-6 text-[11px] text-gray-500">
                        {new Date(webhook.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => window.open(webhook.url, '_blank')}
                            className="text-gray-400 hover:text-gold"
                            title="Open URL"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopySecretText(webhook.secret)}
                            className="text-gray-400 hover:text-gold"
                            title="Copy Secret"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDeleteModal(webhook)}
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

      {/* Create Modal */}
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
                <ExternalLink className="h-32 w-32 text-gold" />
              </div>

              <div className="relative z-10 space-y-8">
                <div>
                  <h3 className="text-2xl font-extrabold text-white tracking-tight mb-2">Create Webhook</h3>
                  <p className="text-sm text-gray-500 font-medium">Configure a new webhook endpoint for event notifications.</p>
                </div>

                <form onSubmit={handleCreate} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gold uppercase tracking-widest">Endpoint URL</label>
                    <Input
                      value={formData.url}
                      onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                      placeholder="https://your-api.com/webhook"
                      required
                      className="bg-black border-white/10 h-14"
                    />
                    <p className="text-[10px] text-gray-500">Must use HTTPS. Localhost allowed for development only.</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gold uppercase tracking-widest">Description (Optional)</label>
                    <Input
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Payment processor callback"
                      className="bg-black border-white/10 h-14"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gold uppercase tracking-widest">Events to Subscribe</label>
                    <div className="flex flex-wrap gap-2 max-h-64 overflow-y-auto">
                      {AVAILABLE_EVENTS.map((event) => (
                        <label key={event} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 cursor-pointer transition-colors">
                          <input
                            type="checkbox"
                            checked={formData.events.includes(event)}
                            onChange={(e) => setFormData({
                              ...formData,
                              events: e.target.checked
                                ? [...formData.events, event]
                                : formData.events.filter(e => e !== event)
                            })}
                            className="w-4 h-4 accent-gold"
                          />
                          <span className="text-[11px] font-mono text-gray-400">{event}</span>
                        </label>
                      ))}
                    </div>
                    <p className="text-[10px] text-gray-500">Select at least one event. HMAC-SHA256 signatures will be sent with each payload.</p>
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
                      Create Webhook
                    </Button>
                  </div>
                </form>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Secret Display Modal */}
      <AnimatePresence>
        {showSecretModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[500] flex items-center justify-center p-4"
            onClick={() => setShowSecretModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-md bg-card border border-red-500/20 rounded-[2.5rem] p-8 shadow-2xl overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-8 opacity-5">
                <AlertTriangle className="h-32 w-32 text-red-500" />
              </div>

              <div className="relative z-10 space-y-8 text-center">
                <div className="h-16 w-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
                  <AlertTriangle className="h-8 w-8 text-red-500" />
                </div>
                <div>
                  <h3 className="text-2xl font-extrabold text-white tracking-tight mb-2">Webhook Created</h3>
                  <p className="text-sm text-gray-500 font-medium">
                    This is the only time the secret will be shown. Copy and store it securely.
                  </p>
                </div>

                <div className="p-6 rounded-2xl bg-red-500/10 border border-red-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Signing Secret</span>
                    {copiedId === 'secret' && <span className="text-emerald-400 text-[10px] font-bold">Copied!</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs font-mono text-white bg-black border border-white/10 rounded-xl p-3 break-all" id="secret-display">{newSecret}</code>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleCopySecret}
                      className="h-10"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
                  <AlertTriangle className="h-4 w-4 text-amber-400 mb-2" />
                  <p className="text-[10px] text-amber-300 font-medium uppercase tracking-wider">
                    This secret will never be shown again. If lost, you must delete this webhook and create a new one.
                  </p>
                </div>

                <Button
                  variant="accent"
                  className="w-full bg-gold hover:bg-gold-dark text-black rounded-2xl h-14 font-bold uppercase tracking-widest text-xs shadow-lg shadow-gold/20"
                  onClick={() => { setShowSecretModal(false); setNewSecret(''); }}
                >
                  I've Saved the Secret
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deletingWebhook && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[400] flex items-center justify-center p-4"
            onClick={() => setDeletingWebhook(null)}
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
                  <h3 className="text-2xl font-extrabold text-white tracking-tight mb-2">Delete Webhook</h3>
                  <p className="text-sm text-gray-500 font-medium">
                    Are you sure you want to delete <strong className="text-white">{deletingWebhook.url}</strong>?
                    This action cannot be undone.
                  </p>
                </div>
                <div className="flex space-x-3">
                  <Button
                    variant="secondary"
                    className="flex-1 rounded-2xl h-14 font-bold uppercase tracking-widest text-xs"
                    onClick={() => setDeletingWebhook(null)}
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

function getStatusConfig(webhook: Webhook) {
  if (!webhook.enabled) return { label: 'Disabled', className: 'bg-gray-500/20 text-gray-400', icon: <Shield className="h-3 w-3" /> };
  if (webhook.consecutiveFailures > 0) return { label: 'Failing', className: 'bg-amber-500/20 text-amber-400', icon: <AlertTriangle className="h-3 w-3" /> };
  return { label: 'Active', className: 'bg-emerald-500/20 text-emerald-400', icon: <CheckCircle2 className="h-3 w-3" /> };
}