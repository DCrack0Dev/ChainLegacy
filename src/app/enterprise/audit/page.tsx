'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { Loader2, AlertCircle, Download, FileText, Filter, ChevronDown, ChevronUp, Shield, Key, Users, Bell, Globe, Database, Settings, CreditCard, Lock, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { EnterpriseSkeleton } from '@/components/enterprise/EnterpriseSkeleton';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { motion, AnimatePresence } from 'framer-motion';

type AuditEvent = {
  id: string;
  organizationId: string;
  event: string;
  actor?: { type: string; id: string };
  resource?: { type: string; id: string };
  details?: any;
  result?: string;
  createdAt: string;
};

const EVENT_CATEGORIES = [
  { key: 'organization', label: 'Organization', icon: <Globe className="h-3 w-3" /> },
  { key: 'customer', label: 'Customer', icon: <Users className="h-3 w-3" /> },
  { key: 'legacy_plan', label: 'Legacy Plan', icon: <FileText className="h-3 w-3" /> },
  { key: 'beneficiary', label: 'Beneficiary', icon: <Users className="h-3 w-3" /> },
  { key: 'guardian', label: 'Guardian', icon: <Shield className="h-3 w-3" /> },
  { key: 'claim', label: 'Claim', icon: <FileText className="h-3 w-3" /> },
  { key: 'api_key', label: 'API Key', icon: <Key className="h-3 w-3" /> },
  { key: 'webhook', label: 'Webhook', icon: <Globe className="h-3 w-3" /> },
  { key: 'liveness', label: 'Liveness', icon: <AlertTriangle className="h-3 w-3" /> },
  { key: 'billing', label: 'Billing', icon: <CreditCard className="h-3 w-3" /> },
  { key: 'security', label: 'Security', icon: <Lock className="h-3 w-3" /> },
];

export default function EnterpriseAuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ total: 0, success: 0, failed: 0, categories: 0 });
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<'csv' | 'json'>('csv');
  const [exporting, setExporting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: ((page - 1) * pageSize).toString(),
      });
      if (categoryFilter !== 'all') params.append('event', categoryFilter);

      const res = await fetch(`/api/v1/audit?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch audit events');
      const data = await res.json();
      setEvents(data.data || []);
      setTotal(data.meta?.total || 0);
      
      // Compute stats
      const allRes = await fetch(`/api/v1/audit${categoryFilter !== 'all' ? `?event=${categoryFilter}` : ''}&limit=1000`);
      const allData = await allRes.json();
      const allEvents = allData.data || [];
      const categories = new Set(allEvents.map((e: AuditEvent) => e.event.split('.')[0]));
      setStats({
        total: allEvents.length,
        success: allEvents.filter((e: AuditEvent) => e.result === 'success').length,
        failed: allEvents.filter((e: AuditEvent) => e.result === 'failed').length,
        categories: categories.size,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams({
        limit: '10000',
        offset: '0',
      });
      if (categoryFilter !== 'all') params.append('event', categoryFilter);

      const res = await fetch(`/api/v1/audit?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch events for export');
      const data = await res.json();
      const exportData = data.data || [];

      if (exportFormat === 'csv') {
        const headers = ['ID', 'Event', 'Actor Type', 'Actor ID', 'Resource Type', 'Resource ID', 'Result', 'Created At'];
        const rows = exportData.map((e: AuditEvent) => [
          e.id,
          e.event,
          e.actor?.type || '',
          e.actor?.id || '',
          e.resource?.type || '',
          e.resource?.id || '',
          e.result || '',
          new Date(e.createdAt).toISOString(),
        ]);
        const csv = [headers.join(','), ...rows.map((r: string[]) => r.map((v: string) => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
        downloadBlob(csv, `audit-export-${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
      } else {
        downloadBlob(JSON.stringify(exportData, null, 2), `audit-export-${new Date().toISOString().split('T')[0]}.json`, 'application/json');
      }
      setShowExportModal(false);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setExporting(false);
    }
  };

  const downloadBlob = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: ((page - 1) * pageSize).toString(),
      });
      if (categoryFilter !== 'all') params.append('event', categoryFilter);

      const res = await fetch(`/api/v1/audit?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch audit events');
      const data = await res.json();
      setEvents(data.data || []);
      setTotal(data.meta?.total || 0);
      
      // Compute stats
      const allRes = await fetch(`/api/v1/audit${categoryFilter !== 'all' ? `?event=${categoryFilter}` : ''}&limit=1000`);
      const allData = await allRes.json();
      const allEvents = allData.data || [];
      const categories = new Set(allEvents.map((e: AuditEvent) => e.event.split('.')[0]));
      setStats({
        total: allEvents.length,
        success: allEvents.filter((e: AuditEvent) => e.result === 'success').length,
        failed: allEvents.filter((e: AuditEvent) => e.result === 'failed').length,
        categories: categories.size,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [page, categoryFilter]);

  const getEventIcon = (event: string) => {
    const category = event.split('.')[0];
    const cat = EVENT_CATEGORIES.find(c => c.key === category);
    return cat?.icon || <Database className="h-3 w-3" />;
  };

  const getResultBadge = (result?: string) => {
    if (result === 'success') return <span className="px-2 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-emerald-500/20 text-emerald-400"><CheckCircle2 className="h-3 w-3 mr-1" /> Success</span>;
    if (result === 'failed') return <span className="px-2 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-red-500/20 text-red-400"><XCircle className="h-3 w-3 mr-1" /> Failed</span>;
    return <span className="px-2 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-gray-500/20 text-gray-400">Unknown</span>;
  };

  const hasMore = page * pageSize < total;

  return (
    <EnterpriseSkeleton
      eyebrow="Audit Trail"
      title="Audit Events"
      subtitle="Every security-critical action: create org/key, claim transitions, guardian approvals, webhook deliveries, OTP events — redacted for 15 sensitive keys (password, secret, seed, otp, mnemonic, token, etc.)."
      stats={[
        { label: 'Total Events', value: stats.total },
        { label: 'Successful', value: stats.success, tone: 'positive' },
        { label: 'Failed', value: stats.failed, tone: stats.failed > 0 ? 'negative' : 'positive' },
        { label: 'Categories', value: stats.categories, tone: 'neutral' },
      ]}
      cta={[
        { label: 'Export CSV', variant: 'secondary', action: () => { setExportFormat('csv'); setShowExportModal(true); } },
        { label: 'Export JSON', variant: 'secondary', action: () => { setExportFormat('json'); setShowExportModal(true); } },
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
          <Filter className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <Input
            placeholder="Search by event, actor, resource..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-10 pr-4"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <select
            value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
            className="pl-10 pr-10 bg-black border border-white/10 h-14 text-white rounded-2xl appearance-none"
          >
            <option value="all">All Categories</option>
            {EVENT_CATEGORIES.map(cat => (
              <option key={cat.key} value={cat.key}>{cat.label}</option>
            ))}
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
                <th className="py-3 px-6">Event</th>
                <th className="py-3 px-6">Actor</th>
                <th className="py-3 px-6">Resource</th>
                <th className="py-3 px-6">Result</th>
                <th className="py-3 px-6">Details</th>
                <th className="py-3 px-6">Time</th>
              </tr>
            </thead>
            <tbody className="text-gray-300">
              {(() => {
                if (loading && events.length === 0) {
                  return (
                    <tr>
                      <td colSpan={6} className="py-12 text-center">
                        <Loader2 className="h-8 w-8 animate-spin text-gold mx-auto" />
                      </td>
                    </tr>
                  );
                }
                if (events.length === 0) {
                  return (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-gray-500">No audit events found</td>
                    </tr>
                  );
                }
                return events.map((event) => (
                  <tr key={event.id} className="border-t border-white/5 hover:bg-white/[0.02] transition-colors">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-xl bg-white/5 flex items-center justify-center border border-white/10">
                          {getEventIcon(event.event)}
                        </div>
                        <div>
                          <p className="font-semibold text-white text-sm">{event.event}</p>
                          <p className="text-[11px] text-gray-500 font-mono">{event.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="space-y-1">
                        {event.actor && (
                          <div className="flex items-center gap-1 text-[11px]">
                            <span className="text-gray-500">{event.actor.type}:</span>
                            <span className="font-mono text-white truncate max-w-xs">{event.actor.id}</span>
                          </div>
                        )}
                        {!event.actor && <span className="text-gray-500 text-[11px]">System</span>}
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="space-y-1">
                        {event.resource && (
                          <div className="flex items-center gap-1 text-[11px]">
                            <span className="text-gray-500">{event.resource.type}:</span>
                            <span className="font-mono text-white truncate max-w-xs">{event.resource.id}</span>
                          </div>
                        )}
                        {!event.resource && <span className="text-gray-500 text-[11px]">—</span>}
                      </div>
                    </td>
                    <td className="py-4 px-6">{getResultBadge(event.result)}</td>
                    <td className="py-4 px-6 text-[11px] text-gray-500">
                      {event.details ? (
                        <button
                          className="text-blue-400 hover:text-blue-300 text-left underline"
                          onClick={() => alert(JSON.stringify(event.details, null, 2))}
                        >
                          View Details
                        </button>
                      ) : (
                        <span className="text-gray-500">—</span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-[11px] text-gray-500">
                      {new Date(event.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))
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

      {/* Export Modal */}
      <AnimatePresence>
        {showExportModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[400] flex items-center justify-center p-4"
            onClick={() => setShowExportModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-md bg-card border border-white/10 rounded-[2.5rem] p-8 shadow-2xl overflow-hidden"
            >
              <div className="relative z-10 space-y-8 text-center">
                <div className="h-16 w-16 rounded-full bg-blue-500/10 flex items-center justify-center mx-auto mb-4">
                  <FileText className="h-8 w-8 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-2xl font-extrabold text-white tracking-tight mb-2">Export Audit Events</h3>
                  <p className="text-sm text-gray-500 font-medium">Choose export format and confirm.</p>
                </div>

                <div className="space-y-4">
                  <label className="flex items-center gap-3 p-4 rounded-2xl bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10 transition-colors">
                    <input
                      type="radio"
                      name="format"
                      value="csv"
                      checked={exportFormat === 'csv'}
                      onChange={(e) => setExportFormat(e.target.value as 'csv' | 'json')}
                      className="w-4 h-4 accent-gold"
                    />
                    <div className="text-left">
                      <p className="font-semibold text-white">CSV</p>
                      <p className="text-[11px] text-gray-500">Comma-separated values, opens in Excel</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 p-4 rounded-2xl bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10 transition-colors">
                    <input
                      type="radio"
                      name="format"
                      value="json"
                      checked={exportFormat === 'json'}
                      onChange={(e) => setExportFormat(e.target.value as 'csv' | 'json')}
                      className="w-4 h-4 accent-gold"
                    />
                    <div className="text-left">
                      <p className="font-semibold text-white">JSON</p>
                      <p className="text-[11px] text-gray-500">Full structured data with all fields</p>
                    </div>
                  </label>
                </div>

                <div className="flex space-x-3 pt-4">
                  <Button
                    type="button"
                    variant="secondary"
                    className="flex-1 rounded-2xl h-14 font-bold uppercase tracking-widest text-xs"
                    onClick={() => setShowExportModal(false)}
                    disabled={exporting}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="accent"
                    className="flex-1 bg-gold hover:bg-gold-dark text-black rounded-2xl h-14 font-bold uppercase tracking-widest text-xs shadow-lg shadow-gold/20"
                    onClick={handleExport}
                    isLoading={exporting}
                  >
                    Export {exportFormat.toUpperCase()}
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