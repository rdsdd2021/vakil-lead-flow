import https from 'https';

// Configurable fallback agent phone (reads from environment)
const FALLBACK_AGENT_PHONE = process.env.FALLBACK_AGENT_PHONE || process.env.SMARTFLO_DEFAULT_AGENT_PHONE || '9800000000';

// Directory mapping: Agent / Lawyer ID -> Contact Phone
const AGENT_PHONE_DIRECTORY = {
  'u1': process.env.AGENT_U1_PHONE || FALLBACK_AGENT_PHONE,
  'u2': process.env.AGENT_U2_PHONE || FALLBACK_AGENT_PHONE,
  'devika': process.env.AGENT_DEVIKA_PHONE || FALLBACK_AGENT_PHONE,
  'aaditya': process.env.AGENT_AADITYA_PHONE || FALLBACK_AGENT_PHONE,
  'pritam': process.env.AGENT_PRITAM_PHONE || FALLBACK_AGENT_PHONE,
  'lawyer': process.env.AGENT_LAWYER_PHONE || FALLBACK_AGENT_PHONE,
};

// Formats any phone number to clean 10 digits for Indian telecom PBX routing
function to10DigitPhone(num) {
  if (!num) return FALLBACK_AGENT_PHONE;
  const clean = String(num).replace(/^\+/, '').replace(/\s/g, '').replace(/\D/g, '');
  if (clean.length === 12 && clean.startsWith('91')) {
    return clean.slice(2);
  }
  if (clean.length === 11 && clean.startsWith('0')) {
    return clean.slice(1);
  }
  if (clean.length >= 10) {
    return clean.slice(-10);
  }
  return clean;
}

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    let callerId = '';
    let didNumber = '';
    let targetPhone = FALLBACK_AGENT_PHONE;
    let targetAgentName = 'Front Desk Lead';

    if (req.body) {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      callerId = body.caller_id_number || body.caller_id || body.caller_number || body.customer_number || body.From || '';
      didNumber = body.call_to_number || body.did_number || body.did || body.caller_id_num || '';
      if (body.agent_phone) targetPhone = body.agent_phone;
      if (body.lawyer_id && AGENT_PHONE_DIRECTORY[body.lawyer_id.toLowerCase()]) {
        targetPhone = AGENT_PHONE_DIRECTORY[body.lawyer_id.toLowerCase()];
        targetAgentName = `Assigned Lawyer (${body.lawyer_id})`;
      }
    }

    if (!callerId && req.query) {
      callerId = req.query.caller_id_number || req.query.caller_id || req.query.caller_number || req.query.customer_number || '';
      didNumber = req.query.call_to_number || req.query.did_number || req.query.did || '';
      if (req.query.agent_phone) targetPhone = req.query.agent_phone;
      if (req.query.lawyer_id && AGENT_PHONE_DIRECTORY[req.query.lawyer_id.toLowerCase()]) {
        targetPhone = AGENT_PHONE_DIRECTORY[req.query.lawyer_id.toLowerCase()];
        targetAgentName = `Assigned Lawyer (${req.query.lawyer_id})`;
      }
    }

    const final10DigitPhone = to10DigitPhone(targetPhone);

    const smartfloResponse = [
      {
        transfer: {
          type: 'number',
          data: [final10DigitPhone],
        },
      },
    ];

    console.log(`[Smartflo Dialplan Final Decision] Incoming: ${cleanCaller} -> ${targetAgentName} (${final10DigitPhone})`);
    return res.status(200).json(smartfloResponse);
  } catch (err) {
    console.error('Smartflo dialplan error:', err);
    return res.status(200).json([
      {
        transfer: {
          type: 'number',
          data: [FALLBACK_AGENT_PHONE],
        },
      },
    ]);
  }
}
