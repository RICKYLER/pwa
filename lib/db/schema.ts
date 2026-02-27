// Core type definitions for MSWDO Census PWA

export type UserRole = 'admin' | 'encoder' | 'health_worker' | 'responder';
export type HouseholdStatus = 'active' | 'moved_out' | 'deceased';
export type ResidentStatus = 'active' | 'moved_out' | 'deceased';
export type CivilStatus = 'single' | 'married' | 'widowed' | 'separated';
export type IncomeLevel = 'low' | 'middle' | 'high';
export type Gender = 'M' | 'F';
export type PWDType = 'physical' | 'visual' | 'hearing' | 'intellectual' | 'psychosocial';
export type SyncStatus = 'pending' | 'synced';
export type DistributionType = 'regular' | 'emergency' | 'disaster_relief';
export type DistributionStatus = 'planned' | 'ongoing' | 'completed';
export type IncidentType = 'flood' | 'fire' | 'medical' | 'landslide' | 'typhoon' | 'other';
export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IncidentStatus = 'reported' | 'verified' | 'responding' | 'resolved';

export interface User {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role: UserRole;
  barangay_id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Household {
  id: string;
  head_name: string;
  head_id?: string; // FK to residents
  barangay_id: string;
  purok_sitio: string;
  street_address: string;
  contact_number?: string;
  status: HouseholdStatus;
  gps_lat?: number;
  gps_long?: number;
  createdAt: Date;
  updatedAt: Date;
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
  category: 'food' | 'medicine' | 'hygiene' | 'clothing' | 'blankets' | 'other';
  quantity_available: number;
  unit: 'pcs' | 'kg' | 'box' | 'pack' | 'bundle';
  expiration_date?: string; // ISO format
  notes?: string;
  syncStatus: SyncStatus;
}

export interface DistributionEvent {
  id: string;
  event_name: string;
  type: DistributionType;
  incident_id?: string;
  location: string;
  scheduled_date: string; // ISO format
  status: DistributionStatus;
  created_by: string;
  notes?: string;
  syncStatus: SyncStatus;
}

export interface DistributedItem {
  item_id: string;
  quantity: number;
}

export interface DistributionRecord {
  id: string;
  event_id: string;
  resident_id: string;
  items_distributed: DistributedItem[];
  received_by_name?: string;
  timestamp: Date;
  distributor_id: string;
  notes?: string;
  syncStatus: SyncStatus;
}

export interface Incident {
  id: string;
  type: IncidentType;
  location: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  reported_by: string;
  reported_at: Date;
  photo_url?: string;
  description: string;
  syncStatus: SyncStatus;
}

export interface AuditLog {
  id: string;
  user_id: string;
  action: string;
  entity_type: 'household' | 'resident' | 'distribution' | 'incident' | 'inventory' | 'user';
  entity_id: string;
  changes?: Record<string, any>;
  timestamp: Date;
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
