# Vakil Lead Flow — Legal CRM & Cloud Telephony Platform

[![Production Status](https://img.shields.io/badge/Production-Live-success)](https://vakil-lead-flow-main.vercel.app)
[![Vercel Deployment](https://img.shields.io/badge/Deployed%20with-Vercel-black)](https://vakil-lead-flow-main.vercel.app)
[![React 18](https://img.shields.io/badge/React-18.3.1-blue)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-7.3-purple)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-3.4-38bdf8)](https://tailwindcss.com/)
[![Tata Smartflo](https://img.shields.io/badge/Telephony-Tata%20Smartflo-red)](https://docs.smartflo.tatatelebusiness.com/)

**Vakil Lead Flow** is an enterprise-grade Legal Practice Management & Cloud Telephony CRM built for modern law firms, advocates, and legal advisory teams. It provides end-to-end client intake, matter management, follow-up scheduling, and seamless two-way voice bridging powered by **Tata Tele Business Services (Smartflo)**.

---

## 🌐 Live Production Links

* 🏛️ **CRM Portal**: [https://vakil-lead-flow-main.vercel.app](https://vakil-lead-flow-main.vercel.app)
* 📋 **Public Lead Intake Portal**: [https://vakil-lead-flow-main.vercel.app/intake](https://vakil-lead-flow-main.vercel.app/intake)
* 🔐 **Login Page**: [https://vakil-lead-flow-main.vercel.app/login](https://vakil-lead-flow-main.vercel.app/login)
* 📞 **Tata Smartflo Dialplan Endpoint**: `https://vakil-lead-flow-main.vercel.app/api/dialplan`
* 🎙️ **Seekable Audio Recording Proxy**: `https://vakil-lead-flow-main.vercel.app/api/recording`

---

## 🔑 Quick Login Credentials

All firm accounts authenticate using master password **`Password@123`**:

| Role | User ID / Login Email | Password | Name | Assigned Calling Mobile |
| :--- | :--- | :--- | :--- | :--- |
| **Super Admin** | `admin@vakiltech.com` | `Password@123` | Priya Sharma | `+91 9800000001` |
| **Front Desk** | `frontdesk@vakiltech.com` | `Password@123` | Rahul Verma | `+91 9800000002` |
| **Senior Lawyer** | `devika@vakiltech.com` | `Password@123` | Adv. Devika | `+91 9800000003` |
| **Corporate Lawyer** | `pritam@vakiltech.com` | `Password@123` | Adv. Pritam Banik | `+91 9800000004` |
| **Litigation Lawyer** | `aaditya@vakiltech.com` | `Password@123` | Adv. Aaditya | `+91 9800000005` |
| **General Lawyer** | `lawyer@vakiltech.com` | `Password@123` | Adv. Meera Patel | `+91 9800000006` |

> [!TIP]
> You can enter either the full email address or just the short role ID (e.g. `admin`, `frontdesk`, `devika`, `pritam`, `aaditya`, `lawyer`).

---

## 📚 Complete Documentation Suite

Comprehensive technical, operational, and architectural documentation is available in the [`docs/`](file:///C:/Users/Ramanuj%20Dey%20Sarkar/Downloads/vakil-lead-flow-main/vakil-lead-flow-main/docs/) directory:

| Document | Purpose & Scope |
| :--- | :--- |
| 📜 **[TIMELINE.md](file:///C:/Users/Ramanuj%20Dey%20Sarkar/Downloads/vakil-lead-flow-main/vakil-lead-flow-main/docs/TIMELINE.md)** | **Engineering Evolution Timeline**: In-depth history across Phases 1 through 9 covering telephony diagnostics, recording fixes, AWS decoupling, and number migration. |
| 🏷️ **[CHANGELOG.md](file:///C:/Users/Ramanuj%20Dey%20Sarkar/Downloads/vakil-lead-flow-main/vakil-lead-flow-main/docs/CHANGELOG.md)** | **Release Notes (SemVer)**: Full version history from `v1.0.0` to `v2.2.0` documenting Added, Changed, Fixed, and Removed items. |
| 🏛️ **[ARCHITECTURE.md](file:///C:/Users/Ramanuj%20Dey%20Sarkar/Downloads/vakil-lead-flow-main/vakil-lead-flow-main/docs/ARCHITECTURE.md)** | **System Architecture**: High-level design, `localStorage` schema, cross-tab reactive synchronization engine, and RBAC matrix. |
| 📞 **[TELEPHONY_INTEGRATION_GUIDE.md](file:///C:/Users/Ramanuj%20Dey%20Sarkar/Downloads/vakil-lead-flow-main/vakil-lead-flow-main/docs/TELEPHONY_INTEGRATION_GUIDE.md)** | **Tata Smartflo Guide**: Pilot DID configuration, click-to-call bridging, dynamic `/api/dialplan` webhook spec, and `/api/recording` audio streaming proxy. |
| 📖 **[USER_AND_ADMIN_MANUAL.md](file:///C:/Users/Ramanuj%20Dey%20Sarkar/Downloads/vakil-lead-flow-main/vakil-lead-flow-main/docs/USER_AND_ADMIN_MANUAL.md)** | **Operations Manual**: User guide for leads, tickets, follow-ups, click-to-call dialing, and changing profile calling numbers. |
| 👥 **[USER_ROLES_AND_WORKFLOWS.md](file:///C:/Users/Ramanuj%20Dey%20Sarkar/Downloads/vakil-lead-flow-main/vakil-lead-flow-main/docs/USER_ROLES_AND_WORKFLOWS.md)** | **Roles & Userflows**: Granular permissions matrix (Super Admin, Front Desk, Lawyer, Client) and step-by-step userflows with sequence diagrams. |
| 🚀 **[DEPLOYMENT_AND_RUNBOOK.md](file:///C:/Users/Ramanuj%20Dey%20Sarkar/Downloads/vakil-lead-flow-main/vakil-lead-flow-main/docs/DEPLOYMENT_AND_RUNBOOK.md)** | **Operations Runbook**: Vercel deployment, local dev setup, JSON data export/backup scripts, and disaster recovery. |

---

## ⚡ Key Platform Capabilities

### 1. Two-Way Outbound Voice Bridging
* Integrated with Tata Smartflo Virtual Pilot DID.
* When an advocate clicks **Call Lead**, Smartflo rings the advocate's registered mobile first.
* Once answered, Smartflo dials the client showing the firm's DID. Personal lawyer numbers are never exposed.

### 2. Method 2 Dynamic Inbound Dialplan Webhook
* Inbound calls to the Virtual DID consult our serverless webhook at `/api/dialplan` in real time.
* The dialplan resolves active legal matters and forwards the call directly to the assigned advocate.

### 3. Seekable Call Recording Streaming Proxy
* Call recordings from Tata's media servers stream through `/api/recording`.
* Enforces HTTP 206 Partial Content range requests and strips corrupt MIME types, enabling audio scrubbing, seeking, and instant downloads.

### 4. Client Lead Intake Portal (`/intake`)
* Public self-service form for walk-ins and web inquiries with automatic reference code generation (`VT-YYYY-XXXXX`).
* Real-time cross-tab synchronization triggers instant updates on staff dashboards without page reloads.

### 5. MySQL Database & Hybrid LocalStorage Engine
* Complete MySQL relational database support powered by `mysql2/promise` with connection pooling.
* Automated database migration and seeding via `npm run db:init` ([database/schema.sql](file:///C:/Users/Ramanuj%20Dey%20Sarkar/Downloads/vakil-lead-flow-main/vakil-lead-flow-main/database/schema.sql)).
* Dual-tier resilience: live real-time sync with MySQL REST API (`npm run server`) + offline browser storage fallback.

---

## 💻 Local Development Quickstart

```bash
# 1. Clone repository
git clone https://github.com/rdsdd2021/vakil-lead-flow.git
cd vakil-lead-flow

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your MySQL settings (MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE)

# 4. Initialize MySQL schema & default accounts
npm run db:init

# 5. Start MySQL backend & Tata Smartflo webhook server (Port 3001)
npm run server

# 6. Start Vite frontend dev server (Port 8080)
npm run dev

# 7. Type checking & production build verification
npx tsc --noEmit
npm run build
```

---

## 📄 License & Intellectual Property
Proprietary software developed for legal practice management and client intake operations. All rights reserved.
