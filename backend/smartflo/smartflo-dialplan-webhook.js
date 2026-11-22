/**
 * Tata Tele Business Services (TTBS) Smartflo API Dialplan Webhook
 * 
 * Method 2: Dynamic CRM-Driven Lead Ownership Routing
 */

const https = require('https');

const FALLBACK_AGENT_PHONE = process.env.FALLBACK_AGENT_PHONE || '9800000000';

const AGENT_PHONE_DIRECTORY = {
  'u1': process.env.AGENT_U1_PHONE || '9800000001', // Super Admin
  'u2': process.env.AGENT_U2_PHONE || '9800000002', // Front Desk Lead
  'u3': process.env.AGENT_U3_PHONE || '9800000003', // Corporate Lawyer
  'u4': process.env.AGENT_U4_PHONE || '9800000004', // Consultations
  'u5': process.env.AGENT_U5_PHONE || '9800000005', // Front Desk Intake
};

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

async function resolveDialplanRoute(callerId, didNumber) {
  let targetPhone = FALLBACK_AGENT_PHONE;
  const final10Digit = to10DigitPhone(targetPhone);

  return [
    {
      transfer: {
        type: 'number',
        data: [final10Digit],
      },
    },
  ];
}

exports.handler = async (event) => {
  try {
    let callerId = '';
    let didNumber = '';

    if (event.body) {
      const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
      callerId = body.caller_id_number || body.caller_id || body.caller_number || body.customer_number || body.From || '';
      didNumber = body.call_to_number || body.did_number || body.did || '';
    }

    if (!callerId && event.queryStringParameters) {
      callerId = event.queryStringParameters.caller_id_number || event.queryStringParameters.caller_id || event.queryStringParameters.customer_number || '';
      didNumber = event.queryStringParameters.call_to_number || event.queryStringParameters.did_number || '';
    }

    const response = await resolveDialplanRoute(callerId, didNumber);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(response),
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([
        {
          transfer: {
            type: 'number',
            data: [FALLBACK_AGENT_PHONE],
          },
        },
      ]),
    };
  }
};

exports.resolveDialplanRoute = resolveDialplanRoute;
