# MSWDO Household Census PWA

> A capstone project built to help local government workers serve their communities better — through smarter data, not more paperwork.

---

## What This Is

This is a **Progressive Web Application (PWA)** built for the **Municipal Social Welfare and Development Office (MSWDO)**. It helps frontline staff — encoders, health workers, and responders — manage their household census data, automatically track vulnerable residents, and coordinate relief distributions, all without needing a stable internet connection.

The app was designed with a simple philosophy: **the system should do the hard work, not the people using it.**

Instead of asking staff to manually pick an age category or check a checkbox every time someone's birthday passes, the app figures it out automatically. You enter a birthdate once, and the system handles everything else — for life.

---

## The Core Innovation: Automatic Vulnerability Detection

Here's the problem we solved: MSWDO staff used to manually mark residents as "child," "adult," or "senior" — and those labels would go stale the moment someone had a birthday. People would be miscategorized for months, and relief distributions would sometimes miss the right beneficiaries.

Our solution was simple but powerful: **compute age and category directly from the birthdate, every single time.**

- **Child**: 0–17 years old
- **Adult**: 18–59 years old
- **Senior**: 60 years and above

There's no forms to re-fill. No categories to manually update. A resident born on **February 28, 1964** is automatically recognized as a **Senior (age 62)** on **February 28, 2026** — without anyone touching the record.

---

## Who Uses This App

| Role | What They Do |
|------|-------------|
| **Admin** | Manages users, has full access to everything |
| **Encoder** | Adds and updates households and resident records |
| **Health Worker** | Updates health flags (pregnancy, PWD, chronic illness) |
| **Responder** | Views vulnerable residents and incident reports |

Each role sees only what they need. Permissions are enforced throughout the app — no workarounds, no accidental deletions.

---

## What's Already Built

### 🏠 Household & Resident Management
- Register households with address, purok/sitio, contact number, and GPS coordinates
- Add family members with full biographical details
- Soft-delete records (residents who've moved out or passed away are preserved, not erased)
- Search and filter households by name, location, or status

### 🤖 Automatic Vulnerability System
- Age computed from birthdate using JavaScript's `Date` API — handles leap years correctly
- Residents are automatically tagged: child, adult, senior
- Health workers can also flag: PWD, pregnant, chronic illness, low-income
- All flags update the dashboard in real time

### 📊 Dashboard & Reporting
- Live KPI cards: total households, population, children, adults, seniors
- Breakdown of vulnerability types across puroks
- Monthly demographic reports — printable and export-ready
- Household listing by purok, vulnerable groups summary

### 🎁 Relief Distribution
- Create distribution events (regular, emergency, disaster relief)
- The system automatically selects eligible beneficiaries based on event type:
  - *Senior Relief* → all seniors 60+
  - *PWD Assistance* → all PWD-flagged residents
  - *Maternal Health* → all pregnant women
  - *General Relief* → all low-income families
- Prevents duplicate distributions within the same event
- Full distribution logs with timestamps and distributor info

### 📦 Inventory Management
- Track food, medicine, hygiene kits, clothing, and blankets
- Low-stock alerts when quantities drop below 10 units
- Expiration date tracking

### 📶 Offline-First
- All data lives in **IndexedDB** — the app works completely offline
- Service worker is registered and ready
- A sync queue is already in place for future Supabase integration

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Icons | Lucide React |
| Storage | IndexedDB (offline-first) |
| Auth | Custom RBAC (localStorage session) |
| PWA | Web App Manifest + Service Worker |

---

## Getting Started

### Demo Login Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@mswdo.local | admin123 |
| Encoder | encoder@barangay.local | encoder123 |
| Health Worker | health@barangay.local | health123 |
| Responder | responder@drrmo.local | responder123 |

### Running Locally

```bash
# Install dependencies
npm install

# Start the dev server
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

The first time you log in, the database is automatically seeded with sample households and residents — so you can start exploring right away, no manual setup needed.

## System Flowchart

The full architecture and data-flow diagram lives in [SYSTEM_FLOWCHART.md](./SYSTEM_FLOWCHART.md).

---

## Project File Structure

```
/app
├── page.tsx                      ← Root redirect
├── layout.tsx                    ← PWA metadata + layout
├── login/page.tsx                ← Login form
├── dashboard/page.tsx            ← Main dashboard
├── households/
│   ├── page.tsx                  ← Household list
│   ├── new/page.tsx              ← Add household
│   └── [id]/page.tsx            ← Household detail + members
├── vulnerability/page.tsx        ← Vulnerability dashboard
├── reports/
│   ├── page.tsx                  ← Reports menu
│   └── monthly/page.tsx         ← Monthly demographic report
├── inventory/page.tsx            ← Inventory management
└── distribution/page.tsx         ← Distribution events

/lib
├── auth.ts                       ← Auth utilities
└── db/
    ├── schema.ts                 ← TypeScript type definitions
    ├── indexeddb.ts              ← IndexedDB setup
    ├── households.ts             ← Household CRUD
    ├── residents.ts              ← Resident CRUD
    ← vulnerability.ts           ← Age + vulnerability engine
    ├── inventory.ts              ← Inventory CRUD
    ├── distribution.ts           ← Distribution operations
    └── queries.ts                ← Complex report queries

/components
└── forms/
    └── household-form.tsx        ← Reusable household form

/public
├── manifest.json                 ← PWA manifest
└── service-worker.js             ← Service worker (ready)
```

---

## Capstone Defense Demo Script (10–15 minutes)

### 1. Login — 30 seconds
Log in using any of the demo credentials. Switch roles to show that each one has a different view and different permissions.

### 2. Add a Household — 2 minutes
- Go to **Dashboard → Add Household**
- Create "Garcia Family" at Purok 1
- Add family members:
  - Parent 1: born 1978-03-15 → auto-tagged **Adult**
  - Parent 2: born 1980-07-22 → auto-tagged **Adult**
  - Child: born 2015-11-10 → auto-tagged **Child** ✨
  - Senior: born 1950-01-28 → auto-tagged **Senior** ✨
- Emphasize: **no age dropdowns. No manual category selection. Zero.**

### 3. Vulnerability Dashboard — 1 minute
- Click "Vulnerability Dashboard"
- Show the live tally updating with the new residents
- Filter by "Children (0–17)" to show the newly added child

### 4. Generate a Report — 1 minute
- Go to **Reports → Monthly Demographic Summary**
- Show the updated counts and age breakdown
- Click Print — demonstrate the PDF-ready layout

### 5. Relief Distribution — 2 minutes
- Go to **Distribution → New Event**
- Create a "Senior Relief Event"
- The system automatically picks all seniors as eligible beneficiaries
- Record a distribution and show the duplicate-prevention in action

### 6. Offline Mode (Optional) — 1–2 minutes
- Open DevTools → Network → set to Offline
- Show that all household data is still visible and usable
- Add something while offline — it queues for sync
- Go back online — the queue is ready to sync

---

## Database Schema (IndexedDB)

| Store | Purpose |
|-------|---------|
| `users` | Admin, encoders, health workers, responders |
| `households` | Head name, address, purok, contact details |
| `residents` | Full name, birthdate, gender, relationship |
| `vulnerability_flags` | Computed (child/adult/senior) + manual (PWD, pregnant, chronic) |
| `inventory_items` | Stock management with expiry tracking |
| `distribution_events` | Relief events with type and status |
| `distribution_records` | Per-beneficiary records, duplicate prevention |
| `audit_logs` | Full change history for every action |
| `sync_queue` | Offline operations queued for cloud sync |

---

## Design Decisions Worth Knowing

**Why IndexedDB?**
Because internet connectivity in barangay areas can be unreliable. The app needed to work offline, first — syncing to the cloud later.

**Why soft deletes?**
Residents who move out or pass away are marked with a status field (`moved_out`, `deceased`) rather than deleted. This keeps the audit trail intact and preserves historical data.

**Why auto-compute age categories?**
Manual entry is error-prone. Staff forget to update records. Automatic computation from birthdate means the data is always correct — forever.

**Why Role-Based Access Control?**
Different roles have genuinely different needs. Health workers shouldn't be able to delete households. Responders shouldn't edit medical flags. The permission matrix enforces these boundaries quietly, in the background.

---

## What's Not Built Yet (Phase 3)

These features are foundation-ready — the database structures and data generators are in place. They just need a UI and integration:

- [ ] **Leaflet + OpenStreetMap** — map pins and heatmap by vulnerability per purok
- [ ] **Incident Reporting** — disaster response with photo upload and responder assignment
- [ ] **Background Sync** — service worker auto-syncing offline queue to Supabase
- [ ] **Push Notifications** — relief schedule reminders, evacuation alerts
- [ ] **Multi-Barangay Support** — filter and aggregate across multiple areas
- [ ] **Edit/Delete actions** — for existing residents and inventory items (UI only)

### Future Wishlist
- Barcode scanning for inventory check-in/out
- Bulk import/export via CSV
- SMS notifications for relief events
- Real-time sync via WebSocket

---

## Security Notes

- **Passwords**: Currently plain-text for demo. Production should use `bcrypt` hashing.
- **HTTPS**: Required for PWA installation and service worker registration.
- **Row-Level Security**: Ready to enable once Supabase is integrated.
- **Input Validation**: Implemented on all forms — sanitized before storage.
- **Audit Logs**: Every create, update, and delete is logged with user ID and timestamp.

---

## Deployment

### Deploy to Vercel
```bash
npm install -g vercel
vercel
```

### Production Checklist
- [ ] Enable HTTPS
- [ ] Set environment variables
- [ ] Connect Supabase backend (optional but recommended for multi-device)
- [ ] Test offline mode end-to-end
- [ ] Verify PWA installs on Android and iOS
- [ ] Enable Row-Level Security on Supabase
- [ ] Hash all passwords with bcrypt
- [ ] Review and monitor audit logs

---

## Where to Look If Something's Unclear

| Question | File to Check |
|----------|--------------|
| How is age calculated? | `/lib/db/vulnerability.ts` |
| How does login work? | `/lib/auth.ts` |
| Where's the IndexedDB schema? | `/lib/db/schema.ts` |
| How do complex queries work? | `/lib/db/queries.ts` |
| Full technical spec | `/v0_plans/creative-guide.md` |

---

*Built as part of a capstone project for MSWDO. Designed to make the lives of social workers a little bit easier, one household at a time.*

**Stack**: Next.js 16 · TypeScript · Tailwind CSS · IndexedDB  
**Status**: Production-Ready MVP — Phase 1 & Phase 2 Complete ✅
