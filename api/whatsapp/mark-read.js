const KAPSO_BASE_URL = process.env.KAPSO_BASE_URL || 'https://api.kapso.ai/meta/whatsapp/v24.0';
const KAPSO_API_KEY = process.env.KAPSO_API_KEY || 'd8cc0e10ba83ef26a82064b24f41675370985d8a661b64906a6a087b3a4d5981';
const KAPSO_PHONE_NUMBER_ID = process.env.KAPSO_PHONE_NUMBER_ID || '1432055029996702';

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
    const { messageId } = body;

    if (!messageId || messageId.startsWith('wamid.sim_')) {
      return res.status(200).json({ success: true, simulated: true });
    }

    const endpointUrl = `${KAPSO_BASE_URL}/${KAPSO_PHONE_NUMBER_ID}/messages`;
    const resp = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': KAPSO_API_KEY,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      }),
    });

    const parsed = await resp.json().catch(() => ({}));
    return res.status(200).json({ success: resp.ok, result: parsed });
  } catch (err) {
    console.error('Error marking message read:', err);
    return res.status(500).json({ error: err.message });
  }
}
