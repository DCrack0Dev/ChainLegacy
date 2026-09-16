import React from 'react';
import { adminDb } from '@/lib/firebase-admin';
import ClaimClient from './ClaimClient';
import { Navbar } from '@/components/ui/Navbar';
import { AlertTriangle } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function ClaimPage({ params }: { params: { id: string } }) {
  const { id } = params;
  let userData = null;
  let error = '';

  if (!adminDb) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto" />
          <p className="text-white">Database connection error. Please try again later.</p>
        </div>
      </div>
    );
  }

  try {
    const userDoc = await adminDb.collection('users').doc(id).get();
    if (userDoc.exists) {
      const fullData = userDoc.data()!;
      
      // SECURITY: Only pass the owner's identity and status to the client initially.
      // Do NOT pass encryptedSecret, videoUrl, or beneficiary details yet.
      userData = {
        id,
        owner: {
          name: fullData.name,
          email: fullData.email,
        },
        status: fullData.status,
        beneficiary: {
          walletAddress: fullData.beneficiary?.walletAddress,
        },
        trustedContact: {
          name: fullData.trustedContact?.name,
          email: fullData.trustedContact?.email,
        },
        approvalStatus: fullData.approvalStatus,
      };
      
      userData = JSON.parse(JSON.stringify(userData));
    } else {
      error = 'Invalid legacy link.';
    }
  } catch (err) {
    console.error('Error fetching legacy data:', err);
    error = 'Failed to fetch legacy information.';
  }

  if (error || !userData) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <Navbar />
        <div className="mx-auto max-w-2xl px-4 pt-40 text-center">
          <div className="p-8 bg-red-500/10 border border-red-500/20 rounded-2xl">
            <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-white mb-2">{error || 'Vault Not Found'}</h1>
            <p className="text-gray-400">The legacy link you followed appears to be invalid or has expired.</p>
          </div>
        </div>
      </div>
    );
  }

  return <ClaimClient id={id} initialData={userData} />;
}
