# Tata Tele Business Services (TTBS) Smartflo Integration Guide

This directory contains the production-ready AWS Lambda functions to connect **Vakil Lead Flow CRM** with **Tata Smartflo Cloud Telephony**.

Official Tata Smartflo API Reference: [https://docs.smartflo.tatatelebusiness.com/reference/introduction-to-apis-1](https://docs.smartflo.tatatelebusiness.com/reference/introduction-to-apis-1)

---

## 1. Features Implemented

1. **Number Masking**: Front-desk agents never see customer's real personal phone number in the UI. When placing calls, the company Virtual Pilot DID is displayed to both parties.
2. **Bi-directional Click-to-Call**: Agent clicks "Call" in the CRM. Smartflo dials the agent first, then bridges the customer.
3. **Automatic Call Recording Attachment**: Once the call hangs up, Smartflo sends the `recording_url` via webhook, which is attached to the lead's Activity Timeline with an in-CRM audio player.
4. **Sticky Agent Inbound Routing**: When a customer calls back on the virtual DID, Smartflo's API Dialplan queries our backend to dynamically route the call to the same agent who last handled the lead.
5. **Agent Busy / Missed Notification**: If the assigned agent is on another call or misses the callback, Smartflo triggers a webhook and fires an instant Web Push notification + in-CRM alert banner.

---

## 2. Tata Smartflo Dashboard Configuration

### Step A: Verify Token Permissions & Scopes
1. Log in to your **Smartflo Portal** (`https://smartflo.tatateleservices.com`).
2. Navigate to **Integrations** > **API Connect** > **API Tokens**.
3. Under the token settings, ensure **"Click to Call"** is enabled in the API Scope list. *(If omitted, Tata's API gateway rejects requests with "not allowed by policy")*.
4. If **IP Restrictions** are configured, add your server or development IP to the whitelist (or leave unrestricted).
5. Configured DID for this account: `<SMARTFLO_PILOT_NUMBER>` (e.g. `+91 79XXXXXXXX`).

### Step B: Configure Webhooks
1. In the Smartflo Portal, go to **API Connect** > **Webhook** > **Add Webhook**.
2. **Hangup Webhook (Recording URL Sync)**:
   - **Event Trigger**: `Call Hangup (Missed or Answered)`
   - **Method**: `POST`
   - **URL**: `https://<YOUR-API-GATEWAY>/webhooks/smartflo/hangup`
3. **Missed / Busy Webhook**:
   - **Event Trigger**: `Call Missed / Agent Busy`
   - **Method**: `POST`
   - **URL**: `https://<YOUR-API-GATEWAY>/webhooks/smartflo/missed`

### Step C: Configure Inbound DID for Sticky Routing
1. In Smartflo Portal, go to **Number** > **Select your Virtual DID**.
2. Under **Call Routing / Flow**, choose **API Dialplan**.
3. **API Endpoint URL**: `https://<YOUR-API-GATEWAY>/webhooks/smartflo/dialplan`
4. **Method**: `POST`

---

## 3. Lambda Environment Variables

Set the following environment variables in AWS Lambda:

| Variable | Description | Example |
| :--- | :--- | :--- |
| `SMARTFLO_API_TOKEN` | Bearer token from Smartflo portal | `<YOUR_SMARTFLO_JWT_TOKEN>` |
| `SMARTFLO_PILOT_NUMBER` | Virtual DID assigned by Tata Tele | `917900000000` |
| `DATABASE_URL` | PostgreSQL connection string | `postgres://user:pass@host:5432/vakil` |
| `VAPID_PUBLIC_KEY` | Public key for browser Web Push | `<YOUR_VAPID_PUBLIC_KEY>` |
| `VAPID_PRIVATE_KEY` | Private key for browser Web Push | `<Secret>` |

---

## 4. Lambda Function Handlers

- `smartflo-call-initiate.js` -> Triggered by `POST /calls/initiate`
- `smartflo-hangup-webhook.js` -> Triggered by `POST /webhooks/smartflo/hangup`
- `smartflo-dialplan-webhook.js` -> Triggered by `POST /webhooks/smartflo/dialplan`
- `smartflo-missed-webhook.js` -> Triggered by `POST /webhooks/smartflo/missed`
