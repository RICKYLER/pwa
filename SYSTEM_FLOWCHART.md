# MSWDO Census PWA System Flowchart

This flowchart reflects the current codebase as of 2026-03-19.

Key source anchors:
- `lib/auth.ts`
- `lib/server/auth-store.ts`
- `components/forms/household-form.tsx`
- `app/admin/location-review/page.tsx`
- `views/desktop/ResponderDesktop.tsx`
- `lib/db/distribution.ts`
- `public/sw.js`

## 1. Current Whole-System Overview

```mermaid
flowchart TD
    U[Users]
    A[Admin]
    E[Encoder]
    H[Health Worker]
    R[Responder]
    RS[Resident]
    N[Invited Staff]

    U --> A
    U --> E
    U --> H
    U --> R
    U --> RS
    U --> N

    A --> AUTH[Secure Session Auth<br/>HTTP-only cookie + offline snapshot]
    E --> AUTH
    H --> AUTH
    R --> AUTH
    RS --> RESAUTH[Resident self-service register and login]
    N --> SETUP[Password Setup Link]
    SETUP --> AUTH
    RESAUTH --> AUTH

    AUTH --> APP[Next.js App Router + AppShell]

    APP --> DASH[Dashboard KPIs]
    APP --> HH[Households]
    APP --> VUL[Vulnerability]
    APP --> RESP[Field Response]
    APP --> DIST[Distribution]
    APP --> INV[Inventory]
    APP --> REP[Reports]
    APP --> ADMUSERS[Admin User Accounts]
    APP --> ADMLOC[Admin Location Review]
    APP --> ADMHEALTH[Admin API Health]
    APP --> RESPOR[Resident Portal]

    HH --> HHCRUD[Household and Resident CRUD]
    HHCRUD --> LOCFLOW[Address Search and GPS Pin Flow]
    HHCRUD --> VCALC[Auto Vulnerability Calculation]

    H --> HEALTHFLAGS[Manual Health Flags<br/>pregnant, PWD, chronic]
    HEALTHFLAGS --> VCALC

    VCALC --> DASH
    VCALC --> VUL
    VCALC --> DIST
    VCALC --> REP
    VCALC --> RESP

    RESP --> INC[Incident Monitoring]
    RESP --> PRIORITY[Priority Check-ins]
    RESP --> MAP[Google Map View]
    RESP --> WEATHER[Live Weather and Map Overlays]
    RESP --> EVENTS[Ongoing Distribution Events]

    DIST --> ELIGIBLE[Eligible Household or Resident Selection]
    DIST --> DREC[Distribution Records]
    DIST --> STOCKREL[Inventory Release]

    INV --> ITEMS[Inventory Items]
    INV --> MOVES[Inventory Movements]
    INV --> PACKS[Package Templates]
    PACKS --> DIST

    REP --> PRINT[Print, CSV, and PDF Export]

    APP --> IDB[IndexedDB Offline Stores]
    IDB --> HHS[households]
    IDB --> RESS[residents]
    IDB --> VFS[vulnerability_flags]
    IDB --> INVS[inventory_items]
    IDB --> MOVS[inventory_movements]
    IDB --> PKGS[package_templates]
    IDB --> DEVS[distribution_events]
    IDB --> DRS[distribution_records]
    IDB --> INCS[incidents]
    IDB --> LMS[location_master_lists]
    IDB --> AUD[audit_logs]
    IDB --> SYNCQ[sync_queue]

    APP --> PWA[PWA Bootstrap + Service Worker]
    PWA --> CACHE[Offline Shell and Cached Routes]
    PWA --> BGSYNC[Background Backup Sync]
    BGSYNC --> BACKUPAPI[/api/sync/backup/]
    BACKUPAPI --> BACKUPFILE[data/field-sync-backup.json]

    AUTH --> AUTHPATHS[/api/auth/login<br/>/api/auth/session<br/>/api/auth/logout/]
    RESAUTH --> RESAPIS[/api/auth/register/]
    ADMUSERS --> USERAPI[/api/admin/users/]
    USERAPI --> AUTHSTORE[data/auth-store.json]
    SETUP --> SETUPAPI[/api/auth/setup-password/]
    ADMUSERS --> EMAIL[/api/send-email/]

    LOCFLOW --> GMAPS[Google Maps, Places, Geocoding]
    RESP --> OWM[OpenWeather API]
    ADMHEALTH --> HEALTHAPI[/api/health/]
```

## 2. Authentication, Session, and Account Onboarding

```mermaid
flowchart TD
    USER[Existing User] --> LOGIN[Login Page]
    LOGIN --> INIT[db.init and seedInitialData]
    INIT --> LOGINAPI[/POST /api/auth/login/]
    LOGINAPI --> VERIFY[Verify password in auth-store.json]
    VERIFY --> VALID{Credentials valid?}

    VALID -- No --> LERR[Show login error]
    LERR --> LOGIN

    VALID -- Yes --> COOKIE[Set signed HTTP-only session cookie]
    COOKIE --> SNAP[Store safe session snapshot<br/>for offline restore]
    COOKIE --> BOOT[AuthBootstrap]
    BOOT --> SESSIONAPI[/GET /api/auth/session/]
    SESSIONAPI --> RBAC[Role and permission checks]
    RBAC --> ALLOW{Role allowed?}
    ALLOW -- No --> DENY[Redirect to allowed page]
    ALLOW -- Yes --> APP[Authorized app routes]

    OFFLINE[Offline reload] --> RESTORE[restoreSession snapshot]
    RESTORE --> RBAC

    ADMIN[Admin] --> CREATE[Create account]
    CREATE --> USERSAPI[/POST /api/admin/users/]
    USERSAPI --> STORE[Create account in auth-store.json]
    STORE --> TOKEN[Create one-time setup token]
    TOKEN --> SENDMAIL[/api/send-email/]
    SENDMAIL --> INVITEE[Invited staff member]
    INVITEE --> LINK[/setup-password?token=.../]
    LINK --> CHECKTOKEN[/GET /api/auth/setup-password/]
    CHECKTOKEN --> POSTSETUP[/POST /api/auth/setup-password/]
    POSTSETUP --> HASH[Hash password and activate account]
    HASH --> COOKIE

    RESIDENT[Resident] --> RESREGISTER[Resident register page]
    RESREGISTER --> RESAPI[/POST /api/auth/register/]
    RESAPI --> RESSTORE[Create resident account in auth-store.json]
    RESSTORE --> COOKIE
    COOKIE --> RESPORTAL[Resident Portal]
```

## 3. Registration Wizard to Admin Approval to Field Response

```mermaid
flowchart TD
    REG[Registration Wizard]
    REG --> STEP1[Personal Information<br/>name, contact, email, address, document]
    STEP1 --> MASTER[Load admin master list<br/>municipality, barangay, purok]
    MASTER --> STEP2[Location Verification]

    STEP2 --> CURRENT[Use My Current Location]
    STEP2 --> MANUAL[Enter Location Manually]
    MANUAL --> SEARCH[Google autocomplete or text search]
    SEARCH --> FOUND{Address resolved?}

    FOUND -- Yes --> AUTOPIN[Set gps_lat and gps_long<br/>location_source=address_search<br/>confidence=medium]
    FOUND -- No --> MANREQ[Manual pin required]

    STEP2 --> CLICK[Click or drag map pin]
    CURRENT --> GEOOK{Location access allowed?}
    GEOOK -- No --> GEOERR[Show geolocation error]
    GEOERR --> STEP2
    GEOOK -- Yes --> REVGEO[Reverse geocode current GPS]

    CLICK --> REVGEO2[Reverse geocode selected point]
    MANREQ --> CLICK
    REVGEO --> MANPIN[Set gps_lat and gps_long<br/>location_source=current_gps]
    REVGEO2 --> MANPIN2[Set gps_lat and gps_long<br/>location_source=manual_pin]
    MANPIN --> CONFIRM[Confirm My Location]
    MANPIN2 --> CONFIRM[Confirm My Location]

    AUTOPIN --> STEP3[Review and Submit]
    CONFIRM --> STEP3
    STEP3 --> SAVECHK{Form valid and pin ready?}

    SAVECHK -- No --> FORMERR[Show validation or pinning error]
    FORMERR --> REG
    SAVECHK -- Yes --> SAVEHH[Create household<br/>registration_status=pending]
    SAVEHH --> HHDB[Store household in IndexedDB]
    HHDB --> DETAIL[Household detail view]
    HHDB --> STATUSPAGE[Registration Status Page]
    HHDB --> QUEUE[Add pending sync item]
    HHDB --> REVIEW[Admin Location Review]

    STATUSPAGE --> TIMELINE[Pending Review<br/>Submitted → Location Review → Admin Approval]
    REVIEW --> MASTERUPD[Maintain official location master list]
    REVIEW --> VERIFY[Adjust directions, confidence,<br/>Map Pin QA, and verified status]
    VERIFY --> DECIDE{Approve?}
    DECIDE -- Approve --> APPROVED[registration_status=approved]
    DECIDE -- Reject --> REJECTED[registration_status=rejected]
    DECIDE -- Request Update --> CORRECT[registration_status=needs_correction]
    APPROVED --> MASTERLIST[Approved Master List]
    APPROVED --> HHDB
    REJECTED --> HHDB
    CORRECT --> HHDB

    DETAIL --> GPSCHK{GPS exists?}
    GPSCHK -- No --> ADDRONLY[Show address and landmark fallback]
    GPSCHK -- Yes --> MINI[Show mini map and Navigate Here]

    HHDB --> RESP[Field Response]
    RESP --> LOADGPS[Load active households with pins]
    RESP --> SCORE[Score priority households from vulnerability flags]
    RESP --> WX[Load weather cards and map overlays]
    LOADGPS --> NAVCHK{Pinned GPS exists?}
    NAVCHK -- Yes --> EXACT[Open Google Maps by coordinates]
    NAVCHK -- No --> FALLBACK[Open Google Maps by address text]
    SCORE --> NAVCHK
```

## 4. Distribution and Inventory Flow

```mermaid
flowchart TD
    INV[Inventory Module]
    INV --> ITEMCRUD[Create, edit, archive items]
    ITEMCRUD --> MOVES[Write inventory_movements]
    INV --> TEMPLATES[Create package templates]

    TEMPLATES --> NEWEVENT[New distribution event]
    NEWEVENT --> EVENTFORM[Set type, target_scope, target_group,<br/>schedule, notes]
    EVENTFORM --> EVENTPIN[Pin event location]
    EVENTFORM --> PACKAGE[Select stock items or apply template]
    PACKAGE --> EVENTCHK{Event valid?}

    EVENTCHK -- No --> EVENTERR[Show validation error]
    EVENTERR --> NEWEVENT
    EVENTCHK -- Yes --> SAVEEVENT[Save event]
    SAVEEVENT --> EVDB[distribution_events]
    SAVEEVENT --> QSYNC[queue sync item]

    EVDB --> DETAIL[Distribution detail page]
    DETAIL --> SCOPE{Target scope}
    SCOPE -- Household --> HHSEL[Load eligible households]
    SCOPE -- Resident --> RESSEL[Load eligible residents]
    HHSEL --> FLAGS[Vulnerability flags and active status]
    RESSEL --> FLAGS

    FLAGS --> PICK[Search and select beneficiary]
    PICK --> DUP{Already served in this event?}
    DUP -- Yes --> DUPERR[Show duplicate prevention error]
    DUP -- No --> STOCKCHK{Enough stock for full package?}

    STOCKCHK -- No --> STOCKERR[Show low stock error]
    STOCKERR --> DETAIL
    STOCKCHK -- Yes --> RELEASE[Release distribution package]
    RELEASE --> DREC[Create distribution_record]
    RELEASE --> STOCKOUT[Reduce inventory stock]
    STOCKOUT --> MOVES
    DREC --> DRDB[distribution_records]
    DRDB --> STATUS[planned to ongoing to completed]
    STATUS --> REPORTS[Print event records and summaries]
```

## 5. Offline-First Sync and Backup Flow

```mermaid
flowchart TD
    ACTION[User creates or updates local data]
    ACTION --> WRITE[Write to IndexedDB]
    WRITE --> PENDING[Mark record syncStatus=pending]
    PENDING --> SYNCQ[Upsert sync_queue item]
    SYNCQ --> BANNER[PwaBootstrap status banner]

    BANNER --> ONLINE{Device online?}
    ONLINE -- No --> OFFLINE[Keep working offline<br/>cached shell and offline fallback]
    OFFLINE --> WAIT[Wait for reconnection]
    WAIT --> ONLINE

    ONLINE -- Yes --> SW[Service worker flushes queue<br/>background sync or Sync Now]
    SW --> POST[/POST /api/sync/backup/]
    POST --> AUTHCHK{Authenticated session cookie?}

    AUTHCHK -- No --> FAIL[Keep queue items pending<br/>increment attempts and last_error]
    FAIL --> BANNER

    AUTHCHK -- Yes --> BACKUP[data/field-sync-backup.json]
    BACKUP --> ACK[Return applied queue item ids]
    ACK --> MARK[Set local records syncStatus=synced]
    MARK --> CLEAR[Remove items from sync_queue]
    CLEAR --> CLEAN[Update banner to healthy state]
```

## 6. Common Guard, Validation, and Error Handling

```mermaid
flowchart TD
    START[User action]
    START --> SESSION[Session available?]
    SESSION -- No --> LOGIN[Redirect to login or setup]
    SESSION -- Yes --> PERM[Role or permission allowed?]

    PERM -- No --> DENY[Redirect to allowed page]
    PERM -- Yes --> VALIDATE[Input and business-rule validation]

    VALIDATE -- No --> VERR[Show validation message]
    VERR --> RETURN[Return to current form or selection]

    VALIDATE -- Yes --> PROCESS[Process IndexedDB or API work]
    PROCESS --> OK{Operation successful?}

    OK -- No --> OERR[Show error, keep local state,<br/>allow retry]
    OERR --> RETURN

    OK -- Yes --> SUCCESS[Update UI, write audit log,<br/>queue sync if needed]
```
