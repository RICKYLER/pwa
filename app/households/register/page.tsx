'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { HouseholdRegistrationWizard } from '@/components/forms/household-registration-wizard';
import type { MemberDraft } from '@/components/forms/household-form';
import ResidentShell from '@/components/resident/ResidentShell';
import { getCurrentUser, hasPermission } from '@/lib/auth';
import { createHouseholdBundle } from '@/lib/db/households';
import type { Household } from '@/lib/db/schema';
import { CivicBadge, CivicPanel, CivicSectionHeading } from '@/components/ui/civic-primitives';

export default function HouseholdRegistrationPage() {
  const router = useRouter();
  const user = getCurrentUser();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }

    if (user.role !== 'resident' && !hasPermission('create_household')) {
      router.push('/households');
      return;
    }

    setReady(true);
  }, [router, user]);

  async function handleSubmit(
    data: Omit<Household, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>,
    members: MemberDraft[],
  ): Promise<string> {
    const created = await createHouseholdBundle({
      ...data,
      applicant_user_id: user?.role === 'resident' ? user.id : data.applicant_user_id,
      applicant_email: user?.role === 'resident' ? user.email : data.applicant_email,
    }, members);
    return created.id;
  }

  if (!user || !ready) {
    return null;
  }

  const content = (
      <div className="mx-auto max-w-[1180px] space-y-6 p-4 sm:p-6 lg:p-8">
        <CivicPanel>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Link
                href={user.role === 'resident' ? '/resident' : '/households'}
                className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-800"
              >
                <ArrowLeft className="h-4 w-4" />
                {user.role === 'resident' ? 'Back to Portal' : 'Back to Households'}
              </Link>
              <div className="mt-4">
                <CivicSectionHeading
                  icon={ShieldCheck}
                  title="New registration"
                  description="Collect the form, capture the map pin, and send the record to the admin approval queue."
                />
              </div>
            </div>
            <CivicBadge label="Pending records stay out of the master list until approved" tone="emerald" />
          </div>
        </CivicPanel>

        <HouseholdRegistrationWizard
          barangayId={user.barangay_id}
          initialValues={{
            head_name: user.role === 'resident' ? user.name : undefined,
            applicant_email: user.email,
          }}
          lockApplicantEmail={user.role === 'resident'}
          onSubmit={handleSubmit}
        />
      </div>
  );

  if (user.role === 'resident') {
    return (
      <ResidentShell
        title="New Registration"
        subtitle="Submit your household registration and wait for admin review."
      >
        {content}
      </ResidentShell>
    );
  }

  return (
    <AppShell title="Household Registration">
      {content}
    </AppShell>
  );
}
