# MSWDO Household Census PWA

> A capstone project for the Municipal Social Welfare and Development Office (MSWDO) focused on faster fieldwork, better beneficiary targeting, and reliable offline operations.

---

## General Objective

The general objective of this capstone project is to design and develop a Progressive Web Application (PWA) for the Municipal Social Welfare and Development Office (MSWDO) that digitizes household census operations, improves the identification of vulnerable residents, and supports relief, response, and reporting workflows through an offline-first system that can still function in low-connectivity field conditions.

## Specific Objectives

1. To provide a centralized household and resident profiling system for recording census, demographic, and location data.
2. To automatically determine age-based vulnerability categories such as child, adult, and senior citizen using each resident's birthdate.
3. To allow authorized staff to record additional vulnerability indicators such as pregnancy, disability, chronic illness, and low-income status.
4. To support household self-registration and resident self-service tracking of application and approval status.
5. To help administrators validate submitted locations, review map pins, and approve or return household registrations for correction.
6. To support relief distribution operations by identifying eligible beneficiaries, recording released assistance, and preventing duplicate claims within the same event.
7. To manage inventory items, stock movements, package templates, reorder levels, and expiration dates for welfare and disaster-response supplies.
8. To generate dashboards and reports that summarize households, population, vulnerable sectors, and operational activities for decision-making.
9. To enforce role-based access control so that each user only sees and updates the parts of the system relevant to their work.
10. To enable the system to continue working offline through IndexedDB storage, cached application routes, and a sync queue that can be backed up when connectivity returns.

---

## System Overview

This project is a **Next.js 16 Progressive Web Application** built for MSWDO field and office staff. It combines census management, registration review, vulnerability monitoring, relief distribution, inventory tracking, field response, and reports in a single system.

The system follows an **offline-first** approach. Operational data is stored locally in **IndexedDB**, the app shell is cached by the **service worker**, and pending changes are added to a **sync queue** for later backup and server synchronization. This allows staff to continue working even when internet service is unstable.

The system also includes a **server-backed authentication flow**. Users sign in through API routes, receive an **HTTP-only session cookie**, and the client keeps a safe session snapshot for offline restore when the device temporarily loses connectivity.

---

## Core Capstone Contribution

The core contribution of the project is the **automatic vulnerability detection workflow**.

Instead of requiring staff to manually tag residents as child, adult, or senior, the system computes age directly from the resident's birthdate every time the data is used. This reduces stale records, improves report accuracy, and helps distribution events target the correct beneficiaries without repeated manual updates.

Age categories used by the system:

- **Child**: 0 to 17 years old
- **Adult**: 18 to 59 years old
- **Senior**: 60 years old and above

This means a resident born on **February 28, 1964** is automatically treated as a **Senior** on **February 28, 2026** without any manual recategorization.

---

## Users And Roles

The current system supports these user roles:

| Role | Main Responsibilities |
|------|------------------------|
| **Admin** | Manages users, reviews registrations, validates location data, oversees the whole system |
| **Encoder** | Creates and updates household and resident records |
| **Health Worker** | Updates health-related vulnerability flags |
| **Responder** | Uses field-response tools, incident views, maps, and operational data |
| **Resident** | Submits household registration and tracks review status |

Permissions are handled through a role-based permission matrix so each user sees only the features appropriate to their assigned work.

---

## Major Functional Modules

### 1. Household And Resident Management

- Register households with head name, address, purok or sitio, contact details, and GPS coordinates
- Add, update, and review household members
- Keep historical status through soft-delete style state changes such as moved out or deceased
- Search and filter household records by name, location, and registration status

### 2. Automatic Vulnerability Monitoring

- Compute age from birthdate using the current date
- Classify residents as child, adult, or senior automatically
- Record manual flags such as pregnant, PWD, chronic illness, and low-income
- Reflect vulnerability updates in dashboards, reports, and targeting workflows

### 3. Registration And Approval Workflow

- Resident self-service household registration
- Multi-step registration flow with location verification
- Current location, map pin, and address-assisted entry
- Supporting document capture for review
- Admin review actions for approve, reject, or request correction
- Registration timeline and status tracking for residents

### 4. Location Review And Map Pin QA

- Admin dashboard for pending, approved, rejected, and correction-needed registrations
- Duplicate pin detection and map-pin quality checks
- Review notes, landmark directions, and location confidence updates
- Master list management for municipality, barangay, and purok values

### 5. Relief Distribution

- Create relief events for different program or incident needs
- Select eligible households or residents based on event rules and vulnerability data
- Record distributed packages and item releases
- Prevent duplicate distribution records within the same event
- Keep a release history with timestamps and responsible staff

### 6. Inventory Management

- Track food, medicine, hygiene kits, blankets, clothing, and other items
- Record stock-in, stock-out, adjustments, and distribution-linked releases
- Monitor low-stock conditions through reorder levels
- Track expiration dates and expiring items
- Maintain package templates for repeatable distribution bundles

### 7. Reports And Dashboard

- Dashboard KPIs for households, population, and vulnerable sectors
- Household listing reports
- Monthly demographic summary reports
- Vulnerable groups reporting
- Export-ready and print-friendly report views

### 8. Field Response

- Responder-facing field response workspace
- Incident and operational views tied to vulnerable households
- Weather integrations and map overlays through API routes
- Mobile and desktop responder layouts

### 9. Offline PWA Support

- Cached shell routes and static assets
- Offline fallback page
- Local IndexedDB data stores
- Sync queue tracking and background backup attempts
- Installable PWA behavior for supported devices

---

## Current Architecture

### Frontend

- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Libraries**: Radix UI, Lucide React, Recharts

### Data And Storage

- **Primary local storage**: IndexedDB
- **Tracked stores**: households, residents, vulnerability flags, inventory, distributions, incidents, location master lists, audit logs, and sync queue
- **Offline queueing**: pending create, update, and delete operations are added to a sync queue

### Authentication

- **Server API login flow** using `/api/auth/login`
- **HTTP-only signed session cookie** for active sessions
- **Offline session snapshot** for temporary offline restoration
- **Resident account registration** and invited staff password setup flows

### PWA And Sync

- **Service worker** at `/public/sw.js`
- **Cached navigation shell** and stale-while-revalidate static asset strategy
- **Background sync trigger** for queued field changes
- **Backup sync API** at `/api/sync/backup`
- **Supabase sync bridge** for connected deployments

### External Services

- **Google Maps / Places / Geocoding** for address and pin workflows
- **OpenWeather integrations** for map and weather overlays
- **Supabase** for connected sync and server-side integrations
- **Nodemailer** for account email flows

---

## Current Tech Stack

| Layer | Technology |
|------|------------|
| Frontend | Next.js 16, React 19, TypeScript |
| Styling | Tailwind CSS |
| Local Storage | IndexedDB |
| Authentication | Custom server-backed auth with signed cookie and offline snapshot |
| PWA | Web App Manifest, service worker, install prompt, sync banner |
| Mapping | Google Maps, React Google Maps API, Leaflet dependencies |
| Reporting | jsPDF, jspdf-autotable |
| Integrations | Supabase, Firebase, OpenWeather, Nodemailer |

---

## APIs And Services Used By The System

### External APIs And Services

1. **Google Maps JavaScript API**
   Used for interactive maps, household pin placement, current-location support, and admin map review.

2. **Google Places / Geocoding Services**
   Used for address-assisted search, reverse geocoding, and location resolution during registration and review.

3. **Google Address Validation API**
   Used through the system's address validation route for validating supported address payloads.

4. **OpenWeather API**
   Used for responder weather forecasts, operational weather summaries, and weather map overlays.

5. **Supabase**
   Used for connected sync, backup application, and real-time or server-side integration flows.

6. **Firebase App Check**
   Used to protect Google Maps requests with attestation and reCAPTCHA Enterprise support.

7. **SMTP / Nodemailer**
   Used for sending account setup emails and resident email verification messages.

8. **Thunderforest and Tracestrack Map Tiles**
   Optional map tile providers used by the responder map when their API keys are configured.

### Internal API Routes

The system also exposes internal Next.js API routes for application features:

| Route | Purpose |
|------|---------|
| `/api/auth/login` | Authenticates a user and starts a secure session |
| `/api/auth/logout` | Ends the active session |
| `/api/auth/session` | Returns the current signed-in user session |
| `/api/auth/register` | Creates a resident self-service account |
| `/api/auth/verify-email` | Verifies resident email tokens |
| `/api/auth/resend-verification` | Resends resident verification email |
| `/api/auth/setup-password` | Completes invited staff password setup |
| `/api/admin/users` | Lists users and creates staff accounts |
| `/api/admin/users/[id]` | Updates a selected user account |
| `/api/send-email` | Sends admin-triggered account setup emails |
| `/api/address/validate` | Validates address input through the system service layer |
| `/api/weather` | Returns weather forecast and field weather summary data |
| `/api/weather/map-tile` | Proxies OpenWeather weather map tiles |
| `/api/weather/map-surface` | Returns weather surface layer data for map views |
| `/api/sync/backup` | Accepts queued offline changes for backup and sync processing |
| `/api/health` | Provides a basic health check endpoint |
| `/api/api-health` | Provides application API health diagnostics |

### Environment Variables Commonly Needed For These APIs

- `NEXT_PUBLIC_GOOGLE_MAPS_KEY`
- `GOOGLE_ADDRESS_VALIDATION_API_KEY`
- `OPENWEATHER_API_KEY`
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`
- `NEXT_PUBLIC_THUNDERFOREST_API_KEY`
- `NEXT_PUBLIC_TRACESTRACK_KEY`

---

## IndexedDB Stores Used By The System

| Store | Purpose |
|------|---------|
| `users` | User directory and local user-related data |
| `households` | Household profiles and registration records |
| `residents` | Resident demographic and personal records |
| `vulnerability_flags` | Computed and manual vulnerability indicators |
| `inventory_items` | Current inventory records |
| `inventory_movements` | Stock movement history |
| `package_templates` | Reusable relief package definitions |
| `distribution_events` | Relief or assistance event definitions |
| `distribution_records` | Per-beneficiary distribution logs |
| `incidents` | Field incident and response records |
| `location_master_lists` | Official municipality, barangay, and purok lists |
| `audit_logs` | Audit trail of user actions |
| `sync_queue` | Pending offline operations waiting for backup or sync |

---

## Why This System Matters

This system addresses common manual-process problems in local welfare operations:

- Paper-based or spreadsheet-based census records are slow to update and hard to validate
- Manual age categorization becomes inaccurate over time
- Relief distribution is harder to track without beneficiary targeting and duplicate prevention
- Inventory monitoring is difficult without movement logs and stock alerts
- Field workers may lose access to critical records when internet connectivity is poor

By combining automated vulnerability tagging, offline-first data handling, and role-based workflows, the system helps MSWDO staff make faster and more accurate operational decisions.

---

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:3000` after the dev server starts.

### Default Admin Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | `MSWDOOO2017@gmail.com` | `mswdoooadmin123` |

The local fallback auth store seeds this admin account automatically when the auth store file is created for the first time.

---

## Suggested Capstone Defense Flow

1. Log in as different roles and show how each role lands on a different workflow.
2. Register a household, add residents, and emphasize that age categories are not entered manually.
3. Open the vulnerability dashboard and show the updated child, adult, and senior counts.
4. Demonstrate resident self-registration and admin location review with pin validation.
5. Create a distribution event and show automatic or assisted beneficiary targeting plus duplicate protection.
6. Show the inventory module and explain stock movement and low-stock monitoring.
7. Switch the browser offline and show that cached pages and local data continue to work.
8. Return online and show the sync banner processing queued field changes.

---

## Project Guide

| Concern | Main File Or Area |
|--------|--------------------|
| App shell and metadata | `/app/layout.tsx` |
| Login and session bootstrapping | `/app/api/auth/login/route.ts`, `/lib/auth.ts`, `/lib/server/auth-session.ts` |
| Local database manager | `/lib/db/indexeddb.ts` |
| Household operations | `/lib/db/households.ts` |
| Resident operations | `/lib/db/residents.ts` |
| Vulnerability engine | `/lib/db/vulnerability.ts` |
| Inventory operations | `/lib/db/inventory.ts` |
| Distribution operations | `/lib/db/distribution.ts` |
| Registration workflow | `/app/households/register`, `/app/admin/location-review/page.tsx` |
| Resident portal | `/app/resident/page.tsx` |
| Responder workspace | `/app/responder/page.tsx` |
| Service worker and caching | `/public/sw.js` |
| Full architecture flow | `/SYSTEM_FLOWCHART.md` |

---

## Security Notes

- Passwords in the current auth store are hashed with `scrypt`, not stored as plain text.
- Active sessions use an HTTP-only signed cookie.
- The client keeps an offline-safe session snapshot for limited offline restore behavior.
- API routes validate and normalize request payloads before processing.
- Audit logging is built into key data mutation flows.
- Production deployments should use a strong `AUTH_SESSION_SECRET`, secure environment variables, and HTTPS.

---

## Planned Enhancements

- Broader multi-barangay and multi-tenant operational support
- More advanced incident-response workflows and media handling
- Stronger real-time synchronization across multiple devices
- Push or SMS notifications for approvals, events, and field advisories
- Additional bulk import and export utilities
- Expanded analytics for planning and program evaluation

---

Built as an MSWDO capstone system to reduce paperwork, improve data accuracy, and make field operations more reliable in real-world connectivity conditions.
