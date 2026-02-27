import type { 
  User, Household, Resident, VulnerabilityFlags, 
  Program, Beneficiary, InventoryItem, DistributionEvent,
  DistributionRecord, Incident, AuditLog, SyncQueueItem 
} from './schema';

const DB_NAME = 'mswdo_census';
const DB_VERSION = 1;

export const STORE_NAMES = {
  users: 'users',
  households: 'households',
  residents: 'residents',
  vulnerability_flags: 'vulnerability_flags',
  programs: 'programs',
  beneficiaries: 'beneficiaries',
  inventory_items: 'inventory_items',
  distribution_events: 'distribution_events',
  distribution_records: 'distribution_records',
  incidents: 'incidents',
  audit_logs: 'audit_logs',
  sync_queue: 'sync_queue',
} as const;

export class IndexedDBManager {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<IDBDatabase> | null = null;

  async init(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('IndexedDB open error:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('[v0] IndexedDB initialized');
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        console.log('[v0] Creating IndexedDB schema v' + DB_VERSION);

        // Create stores with auto-increment where needed
        const createStore = (name: string) => {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: 'id' });
          }
        };

        // Core stores
        createStore(STORE_NAMES.users);
        createStore(STORE_NAMES.households);
        createStore(STORE_NAMES.residents);
        createStore(STORE_NAMES.vulnerability_flags);
        createStore(STORE_NAMES.programs);
        createStore(STORE_NAMES.beneficiaries);
        createStore(STORE_NAMES.inventory_items);
        createStore(STORE_NAMES.distribution_events);
        createStore(STORE_NAMES.distribution_records);
        createStore(STORE_NAMES.incidents);
        createStore(STORE_NAMES.audit_logs);
        createStore(STORE_NAMES.sync_queue);
      };
    });

    return this.initPromise;
  }

  async add<T extends Record<string, any>>(storeName: string, data: T): Promise<T> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.add(data);

      request.onsuccess = () => {
        console.log(`[v0] Added to ${storeName}:`, data.id);
        resolve(data);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async put<T extends Record<string, any>>(storeName: string, data: T): Promise<T> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.put(data);

      request.onsuccess = () => {
        console.log(`[v0] Updated ${storeName}:`, data.id);
        resolve(data);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async get<T = any>(storeName: string, key: string): Promise<T | undefined> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAll<T = any>(storeName: string): Promise<T[]> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async delete(storeName: string, key: string): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.delete(key);

      request.onsuccess = () => {
        console.log(`[v0] Deleted from ${storeName}:`, key);
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  async clear(storeName: string): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async query<T = any>(
    storeName: string,
    filter?: (item: T) => boolean
  ): Promise<T[]> {
    const all = await this.getAll<T>(storeName);
    return filter ? all.filter(filter) : all;
  }
}

// Singleton instance
export const db = new IndexedDBManager();

// Seed initial demo data
export async function seedInitialData() {
  console.log('[v0] Seeding initial data...');

  try {
    // Check if users already exist
    const users = await db.getAll<User>(STORE_NAMES.users);
    if (users.length > 0) {
      console.log('[v0] Data already seeded, skipping...');
      return;
    }

    // Demo users (passwords should be hashed in production)
    const demoUsers: User[] = [
      {
        id: 'user-admin-1',
        email: 'admin@mswdo.local',
        password_hash: 'admin123', // TODO: hash this in production
        name: 'Maria Santos',
        role: 'admin',
        barangay_id: 'barangay-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'user-encoder-1',
        email: 'encoder@barangay.local',
        password_hash: 'encoder123',
        name: 'Juan dela Cruz',
        role: 'encoder',
        barangay_id: 'barangay-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'user-health-1',
        email: 'health@barangay.local',
        password_hash: 'health123',
        name: 'Dr. Rosa Garcia',
        role: 'health_worker',
        barangay_id: 'barangay-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'user-responder-1',
        email: 'responder@drrmo.local',
        password_hash: 'responder123',
        name: 'Pedro Reyes',
        role: 'responder',
        barangay_id: 'barangay-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    for (const user of demoUsers) {
      await db.add(STORE_NAMES.users, user);
    }

    // Sample households
    const households: Household[] = [
      {
        id: 'hh-1',
        head_name: 'Miguel Santos',
        barangay_id: 'barangay-1',
        purok_sitio: 'Purok 1',
        street_address: '123 Main Street',
        contact_number: '09171234567',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
        syncStatus: 'synced',
      },
      {
        id: 'hh-2',
        head_name: 'Rosa Fernandez',
        barangay_id: 'barangay-1',
        purok_sitio: 'Purok 2',
        street_address: '456 Oak Avenue',
        contact_number: '09187654321',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
        syncStatus: 'synced',
      },
    ];

    for (const household of households) {
      await db.add(STORE_NAMES.households, household);
    }

    // Sample residents with varied ages
    const residents: Resident[] = [
      {
        id: 'res-1',
        household_id: 'hh-1',
        full_name: 'Miguel Santos Jr.',
        birthdate: '1968-03-15',
        gender: 'M',
        relationship_to_head: 'Self',
        status: 'active',
        civil_status: 'married',
        occupation: 'Farmer',
        createdAt: new Date(),
        updatedAt: new Date(),
        syncStatus: 'synced',
      },
      {
        id: 'res-2',
        household_id: 'hh-1',
        full_name: 'Carmen Santos',
        birthdate: '1970-07-22',
        gender: 'F',
        relationship_to_head: 'Spouse',
        status: 'active',
        civil_status: 'married',
        occupation: 'Teacher',
        createdAt: new Date(),
        updatedAt: new Date(),
        syncStatus: 'synced',
      },
      {
        id: 'res-3',
        household_id: 'hh-1',
        full_name: 'Ana Santos',
        birthdate: '2015-11-10',
        gender: 'F',
        relationship_to_head: 'Daughter',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
        syncStatus: 'synced',
      },
      {
        id: 'res-4',
        household_id: 'hh-1',
        full_name: 'Elena Santos',
        birthdate: '1950-01-28',
        gender: 'F',
        relationship_to_head: 'Mother',
        status: 'active',
        civil_status: 'widowed',
        createdAt: new Date(),
        updatedAt: new Date(),
        syncStatus: 'synced',
      },
      {
        id: 'res-5',
        household_id: 'hh-2',
        full_name: 'Rosa Fernandez',
        birthdate: '1975-05-12',
        gender: 'F',
        relationship_to_head: 'Self',
        status: 'active',
        civil_status: 'married',
        occupation: 'Shopkeeper',
        createdAt: new Date(),
        updatedAt: new Date(),
        syncStatus: 'synced',
      },
      {
        id: 'res-6',
        household_id: 'hh-2',
        full_name: 'Carlos Reyes',
        birthdate: '1973-09-18',
        gender: 'M',
        relationship_to_head: 'Spouse',
        status: 'active',
        civil_status: 'married',
        occupation: 'Construction',
        createdAt: new Date(),
        updatedAt: new Date(),
        syncStatus: 'synced',
      },
      {
        id: 'res-7',
        household_id: 'hh-2',
        full_name: 'Maria Reyes',
        birthdate: '2020-06-14',
        gender: 'F',
        relationship_to_head: 'Daughter',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
        syncStatus: 'synced',
      },
    ];

    for (const resident of residents) {
      await db.add(STORE_NAMES.residents, resident);
    }

    // Seed programs
    const programs: Program[] = [
      {
        id: 'prog-1',
        name: 'Senior Aid',
        description: 'Assistance for senior citizens',
        active: true,
        createdAt: new Date(),
      },
      {
        id: 'prog-2',
        name: 'PWD Assistance',
        description: 'Support for persons with disabilities',
        active: true,
        createdAt: new Date(),
      },
      {
        id: 'prog-3',
        name: 'Maternal Health',
        description: 'Care for pregnant women and mothers',
        active: true,
        createdAt: new Date(),
      },
    ];

    for (const program of programs) {
      await db.add(STORE_NAMES.programs, program);
    }

    console.log('[v0] Initial data seeded successfully');
  } catch (error) {
    console.error('[v0] Error seeding initial data:', error);
  }
}
