# Role-Based UI/UX Flowchart

This document is intentionally limited to UI/UX flow only.

- No database layer
- No API layer
- No IndexedDB or Supabase details
- Only screens, roles, visible user decisions, and user-facing paths

## Flowchart Symbol Guide

```text
([Start / End]) = Terminator
[Screen / Process] = Page, action, or visible UI step
{Decision?} = Decision diamond
((Connector)) = Loop or return connector
```

## 1. Shared Entry Flow

```mermaid
flowchart TD
    START([Start]) --> LOGIN[Open Login Page]
    LOGIN --> ENTER[Enter Email and Password]
    ENTER --> VALID{Credentials Correct?}

    VALID -- No --> ERROR[Show Login Error]
    ERROR --> RETRY((Retry Login))
    RETRY --> ENTER

    VALID -- Yes --> ROLE{Which Role Logged In?}
    ROLE -- Resident --> RESIDENT[Open Resident Portal]
    ROLE -- Admin --> ADMIN[Open Admin Dashboard]
    ROLE -- Encoder --> ENCODER[Open Staff Dashboard]
    ROLE -- Health Worker --> HEALTH[Open Staff Dashboard]
    ROLE -- Responder --> RESPONDER[Open Field Response Dashboard]

    RESIDENT --> END([End])
    ADMIN --> END
    ENCODER --> END
    HEALTH --> END
    RESPONDER --> END
```

## 2. Resident and Household Self-Service Flow

```mermaid
flowchart TD
    START([Start]) --> LOGIN[Resident Opens Login Page]
    LOGIN --> HAS_ACCOUNT{Already Has Resident Account?}

    HAS_ACCOUNT -- No --> REGISTER[Open Resident Register Page]
    REGISTER --> ACCOUNT_FORM[Fill Out Account Details]
    ACCOUNT_FORM --> ACCOUNT_VALID{Form Complete?}
    ACCOUNT_VALID -- No --> ACCOUNT_ERROR[Show Validation Errors]
    ACCOUNT_ERROR --> ACCOUNT_LOOP((Fix Account Form))
    ACCOUNT_LOOP --> ACCOUNT_FORM
    ACCOUNT_VALID -- Yes --> ACCOUNT_CREATED[Account Created]
    ACCOUNT_CREATED --> VERIFY[Open Verify Email Screen]
    VERIFY --> EMAIL_OK{Email Verified?}
    EMAIL_OK -- No --> RESEND[Stay on Verify Email / Resend Email]
    RESEND --> VERIFY_LOOP((Wait or Resend))
    VERIFY_LOOP --> VERIFY
    EMAIL_OK -- Yes --> LOGIN_READY[Return to Login]

    HAS_ACCOUNT -- Yes --> LOGIN_READY
    LOGIN_READY --> CREDENTIALS[Enter Resident Credentials]
    CREDENTIALS --> LOGIN_OK{Credentials Correct?}
    LOGIN_OK -- No --> LOGIN_ERROR[Show Login Error]
    LOGIN_ERROR --> CREDENTIALS
    LOGIN_OK -- Yes --> PORTAL[Resident Portal]

    PORTAL --> APPROVED{Has Approved Household?}
    APPROVED -- Yes --> MY_HOUSEHOLD[Open My Household]
    APPROVED -- No --> NEW_REG[Open New Household Registration]

    NEW_REG --> STEP1[Step 1: Personal and Household Information]
    STEP1 --> STEP1_OK{Required Fields Complete?}
    STEP1_OK -- No --> STEP1_ERROR[Show Field Errors]
    STEP1_ERROR --> STEP1_LOOP((Correct Details))
    STEP1_LOOP --> STEP1
    STEP1_OK -- Yes --> STEP2[Step 2: Location Verification]

    STEP2 --> METHOD{Choose Location Method}
    METHOD -- Use Current Location --> PERMISSION{Location Permission Allowed?}
    PERMISSION -- No --> LOCATION_ERROR[Show Location Error]
    LOCATION_ERROR --> STEP2
    PERMISSION -- Yes --> PIN[Preview GPS Pin]

    METHOD -- Search or Manual Address --> ADDRESS[Search Address / Enter Address]
    ADDRESS --> FOUND{Address Found?}
    FOUND -- Yes --> PIN
    FOUND -- No --> MANUAL_PIN[Drop or Drag Map Pin Manually]
    MANUAL_PIN --> PIN

    PIN --> CONFIRM_PIN[Confirm My Location]
    CONFIRM_PIN --> STEP3[Step 3: Review and Submit]
    STEP3 --> READY{Ready to Submit?}
    READY -- No --> EDIT_REG[Go Back and Edit Details]
    EDIT_REG --> STEP1
    READY -- Yes --> SUBMIT[Submit Registration]
    SUBMIT --> STATUS[Open Registration Status Page]

    STATUS --> REVIEW_STATUS{Admin Review Status}
    REVIEW_STATUS -- Pending --> PENDING[Show Pending Review Timeline]
    REVIEW_STATUS -- Needs Correction --> CORRECTION[Show Correction Notice]
    REVIEW_STATUS -- Rejected --> REJECTED[Show Rejected Status]
    REVIEW_STATUS -- Approved --> APPROVED_STATUS[Show Approved Status]

    PENDING --> PORTAL_END((Back to Portal))
    CORRECTION --> NEW_REG
    REJECTED --> PORTAL_END
    APPROVED_STATUS --> MY_HOUSEHOLD

    MY_HOUSEHOLD --> DETAILS[View Household Details]
    DETAILS --> MEMBERS[View Household Members]
    MEMBERS --> NOTIFICATIONS[Open Notifications]
    PORTAL --> NOTIFICATIONS
    NOTIFICATIONS --> SIGNOUT{Sign Out?}
    PORTAL_END --> PORTAL
    SIGNOUT -- No --> PORTAL
    SIGNOUT -- Yes --> END([End])
```

## 3. Staff Household Management Flow

```mermaid
flowchart TD
    START([Start]) --> HOUSEHOLDS[Staff Opens Households]
    HOUSEHOLDS --> LIST[View Household List]
    LIST --> FILTERS{Apply Search or Filters?}
    FILTERS -- Search --> SEARCH[Search by Head Name or Address]
    FILTERS -- Purok / Sitio --> PUROK[Filter by Purok or Sitio]
    FILTERS -- Status --> STATUS_FILTER[Filter by Household Status]
    FILTERS -- Hazard / Risk --> RISK[Filter by Hazard or Disaster Risk]
    FILTERS -- No --> ACTION{Choose Action}

    SEARCH --> RESULTS[Updated Results]
    PUROK --> RESULTS
    STATUS_FILTER --> RESULTS
    RISK --> RESULTS
    RESULTS --> ACTION

    ACTION -- Create Household --> ADD_FORM[Open Add Household Form]
    ADD_FORM --> HH_INFO[Fill Household Information]
    HH_INFO --> INITIAL_MEMBERS[Add Initial Members]
    INITIAL_MEMBERS --> LOCATION[Set Address and Location Details]
    LOCATION --> HH_VALID{Form Valid?}
    HH_VALID -- No --> HH_ERROR[Show Validation Errors]
    HH_ERROR --> ADD_FORM
    HH_VALID -- Yes --> SAVE_HH[Save Household]
    SAVE_HH --> BACK_LIST((Back to List))
    BACK_LIST --> LIST

    ACTION -- Open Household --> DETAIL[Open Household Details]
    DETAIL --> PROFILE[View Household Profile]
    DETAIL --> MAP[View Location and Map Information]
    DETAIL --> MEMBER_LIST[View Members and Vulnerability Badges]
    PROFILE --> DETAIL_ACTION{Choose Detail Action}
    MAP --> DETAIL_ACTION
    MEMBER_LIST --> DETAIL_ACTION

    DETAIL_ACTION -- Edit Household --> EDIT_HH[Open Edit Household Information]
    EDIT_HH --> UPDATE_HH[Update Address, Contact, Status, or Location]
    UPDATE_HH --> UPDATE_OK{Changes Valid?}
    UPDATE_OK -- No --> UPDATE_ERROR[Show Validation Errors]
    UPDATE_ERROR --> EDIT_HH
    UPDATE_OK -- Yes --> SAVE_CHANGES[Save Household Changes]
    SAVE_CHANGES --> DETAIL

    DETAIL_ACTION -- Add Member --> ADD_MEMBER[Open Add Member Form]
    ADD_MEMBER --> MEMBER_FORM[Enter Name, Birthdate, Gender, Relationship, Civil Status, Occupation]
    MEMBER_FORM --> MEMBER_OK{Member Form Valid?}
    MEMBER_OK -- No --> MEMBER_ERROR[Show Member Errors]
    MEMBER_ERROR --> MEMBER_FORM
    MEMBER_OK -- Yes --> SAVE_MEMBER[Save Member]
    SAVE_MEMBER --> DETAIL

    DETAIL_ACTION -- Edit Member --> EDIT_MEMBER[Open Edit Member Form]
    EDIT_MEMBER --> UPDATE_MEMBER[Update Member Details]
    UPDATE_MEMBER --> SAVE_MEMBER_CHANGES[Save Member Changes]
    SAVE_MEMBER_CHANGES --> DETAIL

    DETAIL_ACTION -- Update Health Flags --> HEALTH_FLAGS[Open Health Monitoring Fields]
    HEALTH_FLAGS --> SET_FLAGS[Set PWD, Pregnant, Chronic Illness, Follow-Up, Notes]
    SET_FLAGS --> SAVE_FLAGS[Save Health Flags]
    SAVE_FLAGS --> DETAIL

    DETAIL_ACTION -- Remove Member --> REMOVE_MEMBER[Open Removal Confirmation]
    REMOVE_MEMBER --> REASON{Reason?}
    REASON -- Moved Out --> MOVED[Mark Member as Moved Out]
    REASON -- Deceased --> DECEASED[Mark Member as Deceased]
    MOVED --> DETAIL
    DECEASED --> DETAIL

    DETAIL_ACTION -- Back to List --> LIST
    ACTION -- Sign Out --> END([End])
```

## 4. Admin Account and Review Flow

```mermaid
flowchart TD
    START([Start]) --> LOGIN[Admin Opens Login Page]
    LOGIN --> ENTER[Enter Admin Credentials]
    ENTER --> VALID{Credentials Correct?}

    VALID -- No --> ERROR[Show Login Error]
    ERROR --> ENTER
    VALID -- Yes --> DASHBOARD[Admin Dashboard]

    DASHBOARD --> PATH{Choose Admin Path}
    PATH -- User Accounts --> USERS[Open User Accounts]
    PATH -- Location Review --> REVIEW[Open Location Review]
    PATH -- API Health --> HEALTH[Open API Health]
    PATH -- System Modules --> MODULES[Open Households, Vulnerability, Distribution, Inventory, Reports, or Field Response]
    PATH -- Sign Out --> END([End])

    USERS --> ACCOUNT_ACTION{Account Action?}
    ACCOUNT_ACTION -- Create Staff Account --> CREATE[Open Create Account Form]
    CREATE --> ROLE[Select Role: Admin, Encoder, Health Worker, or Responder]
    ROLE --> DETAILS[Enter Name, Email, Barangay Scope, and Status]
    DETAILS --> FORM_OK{Form Valid?}
    FORM_OK -- No --> FORM_ERROR[Show Account Errors]
    FORM_ERROR --> CREATE
    FORM_OK -- Yes --> SAVE_ACCOUNT[Create Account and Send Setup Link]
    SAVE_ACCOUNT --> USERS

    ACCOUNT_ACTION -- Edit Account --> OPEN_ACCOUNT[Open Existing Account]
    OPEN_ACCOUNT --> EDIT_ACCOUNT[Update Name, Email, Role, Scope, or Status]
    EDIT_ACCOUNT --> SAVE_EDIT[Save Changes]
    SAVE_EDIT --> USERS

    ACCOUNT_ACTION -- Deactivate or Reactivate --> STATUS[Change Account Status]
    STATUS --> USERS

    ACCOUNT_ACTION -- Delete Account --> DELETE_CONFIRM[Open Delete Confirmation]
    DELETE_CONFIRM --> DELETE_OK{Confirm Permanent Delete?}
    DELETE_OK -- No --> USERS
    DELETE_OK -- Yes --> DELETE[Delete Account]
    DELETE --> USERS

    ACCOUNT_ACTION -- Back --> DASHBOARD

    REVIEW --> TABS[Review Dashboard Tabs]
    TABS --> QUEUE{Select Queue?}
    QUEUE -- Pending --> PENDING[Open Pending Queue]
    QUEUE -- Approved --> APPROVED[Open Approved Queue]
    QUEUE -- Rejected --> REJECTED[Open Rejected Queue]
    QUEUE -- Needs Correction --> NEEDS[Open Needs Correction Queue]

    PENDING --> FILTER[Search Applicant / Filter Map Pin QA]
    APPROVED --> FILTER
    REJECTED --> FILTER
    NEEDS --> FILTER
    FILTER --> SELECT[Select Registration Record]
    SELECT --> INSPECT[Review Applicant Info, Members, Address, Document, and Map Pin]
    INSPECT --> NOTES[Edit Review Notes, Directions, Location Verified, and Map Pin QA]
    NOTES --> DECISION{Review Decision?}

    DECISION -- Approve and Next --> BLOCKERS{Approval Blockers?}
    BLOCKERS -- Yes --> BLOCKED[Show Blocker Message]
    BLOCKED --> NOTES
    BLOCKERS -- No --> APPROVE[Mark Approved and Move to Next Record]
    APPROVE --> TABS

    DECISION -- Request Update --> REQUEST_UPDATE[Mark Needs Correction and Move to Next Record]
    REQUEST_UPDATE --> TABS

    DECISION -- Reject and Next --> REJECT[Mark Rejected and Move to Next Record]
    REJECT --> TABS

    REVIEW --> MASTER[Open Approved Master List]
    MASTER --> MASTER_TABLE[View Approved ID, Name, Map Pin, Address, Location, Status, and Approval Date]
    MASTER_TABLE --> REVIEW

    HEALTH --> HEALTH_STATUS[View Service Readiness and Integration Status]
    HEALTH_STATUS --> DASHBOARD
    MODULES --> DASHBOARD
```

## 5. Encoder Staff Flow

```mermaid
flowchart TD
    START([Start]) --> LOGIN[Encoder Opens Login Page]
    LOGIN --> ENTER[Enter Staff Credentials]
    ENTER --> VALID{Credentials Correct?}

    VALID -- No --> ERROR[Show Login Error]
    ERROR --> ENTER
    VALID -- Yes --> DASHBOARD[Staff Dashboard]

    DASHBOARD --> PATH{Choose Module?}
    PATH -- Households --> HOUSEHOLDS[Open Households]
    PATH -- Vulnerability --> VULNERABILITY[Open Vulnerability]
    PATH -- Distribution --> DISTRIBUTION[Open Distribution]
    PATH -- Inventory --> INVENTORY[Open Inventory]
    PATH -- Reports --> REPORTS[Open Reports]
    PATH -- Sign Out --> END([End])

    HOUSEHOLDS --> CREATE{Create New Household?}
    CREATE -- Yes --> ADD[Open Add Household Form]
    ADD --> SAVE[Save Household]
    SAVE --> HOUSEHOLDS
    CREATE -- No --> DETAIL[Open Household Details]
    DETAIL --> MANAGE{Manage Resident?}
    MANAGE -- Add or Update --> RESIDENT[Add or Update Resident]
    RESIDENT --> DETAIL
    MANAGE -- Back --> HOUSEHOLDS

    VULNERABILITY --> DASHBOARD
    DISTRIBUTION --> DASHBOARD
    INVENTORY --> DASHBOARD
    REPORTS --> DASHBOARD
```

## 6. Health Worker Staff Flow

```mermaid
flowchart TD
    START([Start]) --> LOGIN[Health Worker Opens Login Page]
    LOGIN --> ENTER[Enter Staff Credentials]
    ENTER --> VALID{Credentials Correct?}

    VALID -- No --> ERROR[Show Login Error]
    ERROR --> ENTER
    VALID -- Yes --> DASHBOARD[Staff Dashboard]

    DASHBOARD --> PATH{Choose Work Area?}
    PATH -- Vulnerability --> VULNERABILITY[Open Vulnerability]
    PATH -- Household Details --> HOUSEHOLD[Open Household Details]
    PATH -- Sign Out --> END([End])

    VULNERABILITY --> PROFILES[Review Resident Risk Profiles]
    PROFILES --> NEEDS_UPDATE{Needs Health Flag Update?}
    NEEDS_UPDATE -- Yes --> UPDATE_FLAGS[Update Health-Related Flags]
    UPDATE_FLAGS --> VULNERABILITY
    NEEDS_UPDATE -- No --> DASHBOARD

    HOUSEHOLD --> MONITORING[Update Resident Health Monitoring]
    MONITORING --> HOUSEHOLD
```

## 7. Responder Field Response Flow

```mermaid
flowchart TD
    START([Start]) --> LOGIN[Responder Opens Login Page]
    LOGIN --> ENTER[Enter Staff Credentials]
    ENTER --> VALID{Credentials Correct?}

    VALID -- No --> ERROR[Show Login Error]
    ERROR --> RETRY((Retry Login))
    RETRY --> ENTER

    VALID -- Yes --> DASHBOARD[Open Field Response Dashboard]
    DASHBOARD --> WEATHER[View Live Weather and Operations Panel]
    DASHBOARD --> MAP[View Response Map]
    MAP --> MAP_CONTROLS[Use Map Controls and Risk Filters]
    MAP_CONTROLS --> MAP_LOOP((Refresh Map View))
    MAP_LOOP --> MAP

    DASHBOARD --> TAB{Choose Field Response Tab?}

    TAB -- Incidents --> INCIDENTS[Open Incidents Tab]
    INCIDENTS --> INCIDENT_LIST[View Active Incident List]
    INCIDENT_LIST --> SELECT_INCIDENT[Select Incident]
    SELECT_INCIDENT --> INCIDENT_DETAILS[View Severity, Location, Context, and Notes]
    INCIDENT_DETAILS --> STATUS_DECISION{Update Incident Status?}
    STATUS_DECISION -- Reported --> STATUS_REPORTED[Set Status to Reported]
    STATUS_DECISION -- Verified --> STATUS_VERIFIED[Set Status to Verified]
    STATUS_DECISION -- Responding --> STATUS_RESPONDING[Set Status to Responding]
    STATUS_DECISION -- Resolved --> STATUS_RESOLVED[Set Status to Resolved]
    STATUS_DECISION -- No --> KEEP_STATUS[Keep Current Status]
    STATUS_REPORTED --> INCIDENT_LIST
    STATUS_VERIFIED --> INCIDENT_LIST
    STATUS_RESPONDING --> INCIDENT_LIST
    STATUS_RESOLVED --> INCIDENT_LIST
    KEEP_STATUS --> NAV_INCIDENT{Navigate to Incident?}
    INCIDENT_DETAILS --> NAV_INCIDENT
    NAV_INCIDENT -- Yes --> INCIDENT_DIRECTIONS[Open Map Directions]
    NAV_INCIDENT -- No --> INCIDENT_LIST
    INCIDENT_DIRECTIONS --> INCIDENT_LIST

    TAB -- Alert Suggestions --> SUGGESTIONS[Open Alert Suggestions Tab]
    SUGGESTIONS --> SUGGESTION_LIST[View Suggested Cases from Disaster Alerts]
    SUGGESTION_LIST --> SUGGESTION_DETAILS[Open Suggestion Details]
    SUGGESTION_DETAILS --> CREATE_FROM_ALERT{Create Incident from Alert?}
    CREATE_FROM_ALERT -- No --> SUGGESTIONS
    CREATE_FROM_ALERT -- Yes --> CREATE_CASE[Open Create Responder Case]
    CREATE_CASE --> CONFIRM_CASE[Confirm Hazard, Area, Severity, and Context]
    CONFIRM_CASE --> CASE_OK{Case Details Correct?}
    CASE_OK -- No --> CREATE_CASE
    CASE_OK -- Yes --> CREATE_INCIDENT[Create Incident]
    CREATE_INCIDENT --> INCIDENTS

    TAB -- Priority Households --> PRIORITIES[Open Priority Households Tab]
    PRIORITIES --> PRIORITY_LIST[View Vulnerable or High-Risk Households]
    PRIORITY_LIST --> SELECT_HOUSEHOLD[Select Household]
    SELECT_HOUSEHOLD --> HOUSEHOLD_RISK[View Household Risk Summary]
    HOUSEHOLD_RISK --> NAV_HOUSEHOLD{Navigate to Household?}
    NAV_HOUSEHOLD -- GPS Available --> COORD_DIRECTIONS[Open Directions by Coordinates]
    NAV_HOUSEHOLD -- No GPS --> ADDRESS_DIRECTIONS[Open Directions by Address]
    NAV_HOUSEHOLD -- Stay --> PRIORITIES
    COORD_DIRECTIONS --> PRIORITIES
    ADDRESS_DIRECTIONS --> PRIORITIES

    TAB -- Events --> EVENTS[Open Ongoing Distribution Events Tab]
    EVENTS --> EVENT_LIST[View Active Relief or Operations Events]
    EVENT_LIST --> NAV_EVENT{Navigate to Event Location?}
    NAV_EVENT -- Yes --> EVENT_DIRECTIONS[Open Event Directions]
    NAV_EVENT -- No --> EVENTS
    EVENT_DIRECTIONS --> EVENTS

    TAB -- Flood Zones --> ZONES[Open Flood Zones Tab]
    ZONES --> PUROK_PROFILES[View Purok Risk Profiles]
    PUROK_PROFILES --> FLOOD_STATUS{Update Flood Control Status?}
    FLOOD_STATUS -- Yes --> SET_FLOOD_STATUS[Select Protected, Partial, None, or Unknown]
    SET_FLOOD_STATUS --> PUROK_PROFILES
    FLOOD_STATUS -- No --> EDIT_NOTES{Edit Zone Notes?}
    EDIT_NOTES -- Yes --> ZONE_NOTES[Update Evacuation Site, Warning Notes, and Control Notes]
    ZONE_NOTES --> PUROK_PROFILES
    EDIT_NOTES -- No --> ZONES

    TAB -- Sign Out --> END([End])
    WEATHER --> DASHBOARD_CONNECTOR((Dashboard Ready))
    DASHBOARD_CONNECTOR --> TAB
```

## 8. Role Access Summary

```text
Resident
- Login
- Register
- Verify Email
- Resident Portal
- New Household Registration
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
- Alerts

Encoder
- Dashboard
- Households
- Household Details
- Resident Add/Edit
- Vulnerability
- Distribution
- Inventory
- Reports

Health Worker
- Dashboard
- Vulnerability
- Household Details
- Health Monitoring Flags

Responder
- Field Response Dashboard
- Incidents
- Alert Suggestions
- Priority Households
- Ongoing Events
- Flood Zones
- Response Map
```
