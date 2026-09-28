// Core type definitions for MSWDO Census PWA

export type UserRole = 'admin' | 'encoder' | 'health_worker' | 'responder' | 'resident' | 'social_worker';
export type UserAccountStatus = 'active' | 'inactive';
export type HouseholdStatus = 'active' | 'moved_out' | 'deceased';
export type ResidentStatus = 'active' | 'moved_out' | 'deceased' | 'rejected';
export type ResidentVerificationStatus = 'pending' | 'verified';
export type CivilStatus = 'single' | 'married' | 'widowed' | 'separated';
export type IncomeLevel = 'low' | 'middle' | 'high';
export type Gender = 'M' | 'F';
export type PWDType = 'physical' | 'visual' | 'hearing' | 'intellectual' | 'psychosocial';
export type FollowUpStatus = 'none' | 'needs_visit' | 'visited' | 'referred' | 'resolved';
export type SyncStatus = 'pending' | 'synced';
export type DistributionType = 'regular' | 'emergency' | 'disaster_relief';
export type DistributionStatus = 'planned' | 'ongoing' | 'completed';
export type DistributionTargetScope = 'household' | 'resident';
export type DistributionTargetGroup = 'all' | 'senior' | 'pwd' | 'pregnant' | 'minor' | 'low_income';
export type UserNotificationType = 'distribution_event' | 'disaster_alert' | 'member_approval';
export type InventoryItemStatus = 'active' | 'trashed';
export type InventoryMovementType =
  | 'stock_in'
  | 'stock_out'
  | 'adjustment'
  | 'distribution_release'
  | 'transfer';
export type IncidentType = 'flood' | 'fire' | 'medical' | 'landslide' | 'typhoon' | 'other';
export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IncidentStatus = 'reported' | 'verified' | 'responding' | 'resolved';
export type IncidentSource = 'manual' | 'alert';
export type LocationSource = 'address_search' | 'manual_pin' | 'current_gps' | 'admin_review';
export type LocationConfidence = 'low' | 'medium' | 'high';
export type HouseholdRegistrationStatus = 'pending' | 'approved' | 'rejected' | 'needs_correction';
export type PinQaStatus = 'valid' | 'duplicate' | 'needs_verification';
export type DisasterRiskLevel = 'low' | 'medium' | 'high';
export type HazardType = 'flood' | 'typhoon' | 'landslide' | 'storm_surge' | 'fire' | 'earthquake';
export type DisasterAlertSeverity = 'watch' | 'warning';
export type DisasterAlertTriggerSource = 'official' | 'threshold' | 'hybrid';
export type PurokFloodControlStatus = 'protected' | 'partial' | 'none' | 'unknown';

export type CaseClassification =
  | 'vawc_physical'
  | 'vawc_psychological'
  | 'vawc_sexual'
  | 'vawc_economic'
  | 'vac_abuse'
  | 'vac_neglect'
  | 'vac_exploitation'
  | 'rape'
  | 'cicl'
  | 'other';

export type CaseStatus =
  | 'active'
  | 'under_bpo_tpo'
  | 'referred_pnp_wcpd'
  | 'filed_in_court'
  | 'resolved_closed'
  | 'monitoring';

export type CaseAttachmentType =
  | 'intake_sheet'
  | 'bpo_tpo'
  | 'medico_legal'
  | 'pnp_blotter'
  | 'court_order'
  | 'progress_report'
  | 'other';

export interface User {
  id: string;
  email: string;
  password_hash?: string;
  name: string;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  role: UserRole;
  status: UserAccountStatus;
  barangay_id: string;
  must_change_password?: boolean;
  email_verification_required?: boolean;
  email_verified_at?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Household {
  id: string;
  head_name: string;
  head_id?: string; // FK to residents
  barangay_id: string;
  applicant_user_id?: string;
  applicant_email?: string;
  barangay_name?: string;
  municipality?: string;
  purok_sitio: string;
  street_address: string;
  landmark_directions?: string;
  contact_number?: string;
  supporting_document_name?: string;
  supporting_document_type?: string;
  supporting_document_data?: string;
  status: HouseholdStatus;
  gps_lat?: number;
  gps_long?: number;
  location_source?: LocationSource;
  location_confidence?: LocationConfidence;
  location_verified?: boolean;
  location_verified_at?: Date;
  location_verified_by?: string;
  registration_status?: HouseholdRegistrationStatus;
  registration_submitted_at?: Date;
  registration_reviewed_at?: Date;
  registration_reviewed_by?: string;
  registration_review_notes?: string;
  pin_qa_status?: PinQaStatus;
  pin_qa_notes?: string;
  hazard_tags?: HazardType[];
  disaster_risk_level?: DisasterRiskLevel;
  evacuation_site?: string;
  special_assistance_notes?: string;
  disaster_profile_updated_at?: Date;
  createdAt: Date;
  updatedAt: Date;
  syncStatus: SyncStatus;
}

export interface LocationMasterList {
  id: string;
  barangay_id: string;
  municipality: string;
  barangay_name: string;
  puroks: string[];
  updatedAt: Date;
  updatedBy?: string;
}

export interface PurokRiskProfile {
  id: string;
  barangay_id: string;
  purok_sitio: string;
  flood_prone: boolean;
  flood_control_status: PurokFloodControlStatus;
  flood_control_notes?: string;
  default_evacuation_site?: string;
  warning_notes?: string;
  updatedAt: Date;
  updatedBy?: string;
  syncStatus: SyncStatus;
}

export type EvacuationCenterStatus = 'closed' | 'open';
export type EvacuationCenterActivationSource = 'alert' | 'manual';

export interface EvacuationCenter {
  id: string;
  municipality: string;
  barangay_id: string;
  name: string;
  gps_lat?: number;
  gps_lng?: number;
  capacity?: number;
  status: EvacuationCenterStatus;
  activation_source?: EvacuationCenterActivationSource;
  activated_at?: Date;
  activated_by?: string;
  activated_by_alert_id?: string;
  deactivated_at?: Date;
  notes?: string;
  updatedAt: Date;
  updatedBy?: string;
  syncStatus: SyncStatus;
}

export interface EvacueeVulnerabilitySummary {
  infants: number;
  children: number;
  seniors: number;
  pwds: number;
  pregnant: number;
}

export interface EvacueeRecord {
  id: string;
  household_id: string;
  head_name: string;
  evacuation_center_id: string;
  evacuation_center_name: string;
  barangay_id: string;
  barangay_name: string;
  purok_sitio: string;
  family_members_count: number;
  contact_number?: string;
  vulnerabilities: EvacueeVulnerabilitySummary;
  checked_in_at: string;
  checked_in_by?: string;
  status: 'sheltered' | 'checked_out';
  checked_out_at?: string;
  notes?: string;
}

export interface Resident {
  id: string;
  household_id: string;
  full_name: string;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  birthdate: string; // ISO format: YYYY-MM-DD
  gender: Gender;
  relationship_to_head: string;
  status: ResidentStatus;
  civil_status?: CivilStatus;
  occupation?: string;
  income_level?: IncomeLevel;
  contact_number?: string;
  verification_status: ResidentVerificationStatus;
  createdAt: Date;
  updatedAt: Date;
  syncStatus: SyncStatus;
}

export interface VulnerabilityFlags {
  id: string;
  resident_id: string;
  is_infant?: boolean; // computed: age 0-1
  is_child: boolean; // computed: age 0-17
  is_adult: boolean; // computed: age 18-59
  is_senior: boolean; // computed: age 60+
  is_pregnant: boolean;
  pregnancy_months?: number;
  expected_delivery_date?: string;
  is_pwd: boolean;
  is_4ps?: boolean;
  is_indigent?: boolean;
  pwd_type?: PWDType;
  is_solo_parent?: boolean;
  solo_parent_id?: string;
  solo_parent_category?: SoloParentCategory;
  has_chronic_illness: boolean;
  chronic_conditions?: string[];
  is_low_income: boolean;
  follow_up_status?: FollowUpStatus;
  medical_notes?: string;
  notes?: string;
  /** When a health worker last confirmed the manual flags (re-verification stamp). */
  last_verified_at?: Date;
  updatedAt: Date;
  syncStatus: SyncStatus;
}

export interface Program {
  id: string;
  name: string;
  description?: string;
  active: boolean;
  createdAt: Date;
}

export interface Beneficiary {
  id: string;
  program_id: string;
  resident_id: string;
  enrollment_date: Date;
  status: 'active' | 'inactive';
  syncStatus: SyncStatus;
}

export interface InventoryItem {
  id: string;
  item_name: string;
  item_code?: string;
  category: 'food' | 'medicine' | 'hygiene' | 'clothing' | 'blankets' | 'other';
  status?: InventoryItemStatus;
  quantity_available: number;
  unit: 'pcs' | 'kg' | 'box' | 'pack' | 'bundle';
  reorder_level?: number;
  storage_location?: string;
  expiration_date?: string; // ISO format
  notes?: string;
  syncStatus: SyncStatus;
}

export interface InventoryMovement {
  id: string;
  item_id: string;
  item_name: string;
  type: InventoryMovementType;
  quantity: number;
  previous_quantity: number;
  new_quantity: number;
  unit: InventoryItem['unit'];
  performed_by?: string;
  performed_by_name?: string;
  reference_id?: string;
  reference_type?: 'inventory' | 'distribution' | 'manual' | 'transfer';
  notes?: string;
  timestamp: Date;
  syncStatus: SyncStatus;
}

export interface PackageTemplate {
  id: string;
  name: string;
  description?: string;
  items: DistributedItem[];
  createdAt: Date;
  updatedAt: Date;
  syncStatus: SyncStatus;
}

export interface DistributionEvent {
  id: string;
  barangay_id: string;
  event_name: string;
  type: DistributionType;
  incident_id?: string;
  target_scope: DistributionTargetScope;
  target_group: DistributionTargetGroup;
  package_items: DistributedItem[];
  location: string;
  gps_lat?: number;
  gps_lng?: number;
  scheduled_date: string; // ISO format
  status: DistributionStatus;
  created_by: string;
  notes?: string;
  syncStatus: SyncStatus;
}

export interface DistributionEventNotificationPayload {
  event_id: string;
  event_name: string;
  type: DistributionType;
  status: DistributionStatus;
  target_scope: DistributionTargetScope;
  target_group: DistributionTargetGroup;
  scheduled_date: string;
  location: string;
  notes?: string;
  claim_status?: 'released' | 'unclaimed';
}

export interface DisasterAlertRule {
  id: string;
  municipality: string;
  barangay_id: string;
  purok_sitio?: string;
  hazard: HazardType;
  trigger_lat: number;
  trigger_lng: number;
  enabled: boolean;
  notify_responders: boolean;
  official_keywords: string[];
  min_rain_chance?: number;
  min_rain_intensity_mm_per_hr?: number;
  min_next_hour_precip_mm?: number;
  min_wind_gust_kph?: number;
  cooldown_minutes: number;
  last_triggered_at?: Date;
  last_trigger_signature?: string;
  createdAt: Date;
  updatedAt: Date;
  syncStatus: SyncStatus;
}

export interface DisasterAlertWeatherSnapshot {
  summary: string;
  official_alert_titles: string[];
  rain_chance: number | null;
  rain_intensity_mm_per_hr: number | null;
  next_hour_precip_mm: number | null;
  wind_gust_kph: number | null;
}

export interface DisasterAlert {
  id: string;
  rule_id: string;
  municipality: string;
  barangay_id: string;
  purok_sitio?: string;
  hazard: HazardType;
  severity: DisasterAlertSeverity;
  title: string;
  message: string;
  trigger_source: DisasterAlertTriggerSource;
  trigger_reason: string;
  weather_snapshot: DisasterAlertWeatherSnapshot;
  evacuation_site?: string;
  special_assistance_notes?: string;
  notify_responders: boolean;
  reachable_household_count: number;
  unreachable_household_count: number;
  issued_at: Date;
  createdAt: Date;
  updatedAt: Date;
  syncStatus: SyncStatus;
}

export interface DisasterAlertNotificationPayload {
  alert_id: string;
  rule_id: string;
  municipality: string;
  barangay_id: string;
  purok_sitio?: string;
  trigger_lat?: number;
  trigger_lng?: number;
  hazard: HazardType;
  severity: DisasterAlertSeverity;
  title: string;
  message: string;
  trigger_source: DisasterAlertTriggerSource;
  trigger_reason: string;
  weather_summary?: string;
  evacuation_site?: string;
  special_assistance_notes?: string;
  flood_control_status?: PurokFloodControlStatus;
  flood_control_notes?: string;
  default_evacuation_site?: string;
  warning_notes?: string;
  issued_at: string;
}

export interface DistributedItem {
  item_id: string;
  quantity: number;
  item_name?: string;
  unit?: InventoryItem['unit'];
}

export interface DistributionRecord {
  id: string;
  event_id: string;
  household_id?: string;
  resident_id?: string;
  beneficiary_name?: string;
  items_distributed: DistributedItem[];
  received_by_name?: string;
  timestamp: Date;
  distributor_id: string;
  notes?: string;
  syncStatus: SyncStatus;
}

export interface UserNotification {
  id: string;
  user_id: string;
  event_id?: string;
  alert_id?: string;
  type: UserNotificationType;
  title: string;
  body: string;
  payload: DistributionEventNotificationPayload | DisasterAlertNotificationPayload | Record<string, unknown>;
  read_at?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IncidentContextSnapshot {
  alert_title?: string;
  trigger_reason?: string;
  weather_summary?: string;
  flood_control_status?: PurokFloodControlStatus;
  flood_control_notes?: string;
  default_evacuation_site?: string;
  warning_notes?: string;
}

export interface Incident {
  id: string;
  type: IncidentType;
  location: string;
  gps_lat?: number;
  gps_lng?: number;
  severity: IncidentSeverity;
  status: IncidentStatus;
  reported_by: string;
  reported_at: Date;
  photo_url?: string;
  description: string;
  source?: IncidentSource;
  source_alert_id?: string;
  source_rule_id?: string;
  hazard_context?: HazardType;
  context_snapshot?: IncidentContextSnapshot;
  syncStatus: SyncStatus;
}

export interface CaseRecord {
  id: string;
  case_number: string;
  case_type: CaseClassification;
  reported_at: string;
  incident_date?: string;
  victim_name: string;
  victim_age?: number;
  victim_gender?: Gender | string;
  victim_contact?: string;
  victim_address?: string;
  barangay_id: string;
  purok_sitio?: string;
  perpetrator_name?: string;
  perpetrator_relationship?: string;
  perpetrator_address?: string;
  status: CaseStatus;
  case_summary: string;
  intake_notes?: string;
  assigned_worker_id?: string;
  assigned_worker_name?: string;
  resident_id?: string;
  household_id?: string;
  source: 'excel_import' | 'manual_intake';
  createdAt: Date | string;
  updatedAt: Date | string;
  syncStatus?: SyncStatus;
}

export interface CaseAttachment {
  id: string;
  case_id: string;
  file_name: string;
  file_type: string;
  file_size?: number;
  file_url: string;
  document_type: CaseAttachmentType;
  uploaded_by: string;
  uploaded_at: string;
}

export interface CaseNote {
  id: string;
  case_id: string;
  worker_id?: string;
  worker_name: string;
  date: string;
  note: string;
  action_taken?: string;
  next_follow_up?: string;
  createdAt: string;
}

export type SoloParentCategory =
  | 'death_of_spouse'
  | 'abandonment'
  | 'unmarried'
  | 'legal_separation'
  | 'spouse_detained'
  | 'spouse_incapacitated'
  | 'other_extenuating';

export type SoloParentStatus = 'active' | 'expiring' | 'expired' | 'revoked';

export interface SoloParentDependent {
  resident_id?: string;
  full_name: string;
  birthdate: string;
  age: number;
  relationship: string;
  is_studying: boolean;
  is_pwd: boolean;
}

export interface SoloParentRequirements {
  barangay_cert: boolean;
  birth_certificates: boolean;
  justification_proof: boolean;
  income_proof: boolean;
}

export interface SoloParentRecord {
  id: string;
  id_number: string; // e.g. SP-2026-0042
  resident_id: string; // FK to resident
  household_id: string; // FK to household
  full_name: string;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  birthdate: string;
  age: number;
  gender: Gender;
  civil_status?: CivilStatus;
  contact_number?: string;
  barangay_id: string;
  purok_sitio: string;
  street_address?: string;

  category: SoloParentCategory;
  category_narrative?: string;
  monthly_income: number;
  is_minimum_wage_or_below: boolean; // RA 11861 subsidy eligibility
  occupation?: string;
  employment_status?: string;

  dependents: SoloParentDependent[];
  requirements: SoloParentRequirements;

  issued_at: string; // YYYY-MM-DD
  expires_at: string; // YYYY-MM-DD
  encoder_id?: string;
  encoder_name: string;
  notes?: string;
  status: SoloParentStatus;
  revocation_reason?: string;
  revocation_date?: string; // YYYY-MM-DD

  createdAt: Date | string;
  updatedAt: Date | string;
  syncStatus?: SyncStatus;
}

export interface AuditLog {
  id: string;
  user_id?: string | null;
  action: string;
  entity_type:
    | 'household'
    | 'resident'
    | 'distribution'
    | 'incident'
    | 'inventory'
    | 'user'
    | 'location_master'
    | 'purok_risk_profile'
    | 'disaster_alert'
    | 'disaster_alert_rule'
    | 'case'
    | 'case_attachment'
    | 'case_note'
    | 'solo_parent';
  entity_id: string;
  changes?: Record<string, any>;
  timestamp: Date;
  syncStatus: SyncStatus;
}

export interface SyncQueueItem {
  id: string;
  operation: 'create' | 'update' | 'delete';
  entity_type: string;
  entity_id: string;
  data: any;
  timestamp: Date;
  attempts: number;
  last_error?: string;
}

export interface AuthContext {
  user: User | null;
  role: UserRole | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (role: UserRole | UserRole[]) => boolean;
  hasPermission: (action: string, resource: string) => boolean;
}
