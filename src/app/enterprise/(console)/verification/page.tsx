"use client";

export const dynamic = "force-dynamic";

import { EnterpriseSkeleton } from "@/components/enterprise/EnterpriseSkeleton";

export default function EnterpriseVerificationPage() {
  return (
    <EnterpriseSkeleton
      eyebrow="Identity Verification"
      title="Identity Verifications"
      subtitle="Test"
      stats={[{ label: "Total", value: 0 }]}
      cta={[]}
    >
      <div>Test</div>
    </EnterpriseSkeleton>
  );
}