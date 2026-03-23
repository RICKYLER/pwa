import { NextRequest, NextResponse } from 'next/server';
import type { Household, InventoryItem, InventoryMovementType, Resident } from '@/lib/db/schema';
import { requireAuthenticatedUser } from '@/lib/server/auth-guards';
import {
  applyInventoryTransactionOnServer,
  createHouseholdBundleOnServer,
  createInventoryItemOnServer,
  createResidentOnServer,
  deleteDistributionEventOnServer,
  releaseDistributionPackageOnServer,
  updateResidentOnServer,
} from '@/lib/server/supabase-mutations';

export const runtime = 'nodejs';

function badRequest(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuthenticatedUser(request);
  if ('response' in authResult) {
    return authResult.response;
  }

  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  const body = payload ?? {};
  const action = typeof body.action === 'string' ? body.action : '';
  if (!action) {
    return badRequest('Mutation action is required.');
  }

  try {
    switch (action) {
      case 'create_household_bundle': {
        const household = body.household;
        const members = Array.isArray(body.members) ? body.members : [];
        if (!household || typeof household !== 'object') {
          return badRequest('household payload is required.');
        }

        const data = await createHouseholdBundleOnServer(
          authResult.user,
          household as Omit<Household, 'createdAt' | 'updatedAt' | 'syncStatus'> & { id: string },
          members as Array<{
            full_name: string;
            birthdate: string;
            gender: 'M' | 'F';
            relationship_to_head: string;
            civil_status?: string;
            occupation?: string;
            income_level?: string;
            is_pregnant?: boolean;
            is_pwd?: boolean;
            pwd_type?: string;
            has_chronic_illness?: boolean;
            chronic_conditions?: string[];
          }>,
        );

        return NextResponse.json(data, {
          headers: { 'Cache-Control': 'no-store' },
        });
      }
      case 'create_resident': {
        const resident = body.resident;
        if (!resident || typeof resident !== 'object') {
          return badRequest('resident payload is required.');
        }

        const data = await createResidentOnServer(
          authResult.user,
          resident as Omit<Resident, 'createdAt' | 'updatedAt' | 'syncStatus'> & { id: string },
        );

        return NextResponse.json(data, {
          headers: { 'Cache-Control': 'no-store' },
        });
      }
      case 'update_resident': {
        const residentId = typeof body.residentId === 'string' ? body.residentId : '';
        const updates = body.updates;
        if (!residentId || !updates || typeof updates !== 'object') {
          return badRequest('residentId and updates are required.');
        }

        const data = await updateResidentOnServer(
          authResult.user,
          residentId,
          updates as Partial<Resident>,
        );

        return NextResponse.json(data, {
          headers: { 'Cache-Control': 'no-store' },
        });
      }
      case 'create_inventory_item': {
        const item = body.item;
        if (!item || typeof item !== 'object') {
          return badRequest('item payload is required.');
        }

        const data = await createInventoryItemOnServer(
          authResult.user,
          item as Omit<InventoryItem, 'syncStatus'> & { id: string },
        );

        return NextResponse.json(data, {
          headers: { 'Cache-Control': 'no-store' },
        });
      }
      case 'apply_inventory_transaction': {
        const params = body.params;
        if (!params || typeof params !== 'object') {
          return badRequest('params payload is required.');
        }

        const transactionParams = params as {
          item_id: string;
          type: InventoryMovementType;
          quantity: number;
          next_quantity?: number;
          notes?: string;
          reference_id?: string;
          reference_type?: 'inventory' | 'distribution' | 'manual' | 'transfer';
          expected_record_version?: number;
        };

        const data = await applyInventoryTransactionOnServer(
          authResult.user,
          transactionParams,
        );

        return NextResponse.json(data, {
          headers: { 'Cache-Control': 'no-store' },
        });
      }
      case 'release_distribution_package': {
        const params = body.params;
        if (!params || typeof params !== 'object') {
          return badRequest('params payload is required.');
        }

        const data = await releaseDistributionPackageOnServer(
          authResult.user,
          params as {
            event_id: string;
            household_id?: string;
            resident_id?: string;
            received_by_name?: string;
            notes?: string;
          },
        );

        return NextResponse.json(data, {
          headers: { 'Cache-Control': 'no-store' },
        });
      }
      case 'delete_distribution_event': {
        const eventId = typeof body.eventId === 'string' ? body.eventId : '';
        if (!eventId) {
          return badRequest('eventId is required.');
        }

        const data = await deleteDistributionEventOnServer(authResult.user, eventId);
        return NextResponse.json(data, {
          headers: { 'Cache-Control': 'no-store' },
        });
      }
      default:
        return badRequest(`Unsupported mutation action: ${action}`);
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Mutation failed.',
      },
      {
        status: 500,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}
