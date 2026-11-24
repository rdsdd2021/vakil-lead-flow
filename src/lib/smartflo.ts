/**
 * Tata Tele Business Services (TTBS) Smartflo Cloud Telephony Integration
 * Documentation: https://docs.smartflo.tatatelebusiness.com/reference/introduction-to-apis-1
 */

import { UserRole } from '@/types/crm';

export interface SmartfloConfig {
  pilotNumber: string; // Virtual DID displayed to both customer & agent
  defaultAgentPhone: string; // Real agent mobile number
  apiBaseUrl: string;
  apiToken: string;
  enableNumberMasking: boolean;
}

export function getSmartfloDID(): string {
  if (typeof window !== 'undefined') {
    const custom = localStorage.getItem('smartflo_custom_did');
    if (custom && custom.trim()) {
      return custom.trim();
    }
  }
  return import.meta.env.VITE_SMARTFLO_PILOT_NUMBER || '917965561294';
}

export function setSmartfloDID(newDid: string): void {
  const clean = newDid.replace(/^\+/, '').replace(/\s/g, '');
  if (typeof window !== 'undefined') {
    localStorage.setItem('smartflo_custom_did', clean);
  }
  SMARTFLO_CONFIG.pilotNumber = clean;
}

export const SMARTFLO_CONFIG: SmartfloConfig = {
  pilotNumber: getSmartfloDID(),
  defaultAgentPhone: import.meta.env.VITE_SMARTFLO_DEFAULT_AGENT_PHONE || '9800000001',
  apiBaseUrl: import.meta.env.VITE_SMARTFLO_API_BASE_URL || 'https://api-smartflo.tatateleservices.com',
  apiToken: import.meta.env.VITE_SMARTFLO_JWT_TOKEN || import.meta.env.VITE_SMARTFLO_API_TOKEN || '',
  enableNumberMasking: true,
};

/**
 * Masks a phone number to protect customer & agent privacy.
 * Example: "919876543210" -> "+91 98••• ••210"
 * Super admin can view full number if requested.
 */
export function maskPhoneNumber(phone?: string | null, isSuperAdmin: boolean = false): string {
  if (!phone) return '••••••••••';
  if (isSuperAdmin) {
    return phone.startsWith('+') ? phone : `+${phone}`;
  }

  const cleaned = phone.replace(/^\+/, '').replace(/\s+/g, '');
  if (cleaned.length < 8) return '••••••••••';

  const prefix = cleaned.slice(0, 4); // Country code + first 2 digits (e.g. 9198)
  const suffix = cleaned.slice(-3);  // Last 3 digits (e.g. 210)
  return `+${prefix.slice(0, 2)} ${prefix.slice(2)}••• ••${suffix}`;
}

export type SmartfloCallStatus =
  | 'idle'
  | 'initiating'
  | 'ringing_agent'
  | 'bridging_customer'
  | 'connected'
  | 'completed'
  | 'rejected'
  | 'busy'
  | 'no_answer'
  | 'failed';

export interface SmartfloCallInitiateParams {
  leadId: string;
  leadName: string;
  agentId: string;
  agentName: string;
  agentPhoneOrExt?: string;
  customerNumber: string;
  serviceName?: string;
  callerId?: string;
}

export interface SmartfloCallResult {
  success: boolean;
  refId: string;
  callId: string;
  durationSeconds: number;
  recordingUrl?: string;
  status: SmartfloCallStatus;
  message?: string;
  simulated?: boolean;
}

export interface SmartfloCallRecord {
  id?: string;
  call_id: string;
  ref_id?: string;
  status: 'answered' | 'missed' | string;
  description?: string;
  reason?: string;
  hangup_cause?: string;
  call_duration: number;
  answered_seconds: number;
  recording_url?: string;
  client_number?: string;
  agent_number?: string;
  date?: string;
  time?: string;
  direction?: string;
}

// Sample audio recording for demo/preview testing
const SAMPLE_RECORDINGS = [
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
];

/**
 * Normalizes call recording URLs.
 * If URL points to Tata Smartflo (cloudphone.tatateleservices.com), routes it through
 * our dedicated /api/recording proxy to fix malformed MIME types, enable Range seeking,
 * and provide seamless streaming on Chrome, Edge, and Safari.
 */
export function formatPlayableAudioUrl(rawUrl?: string | null): string {
  if (!rawUrl) return '';
  if (rawUrl.startsWith('/api/recording')) {
    return rawUrl;
  }
  if (rawUrl.includes('cloudphone.tatateleservices.com/file/recording')) {
    return `/api/recording?url=${encodeURIComponent(rawUrl)}`;
  }
  return rawUrl;
}

/**
 * Initiates a bi-directional click-to-call via Tata Smartflo.
 * 1. Agent's phone/extension rings first from the company virtual DID.
 * 2. When agent picks up, Smartflo dials the customer displaying the DID.
 * 3. Both legs are bridged with recording active.
 */
export async function initiateSmartfloCall(
  params: SmartfloCallInitiateParams,
  onStateChange?: (status: SmartfloCallStatus, message: string) => void,
  forceSimulation: boolean = false
): Promise<SmartfloCallResult> {
  const { leadId, agentId, customerNumber, agentPhoneOrExt } = params;

  const cleanDestination = customerNumber.replace(/^\+/, '').replace(/\s/g, '').replace(/\D/g, '');
  const cleanCallerId = (params.callerId || getSmartfloDID()).replace(/^\+/, '').replace(/\s/g, '').replace(/\D/g, '');
  const cleanAgentNumber = (agentPhoneOrExt || SMARTFLO_CONFIG.defaultAgentPhone || '9800000001').replace(/^\+/, '').replace(/\s/g, '').replace(/\D/g, '');

  if (!forceSimulation) {
    onStateChange?.('initiating', `Triggering live call via Tata Smartflo (DID: ${cleanCallerId})...`);

    try {
      const directRes = await fetch('/api/smartflo/v1/click_to_call', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SMARTFLO_CONFIG.apiToken}`,
        },
        body: JSON.stringify({
          agent_number: cleanAgentNumber,
          destination_number: cleanDestination,
          caller_id: cleanCallerId,
          async: 1,
          custom_identifier: {
            lead_id: leadId,
            agent_id: agentId,
          },
        }),
      });

      const data = await directRes.json().catch(() => ({}));

      if (directRes.ok && data.success) {
        const refId = data.ref_id || data.call_id || '';
        onStateChange?.('ringing_agent', `Calling your phone (${cleanAgentNumber}) from ${cleanCallerId}. Pick up to connect!`);
        return {
          success: true,
          refId: refId,
          callId: data.call_id || refId || `tata_${Date.now()}`,
          durationSeconds: 0,
          status: 'ringing_agent',
          message: data.message || `Call placed! Tata Smartflo is ringing your phone (${cleanAgentNumber}) right now.`,
          simulated: false,
        };
      } else {
        const errMsg = data.error || data.message || 'Call request rejected by Tata Smartflo';
        onStateChange?.('failed', errMsg);
        return {
          success: false,
          refId: '',
          callId: '',
          durationSeconds: 0,
          status: 'failed',
          message: errMsg,
        };
      }
    } catch (err: any) {
      console.warn('Call request failed:', err);
      const errMsg = err?.message || 'Network error connecting to Tata Smartflo';
      onStateChange?.('failed', errMsg);
      return {
        success: false,
        refId: '',
        callId: '',
        durationSeconds: 0,
        status: 'failed',
        message: errMsg,
      };
    }
  }

  // Fallback / simulation mode ONLY if explicitly requested
  onStateChange?.('ringing_agent', `Simulation Mode: Ringing agent from DID ${SMARTFLO_CONFIG.pilotNumber}...`);

  return new Promise((resolve) => {
    setTimeout(() => {
      onStateChange?.('bridging_customer', `Agent answered. Bridging to ${maskPhoneNumber(customerNumber)}...`);

      setTimeout(() => {
        onStateChange?.('connected', 'Call connected! Recording active 🔴');

        resolve({
          success: true,
          refId: `sim_ref_${Date.now()}`,
          callId: `sf_${Date.now()}`,
          durationSeconds: 0,
          recordingUrl: SAMPLE_RECORDINGS[Math.floor(Math.random() * SAMPLE_RECORDINGS.length)],
          status: 'connected',
          message: 'Call simulated via Tata Smartflo test bridge',
          simulated: true,
        });
      }, 1500);
    }, 1200);
  });
}

/**
 * Checks for live active calls on Tata Smartflo.
 */
export async function fetchSmartfloLiveCalls(agentNumber?: string): Promise<any[]> {
  const cleanAgent = agentNumber ? agentNumber.replace(/\D/g, '').slice(-10) : '';
  const endpoints = [
    '/api/smartflo/v1/live_calls',
    '/api/smartflo/v1/click_to_call?action=live_calls',
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, {
        headers: {
          'Authorization': `Bearer ${SMARTFLO_CONFIG.apiToken}`,
          'Accept': 'application/json',
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          if (cleanAgent && data.length > 0) {
            const filtered = data.filter(c => JSON.stringify(c).includes(cleanAgent));
            if (filtered.length > 0) return filtered;
          }
          return data;
        }
      }
    } catch (e) {
      // try next endpoint
    }
  }
  return [];
}

/**
 * Fetches recent CDR records from Tata Smartflo to detect final status, duration & recording.
 * STRICT: Only matches the specific refId or a call started after callStartTime.
 */
export async function fetchSmartfloCallRecord(
  refId?: string,
  clientNumber?: string,
  callStartTime?: number
): Promise<SmartfloCallRecord | null> {
  const endpoints = [
    '/api/smartflo/v1/call/records?limit=15',
    '/api/smartflo/v1/click_to_call?action=records&limit=15',
  ];

  const cleanClient = clientNumber ? clientNumber.replace(/\D/g, '').slice(-10) : '';

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, {
        headers: {
          'Authorization': `Bearer ${SMARTFLO_CONFIG.apiToken}`,
          'Accept': 'application/json',
        },
      });
      if (res.ok) {
        const data = await res.json();
        const records: SmartfloCallRecord[] = data.results || [];

        // 1. Match by ref_id if available
        if (refId) {
          const match = records.find(r => r.ref_id === refId || r.call_id === refId);
          if (match) return match;
        }

        // 2. Also match by customer phone if record timestamp is after or around callStartTime
        if (cleanClient && callStartTime) {
          const match = records.find(r => {
            const num = (r.client_number || '').replace(/\D/g, '');
            if (!num.endsWith(cleanClient) && !cleanClient.endsWith(num.slice(-10))) return false;

            if (r.date && r.time) {
              const recordTime = new Date(`${r.date}T${r.time}`).getTime();
              // Allow up to 30s before callStartTime for PBX clock drift
              return recordTime >= (callStartTime - 30000);
            }
            return true;
          });
          if (match) return match;
        }
      }
    } catch (e) {
      // try next endpoint
    }
  }
  return null;
}

/**
 * Cleanly cancels or hangs up an active call on Tata Smartflo.
 */
export async function hangupSmartfloCall(refIdOrCallId: string): Promise<boolean> {
  const endpoints = [
    '/api/smartflo/v1/call/hangup',
    '/api/smartflo/v1/click_to_call?action=hangup',
    'https://api-smartflo.tatateleservices.com/v1/call/hangup',
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SMARTFLO_CONFIG.apiToken}`,
        },
        body: JSON.stringify({
          ref_id: refIdOrCallId,
          call_id: refIdOrCallId,
        }),
      });
      if (res.ok) {
        return true;
      }
    } catch (e) {
      // try next
    }
  }
  return false;
}

export interface DialplanSimulationResult {
  callerId: string;
  didNumber: string;
  matchedLead: {
    id: string;
    name: string;
    whatsapp_number: string;
    service?: string;
    assigned_lawyer_id?: string | null;
  } | null;
  targetAgent: {
    name: string;
    phone: string;
    role: string;
    reason: string;
  };
  smartfloResponse: any[];
}

// Static fallback directory for agents and lawyers
// Static fallback directory for agents and lawyers (placeholder sample numbers)
export const AGENT_PHONE_DIRECTORY: Record<string, { name: string; phone: string; role: string }> = {
  'admin': { name: 'Priya Sharma (Super Admin)', phone: '9800000001', role: 'Super Admin' },
  'frontdesk': { name: 'Rahul Verma', phone: '9800000002', role: 'Front Desk Lead' },
  'rahul': { name: 'Rahul Verma', phone: '9800000002', role: 'Front Desk Lead' },
  'devika': { name: 'Adv. Devika', phone: '9800000003', role: 'Senior Case Lawyer' },
  'aaditya': { name: 'Adv. Aaditya', phone: '9800000004', role: 'Litigation Lawyer' },
  'pritam': { name: 'Adv. Pritam Banik', phone: '9800000005', role: 'Corporate Lawyer' },
  'lawyer': { name: 'Adv. Meera Patel', phone: '9800000006', role: 'Corporate Lawyer' },
  'meera': { name: 'Adv. Meera Patel', phone: '9800000006', role: 'Corporate Lawyer' },
  'u1': { name: 'Priya Sharma (Super Admin)', phone: '9800000001', role: 'Super Admin' },
  'u2': { name: 'Rahul Verma', phone: '9800000002', role: 'Front Desk Lead' },
  'u3': { name: 'Adv. Meera Patel', phone: '9800000006', role: 'Corporate Lawyer' },
  'u4': { name: 'Adv. Arjun Singh', phone: '9800000007', role: 'Litigation Lawyer' },
};

/**
 * Method 2: Dynamic Inbound API Dialplan Simulator
 * Simulates what Tata Smartflo receives when a customer calls the company DID.
 */
export function simulateSmartfloInboundDialplan(
  callerPhone: string,
  leadsList: any[] = []
): DialplanSimulationResult {
  const cleanCaller = (callerPhone || '').replace(/^\+/, '').replace(/\s/g, '');
  const callerSuffix = cleanCaller.slice(-10);

  let matchedLead: any = null;

  if (callerSuffix.length >= 8) {
    matchedLead = leadsList.find((l) => {
      const num = (l.whatsapp_number || '').replace(/^\+/, '').replace(/\s/g, '');
      return num.endsWith(callerSuffix);
    });
  }

  let targetPhone = SMARTFLO_CONFIG.defaultAgentPhone || '919800000000';
  let targetAgentName = 'Rahul Verma (Front Desk Lead)';
  let targetRole = 'Front Desk';
  let reason = 'Default Inbound Receiver';

  if (matchedLead) {
    const assignedLawyer = matchedLead.assigned_lawyer_id;
    if (assignedLawyer && AGENT_PHONE_DIRECTORY[assignedLawyer]) {
      const agent = AGENT_PHONE_DIRECTORY[assignedLawyer];
      targetPhone = agent.phone;
      targetAgentName = agent.name;
      targetRole = agent.role;
      reason = `Assigned Lead Owner in CRM (${agent.name})`;
    } else {
      // Check last activity creator
      let lastCreatedBy = '';
      try {
        const comm = typeof matchedLead.communication_notes === 'string'
          ? JSON.parse(matchedLead.communication_notes)
          : matchedLead.communication_notes;
        const callLog = (comm?.activity_logs || []).find((a: any) => a.action?.toLowerCase().includes('call'));
        if (callLog?.created_by) lastCreatedBy = callLog.created_by;
      } catch (e) {}

      if (lastCreatedBy) {
        reason = `Last Agent who contacted lead (${lastCreatedBy})`;
        targetPhone = SMARTFLO_CONFIG.defaultAgentPhone || '919800000000';
        targetAgentName = `${lastCreatedBy} (Last Caller)`;
      } else {
        reason = `Matched Lead "${matchedLead.name}", routing to Primary Lead Owner`;
        targetPhone = SMARTFLO_CONFIG.defaultAgentPhone || '919800000000';
        targetAgentName = 'Rahul Verma (Front Desk)';
      }
    }
  } else {
    reason = 'Unknown New Caller -> Front Desk Intake';
  }

  const smartfloResponse = [
    {
      disable_call_recording: false,
      transfer: {
        type: 'number',
        data: [targetPhone],
        ring_type: 'order_by',
        skip_active: true,
        custom_parameter_1: matchedLead?.id || 'new_caller',
        custom_parameter_2: targetAgentName,
        custom_parameter_3: matchedLead?.name || 'New Lead',
      },
    },
  ];

  return {
    callerId: callerPhone,
    didNumber: SMARTFLO_CONFIG.pilotNumber,
    matchedLead: matchedLead ? {
      id: matchedLead.id,
      name: matchedLead.name,
      whatsapp_number: matchedLead.whatsapp_number,
      service: matchedLead.service,
      assigned_lawyer_id: matchedLead.assigned_lawyer_id,
    } : null,
    targetAgent: {
      name: targetAgentName,
      phone: targetPhone,
      role: targetRole,
      reason,
    },
    smartfloResponse,
  };
}
