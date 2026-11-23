const KAPSO_BASE_URL = process.env.KAPSO_BASE_URL || 'https://api.kapso.ai/meta/whatsapp/v24.0';
const KAPSO_API_KEY = process.env.KAPSO_API_KEY || 'd8cc0e10ba83ef26a82064b24f41675370985d8a661b64906a6a087b3a4d5981';
const KAPSO_PHONE_NUMBER_ID = process.env.KAPSO_PHONE_NUMBER_ID || '1432055029996702';

function formatWhatsAppNumber(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  return digits;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { 
      to, 
      text, 
      templateName, 
      templateLanguage = 'en_US', 
      templateComponents, 
      templateParameters,
      type,
      mediaType,
      mediaUrl,
      filename,
      caption,
      senderId, 
      senderName, 
      leadId, 
      ticketId 
    } = body;

    const cleanTo = formatWhatsAppNumber(to);
    const resolvedMediaType = mediaType || (['image', 'document', 'audio', 'video'].includes(type) ? type : null);

    if (!cleanTo || (!text && !templateName && !mediaUrl)) {
      return res.status(400).json({ error: 'Valid phone number and text, template, or media are required' });
    }

    const normalizedLang = templateLanguage === 'en' ? 'en_US' : templateLanguage;

    let payload;
    if (templateName) {
      // 1. Meta Pre-Approved WhatsApp Template
      let components = templateComponents;
      if (!components && Array.isArray(templateParameters) && templateParameters.length > 0) {
        components = [
          {
            type: 'body',
            parameters: templateParameters.map(p => typeof p === 'object' ? p : { type: 'text', text: String(p) }),
          },
        ];
      }

      payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanTo,
        type: 'template',
        template: {
          name: templateName,
          language: { code: normalizedLang },
          ...(components && components.length > 0 ? { components } : {}),
        },
      };
    } else if (resolvedMediaType && mediaUrl) {
      // 2. WhatsApp Media (Image, Document, Audio, Video)
      if (resolvedMediaType === 'image') {
        payload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanTo,
          type: 'image',
          image: {
            link: mediaUrl,
            caption: String(caption || text || '').trim(),
          },
        };
      } else if (resolvedMediaType === 'document') {
        payload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanTo,
          type: 'document',
          document: {
            link: mediaUrl,
            filename: filename || 'Legal_Document.pdf',
            caption: String(caption || text || '').trim(),
          },
        };
      } else if (resolvedMediaType === 'audio') {
        payload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanTo,
          type: 'audio',
          audio: {
            link: mediaUrl,
          },
        };
      } else if (resolvedMediaType === 'video') {
        payload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanTo,
          type: 'video',
          video: {
            link: mediaUrl,
            caption: String(caption || text || '').trim(),
          },
        };
      }
    } else {
      // 3. WhatsApp Plain Text
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

    const endpointUrl = `${KAPSO_BASE_URL}/${KAPSO_PHONE_NUMBER_ID}/messages`;
    const kapsoRes = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': KAPSO_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    const parsed = await kapsoRes.json().catch(() => ({}));

    if (!kapsoRes.ok) {
      console.error('[Kapso Send Error]:', parsed);
      const rawErr = parsed.error;
      const userFriendlyError = typeof rawErr === 'string'
        ? rawErr
        : (rawErr?.message || parsed.message || 'Meta WhatsApp rejected the message.');
      return res.status(400).json({
        error: userFriendlyError,
        kapso: parsed,
      });
    }

    const kapsoMsgId = parsed.messages?.[0]?.id || `wamid.sent_${Date.now()}`;

    const savedMessage = {
      id: kapsoMsgId,
      lead_id: leadId || null,
      ticket_id: ticketId || null,
      phone_number: cleanTo,
      direction: 'outbound',
      sender_id: senderId || 'staff',
      sender_name: senderName || 'Vakil Staff',
      message_type: templateName ? 'template' : (resolvedMediaType || 'text'),
      content: String(caption || text || (templateName ? `Template: ${templateName}` : filename || `[${resolvedMediaType || 'media'}]`)).trim(),
      media_url: mediaUrl || null,
      media_filename: filename || null,
      status: 'sent',
      kapso_message_id: kapsoMsgId,
      created_at: new Date().toISOString(),
    };

    return res.status(201).json({
      success: true,
      message: savedMessage,
      kapso: parsed,
    });
  } catch (err) {
    console.error('Serverless send error:', err);
    return res.status(500).json({ error: 'Failed to dispatch WhatsApp message: ' + err.message });
  }
}
