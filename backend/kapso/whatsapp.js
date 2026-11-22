/**
 * Kapso AI WhatsApp Cloud API Integration Module
 * Official Reference: https://docs.kapso.ai/docs/introduction
 * 
 * Provides:
 * 1. Outbound WhatsApp message dispatch (Text & Templates) via Kapso WhatsApp API
 * 2. Inbound webhook event parser (Messages, Delivery Status, Read Receipts)
 * 3. Graceful simulation mode for sandbox/development environments
 */

const https = require('https');

const KAPSO_BASE_URL = process.env.KAPSO_BASE_URL || 'https://api.kapso.ai/meta/whatsapp/v24.0';
const KAPSO_API_KEY = process.env.KAPSO_API_KEY || '';
const KAPSO_PHONE_NUMBER_ID = process.env.KAPSO_PHONE_NUMBER_ID || 'sandbox_phone_id';

/**
 * Format phone number for WhatsApp Cloud API (Digits only, including country code, e.g. 919800000001)
 */
function formatWhatsAppNumber(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10) {
    return `91${digits}`; // Default Indian country code prefix
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits;
  }
  return digits;
}

/**
 * Send WhatsApp text or template message via Kapso API
 */
async function sendWhatsAppMessage({ to, text, templateName, templateLanguage = 'en_US' }) {
  const cleanTo = formatWhatsAppNumber(to);
  if (!cleanTo) {
    throw new Error('Valid recipient phone number is required');
  }

  // Normalize language code ('en' -> 'en_US' for Meta Cloud API template compatibility)
  const normalizedLanguage = templateLanguage === 'en' ? 'en_US' : templateLanguage;

  // If no API key configured, run in transparent local development/sandbox simulation mode
  if (!KAPSO_API_KEY || KAPSO_API_KEY === 'your_kapso_api_key_here') {
    console.log(`[Kapso AI Simulator] Outbound WhatsApp to ${cleanTo}: "${text || templateName}"`);
    return {
      success: true,
      simulated: true,
      messaging_product: 'whatsapp',
      contacts: [{ input: cleanTo, wa_id: cleanTo }],
      messages: [{ id: `wamid.sim_${Date.now()}_${Math.random().toString(36).substr(2, 6)}` }],
      note: 'Sent via Kapso AI Sandbox Simulation (Configure KAPSO_API_KEY in .env for live Meta delivery)'
    };
  }

  const endpointUrl = new URL(`${KAPSO_BASE_URL}/${KAPSO_PHONE_NUMBER_ID}/messages`);

  let payload;
  if (templateName) {
    payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanTo,
      type: 'template',
      template: {
        name: templateName,
        language: { code: normalizedLanguage },
      },
    };
  } else {
    payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanTo,
      type: 'text',
      text: {
        preview_url: false,
        body: String(text || '').trim(),
      },
    };
  }

  const dataString = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: endpointUrl.hostname,
        port: 443,
        path: endpointUrl.pathname + endpointUrl.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': KAPSO_API_KEY,
          'Content-Length': Buffer.byteLength(dataString),
        },
      },
      (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({
                success: true,
                statusCode: res.statusCode,
                ...parsed,
              });
            } else {
              console.error('[Kapso AI Error Response]:', parsed);
              const errorMessage = typeof parsed.error === 'string'
                ? parsed.error
                : (parsed.error?.message || parsed.message || 'Kapso API error');
              const nextSteps = parsed.next_steps ? ` - ${parsed.next_steps}` : '';
              resolve({
                success: false,
                statusCode: res.statusCode,
                error: errorMessage + nextSteps,
                raw: parsed,
              });
            }
          } catch (e) {
            resolve({
              success: res.statusCode >= 200 && res.statusCode < 300,
              statusCode: res.statusCode,
              raw: body,
            });
          }
        });
      }
    );

    req.on('error', (err) => {
      console.error('[Kapso AI Network Error]:', err.message);
      reject(err);
    });

    req.write(dataString);
    req.end();
  });
}

/**
 * Fetch WhatsApp conversation history directly from Kapso Platform Cloud API
 */
async function fetchKapsoConversationMessages(phone) {
  if (!KAPSO_API_KEY || KAPSO_API_KEY === 'your_kapso_api_key_here') {
    return [];
  }
  const cleanPhone = formatWhatsAppNumber(phone);
  if (!cleanPhone) return [];

  return new Promise((resolve) => {
    const endpointUrl = new URL(`https://api.kapso.ai/platform/v1/whatsapp/messages`);
    endpointUrl.searchParams.set('phone_number', cleanPhone);
    endpointUrl.searchParams.set('limit', '50');

    const req = https.request(
      {
        hostname: endpointUrl.hostname,
        port: 443,
        path: endpointUrl.pathname + endpointUrl.search,
        method: 'GET',
        headers: {
          'X-API-Key': KAPSO_API_KEY,
        },
      },
      (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            const rawList = parsed.data || [];
            const mapped = rawList.map(item => {
              const msgId = item.id;
              const dir = item.kapso?.direction || (item.from ? 'inbound' : 'outbound');
              const textContent = item.text?.body || item.kapso?.content || '';
              const waStatus = item.kapso?.status || 'sent';
              const createdIso = item.timestamp 
                ? new Date(Number(item.timestamp) * 1000).toISOString() 
                : new Date().toISOString();

              const readTs = item.kapso?.statuses?.find(s => s.status === 'read')?.timestamp;
              const deliveredTs = item.kapso?.statuses?.find(s => s.status === 'delivered')?.timestamp;

              return {
                id: msgId,
                phone_number: item.kapso?.phone_number || item.from || item.to || cleanPhone,
                direction: dir,
                sender_name: item.kapso?.contact_name || (dir === 'inbound' ? 'Client' : 'Staff'),
                message_type: item.type || 'text',
                content: textContent,
                status: waStatus,
                kapso_message_id: msgId,
                created_at: createdIso,
                delivered_at: deliveredTs ? new Date(Number(deliveredTs) * 1000).toISOString() : null,
                read_at: readTs ? new Date(Number(readTs) * 1000).toISOString() : null,
              };
            });

            // Sort chronologically ascending
            mapped.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
            resolve(mapped);
          } catch (e) {
            resolve([]);
          }
        });
      }
    );

    req.on('error', (err) => {
      console.warn('[Kapso AI] Platform messages fetch failed:', err.message);
      resolve([]);
    });

    req.end();
  });
}

/**
 * Mark a WhatsApp message as read via Meta Cloud API / Kapso
 */
async function markWhatsAppMessageRead(messageId) {
  if (!KAPSO_API_KEY || !messageId || messageId.startsWith('wamid.sim_')) {
    return { success: true, simulated: true };
  }

  const endpointUrl = new URL(`${KAPSO_BASE_URL}/${KAPSO_PHONE_NUMBER_ID}/messages`);
  const payload = JSON.stringify({
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId,
  });

  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: endpointUrl.hostname,
        port: 443,
        path: endpointUrl.pathname + endpointUrl.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': KAPSO_API_KEY,
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            resolve({ success: res.statusCode === 200 });
          }
        });
      }
    );
    req.on('error', () => resolve({ success: false }));
    req.write(payload);
    req.end();
  });
}

/**
 * Parse Kapso / Meta Webhook Inbound Message Events
 */
function parseKapsoWebhookPayload(payload, headerEvent = '') {
  const events = [];

  try {
    const eventName = headerEvent || payload.event || payload.type || '';

    // 1. Kapso native structured format: { message: { ... }, conversation: { ... } }
    if (payload.message) {
      const msg = payload.message;
      const conv = payload.conversation || {};
      const msgId = msg.id || `msg_${Date.now()}`;
      const phone = formatWhatsAppNumber(conv.phone_number || msg.from || msg.to);
      const contactName = conv.contact_name || msg.kapso?.contact_name || 'Client';
      const text = msg.text?.body || msg.kapso?.content || msg.content || '';
      const timestamp = msg.timestamp ? new Date(Number(msg.timestamp) * 1000).toISOString() : new Date().toISOString();

      if (eventName === 'whatsapp.message.received' || msg.kapso?.direction === 'inbound') {
        events.push({
          type: 'message',
          from: phone,
          name: contactName,
          text: text,
          messageId: msgId,
          timestamp: timestamp,
        });
      } else if (
        eventName.startsWith('whatsapp.message.') ||
        msg.kapso?.status
      ) {
        const rawStatus = eventName.replace('whatsapp.message.', '') || msg.kapso?.status || 'sent';
        events.push({
          type: 'status_update',
          messageId: msgId,
          recipientId: phone,
          status: rawStatus,
          timestamp: timestamp,
        });
      }
      return events;
    }

    // 2. Kapso message buffering / batch layout: { batch: true, data: [ { message, conversation } ] }
    if (payload.batch && Array.isArray(payload.data)) {
      for (const item of payload.data) {
        if (item.message) {
          const subEvents = parseKapsoWebhookPayload(item, eventName);
          events.push(...subEvents);
        }
      }
      return events;
    }

    // 3. Kapso legacy direct payload: { event: 'whatsapp.message.received', data: { ... } }
    if (eventName === 'whatsapp.message.received' && payload.data) {
      const d = payload.data;
      events.push({
        type: 'message',
        from: formatWhatsAppNumber(d.from || d.sender_phone),
        name: d.sender_name || d.name || 'Client',
        text: d.text?.body || d.body || d.message || '',
        messageId: d.id || d.message_id || `msg_${Date.now()}`,
        timestamp: d.timestamp ? new Date(Number(d.timestamp) * 1000).toISOString() : new Date().toISOString(),
      });
      return events;
    }

    // 4. Standard Meta Cloud API forwarded webhook layout
    if (payload.entry && Array.isArray(payload.entry)) {
      for (const entry of payload.entry) {
        if (!entry.changes) continue;
        for (const change of entry.changes) {
          const val = change.value;
          if (!val) continue;

          // Inbound customer messages
          if (val.messages && Array.isArray(val.messages)) {
            const contactMap = {};
            if (val.contacts && Array.isArray(val.contacts)) {
              val.contacts.forEach(c => contactMap[c.wa_id] = c.profile?.name);
            }

            for (const msg of val.messages) {
              events.push({
                type: 'message',
                from: formatWhatsAppNumber(msg.from),
                name: contactMap[msg.from] || 'Client',
                text: msg.text?.body || (msg.button ? msg.button.text : '') || '',
                messageId: msg.id,
                timestamp: msg.timestamp ? new Date(Number(msg.timestamp) * 1000).toISOString() : new Date().toISOString(),
              });
            }
          }

          // Message delivery / read status receipts
          if (val.statuses && Array.isArray(val.statuses)) {
            for (const st of val.statuses) {
              events.push({
                type: 'status_update',
                messageId: st.id,
                recipientId: formatWhatsAppNumber(st.recipient_id),
                status: st.status, // 'sent' | 'delivered' | 'read' | 'failed'
                timestamp: st.timestamp ? new Date(Number(st.timestamp) * 1000).toISOString() : new Date().toISOString(),
              });
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('Error parsing Kapso webhook payload:', err);
  }

  return events;
}

module.exports = {
  sendWhatsAppMessage,
  fetchKapsoConversationMessages,
  markWhatsAppMessageRead,
  parseKapsoWebhookPayload,
  formatWhatsAppNumber,
  KAPSO_BASE_URL,
  KAPSO_PHONE_NUMBER_ID,
};
