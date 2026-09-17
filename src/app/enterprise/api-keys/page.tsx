'use client';

import { useState, useEffect } from 'react';
import { Plus, Search, Loader2, AlertCircle, CheckCircle2, Edit2, Trash2, Key, Copy, Eye, EyeOff, Shield, AlertTriangle } from 'lucide-react';
import { EnterpriseSkeleton } from '@/components/enterprise/EnterpriseSkeleton';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { motion, AnimatePresence } from 'framer-motion';

type ApiKey = {
  id: string;
  organizationId: string;
  name: string;
  env: 'sandbox' | 'production';
  prefix: string;
  keyHash: string;
  scopes: string[];
  expiresAt?: string | null;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
  disabled: boolean;
  createdAt: string;
  updatedAt: string;
  secret?: string; // Only returned once on creation
};

export default function EnterpriseApiKeysPage() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ total: 0, sandbox: 0, production: 0, revoked: 0 });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSecretModal, setShowSecretModal] = useState(false);
  const [newSecret, setNewSecret] = useState('');
  const [editingKey, setEditingKey] = useState<ApiKey | null>(null);
  const [revokingKey, setRevokingKey] = useState<ApiKey | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    env: 'sandbox' as 'sandbox' | 'production',
    scopes: [] as string[],
    expiresAt: '',
  });
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const AVAILABLE_SCOPES = [
    'customers:read', 'customers:write',
    'vaults:read', 'vaults:write',
    'legacy_plans:read', 'legacy_plans:write',
    'beneficiaries:read', 'beneficiaries:write',
    'guardians:read', 'guardians:write',
    'liveness:read', 'liveness:write',
    'claims:read', 'claims:manage',
    'billing:write',
    'audit:read',
    'webhooks:manage',
    'api_keys:read', 'api_keys:write',
  ];

  const fetchApiKeys = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: ((page - 1) * pageSize).toString(),
      });

      const res = await fetch(`/api/v1/api-keys?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch API keys');
      const data = await res.json();
      setApiKeys(data.data || []);
      setTotal(data.meta?.total || 0);
      
      // Compute stats
      const allRes = await fetch(`/api/v1/api-keys?limit=1000`);
      const allData = await allRes.json();
      const allKeys = allData.data || [];
      setStats({
        total: allKeys.length,
        sandbox: allKeys.filter((k: ApiKey) => k.env === 'sandbox').length,
        production: allKeys.filter((k: ApiKey) => k.env === 'production').length,
        revoked: allKeys.filter((k: ApiKey) => k.revokedAt).length,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApiKeys();
  }, [page, search]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create API key');
      }
      const data = await res.json();
      setNewSecret(data.apiKey.secret || '');
      setShowSecretModal(true);
      setShowCreateModal(false);
      resetForm();
      fetchApiKeys();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async () => {
    if (!revokingKey) return;
    setSubmitting(true);
    try {
      // Would need PATCH endpoint
      alert('Revoke endpoint not yet implemented');
      setRevokingKey(null);
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

  const handleCopyKeyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      env: 'sandbox',
      scopes: [],
      expiresAt: '',
    });
    setEditingKey(null);
  };

  const openCreateModal = () => {
    resetForm();
    setShowCreateModal(true);
  };

  const openRevokeModal = (key: ApiKey) => {
    setRevokingKey(key);
  };

  const getStatusConfig = (key: ApiKey) => {
    if (key.revokedAt) return { label: 'Revoked', className: 'bg-red-500/20 text-red-400' };
    if (key.disabled) return { label: 'Disabled', className: 'bg-gray-500/20 text-gray-400' };
    if (key.expiresAt && new Date(key.expiresAt) < new Date()) return { label: 'Expired', className: 'bg-amber-500/20 text-amber-400' };
    return { label: 'Active', className: 'bg-emerald-500/20 text-emerald-400' };
  };

  const hasMore = page * pageSize < total;

  return (
    <EnterpriseSkeleton
      eyebrow="API Keys"
      title="API Keys"
      subtitle="SHA-256 hashed secrets only. Prefix clsbox_ = sandbox (safe for dev/test). Prefix clprod_ = production (never show again after create). Rotation auto-revokes old key."
      stats={[
        { label: 'Sandbox keys', value: stats.sandbox, tone: 'positive' },
        { label: 'Production keys', value: stats.production, tone: 'positive' },
        { label: 'Revoked', value: stats.revoked, tone: 'negative' },
        { label: 'Default scopes', value: stats.total > 0 ? '17' : '0', tone: 'neutral' },
      ]}
      cta={[
        { label: '+ Create Sandbox Key', variant: 'primary', action: openCreateModal },
        { label: '+ Create Production Key', variant: 'secondary', action: () => { setFormData({ ...formData, env: 'production' }); openCreateModal(); } },
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
                <th className="py-3 px-6">Key</th>
                <th className="py-3 px-6">Environment</th>
                <th className="py-3 px-6">Status</th>
                <th className="py-3 px-6">Scopes</th>
                <th className="py-3 px-6">Last Used</th>
                <th className="py-3 px-6">Created</th>
                <th className="py-3 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-gray-300">
              {(() => {
                if (loading && apiKeys.length === 0) {
                  return (
                    <tr>
                      <td colSpan={7} className="py-12 text-center">
                        <Loader2 className="h-8 w-8 animate-spin text-gold mx-auto" />
                      </td>
                    </tr>
                  );
                }
                if (apiKeys.length === 0) {
                  return (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-gray-500">
                        No API keys found. <Button variant="ghost" className="ml-2" onClick={openCreateModal}>Create one</Button>
                      </td>
                    </tr>
                  );
                }
                return apiKeys.map((key) => {
                  const status = getStatusConfig(key);
                  return (
                    <tr key={key.id} className="border-t border-white/5 hover:bg-white/[0.02] transition-colors">
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-xl bg-white/5 flex items-center justify-center border border-white/10">
                            <Key className="h-4 w-4 text-gray-400" />
                          </div>
                          <div>
                            <p className="font-semibold text-white">{key.name}</p>
                            <p className="text-[11px] text-gray-500 font-mono truncate max-w-xs">
                              {key.prefix}{key.id}
                              {copiedId === key.id && <span className="ml-2 text-emerald-400 text-[10px]">Copied!</span>}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <span className={`px-2 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider ${key.env === 'production' ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'}`}>
                          {key.env}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        <span className={`px-2 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider ${status.className}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        <span className="text-[11px] text-gray-400">{key.scopes?.length || 0} scopes</span>
                      </td>
                      <td className="py-4 px-6 text-[11px] text-gray-500">
                        {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : 'Never'}
                      </td>
                      <td className="py-4 px-6 text-[11px] text-gray-500">
                        {new Date(key.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {!key.revokedAt && !key.disabled && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openRevokeModal(key)}
                              className="text-red-500 hover:text-red-400"
                              title="Revoke"
                            >
                              <AlertTriangle className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopyKeyId(key.id)}
                            className="text-gray-400 hover:text-gold"
                            title="Copy Key ID"
                          >
                            <Copy className="h-4 w-4" />
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
                className="relative w-full max-w-md bg-card border border-white/10 rounded-[2.5rem] p-8 shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
              >
                <div className="absolute top-0 right-0 p-8 opacity-5">
                  <Key className="h-32 w-32 text-gold" />
                </div>

                <div className="relative z-10 space-y-8">
                  <div>
                    <h3 className="text-2xl font-extrabold text-white tracking-tight mb-2">Create API Key</h3>
                    <p className="text-sm text-gray-500 font-medium">Generate a new API key for your organization.</p>
                  </div>

                  <form onSubmit={handleCreate} className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gold uppercase tracking-widest">Key Name</label>
                      <Input
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="My Integration Key"
                        required
                        className="bg-black border-white/10 h-14"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gold uppercase tracking-widest">Environment</label>
                      <div className="flex gap-3">
                        {(['sandbox', 'production'] as const).map((env) => (
                          <Button
                            key={env}
                            type="button"
                            variant={formData.env === env ? 'accent' : 'secondary'}
                            className="flex-1 h-12"
                            onClick={() => setFormData({ ...formData, env })}
                          >
                            {env === 'production' ? (
                              <>
                                <AlertTriangle className="h-4 w-4 mr-2" /> Production
                              </>
                            ) : (
                              <>
                                <Shield className="h-4 w-4 mr-2" /> Sandbox
                              </>
                            )}
                          </Button>
                        ))}
                      </div>
                      <p className="text-[10px] text-gray-500">
                        {formData.env === 'production' ? 'Production keys start with clprod_ and cannot be recovered if lost.' : 'Sandbox keys start with clsbox_ and are safe for development.'}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gold uppercase tracking-widest">Scopes</label>
                      <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
                        {AVAILABLE_SCOPES.map((scope) => (
                          <label key={scope} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 cursor-pointer transition-colors">
                            <input
                              type="checkbox"
                              checked={formData.scopes.includes(scope)}
                              onChange={(e) => setFormData({
                                ...formData,
                                scopes: e.target.checked
                                  ? [...formData.scopes, scope]
                                  : formData.scopes.filter(s => s !== scope)
                              })}
                              className="w-4 h-4 accent-gold"
                            />
                            <span className="text-[11px] font-mono text-gray-400">{scope}</span>
                          </label>
                        ))}
                      </div>
                      <p className="text-[10px] text-gray-500">Select permissions for this API key. Empty = no access.</p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gold uppercase tracking-widest">Expires At (Optional)</label>
                      <Input
                        type="datetime-local"
                        value={formData.expiresAt}
                        onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
                        className="bg-black border-white/10 h-14"
                      />
                      <p className="text-[10px] text-gray-500">Leave blank for no expiration</p>
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
                        variant={formData.env === 'production' ? 'secondary' : 'accent'}
                        className="flex-1 rounded-2xl h-14 font-bold uppercase tracking-widest text-xs shadow-lg"
                        isLoading={submitting}
                      >
                        {formData.env === 'production' ? 'Create Production Key' : 'Create Sandbox Key'}
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
                    <h3 className="text-2xl font-extrabold text-white tracking-tight mb-2">API Key Created</h3>
                    <p className="text-sm text-gray-500 font-medium">
                      This is the only time the secret will be shown. Copy and store it securely.
                    </p>
                  </div>

                  <div className="p-6 rounded-2xl bg-red-500/10 border border-red-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Secret</span>
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
                      This secret will never be shown again. If lost, you must revoke this key and create a new one.
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

        {/* Revoke Confirmation Modal */}
        <AnimatePresence>
          {revokingKey && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[400] flex items-center justify-center p-4"
              onClick={() => setRevokingKey(null)}
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
                    <AlertTriangle className="h-8 w-8 text-red-500" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-extrabold text-white tracking-tight mb-2">Revoke API Key</h3>
                    <p className="text-sm text-gray-500 font-medium">
                      Are you sure you want to revoke <strong className="text-white">{revokingKey.name}</strong>?
                      This action cannot be undone. The key will immediately stop working.
                    </p>
                  </div>
                  <div className="flex space-x-3">
                    <Button
                      variant="secondary"
                      className="flex-1 rounded-2xl h-14 font-bold uppercase tracking-widest text-xs"
                      onClick={() => setRevokingKey(null)}
                      disabled={submitting}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="secondary"
                      className="flex-1 bg-red-500 hover:bg-red-600 text-black rounded-2xl h-14 font-bold uppercase tracking-widest text-xs shadow-lg"
                      onClick={handleRevoke}
                      isLoading={submitting}
                    >
                      Revoke Permanently
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