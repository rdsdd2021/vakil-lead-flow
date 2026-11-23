const KAPSO_API_KEY = process.env.KAPSO_API_KEY || 'd8cc0e10ba83ef26a82064b24f41675370985d8a661b64906a6a087b3a4d5981';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    const url = 'https://api.kapso.ai/platform/v1/whatsapp/conversations?limit=50';
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'X-API-Key': KAPSO_API_KEY,
      },
    });

    if (!resp.ok) {
      console.warn('[Kapso Conversations] API returned status:', resp.status);
      return res.status(200).json([]);
    }

    const json = await resp.json();
    const rawList = json.data || [];

    const mapped = rawList.map(item => ({
      id: item.id,
      phone_number: item.phone_number,
      contact_name: item.contact_name || item.kapso?.contact_name || 'Client',
      last_message: item.kapso?.last_message_text || '',
      last_message_timestamp: item.kapso?.last_message_timestamp || item.last_active_at || item.updated_at,
      last_message_type: item.kapso?.last_message_type || 'text',
      last_message_id: item.kapso?.last_message_id || null,
      messages_count: item.kapso?.messages_count || 0,
      status: item.status || 'active',
      updated_at: item.updated_at || item.last_active_at,
    }));

    return res.status(200).json(mapped);
  } catch (err) {
    console.error('Error in /api/whatsapp/conversations:', err);
    return res.status(200).json([]);
  }
}
