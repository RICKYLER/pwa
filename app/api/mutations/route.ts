import { NextRequest, NextResponse } from 'next/server';
import type {
  DistributionEvent,
  Household,
  Incident,
  InventoryItem,
  InventoryMovementType,
  LocationMasterList,
  PackageTemplate,
  PurokRiskProfile,
  Resident,
} from '@/lib/db/schema';
import { requireAuthenticatedUser } from '@/lib/server/auth-guards';
import {
  applyInventoryTransactionOnServer,
  createAuditLogOnServer,
  createDistributionEventOnServer,
  createHouseholdBundleOnServer,
  createIncidentOnServer,
  createInventoryItemOnServer,
  createPackageTemplateOnServer,
  createResidentOnServer,
  deleteInventoryItemPermanentlyOnServer,
  deletePackageTemplateOnServer,
  deleteDistributionEventOnServer,
  releaseDistributionPackageOnServer,
  saveLocationMasterListOnServer,
  savePurokRiskProfilesOnServer,
  markUserNotificationReadOnServer,
  updateDistributionEventOnServer,
  updateHouseholdOnServer,
  updateResidentHealthFlagsOnServer,
  updateIncidentStatusOnServer,
  updateInventoryItemOnServer,
  updateResidentOnServer,
} from '@/lib/server/supabase-mutations';
import {
  createDisasterAlertRuleOnServer,
  runAutomaticDisasterAlertEvaluation,
  updateDisasterAlertRuleOnServer,
} from '@/lib/server/disaster-alerts';

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
      case 'update_resident_health_flags': {
        const residentId = typeof body.residentId === 'string' ? body.residentId : '';
        const updates = body.updates;
        if (!residentId || !updates || typeof updates !== 'object') {
          return badRequest('residentId and updates are required.');
        }

        const data = await updateResidentHealthFlagsOnServer(
          authResult.user,
          residentId,
          updates as {
            is_pregnant?: boolean;
            is_pwd?: boolean;
            pwd_type?: string;
            has_chronic_illness?: boolean;
            chronic_conditions?: string[];
          },
        );

        return NextResponse.json(data, {
          headers: { 'Cache-Control': 'no-store' },
        });
      }
      case 'update_household': {
        const householdId = typeof body.householdId === 'string' ? body.householdId : '';
        const updates = body.updates;
        if (!householdId || !updates || typeof updates !== 'object') {
          return badRequest('householdId and updates are required.');
        }

        const data = await updateHouseholdOnServer(
          authResult.user,
          householdId,
          updates as Partial<Household>,
        );

        return NextResponse.json(data, {
          headers: { 'Cache-Control': 'no-store' },
        });
      }
      case 'create_disaster_alert_rule': {
        const input = body.input;
        if (!input || typeof input !== 'object') {
          return badRequest('input payload is required.');
        }

        const rule = await createDisasterAlertRuleOnServer(
          authResult.user,
          input,
        );

        return NextResponse.json({ rule }, {
          headers: { 'Cache-Control': 'no-store' },
        });
      }
      case 'update_disaster_alert_rule': {
        const ruleId = typeof body.ruleId === 'string' ? body.ruleId : '';
        const updates = body.updates;
        if (!ruleId || !updates || typeof updates !== 'object') {
          return badRequest('ruleId and updates are required.');
        }

        const rule = await updateDisasterAlertRuleOnServer(
          authResult.user,
          ruleId,
          updates,
        );

        return NextResponse.json({ rule }, {
          headers: { 'Cache-Control': 'no-store' },
        });
      }
      case 'run_disaster_alert_evaluation': {
        const data = await runAutomaticDisasterAlertEvaluation({
          initiatedBy: authResult.user,
        });

        return NextResponse.json(data, {
          headers: { 'Cache-Control': 'no-store' },
        });
      }
      case 'save_location_master_list': {
        const input = body.input;
        if (!input || typeof input !== 'object') {
          return badRequest('input payload is required.');
        }

        const data = await saveLocationMasterListOnServer(
          authResult.user,
          input as Pick<LocationMasterList, 'barangay_id' | 'municipality' | 'barangay_name' | 'puroks'>,
        );

        return NextResponse.json(data, {
          headers: { 'Cache-Control': 'no-store' },
        });
      }
      case 'save_purok_risk_profiles': {
        const input = body.input;
        if (!input || typeof input !== 'object') {
          return badRequest('input payload is required.');
        }

        const profiles = await savePurokRiskProfilesOnServer(
          authResult.user,
          input as {
            barangay_id: string;
            profiles: Array<Pick<
              PurokRiskProfile,
              | 'purok_sitio'
              | 'flood_prone'
              | 'flood_control_status'
              | 'flood_control_notes'
              | 'default_evacuation_site'
              | 'warning_notes'
            >>;
          },
        );

        return NextResponse.json({ profiles }, {
          headers: { 'Cache-Control': 'no-store' },
        });
      }
      case 'create_distribution_event': {
        const event = body.event;
        if (!event || typeof event !== 'object') {
          return badRequest('event payload is required.');
        }

        const data = await createDistributionEventOnServer(
          authResult.user,
          event as Omit<DistributionEvent, 'syncStatus'> & { id: string },
        );

        return NextResponse.json(data, {
          headers: { 'Cache-Control': 'no-store' },
        });
      }
      case 'update_distribution_event': {
        const eventId = typeof body.eventId === 'string' ? body.eventId : '';
        const updates = body.updates;
        if (!eventId || !updates || typeof updates !== 'object') {
          return badRequest('eventId and updates are required.');
        }

        const data = await updateDistributionEventOnServer(
          authResult.user,
          eventId,
          updates as Partial<DistributionEvent>,
        );

        return NextResponse.json(data, {
          headers: { 'Cache-Control': 'no-store' },
        });
      }
      case 'mark_user_notification_read': {
        const notificationId = typeof body.notificationId === 'string' ? body.notificationId : '';
        if (!notificationId) {
          return badRequest('notificationId is required.');
        }

        const notification = await markUserNotificationReadOnServer(
          authResult.user,
          notificationId,
        );

        return NextResponse.json({ notification }, {
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
      case 'update_inventory_item': {
        const itemId = typeof body.itemId === 'string' ? body.itemId : '';
        const updates = body.updates;
        if (!itemId || !updates || typeof updates !== 'object') {
          return badRequest('itemId and updates are required.');
        }

        const data = await updateInventoryItemOnServer(
          authResult.user,
          itemId,
          updates as Partial<InventoryItem>,
        );

        return NextResponse.json(data, {
          headers: { 'Cache-Control': 'no-store' },
        });
      }
      case 'delete_inventory_item_permanently': {
        const itemId = typeof body.itemId === 'string' ? body.itemId : '';
        if (!itemId) {
          return badRequest('itemId is required.');
        }

        const data = await deleteInventoryItemPermanentlyOnServer(
          authResult.user,
          itemId,
        );

        return NextResponse.json(data, {
          headers: { 'Cache-Control': 'no-store' },
        });
      }
      case 'create_package_template': {
        const template = body.template;
        if (!template || typeof template !== 'object') {
          return badRequest('template payload is required.');
        }

        const data = await createPackageTemplateOnServer(
          authResult.user,
          template as Omit<PackageTemplate, 'syncStatus'> & { id: string },
        );

        return NextResponse.json(data, {
          headers: { 'Cache-Control': 'no-store' },
        });
      }
      case 'delete_package_template': {
        const templateId = typeof body.templateId === 'string' ? body.templateId : '';
        if (!templateId) {
          return badRequest('templateId is required.');
        }

        await deletePackageTemplateOnServer(authResult.user, templateId);

        return NextResponse.json(
          { ok: true },
          { headers: { 'Cache-Control': 'no-store' } },
        );
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
      case 'create_incident': {
        const incident = body.incident;
        if (!incident || typeof incident !== 'object') {
          return badRequest('incident payload is required.');
        }

        const data = await createIncidentOnServer(
          authResult.user,
          incident as Omit<Incident, 'syncStatus'> & { id: string },
        );

        return NextResponse.json(data, {
          headers: { 'Cache-Control': 'no-store' },
        });
      }
      case 'update_incident_status': {
        const incidentId = typeof body.incidentId === 'string' ? body.incidentId : '';
        const status = typeof body.status === 'string' ? body.status : '';
        if (!incidentId || !status) {
          return badRequest('incidentId and status are required.');
        }

        const data = await updateIncidentStatusOnServer(
          authResult.user,
          incidentId,
          status as Incident['status'],
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
      case 'create_audit_log': {
        const actionName = typeof body.auditAction === 'string' ? body.auditAction : '';
        const entityType = typeof body.entityType === 'string' ? body.entityType : '';
        const entityId = typeof body.entityId === 'string' ? body.entityId : '';
        const changes = body.changes;
        if (!actionName || !entityType || !entityId) {
          return badRequest('auditAction, entityType, and entityId are required.');
        }

        await createAuditLogOnServer({
          user: authResult.user,
          action: actionName,
          entityType: entityType as 'household' | 'resident' | 'distribution' | 'incident' | 'inventory' | 'user' | 'location_master',
          entityId,
          changes: changes && typeof changes === 'object' ? changes as Record<string, unknown> : undefined,
        });

        return NextResponse.json(
          { ok: true },
          { headers: { 'Cache-Control': 'no-store' } },
        );
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
