// Core type definitions for MSWDO Census PWA

export type UserRole = 'admin' | 'encoder' | 'health_worker' | 'responder' | 'resident';
export type UserAccountStatus = 'active' | 'inactive';
export type HouseholdStatus = 'active' | 'moved_out' | 'deceased';
export type ResidentStatus = 'active' | 'moved_out' | 'deceased';
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
export type UserNotificationType = 'distribution_event' | 'disaster_alert';
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

export interface User {
  id: string;
  email: string;
  password_hash?: string;
  name: string;
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

export interface Resident {
  id: string;
  household_id: string;
  full_name: string;
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
  is_child: boolean; // computed: age 0-17
  is_adult: boolean; // computed: age 18-59
  is_senior: boolean; // computed: age 60+
  is_pregnant: boolean;
  is_pwd: boolean;
  pwd_type?: PWDType;
  has_chronic_illness: boolean;
  chronic_conditions?: string[];
  is_low_income: boolean;
  follow_up_status?: FollowUpStatus;
  medical_notes?: string;
  notes?: string;
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
    | 'disaster_alert_rule';
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
