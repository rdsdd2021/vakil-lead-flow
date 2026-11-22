/**
 * Kapso AI WhatsApp Client Service & Legal Template Library
 * Official Reference: https://docs.kapso.ai/docs/introduction
 */

export interface WhatsAppMessage {
  id: string;
  lead_id?: string | null;
  ticket_id?: string | null;
  phone_number: string;
  direction: 'inbound' | 'outbound';
  sender_id?: string | null;
  sender_name?: string | null;
  message_type?: string;
  content: string;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  kapso_message_id?: string | null;
  created_at: string;
}

export interface QuickLegalTemplate {
  id: string;
  title: string;
  category: 'intake' | 'case_update' | 'billing' | 'documents';
  templateName?: string;
  getContent: (clientName: string, caseTitle?: string) => string;
}

export const QUICK_LEGAL_TEMPLATES: QuickLegalTemplate[] = [
  {
    id: 'intro_consultation',
    title: 'Consultation Welcome',
    category: 'intake',
    getContent: (name, service) =>
      `Hi ${name}, this is Vakiltech Legal Team. Thank you for contacting us regarding ${service || 'your legal query'}. An advocate has been assigned to your file. How may we assist you today?`,
  },
  {
    id: 'doc_request',
    title: 'Document Checklist Request',
    category: 'documents',
    getContent: (name) =>
      `Dear ${name}, to expedite drafting your legal documentation, kindly share digital copies of your ID proof, relevant agreements, and prior correspondence here on WhatsApp.`,
  },
  {
    id: 'draft_ready',
    title: 'Draft Notice Ready for Review',
    category: 'case_update',
    getContent: (name, caseTitle) =>
      `Hello ${name}, your draft for ${caseTitle || 'your legal matter'} has been finalized by our advocate. Kindly review the document summary sent to your email and reply with your approval to proceed with formal dispatch.`,
  },
  {
    id: 'hearing_update',
    title: 'Hearing Date / Filing Update',
    category: 'case_update',
    getContent: (name, caseTitle) =>
      `Respected ${name}, your matter (${caseTitle || 'case proceedings'}) has been processed. Our advocate will attend the scheduled proceedings and update you immediately following the hearing.`,
  },
  {
    id: 'payment_advance',
    title: 'Fee Settlement Receipt',
    category: 'billing',
    getContent: (name) =>
      `Dear ${name}, thank you for your fee payment. The receipt has been recorded in your case file. Our advocate is actively preparing your legal drafts.`,
  },
];

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

/**
 * Fetch WhatsApp conversation history from MySQL backend
 */
export async function fetchWhatsAppMessages(
  leadId?: string,
  ticketId?: string,
  phone?: string
): Promise<WhatsAppMessage[]> {
  try {
    const params = new URLSearchParams();
    if (leadId) params.append('leadId', leadId);
    if (ticketId) params.append('ticketId', ticketId);
    if (phone) params.append('phone', phone);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(`${API_BASE_URL}/api/whatsapp/messages?${params.toString()}`, {
      signal: controller.signal,
    }).catch(() => null);

    clearTimeout(timer);

    if (res && res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        const cacheKey = `wa_history_${leadId || ticketId || phone || 'global'}`;
        const cachedRaw = localStorage.getItem(cacheKey);
        let merged = data;
        if (cachedRaw) {
          try {
            const cached: WhatsAppMessage[] = JSON.parse(cachedRaw);
            const map = new Map<string, WhatsAppMessage>();
            for (const item of cached) { if (item.id) map.set(item.id, item); }
            for (const item of data) { if (item.id) map.set(item.id, item); }
            merged = Array.from(map.values()).sort((a, b) => 
              new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
          } catch (e) {}
        }
        localStorage.setItem(cacheKey, JSON.stringify(merged));
        return merged;
      }
    }
  } catch (err) {
    console.warn('[WhatsApp] API fetch failed, checking local cache:', err);
  }

  // Local storage offline cache fallback
  const cacheKey = `wa_history_${leadId || ticketId || phone || 'global'}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {}
  }

  return [];
}

/**
 * Send an outbound WhatsApp message via Kapso AI backend API
 */
export async function sendWhatsAppMessageApi({
  leadId,
  ticketId,
  to,
  text,
  templateName,
  senderId,
  senderName,
}: {
  leadId?: string;
  ticketId?: string;
  to: string;
  text?: string;
  templateName?: string;
  senderId?: string;
  senderName?: string;
}): Promise<{ success: boolean; message: WhatsAppMessage; simulated?: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/whatsapp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leadId,
        ticketId,
        to,
        text,
        templateName,
        senderId,
        senderName,
      }),
    });

    if (res.ok) {
      const json = await res.json();
      // Update local cache
      const cacheKey = `wa_history_${leadId || ticketId || to || 'global'}`;
      const existing: WhatsAppMessage[] = JSON.parse(localStorage.getItem(cacheKey) || '[]');
      const updated = [...existing, json.message];
      localStorage.setItem(cacheKey, JSON.stringify(updated));

      return {
        success: true,
        message: json.message,
        simulated: json.kapso?.simulated,
      };
    } else {
      const errJson = await res.json().catch(() => ({}));
      const errMsg = errJson.error || `HTTP ${res.status} error from WhatsApp provider`;
      return {
        success: false,
        error: errMsg,
        message: null as any,
      };
    }
  } catch (err: any) {
    console.warn('[WhatsApp] Network error:', err);
    return {
      success: false,
      error: 'Network error connecting to backend server: ' + (err.message || 'Check if server is running'),
      message: null as any,
    };
  }
}
