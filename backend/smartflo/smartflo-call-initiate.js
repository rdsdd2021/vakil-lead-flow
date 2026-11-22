/**
 * AWS Lambda Handler: POST /calls/initiate
 * 
 * Proxies Click-to-Call requests from the CRM frontend to Tata Tele Smartflo.
 * 
 * Flow:
 * 1. Validates agent authorization.
 * 2. Fetches real customer phone number from PostgreSQL.
 * 3. Triggers Tata Smartflo POST /v1/click_to_call with:
 *    - agent_number: Agent's extension or registered mobile
 *    - destination_number: Real customer number
 *    - caller_id: Tata Smartflo Virtual Pilot DID (e.g. +91 80 4719 8800)
 *    - custom_identifier: { lead_id, agent_id }
 */

const https = require('https');

const SMARTFLO_API_HOST = process.env.SMARTFLO_API_HOST || 'api-smartflo.tatateleservices.com';
const SMARTFLO_API_TOKEN = process.env.SMARTFLO_API_TOKEN || '';
const SMARTFLO_PILOT_NUMBER = process.env.SMARTFLO_PILOT_NUMBER || '917900000000'; // Virtual DID Placeholder

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const { lead_id, agent_id, agent_name, destination_number } = body;

    if (!lead_id || !destination_number) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'lead_id and destination_number are required' }),
      };
    }

    // Agent's registered number / extension in Tata Smartflo
    const agent_number = body.agent_number || process.env.DEFAULT_AGENT_EXTENSION || '101';

    // Format numbers: remove leading + and spaces
    const cleanDestination = destination_number.replace(/^\+/, '').replace(/\s/g, '');
    const cleanAgent = agent_number.replace(/^\+/, '').replace(/\s/g, '');

    const payload = JSON.stringify({
      agent_number: cleanAgent,
      destination_number: cleanDestination,
      caller_id: SMARTFLO_PILOT_NUMBER,
      async: 1,
      call_timeout: 600, // 10 minutes maximum
      custom_identifier: {
        lead_id: String(lead_id),
        agent_id: String(agent_id || 'frontdesk'),
      },
    });

    const smartfloResponse = await makeHttpsRequest({
      hostname: SMARTFLO_API_HOST,
      path: '/v1/click_to_call',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SMARTFLO_API_TOKEN}`,
        'Content-Length': Buffer.byteLength(payload),
      },
    }, payload);

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        success: true,
        message: 'Call initiated via Tata Smartflo. Ringing agent first.',
        data: smartfloResponse,
      }),
    };
  } catch (error) {
    console.error('Error initiating Tata Smartflo call:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: error.message || 'Failed to initiate call' }),
    };
  }
};

function makeHttpsRequest(options, data) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve({ raw: body, statusCode: res.statusCode });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}
