import React from 'react';
import Link from 'next/link';
import { Shield, Scale, AlertTriangle } from 'lucide-react';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground py-20 px-4">
      <div className="max-w-4xl mx-auto space-y-12">
        <div className="text-center space-y-4">
          <div className="mx-auto h-16 w-16 bg-gold/10 rounded-full flex items-center justify-center mb-6">
            <Scale className="h-8 w-8 text-gold" />
          </div>
          <h1 className="text-4xl font-extrabold uppercase tracking-tight">Terms of Service & Responsibility</h1>
          <p className="text-gray-400">Last Updated: March 29, 2026</p>
        </div>

        <section className="bg-card-bg border border-card-border rounded-[2rem] p-8 space-y-8">
          <div className="space-y-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Shield className="h-5 w-5 text-gold" />
              1. Non-Custodial Disclosure & Zero-Knowledge
            </h2>
            <p className="text-gray-400 leading-relaxed">
              ChainLegacy is a <strong>non-custodial</strong> service. We do not store, access, or manage your digital assets, private keys, or seed phrases in plain text. All sensitive data is encrypted locally on your device before being stored in our database. 
            </p>
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
              <p className="text-red-400 text-sm font-medium">
                IMPORTANT: We cannot recover your decryption password. If you lose it, your data is permanently inaccessible. We do not verify legal death; we only verify lack of activity based on your settings.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-gold" />
              2. Activity-Based Trigger (Dead Man's Switch)
            </h2>
            <p className="text-gray-400 leading-relaxed">
              The activation of your legacy vault depends entirely on <strong>Activity Signals</strong> (logins, email check-ins, SMS confirmations, or on-chain activity). 
            </p>
            <ul className="list-disc list-inside text-gray-400 space-y-2 ml-4">
              <li><strong>User Responsibility:</strong> You are solely responsible for providing regular activity signals. Failure to check in will trigger the inheritance sequence.</li>
              <li><strong>False Triggers:</strong> You acknowledge the risk of a "false inheritance trigger" if you are alive but fail to provide activity signals for the duration of your chosen interval and grace periods.</li>
              <li><strong>No Death Verification:</strong> ChainLegacy does NOT verify the biological death of a user. We only verify the "Liveness Status" as defined by system activity.</li>
            </ul>
          </div>

          <div className="space-y-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Scale className="h-5 w-5 text-gold" />
              3. Beneficiary Disputes & Liability
            </h2>
            <p className="text-gray-400 leading-relaxed">
              ChainLegacy provides the technical infrastructure for data transmission but does not arbitrate legal disputes.
            </p>
            <ul className="list-disc list-inside text-gray-400 space-y-2 ml-4">
              <li><strong>Inter-Beneficiary Disputes:</strong> We are not liable for disputes between designated beneficiaries regarding the ownership or distribution of decrypted assets.</li>
              <li><strong>Dispute Mechanism:</strong> We provide a "Pause/Dispute" feature for beneficiaries to temporarily halt a claim, but final resolution must be handled through legal channels.</li>
              <li><strong>Indemnification:</strong> You agree to indemnify ChainLegacy against any legal action resulting from the release of your data to your designated beneficiaries.</li>
            </ul>
          </div>

          <div className="space-y-4">
            <h2 className="text-xl font-bold">4. No Financial Advice</h2>
            <p className="text-gray-400 leading-relaxed">
              ChainLegacy provides a technical solution for information transmission. We do not provide financial, legal, or estate planning advice. Consult with a professional for your inheritance strategy.
            </p>
          </div>

          <div className="pt-8 border-t border-card-border">
            <p className="text-sm text-gray-500 text-center italic">
              By continuing to use ChainLegacy, you agree to these terms.
            </p>
          </div>
        </section>

        <div className="text-center">
          <Link href="/" className="text-gold hover:underline font-bold uppercase tracking-widest text-sm">
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
