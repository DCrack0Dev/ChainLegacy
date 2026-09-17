'use client';

import { Shield, Lock, Key, AlertTriangle, CheckCircle2, AlertCircle, RotateCcw, ExternalLink } from 'lucide-react';
import { EnterpriseSkeleton } from '@/components/enterprise/EnterpriseSkeleton';
import { Button } from '@/components/ui/Button';
import { motion, AnimatePresence } from 'framer-motion';

export default function EnterpriseSecurityPage() {
  return (
    <EnterpriseSkeleton
      eyebrow="Security"
      title="Security Center"
      subtitle="API keys, encryption, and tenant boundary. End-to-End Encrypted Vault only — no zero-knowledge proofs in this version (previously incorrectly labeled)."
      stats={[
        { label: 'Encryption', value: 'AES-256-GCM' },
        { label: 'KDF', value: 'Argon2id (hash-wasm)' },
        { label: 'Secret Splitting', value: 'Shamir Threshold' },
        { label: 'Firestore rules', value: 'server-admin only' },
      ]}
      cta={[
        { label: 'Rotate Org Webhook Secret', variant: 'secondary', action: () => alert('Rotate webhook secret - implement endpoint') },
        { label: 'Rotate API Key', variant: 'secondary', action: () => alert('Rotate API key - implement endpoint') },
      ]}
    >
      <div className="space-y-8">
        {/* Encryption Section */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-6">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20">
              <Lock className="h-6 w-6 text-purple-400" />
            </div>
            <div>
              <h2 className="text-base font-bold uppercase tracking-wider">Encryption & Key Management</h2>
              <p className="text-sm text-gray-500">All vault data encrypted at rest with AES-256-GCM. Keys derived via Argon2id.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                  <Lock className="h-5 w-5 text-purple-400" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Algorithm</p>
                  <p className="font-bold text-white">AES-256-GCM</p>
                </div>
              </div>
              <p className="text-sm text-gray-500">Authenticated encryption with associated data (AEAD). 256-bit key, 96-bit nonce, 128-bit tag.</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                  <Key className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Key Derivation</p>
                  <p className="font-bold text-white">Argon2id</p>
                </div>
              </div>
              <p className="text-sm text-gray-500">Memory-hard KDF via hash-wasm. Configurable time/memory/parallelism parameters.</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Secret Splitting</p>
                  <p className="font-bold text-white">Shamir Secret Sharing</p>
                </div>
              </div>
              <p className="text-sm text-gray-500">Configurable threshold (k-of-n). Default: disabled. Enable in vault setup for multi-party key recovery.</p>
            </div>
          </div>
        </section>

        {/* API Key Security */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-6">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
              <Key className="h-6 w-6 text-blue-400" />
            </div>
            <div>
              <h2 className="text-base font-bold uppercase tracking-wider">API Key Security</h2>
              <p className="text-sm text-gray-500">All API keys SHA-256 hashed. Only prefix visible in dashboard.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Hashing</p>
                  <p className="font-bold text-white">SHA-256</p>
                </div>
              </div>
              <p className="text-sm text-gray-500">Keys stored as hex-encoded SHA-256 hashes. Timing-safe comparison on verification.</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                  <Shield className="h-5 w-5 text-purple-400" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Prefixes</p>
                  <p className="font-bold text-white">clsbox_ / clprod_</p>
                </div>
              </div>
              <p className="text-sm text-gray-500">clsbox_ = sandbox (dev/test). clprod_ = production (never shown again after create).</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Scopes</p>
                  <p className="font-bold text-white">17 granular scopes</p>
                </div>
              </div>
              <p className="text-sm text-gray-500">Least-privilege access control. Keys can only access explicitly granted resources.</p>
            </div>
          </div>
        </section>

        {/* Tenant Boundary */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-6">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
              <Shield className="h-6 w-6 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base font-bold uppercase tracking-wider">Tenant Boundary Enforcement</h2>
              <p className="text-sm text-gray-500">All queries scoped to organizationId. Cross-org access rejected at Firestore rules + API layer.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Firestore Rules</p>
                  <p className="font-bold text-white">server-admin only</p>
                </div>
              </div>
              <p className="text-sm text-gray-500">Client SDK has no direct Firestore access. All writes go through server-admin API routes.</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                  <Shield className="h-5 w-5 text-purple-400" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">API Layer</p>
                  <p className="font-bold text-white">orgId guard on every request</p>
                </div>
              </div>
              <p className="text-sm text-gray-500">Middleware validates orgId matches authenticated context. Cross-org requests return 403.</p>
            </div>
          </div>
        </section>

        {/* Webhook Security */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-6">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
              <AlertTriangle className="h-6 w-6 text-amber-400" />
            </div>
            <div>
              <h2 className="text-base font-bold uppercase tracking-wider">Webhook Security</h2>
              <p className="text-sm text-gray-500">HMAC-SHA256 signed payloads. 5-minute replay tolerance. Auto-disable on consecutive failures.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Signing</p>
                  <p className="font-bold text-white">HMAC-SHA256</p>
                </div>
              </div>
              <p className="text-sm text-gray-500">Payload signed with endpoint secret. Timestamp included for replay protection.</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                  <RotateCcw className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Replay Tolerance</p>
                  <p className="font-bold text-white">5 minutes</p>
                </div>
              </div>
              <p className="text-sm text-gray-500">Requests with timestamp older than 5 minutes rejected. Prevents replay attacks.</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Auto-Disable</p>
                  <p className="font-bold text-white">Consecutive failures</p>
                </div>
              </div>
              <p className="text-sm text-gray-500">Endpoints auto-disabled after configurable consecutive failure threshold. Manual re-enable required.</p>
            </div>
          </div>
        </section>

        {/* Audit & Compliance */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-6">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20">
              <ExternalLink className="h-6 w-6 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-base font-bold uppercase tracking-wider">Audit & Compliance</h2>
              <p className="text-sm text-gray-500">Every security-critical action logged with 15-key redaction (password, secret, seed, otp, mnemonic, token, etc.).</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-cyan-500/10 flex items-center justify-center">
                  <ExternalLink className="h-5 w-5 text-cyan-400" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Redaction</p>
                  <p className="font-bold text-white">15 sensitive keys</p>
                </div>
              </div>
              <p className="text-sm text-gray-500">password, secret, seed, otp, mnemonic, token, api_key, private, key, secret_key, access_token, refresh_token, auth, credential, passphrase</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Export</p>
                  <p className="font-bold text-white">CSV / JSON / SIEM stream</p>
                </div>
              </div>
              <p className="text-sm text-gray-500">Full audit trail exportable. Structured JSON for SIEM integration.</p>
            </div>
          </div>
        </section>

        {/* Correction Note */}
        <section className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <h3 className="font-bold text-amber-300">Correction: Zero-Knowledge Claim</h3>
              <p className="text-sm text-amber-200/90 mt-1">
                Verification found false "Zero-Knowledge Promise" on /trust page — corrected to "End-to-End Encrypted Vault".
                Do not overclaim ZKP until implemented. Current architecture: server-admin encrypts with user-derived key (Argon2id + AES-256-GCM).
              </p>
            </div>
          </div>
        </section>
      </div>
    </EnterpriseSkeleton>
  );
}