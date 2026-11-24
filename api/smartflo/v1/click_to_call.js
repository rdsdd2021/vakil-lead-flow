export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const SMARTFLO_API_HOST = process.env.SMARTFLO_API_HOST || 'api-smartflo.tatateleservices.com';
  const SMARTFLO_API_TOKEN = process.env.SMARTFLO_API_TOKEN || process.env.VITE_SMARTFLO_JWT_TOKEN || '';
  const SMARTFLO_PILOT_NUMBER = process.env.SMARTFLO_PILOT_NUMBER || process.env.VITE_SMARTFLO_PILOT_NUMBER || '917965561294';

  // Handle GET requests (live_calls or records)
  if (req.method === 'GET') {
    const { action, limit = '25', agent_number } = req.query;

    if (action === 'live_calls' || req.url.includes('live_calls')) {
      try {
        const query = agent_number ? `?agent_number=${agent_number}` : '';
        const tataRes = await fetch(`https://${SMARTFLO_API_HOST}/v1/live_calls${query}`, {
          headers: {
            'Authorization': `Bearer ${SMARTFLO_API_TOKEN}`,
            'Accept': 'application/json',
          },
        });
        const data = await tataRes.json().catch(() => []);
        return res.status(200).json(Array.isArray(data) ? data : []);
      } catch (e) {
        return res.status(200).json([]);
      }
    }

    if (action === 'records' || req.url.includes('records')) {
      try {
        const tataRes = await fetch(`https://${SMARTFLO_API_HOST}/v1/call/records?limit=${limit}`, {
          headers: {
            'Authorization': `Bearer ${SMARTFLO_API_TOKEN}`,
            'Accept': 'application/json',
          },
        });
        const data = await tataRes.json().catch(() => ({}));
        return res.status(200).json(data);
      } catch (e) {
        return res.status(200).json({ results: [] });
      }
    }

    return res.status(200).json({ status: 'ok', service: 'Smartflo Telephony Service' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Handle Hangup if requested
  const { action } = req.query;
  if (action === 'hangup' || req.url.includes('hangup')) {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const { call_id, ref_id } = body;
      const targetId = call_id || ref_id;
      if (!targetId) return res.status(400).json({ error: 'call_id or ref_id required' });

      const tataRes = await fetch(`https://${SMARTFLO_API_HOST}/v1/call/hangup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SMARTFLO_API_TOKEN}`,
        },
        body: JSON.stringify({ call_id: targetId }),
      });
      const data = await tataRes.json().catch(() => ({}));
      return res.status(200).json({ success: tataRes.ok, data });
    } catch (e) {
      return res.status(200).json({ success: false, error: e.message });
    }
  }

  // Handle Outbound Click-To-Call
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { agent_number, destination_number, caller_id, custom_identifier } = body;

    const cleanDestination = String(destination_number || '').replace(/^\+/, '').replace(/\s/g, '');
    const cleanAgent = String(agent_number || process.env.DEFAULT_AGENT_PHONE || '9800000001').replace(/^\+/, '').replace(/\s/g, '');
    const cleanCaller = String(caller_id || SMARTFLO_PILOT_NUMBER).replace(/^\+/, '').replace(/\s/g, '');

    if (!cleanDestination) {
      return res.status(400).json({ error: 'Destination number is required' });
    }

    if (!cleanAgent) {
      return res.status(400).json({ error: 'Agent number is required' });
    }

    // Call Tata Tele Smartflo Cloud PBX
    if (SMARTFLO_API_TOKEN && SMARTFLO_API_TOKEN !== 'your_smartflo_jwt_token_here') {
      const tataUrl = `https://${SMARTFLO_API_HOST}/v1/click_to_call`;
      const tataRes = await fetch(tataUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SMARTFLO_API_TOKEN}`,
        },
        body: JSON.stringify({
          agent_number: cleanAgent,
          destination_number: cleanDestination,
          caller_id: cleanCaller,
          async: 1,
          custom_identifier: custom_identifier || {},
        }),
      });

      const tataData = await tataRes.json().catch(() => ({}));
      if (tataRes.ok) {
        return res.status(200).json({
          success: true,
          call_id: tataData.ref_id || tataData.call_id || `tata_${Date.now()}`,
          ref_id: tataData.ref_id || tataData.call_id,
          message: 'Call initiated via Tata Smartflo. Ringing agent first.',
          data: tataData,
        });
      } else {
        console.error('[Smartflo API Error]:', tataData);
        return res.status(400).json({
          success: false,
          error: tataData.message || tataData.error || 'Failed to initiate call with Tata Smartflo',
          data: tataData,
        });
      }
    }

    return res.status(400).json({
      success: false,
      error: 'Smartflo API Token is not configured on the server.',
    });
  } catch (err) {
    console.error('Click to call proxy error:', err);
    return res.status(500).json({ error: 'Failed to initiate call: ' + err.message });
  }
}
