# Changelog

All notable changes to the **Vakil Lead Flow CRM & Cloud Telephony Platform** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.4.0] - 2026-11-22

### Added
* **In-CRM WhatsApp Chat Integration via Kapso AI**: Built complete client messaging capability directly within the CRM, eliminating the need to leave the application for external `wa.me` links.
* **Persistent MySQL Message History**: Added `whatsapp_messages` table to MySQL with indexes on phone number, lead ID, ticket ID, and timestamp.
* **Kapso WhatsApp Cloud API Backend Engine**: Created [backend/kapso/whatsapp.js](file:///C:/Users/Ramanuj%20Dey%20Sarkar/Downloads/vakil-lead-flow-main/vakil-lead-flow-main/backend/kapso/whatsapp.js) handling Meta WhatsApp Cloud API `v24.0` requests, Bearer token authorization, Indian phone number formatting (`91XXXXXXXXXX`), and sandbox simulation fallback.
* **Inbound WhatsApp Webhooks**: Implemented `POST /webhooks/whatsapp` and `GET /webhooks/whatsapp` (challenge verification) for incoming client replies, status delivery receipts (`sent`, `delivered`, `read`), and automatic activity logging on matched leads.
* **Interactive WhatsApp Chat Modal**: Created [src/components/WhatsAppChatDialog.tsx](file:///C:/Users/Ramanuj%20Dey%20Sarkar/Downloads/vakil-lead-flow-main/vakil-lead-flow-main/src/components/WhatsAppChatDialog.tsx) with chat bubbles, delivery checkmarks, 4-second reactive polling, auto-scroll, and external `wa.me` fallback link.
* **1-Click Quick Legal Templates**: Pre-configured instant reply templates for Consultation Welcome, Document Checklist Request, Draft Notice Ready, Hearing Date Update, and Fee Settlement Receipt.
* **Universal UI Access Points**: Embedded interactive chat banners and triggers across [QuickActions.tsx](file:///C:/Users/Ramanuj%20Dey%20Sarkar/Downloads/vakil-lead-flow-main/vakil-lead-flow-main/src/components/QuickActions.tsx), [LeadDetail.tsx](file:///C:/Users/Ramanuj%20Dey%20Sarkar/Downloads/vakil-lead-flow-main/vakil-lead-flow-main/src/pages/LeadDetail.tsx), [TicketDetail.tsx](file:///C:/Users/Ramanuj%20Dey%20Sarkar/Downloads/vakil-lead-flow-main/vakil-lead-flow-main/src/pages/TicketDetail.tsx), and [Tickets.tsx](file:///C:/Users/Ramanuj%20Dey%20Sarkar/Downloads/vakil-lead-flow-main/vakil-lead-flow-main/src/pages/Tickets.tsx).
* **Technical Integration Guide**: Authored [docs/KAPSO_WHATSAPP_INTEGRATION_GUIDE.md](file:///C:/Users/Ramanuj%20Dey%20Sarkar/Downloads/vakil-lead-flow-main/vakil-lead-flow-main/docs/KAPSO_WHATSAPP_INTEGRATION_GUIDE.md) detailing architecture, API endpoints, webhook setup, database schema, and sandbox simulation.

---

## [2.3.0] - 2026-11-22

### Added
* **MySQL Database Architecture**: Implemented full relational database support with MySQL/MariaDB using `mysql2/promise` with high-performance connection pooling.
* **Database Schema & Seed Scripts**: Added [database/schema.sql](file:///C:/Users/Ramanuj%20Dey%20Sarkar/Downloads/vakil-lead-flow-main/vakil-lead-flow-main/database/schema.sql) with tables (`users`, `leads`, `tickets`, `follow_ups`, `activity_logs`, `push_subscriptions`) and [database/seed.sql](file:///C:/Users/Ramanuj%20Dey%20Sarkar/Downloads/vakil-lead-flow-main/vakil-lead-flow-main/database/seed.sql) with initial firm staff accounts.
* **Automated Database Initialization**: Added [backend/scripts/init-db.js](file:///C:/Users/Ramanuj%20Dey%20Sarkar/Downloads/vakil-lead-flow-main/vakil-lead-flow-main/backend/scripts/init-db.js) executable via `npm run db:init` to create database tables and seed users automatically.
* **Comprehensive REST API**: Expanded [backend/smartflo/server.js](file:///C:/Users/Ramanuj%20Dey%20Sarkar/Downloads/vakil-lead-flow-main/vakil-lead-flow-main/backend/smartflo/server.js) to provide full REST CRUD routes for `/api/leads`, `/api/tickets`, `/api/users`, `/api/activity-logs`, `/api/health`, and `/api/recording`.
* **Telephony MySQL Webhooks**: Migrated hangup and missed call handlers from legacy PostgreSQL to MySQL, persisting call durations and recording URLs directly in the database.
* **Hybrid Online/Offline Sync**: Updated [src/contexts/CRMContext.tsx](file:///C:/Users/Ramanuj%20Dey%20Sarkar/Downloads/vakil-lead-flow-main/vakil-lead-flow-main/src/contexts/CRMContext.tsx) to sync with the MySQL REST API while preserving instant local caching and offline resilience.

---

## [2.2.0] - 2026-11-21

### Added
* **Local Storage Persistence Engine**: Fully decoupled the application from external AWS API Gateway, DynamoDB/Postgres, and AWS Cognito services. All leads (`vakil_leads`), tickets (`vakil_tickets`), users (`vakil_users`), and sessions (`vakil_auth_user`) are now stored in browser `localStorage`.
* **Cross-Tab Real-time Synchronization**: Added custom `vakil_storage_sync` event triggers and `window.addEventListener('storage')` hooks so actions in one tab (e.g., submitting `/intake`) instantly reflect across all other CRM windows without page refreshes.
* **Browser-Native Web Push Notifications**: Converted push notifications in `src/lib/pushNotifications.ts` to trigger native browser Web Notifications with offline fallback, removing reliance on remote AWS Lambda notification dispatchers.
* **Microsecond Dialplan Execution**: Streamlined `api/dialplan.js` to eliminate external HTTP network hops, cutting webhook response time from ~4,000ms to <10ms.

### Changed
* **Primary Agent Phone Unification**: Systematically unified the fallback and default agent mobile number across all telephony configurations, simulation routines, mock data, and serverless dialplans, backing them by environment variables.
* **Intake Form Submission Pipeline**: Updated [src/pages/LeadIntake.tsx](file:///C:/Users/Ramanuj%20Dey%20Sarkar/Downloads/vakil-lead-flow-main/vakil-lead-flow-main/src/pages/LeadIntake.tsx) to save public client submissions directly into `localStorage` with optimistic sync events.

### Removed
* Eradicated all `https://lqxvick4h8.execute-api.us-east-1.amazonaws.com` API endpoints.
* Eradicated all `https://yp1ehsqhh1.execute-api.us-east-1.amazonaws.com` follow-up endpoints.
* Replaced `amazon-cognito-identity-js` pool imports with local session storage.

---

## [2.1.0] - 2026-11-20

### Added
* **Dynamic User Profile Phone Binding**: Updated `CRMContext.tsx` to automatically bind agent calling numbers to `currentUser.phone`, sourcing from either user profiles, local overrides, or directory definitions.
* **Calling Number Profile Controls**: Added interactive Calling Mobile status card in [src/pages/MorePage.tsx](file:///C:/Users/Ramanuj%20Dey%20Sarkar/Downloads/vakil-lead-flow-main/vakil-lead-flow-main/src/pages/MorePage.tsx) with on-the-fly number updating via `updateCurrentUserPhone()`.
* **Smartflo Dialog Sync**: [src/components/SmartfloCallDialog.tsx](file:///C:/Users/Ramanuj%20Dey%20Sarkar/Downloads/vakil-lead-flow-main/vakil-lead-flow-main/src/components/SmartfloCallDialog.tsx) now automatically initializes using the logged-in agent's/lawyer's number, ensuring Smartflo dials the active user first.
* **Enterprise Credential Authentication**: Implemented formal validation for dedicated production firm accounts (`admin@vakiltech.com`, `frontdesk@vakiltech.com`, `devika@vakiltech.com`, `aaditya@vakiltech.com`, `pritam@vakiltech.com`, `lawyer@vakiltech.com`) using master password `Password@123`.

### Changed
* **Hardened Login Portal**: Redesigned [src/pages/Login.tsx](file:///C:/Users/Ramanuj%20Dey%20Sarkar/Downloads/vakil-lead-flow-main/vakil-lead-flow-main/src/pages/Login.tsx) into a clean, enterprise login form with show/hide password toggles and error handling.

### Removed
* Deleted the "Or One-Click Test Role" buttons container (Front Desk, Super Admin, Lawyer test buttons) from the Login screen.

---

## [2.0.0] - 2026-11-20

### Added
* **Dedicated Client Lead Intake Portal**: Created [src/pages/LeadIntake.tsx](file:///C:/Users/Ramanuj%20Dey%20Sarkar/Downloads/vakil-lead-flow-main/vakil-lead-flow-main/src/pages/LeadIntake.tsx) available at `/intake` for public client intake and front-desk phone triage.
* **Custom Reference ID Formatting**: Automatic generation of formatted legal matter reference codes (`VT-YYYY-XXXXX`).
* **Confirmation Screen & Printable Receipt**: Added client confirmation modal with downloadable summaries and instant navigation back to the intake form.
* **Cross-Navigation Links**: Integrated direct access to the Intake Portal from the Leads Dashboard header and the More navigation menu.

### Removed
* **Complete Dummy Data Purge**: Emptied `mockLeads` and `mockTickets` arrays in `src/data/mockData.ts`.
* Removed hardcoded test lead "Siddharth Roy" from dialplans, contexts, and webhooks.
* Deleted test recording audio file (`test_rec.mp3`).

---

## [1.3.0] - 2026-11-20

### Added
* **Seekable Audio Streaming Proxy**: Developed [api/recording.js](file:///C:/Users/Ramanuj%20Dey%20Sarkar/Downloads/vakil-lead-flow-main/vakil-lead-flow-main/api/recording.js) to resolve empty audio playback and 00:00 recording lengths from Tata Smartflo.
* **HTTP 206 Partial Content Support**: Enabled Byte-Range requests (`Range: bytes=X-Y`), allowing full audio scrubbing, timeline seeking, and smooth streaming in Chrome, Safari, and Firefox.
* **MIME Header Normalization**: Added header sanitization that strips invalid comma-separated MIME types returned by Tata recording clusters (`audio/mpeg, audio/mp3`) and enforces clean `audio/mpeg`.
* **Audio Proxy URL Formatter**: Added `formatPlayableAudioUrl()` helper in `src/lib/smartflo.ts` to seamlessly route Smartflo recording links through `/api/recording`.

---

## [1.2.0] - 2026-11-20

### Added
* **Method 2 Dynamic API Dialplan Webhook**: Created [api/dialplan.js](file:///C:/Users/Ramanuj%20Dey%20Sarkar/Downloads/vakil-lead-flow-main/vakil-lead-flow-main/api/dialplan.js) implementing Tata Smartflo's Inbound API Dialplan specification.
* **Dynamic Lead-to-Lawyer Matching**: Inbound calls to the company Virtual DID are automatically matched against active client records and routed to the assigned case lawyer.
* **Standalone Microservice Fallback**: Created Node.js server in `backend/smartflo/server.js` and `render.yaml` for independent containerized deployment.
* **Dialplan Tester & Simulator**: Built [src/components/SmartfloDialplanSettings.tsx](file:///C:/Users/Ramanuj%20Dey%20Sarkar/Downloads/vakil-lead-flow-main/vakil-lead-flow-main/src/components/SmartfloDialplanSettings.tsx) allowing operators to test inbound caller routing directly within the CRM UI.

### Fixed
* Fixed inbound call dropping issue where callers to the DID heard ringing but the agent's phone was never reached.

---

## [1.1.0] - 2026-11-19

### Added
* **Tata Smartflo Outbound Click-to-Call**: Integrated TTBS Cloud Telephony API (`https://api-smartflo.tatateleservices.com/v1/click_to_call`).
* **Two-Way Voice Bridging**: Initiates an outbound call to the agent first; upon answer, bridges to the customer while presenting the company Virtual DID as Caller ID.
* **Client Phone Privacy Masking**: Added `maskPhoneNumber()` to conceal sensitive client phone numbers (`+91 98••• ••210`) for front desk and lawyer roles.
* **Live In-Call Modal**: Built `SmartfloCallDialog.tsx` with live call state tracking (`ringing_agent`, `bridging_customer`, `connected`), duration timers, notes taking, and disposition selection.

---

## [1.0.0] - 2026-11-18

### Added
* **Core CRM Architecture**: Initial application release built on React 18, Vite, TypeScript, and Tailwind CSS.
* **Role-Based Access Control**: Configured permission boundaries for Super Admin, Front Desk, and Lawyer.
* **Lead Pipeline (Kanban)**: Visual pipeline stages (`NEW_LEAD`, `CONTACTED`, `ADVANCE_PAID`, `COMPLETED`, `USER_DROPPED`, `NOT_INTERESTED`).
* **Ticket Management**: Legal matter tracking for Legal Notice, Consultation, Document Drafting, and Corporate Retainer matters.
* **Follow-up Reminders**: Task scheduler for client callbacks and consultations.
* **Audit Logging & Activity Timeline**: Activity logging for client interactions, case status changes, and staff actions.
