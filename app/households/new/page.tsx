'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getCurrentUser, hasPermission } from '@/lib/auth';
import { createHousehold } from '@/lib/db/households';
import { createResident } from '@/lib/db/residents';
import { HouseholdForm, MemberDraft } from '@/components/forms/household-form';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import type { Household } from '@/lib/db/schema';

export default function AddHouseholdPage() {
  const router = useRouter();
  const user = getCurrentUser();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!user || !hasPermission('create_household')) {
      router.push('/households');
    }
  }, [user, router]);

  async function handleSubmit(
    data: Omit<Household, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>,
    members: MemberDraft[]
  ) {
    try {
      setIsLoading(true);

      // 1. Create the household
      const household = await createHousehold({
        ...data,
        barangay_id: user?.barangay_id || 'barangay-1',
      });

      // 2. Create each member linked to the new household
      for (const member of members) {
        await createResident({
          household_id: household.id,
          full_name: member.full_name,
          birthdate: member.birthdate,
          gender: member.gender,
          relationship_to_head: member.relationship_to_head,
          civil_status: member.civil_status,
          occupation: member.occupation,
          income_level: member.income_level,
          status: 'active',
        });
      }

      router.push('/households');
    } catch (error) {
      console.error('Error creating household:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <Link
            href="/households"
            className="flex items-center gap-2 text-primary hover:opacity-80 transition-opacity mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Households
          </Link>
          <h1 className="text-2xl font-bold text-foreground">Add New Household</h1>
          <p className="text-sm text-muted-foreground">Enter household information and members</p>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-card border border-border rounded-lg p-6">
          <HouseholdForm onSubmit={handleSubmit} isLoading={isLoading} />
        </div>
      </main>
    </div>
  );
}
