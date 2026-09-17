'use client';

import { useState } from 'react';
import { Loader2, AlertCircle, CheckCircle2, Shield, Key, Users, Bell, Globe, Database, Settings, CreditCard, Lock, AlertTriangle, XCircle, Save, RotateCcw, SlidersHorizontal, Moon, Sun, Bell as BellIcon, Mail, Shield as ShieldIcon, HeartPulse, RotateCcw as RotateCcwIcon, MessageSquare, Database as DatabaseIcon, AlertTriangle as AlertTriangleIcon, FileText } from 'lucide-react';
import { EnterpriseSkeleton } from '@/components/enterprise/EnterpriseSkeleton';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { motion, AnimatePresence } from 'framer-motion';

export default function EnterpriseSettingsPage() {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile' | 'billing' | 'security' | 'integrations' | 'notifications'>('profile');
  const [formData, setFormData] = useState({
    orgName: 'Acme Corporation',
    orgSlug: 'acme-corp',
    orgEmail: 'admin@acme.com',
    orgCountry: 'US',
    timezone: 'UTC',
    currency: 'USD',
    plan: 'sandbox',
    // Security
    twoFactorEnabled: false,
    sessionTimeout: 30,
    ipWhitelist: '',
    // Notifications
    emailNotifications: true,
    smsNotifications: false,
    webhookRetryAlerts: true,
    claimAlerts: true,
    livenessAlerts: true,
    billingAlerts: true,
    securityAlerts: true,
    // Integrations
    webhookUrl: '',
    slackWebhook: '',
    pagerdutyKey: '',
    // Billing
    billingEmail: 'billing@acme.com',
    paymentMethod: 'card',
  });

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    await new Promise(resolve => setTimeout(resolve, 1000));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleResetSecret = async (type: string) => {
    if (confirm(`Rotate ${type}? This will invalidate the current secret.`)) {
      alert(`${type} rotation - implement endpoint`);
    }
  };

  const tabs: { id: 'profile' | 'billing' | 'security' | 'integrations' | 'notifications'; label: string; icon: React.ReactNode }[] = [
    { id: 'profile', label: 'Profile', icon: <Users className="h-4 w-4" /> },
    { id: 'security', label: 'Security', icon: <Shield className="h-4 w-4" /> },
    { id: 'notifications', label: 'Notifications', icon: <BellIcon className="h-4 w-4" /> },
    { id: 'integrations', label: 'Integrations', icon: <Globe className="h-4 w-4" /> },
    { id: 'billing', label: 'Billing', icon: <CreditCard className="h-4 w-4" /> },
  ];

  return (
    <EnterpriseSkeleton
      eyebrow="Settings"
      title="Organization Settings"
      subtitle="Profile, billing, legal, SSO/SAML, and integration credentials."
      stats={[
        { label: 'Plan', value: 'Sandbox Trial' },
        { label: 'Cron TTL', value: '9 min' },
        { label: 'Liveness interval', value: '30d' },
        { label: 'Default quorum', value: '2-of-3' },
      ]}
      cta={[
        { label: 'Save Settings', variant: 'primary', action: handleSave },
      ]}
    >
      {saved && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center space-x-3"
        >
          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          <p className="text-emerald-400 text-sm font-medium">Settings saved successfully</p>
        </motion.div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-1 mb-8 p-1 rounded-2xl bg-white/5 border border-white/10">
        {tabs.map(tab => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? 'accent' : 'ghost'}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold uppercase tracking-wider"
            onClick={() => setActiveTab(tab.id)}
            disabled={saving}
          >
            {tab.icon} {tab.label}
          </Button>
        ))}
      </div>

      <div className="space-y-8">
        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <div className="space-y-8">
            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-6">
              <h2 className="text-base font-bold uppercase tracking-wider">Organization Profile</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gold uppercase tracking-widest">Organization Name</label>
                  <Input
                    value={formData.orgName}
                    onChange={(e) => setFormData({ ...formData, orgName: e.target.value })}
                    placeholder="Acme Corporation"
                    className="bg-black border-white/10 h-14"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gold uppercase tracking-widest">Organization Slug</label>
                  <Input
                    value={formData.orgSlug}
                    onChange={(e) => setFormData({ ...formData, orgSlug: e.target.value })}
                    placeholder="acme-corp"
                    className="bg-black border-white/10 h-14"
                  />
                  <p className="text-[10px] text-gray-500">Used in API endpoints. Cannot be changed after creation.</p>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gold uppercase tracking-widest">Contact Email</label>
                  <Input
                    type="email"
                    value={formData.orgEmail}
                    onChange={(e) => setFormData({ ...formData, orgEmail: e.target.value })}
                    placeholder="admin@acme.com"
                    className="bg-black border-white/10 h-14"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gold uppercase tracking-widest">Country</label>
                  <select
                    value={formData.orgCountry}
                    onChange={(e) => setFormData({ ...formData, orgCountry: e.target.value })}
                    className="bg-black border-white/10 h-14 text-white rounded-2xl w-full appearance-none"
                  >
                    <option value="US">United States</option>
                    <option value="CA">Canada</option>
                    <option value="GB">United Kingdom</option>
                    <option value="DE">Germany</option>
                    <option value="FR">France</option>
                    <option value="AU">Australia</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gold uppercase tracking-widest">Timezone</label>
                  <select
                    value={formData.timezone}
                    onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                    className="bg-black border-white/10 h-14 text-white rounded-2xl w-full appearance-none"
                  >
                    <option value="UTC">UTC</option>
                    <option value="America/New_York">Eastern Time (ET)</option>
                    <option value="America/Chicago">Central Time (CT)</option>
                    <option value="America/Denver">Mountain Time (MT)</option>
                    <option value="America/Los_Angeles">Pacific Time (PT)</option>
                    <option value="Europe/London">London (GMT/BST)</option>
                    <option value="Europe/Paris">Paris (CET/CEST)</option>
                    <option value="Asia/Tokyo">Tokyo (JST)</option>
                    <option value="Asia/Singapore">Singapore (SGT)</option>
                    <option value="Australia/Sydney">Sydney (AEST/AEDT)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gold uppercase tracking-widest">Currency</label>
                  <select
                    value={formData.currency}
                    onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                    className="bg-black border-white/10 h-14 text-white rounded-2xl w-full appearance-none"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                    <option value="CAD">CAD ($)</option>
                    <option value="AUD">AUD ($)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gold uppercase tracking-widest">Current Plan</label>
                  <div className="flex items-center gap-3">
                    <span className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${formData.plan === 'sandbox' ? 'bg-blue-500/20 text-blue-400' : formData.plan === 'production' ? 'bg-green-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-400'}`}>
                      {formData.plan}
                    </span>
                    <span className="text-sm text-gray-500">Upgrade at /pricing</span>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* Security Tab */}
        {activeTab === 'security' && (
          <div className="space-y-8">
            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-6">
              <h2 className="text-base font-bold uppercase tracking-wider">Two-Factor Authentication</h2>
              <div className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/10">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                    <Shield className="h-5 w-5 text-purple-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-white">Two-Factor Authentication</p>
                    <p className="text-sm text-gray-500">Require 2FA for all organization members</p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.twoFactorEnabled}
                    onChange={(e) => setFormData({ ...formData, twoFactorEnabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-white/10 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-gold/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gold"></div>
                </label>
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-6">
              <h2 className="text-base font-bold uppercase tracking-wider">Session & Access Control</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gold uppercase tracking-widest">Session Timeout (minutes)</label>
                  <Input
                    type="number"
                    value={formData.sessionTimeout}
                    onChange={(e) => setFormData({ ...formData, sessionTimeout: parseInt(e.target.value) || 30 })}
                    min="5"
                    max="480"
                    className="bg-black border-white/10 h-14"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gold uppercase tracking-widest">IP Whitelist (CIDR, comma-separated)</label>
                  <Input
                    value={formData.ipWhitelist}
                    onChange={(e) => setFormData({ ...formData, ipWhitelist: e.target.value })}
                    placeholder="192.168.1.0/24, 10.0.0.0/8"
                    className="bg-black border-white/10 h-14 font-mono text-xs"
                  />
                  <p className="text-[10px] text-gray-500">Leave empty to allow all IPs</p>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-6">
              <h2 className="text-base font-bold uppercase tracking-wider">Secret Rotation</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Button variant="secondary" onClick={() => handleResetSecret('Webhook Secret')} className="h-14">
                  <RotateCcwIcon className="h-4 w-4 mr-2" /> Rotate Webhook Secret
                </Button>
                <Button
                    variant="secondary"
                    className="flex-1 rounded-2xl h-14 font-bold uppercase tracking-widest text-xs"
                    onClick={() => handleResetSecret('API Key')}
                  >
                    <RotateCcwIcon className="h-4 w-4 mr-2" /> Rotate API Key
                  </Button>
                <Button variant="secondary" onClick={() => handleResetSecret('Webhook Secret')} className="h-14">
                  <RotateCcwIcon className="h-4 w-4 mr-2" /> Rotate Encryption Key
                </Button>
              </div>
            </section>
          </div>
        )}

        {/* Notifications Tab */}
        {activeTab === 'notifications' && (
          <div className="space-y-8">
            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
              <h2 className="text-base font-bold uppercase tracking-wider">Notification Preferences</h2>
              <p className="text-sm text-gray-500">Choose which events trigger notifications for your organization.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { key: 'emailNotifications', label: 'Email Notifications', icon: <Mail className="h-4 w-4" />, desc: 'Receive email notifications for events' },
                  { key: 'smsNotifications', label: 'SMS Notifications', icon: <ShieldIcon className="h-4 w-4" />, desc: 'Receive SMS for critical alerts' },
                  { key: 'webhookRetryAlerts', label: 'Webhook Retry Alerts', icon: <RotateCcwIcon className="h-4 w-4" />, desc: 'Alert when webhook delivery retries' },
                  { key: 'claimAlerts', label: 'Claim Alerts', icon: <FileText className="h-4 w-4" />, desc: 'Notify on claim creation/transitions' },
                  { key: 'livenessAlerts', label: 'Liveness Alerts', icon: <HeartPulse className="h-4 w-4" />, desc: 'Alert on liveness warnings/escalations' },
                  { key: 'billingAlerts', label: 'Billing Alerts', icon: <CreditCard className="h-4 w-4" />, desc: 'Notify on billing events/charges' },
                  { key: 'securityAlerts', label: 'Security Alerts', icon: <Shield className="h-4 w-4" />, desc: 'Critical security event notifications' },
                ].map(item => (
                  <label key={item.key} className="flex items-center gap-3 p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={formData[item.key as keyof typeof formData] as boolean}
                      onChange={(e) => setFormData({ ...formData, [item.key]: e.target.checked })}
                      className="w-4 h-4 accent-gold"
                    />
                    <div className="flex items-center gap-2 flex-1">
                      <div className="h-8 w-8 rounded-xl bg-white/5 flex items-center justify-center">
                        {item.icon}
                      </div>
                      <div>
                        <p className="font-semibold text-white text-sm">{item.label}</p>
                        <p className="text-[10px] text-gray-500">{item.desc}</p>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* Integrations Tab */}
        {activeTab === 'integrations' && (
          <div className="space-y-8">
            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-6">
              <h2 className="text-base font-bold uppercase tracking-wider">Webhook Integration</h2>
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gold uppercase tracking-widest">Webhook URL</label>
                  <Input
                    value={formData.webhookUrl}
                    onChange={(e) => setFormData({ ...formData, webhookUrl: e.target.value })}
                    placeholder="https://your-api.com/webhook"
                    className="bg-black border-white/10 h-14"
                  />
                  <p className="text-[10px] text-gray-500">Main webhook endpoint for all events</p>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-6">
              <h2 className="text-base font-bold uppercase tracking-wider">Third-Party Integrations</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-2xl bg-purple-500/10 flex items-center justify-center">
                      <MessageSquare className="h-6 w-6 text-purple-400" />
                    </div>
                    <div>
                      <p className="font-semibold text-white">Slack</p>
                      <p className="text-sm text-gray-500">Send alerts to Slack channels</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gold uppercase tracking-widest">Slack Webhook URL</label>
                    <Input
                      value={formData.slackWebhook}
                      onChange={(e) => setFormData({ ...formData, slackWebhook: e.target.value })}
                      placeholder="https://hooks.slack.com/services/..."
                      className="bg-black border-white/10 h-14"
                    />
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-2xl bg-orange-500/10 flex items-center justify-center">
                      <AlertTriangle className="h-6 w-6 text-orange-400" />
                    </div>
                    <div>
                      <p className="font-semibold text-white">PagerDuty</p>
                      <p className="text-sm text-gray-500">Critical alert escalation</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gold uppercase tracking-widest">Integration Key</label>
                    <Input
                      value={formData.pagerdutyKey}
                      onChange={(e) => setFormData({ ...formData, pagerdutyKey: e.target.value })}
                      placeholder="xxxxx"
                      className="bg-black border-white/10 h-14"
                    />
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-2xl bg-green-500/10 flex items-center justify-center">
                      <Database className="h-6 w-6 text-green-400" />
                    </div>
                    <div>
                      <p className="font-semibold text-white">Custom Webhook</p>
                      <p className="text-sm text-gray-500">Additional custom endpoint</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gold uppercase tracking-widest">Custom Endpoint</label>
                    <Input
                      value={formData.webhookUrl}
                      onChange={(e) => setFormData({ ...formData, webhookUrl: e.target.value })}
                      placeholder="https://custom.example.com/webhook"
                      className="bg-black border-white/10 h-14"
                    />
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* Billing Tab */}
        {activeTab === 'billing' && (
          <div className="space-y-8">
            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-6">
              <h2 className="text-base font-bold uppercase tracking-wider">Billing Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gold uppercase tracking-widest">Billing Email</label>
                  <Input
                    type="email"
                    value={formData.billingEmail}
                    onChange={(e) => setFormData({ ...formData, billingEmail: e.target.value })}
                    placeholder="billing@acme.com"
                    className="bg-black border-white/10 h-14"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gold uppercase tracking-widest">Payment Method</label>
                  <select
                    value={formData.paymentMethod}
                    onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                    className="bg-black border-white/10 h-14 text-white rounded-2xl w-full appearance-none"
                  >
                    <option value="card">Credit/Debit Card</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="invoice">Invoice (Net 30)</option>
                  </select>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-6">
              <h2 className="text-base font-bold uppercase tracking-wider">Current Plan</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Current Plan</p>
                      <p className="text-2xl font-bold text-white">Sandbox Trial</p>
                    </div>
                    <div className="px-3 py-1 rounded-full bg-blue-500/20 text-blue-400 text-[10px] font-bold uppercase tracking-wider">Trial</div>
                  </div>
                  <div className="space-y-2 text-sm text-gray-400">
                    <p>Unlimited customers</p>
                    <p>Unlimited vaults</p>
                    <p>All features enabled</p>
                    <p>Community support</p>
                  </div>
                  <Button variant="secondary" className="w-full">Upgrade to Production</Button>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Production</p>
                      <p className="text-2xl font-bold text-white">Coming Soon</p>
                    </div>
                    <div className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase tracking-wider">Available</div>
                  </div>
                  <div className="space-y-2 text-sm text-gray-400">
                    <p>Production SLAs</p>
                    <p>Dedicated support</p>
                    <p>Custom contracts</p>
                    <p>Volume discounts</p>
                  </div>
                  <Button variant="primary" className="w-full">Request Access</Button>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Enterprise</p>
                      <p className="text-2xl font-bold text-white">Custom</p>
                    </div>
                    <div className="px-3 py-1 rounded-full bg-purple-500/20 text-purple-400 text-[10px] font-bold uppercase tracking-wider">Custom</div>
                  </div>
                  <div className="space-y-2 text-sm text-gray-400">
                    <p>Custom contracts</p>
                    <p>White-label options</p>
                    <p>On-premise deployment</p>
                    <p>Dedicated infrastructure</p>
                  </div>
                  <Button variant="secondary" className="w-full">Contact Sales</Button>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </EnterpriseSkeleton>
  );
}