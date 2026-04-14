# Role-Based UI/UX Flowchart

This document is intentionally limited to UI/UX flow only.

- No database layer
- No API layer
- No IndexedDB or Supabase details
- Only screens, roles, and visible user decisions

## 1. Shared Entry Flow

```mermaid
flowchart TD
    A[Open Login Page] --> B[Enter Email and Password]
    B --> C{Credentials Correct?}

    C -- No --> D[Show Login Error]
    D --> B

    C -- Yes --> E{Which Role Logged In?}
    E -- Resident --> F[Open Resident Portal]
    E -- Admin --> G[Open Admin Dashboard]
    E -- Encoder --> H[Open Staff Dashboard]
    E -- Health Worker --> I[Open Staff Dashboard]
    E -- Responder --> J[Open Staff Dashboard]
```

## 2. Resident Account Flow

```mermaid
flowchart TD
    A[Resident Opens Login Page] --> B{Already Has Resident Account?}

    B -- No --> C[Open Resident Register Page]
    C --> D[Fill Out Account Details]
    D --> E{Form Complete?}
    E -- No --> F[Show Validation Errors]
    F --> D
    E -- Yes --> G[Account Created]
    G --> H[Open Verify Email Screen]
    H --> I{Email Verified?}
    I -- No --> J[Stay on Verify Email / Resend Email]
    J --> H
    I -- Yes --> K[Return to Login]

    B -- Yes --> K
    K --> L[Enter Resident Credentials]
    L --> M{Credentials Correct?}
    M -- No --> N[Show Login Error]
    N --> L
    M -- Yes --> O[Resident Portal]

    O --> P{Has Approved Household?}
    P -- No --> Q[Open New Registration]
    Q --> R[Submit Household Registration]
    R --> S[Track Registration Status]
    S --> O

    P -- Yes --> T[Open My Household]
    T --> U[View Household Members]
    T --> V[Add Household Member]

    O --> W[Open Notifications]
    O --> X[Sign Out]
```

## 3. Admin Account Flow

```mermaid
flowchart TD
    A[Admin Opens Login Page] --> B[Enter Admin Credentials]
    B --> C{Credentials Correct?}

    C -- No --> D[Show Login Error]
    D --> B

    C -- Yes --> E[Admin Dashboard]

    E --> F[Open User Accounts]
    E --> G[Open Location Review]
    E --> H[Open API Health]
    E --> I[Open Households]
    E --> J[Open Vulnerability]
    E --> K[Open Distribution]
    E --> L[Open Inventory]
    E --> M[Open Reports]
    E --> N[Open Field Response]

    F --> O{Create New Staff Account?}
    O -- Yes --> P[Open Create Account Form]
    P --> Q[Save Staff Account]
    Q --> F
    O -- No --> R[Open Existing Account]
    R --> S{Edit, Deactivate, or Delete?}
    S -- Edit --> T[Update Account Details]
    S -- Deactivate --> U[Deactivate Account]
    S -- Delete --> V[Delete Account]
    T --> F
    U --> F
    V --> F

    G --> W{Approve Location?}
    W -- Yes --> X[Mark as Approved]
    W -- No --> Y[Return for Correction or Keep Pending]
    X --> G
    Y --> G

    E --> Z[Sign Out]
```

## 4. Encoder Staff Flow

```mermaid
flowchart TD
    A[Encoder Opens Login Page] --> B[Enter Staff Credentials]
    B --> C{Credentials Correct?}

    C -- No --> D[Show Login Error]
    D --> B

    C -- Yes --> E[Staff Dashboard]

    E --> F[Open Households]
    F --> G{Create New Household?}
    G -- Yes --> H[Open Add Household Form]
    H --> I[Save Household]
    I --> F
    G -- No --> J[Open Household Details]
    J --> K[Add or Update Resident]
    K --> J

    E --> L[Open Vulnerability]
    E --> M[Open Distribution]
    E --> N[Open Inventory]
    E --> O[Open Reports]
    E --> P[Sign Out]
```

## 5. Health Worker Staff Flow

```mermaid
flowchart TD
    A[Health Worker Opens Login Page] --> B[Enter Staff Credentials]
    B --> C{Credentials Correct?}

    C -- No --> D[Show Login Error]
    D --> B

    C -- Yes --> E[Staff Dashboard]
    E --> F[Open Vulnerability]
    F --> G[Review Resident Risk Profiles]
    G --> H{Needs Health Flag Update?}
    H -- Yes --> I[Update Health-Related Flags]
    I --> F
    H -- No --> J[Return to Dashboard]
    J --> E

    E --> K[Sign Out]
```

## 6. Responder Staff Flow

```mermaid
flowchart TD
    A[Responder Opens Login Page] --> B[Enter Staff Credentials]
    B --> C{Credentials Correct?}

    C -- No --> D[Show Login Error]
    D --> B

    C -- Yes --> E[Staff Dashboard]
    E --> F[Open Field Response]
    F --> G[View Incident List]
    F --> H[View Response Map]
    F --> I[View Weather and Operations Panel]

    G --> J{Update Incident Status?}
    J -- Yes --> K[Set New Incident Status]
    K --> G
    J -- No --> L[Return to Field Response]
    L --> F

    E --> M[Sign Out]
```

## 7. Role Access Summary

```text
Resident
- Login
- Register
- Verify Email
- Resident Portal
- New Registration
- Registration Status
- My Household
- Notifications

Admin
- Dashboard
- User Accounts
- Location Review
- API Health
- Households
- Vulnerability
- Distribution
- Inventory
- Reports
- Field Response

Encoder
- Dashboard
- Households
- Vulnerability
- Distribution
- Inventory
- Reports

Health Worker
- Dashboard
- Vulnerability

Responder
- Dashboard
- Field Response
```
