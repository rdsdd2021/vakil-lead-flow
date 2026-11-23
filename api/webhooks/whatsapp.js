const EXPECTED_TOKEN = process.env.KAPSO_WEBHOOK_VERIFY_TOKEN || 'vakil_secret_webhook_token_123';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Webhook-Event, X-Webhook-Signature');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // 1. Webhook Verification Challenge (GET)
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && (!token || token === EXPECTED_TOKEN)) {
      res.setHeader('Content-Type', 'text/plain');
      return res.status(200).send(challenge || 'OK');
    }
    return res.status(403).json({ error: 'Verification token mismatch' });
  }

  // 2. Incoming Event Ingestion (POST)
  if (req.method === 'POST') {
    const headerEvent = req.headers['x-webhook-event'] || '';
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    console.log(`[Kapso Webhook Live] Event: ${headerEvent}`, JSON.stringify(body).slice(0, 200));

    // Acknowledge HTTP 200 immediately so Meta / Kapso marks event delivered
    return res.status(200).json({ success: true, received: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
