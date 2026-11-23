const KAPSO_API_KEY = process.env.KAPSO_API_KEY || 'd8cc0e10ba83ef26a82064b24f41675370985d8a661b64906a6a087b3a4d5981';

function formatWhatsAppNumber(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  return digits;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const { phone } = req.query;
  const cleanPhone = formatWhatsAppNumber(phone);

  try {
    const url = cleanPhone 
      ? `https://api.kapso.ai/platform/v1/whatsapp/messages?phone_number=${cleanPhone}&limit=50`
      : 'https://api.kapso.ai/platform/v1/whatsapp/messages?limit=100';
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'X-API-Key': KAPSO_API_KEY,
      },
    });

    if (!resp.ok) {
      console.warn('Kapso API returned status:', resp.status);
      return res.status(200).json([]);
    }

    const json = await resp.json();
    let rawList = json.data || [];

    // Fallback if 12-digit returned empty, try 10-digit
    if (rawList.length === 0 && cleanPhone.length === 12 && cleanPhone.startsWith('91')) {
      try {
        const altResp = await fetch(`https://api.kapso.ai/platform/v1/whatsapp/messages?phone_number=${cleanPhone.slice(2)}&limit=50`, {
          method: 'GET',
          headers: { 'X-API-Key': KAPSO_API_KEY },
        });
        if (altResp.ok) {
          const altJson = await altResp.json();
          if (altJson.data && altJson.data.length > 0) {
            rawList = altJson.data;
          }
        }
      } catch (e) {}
    }

    const mapped = rawList.map(item => {
      const msgId = item.id;
      const dir = item.kapso?.direction || (item.from ? 'inbound' : 'outbound');
      const mediaUrl = item.kapso?.media_url || item.kapso?.media_data?.url || 
                       item.image?.link || item.document?.link || item.audio?.link || item.video?.link || null;
      const mediaFilename = item.kapso?.media_data?.filename || item.document?.filename || null;
      const caption = item.image?.caption || item.document?.caption || item.video?.caption || item.kapso?.message_type_data?.caption || '';
      const textContent = item.text?.body || caption || item.kapso?.content || '';
      const rawType = item.type || (mediaUrl ? (item.document ? 'document' : item.audio ? 'audio' : item.video ? 'video' : 'image') : 'text');
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
        sender_name: dir === 'inbound' ? (item.kapso?.contact_name || 'Client') : 'Staff',
        message_type: rawType,
        content: textContent,
        media_url: mediaUrl,
        media_filename: mediaFilename,
        status: waStatus,
        kapso_message_id: msgId,
        created_at: createdIso,
        delivered_at: deliveredTs ? new Date(Number(deliveredTs) * 1000).toISOString() : null,
        read_at: readTs ? new Date(Number(readTs) * 1000).toISOString() : null,
      };
    });

    const dedupMap = new Map();
    for (const m of mapped) {
      const key = m.kapso_message_id || m.id;
      dedupMap.set(key, m);
    }
    const finalSorted = Array.from(dedupMap.values()).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    return res.status(200).json(finalSorted);
  } catch (err) {
    console.error('Error in /api/whatsapp/messages:', err);
    return res.status(200).json([]);
  }
}
