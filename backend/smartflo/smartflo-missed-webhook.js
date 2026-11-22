/**
 * MySQL-Backed Webhook Handler: POST /webhooks/smartflo/missed
 * 
 * Called by Tata Tele Smartflo when an inbound customer call to the agent goes unanswered or agent is busy.
 * 
 * Actions:
 * 1. Logs missed callback in the lead's Activity Timeline in MySQL.
 * 2. Sends an instant Web Push notification to the agent's browser/PWA via VAPID.
 */

const { query } = require('../db/mysql');
const webpush = require('web-push');

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BM_REPLACE_WITH_YOUR_VAPID_PUBLIC_KEY_IN_PRODUCTION';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = 'mailto:support@vakiltech.com';

if (VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  } catch (e) {
    console.warn('Failed to configure VAPID details:', e.message);
  }
}

exports.handler = async (event) => {
  console.log('Received Tata Smartflo Missed Call / Agent Busy Webhook:', event.body);

  try {
    const payload = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : (event.body || {});
    const { caller_id, call_status = 'missed', agent_id, agent_extension } = payload;

    const callerNumber = (caller_id || '').replace(/^\+/, '').replace(/\s/g, '');
    const phoneSuffix = callerNumber.slice(-10);

    // Find lead in MySQL by phone or whatsapp_number
    const rows = await query(
      'SELECT id, name, last_called_by, assigned_lawyer_id, communication_notes FROM leads WHERE whatsapp_number LIKE ? OR phone LIKE ? LIMIT 1',
      [`%${phoneSuffix}`, `%${phoneSuffix}`]
    );

    if (!rows || rows.length === 0) {
      return { statusCode: 200, body: JSON.stringify({ message: 'No matching lead found in MySQL' }) };
    }

    const lead = rows[0];
    const targetAgentId = lead.last_called_by || lead.assigned_lawyer_id || agent_id;

    // Log to communication_notes & activity_logs
    let notes = { notes: [], call_logs: [], meetings: [], activity_logs: [] };
    try {
      if (lead.communication_notes) {
        notes = typeof lead.communication_notes === 'string' ? JSON.parse(lead.communication_notes) : lead.communication_notes;
      }
    } catch (e) {
      console.error(e);
    }

    const missedLog = {
      id: `act_${Date.now()}`,
      action: 'Call Made',
      details: `Missed callback from customer (${call_status.toUpperCase()}) while agent was busy. Number masked.`,
      call_status: 'Missed / Busy',
      created_by: 'Tata Smartflo System',
      created_at: new Date().toISOString(),
    };

    notes.activity_logs = [missedLog, ...(notes.activity_logs || [])];

    await query(
      'UPDATE leads SET communication_notes = ?, updated_at = NOW() WHERE id = ?',
      [JSON.stringify(notes), lead.id]
    );

    // Send Web Push notification if subscription exists in MySQL
    if (VAPID_PRIVATE_KEY && targetAgentId) {
      const subRes = await query('SELECT subscription FROM push_subscriptions WHERE user_id = ?', [targetAgentId]);
      if (subRes && subRes.length > 0) {
        const pushPayload = JSON.stringify({
          title: '⚠️ Missed Callback (Agent Busy)',
          body: `${lead.name} called back on Tata Smartflo line. Tap to return call.`,
          url: `/lead/${lead.id}`,
          tag: `missed-call-${lead.id}`,
        });

        for (const row of subRes) {
          try {
            const subData = typeof row.subscription === 'string' ? JSON.parse(row.subscription) : row.subscription;
            await webpush.sendNotification(subData, pushPayload);
          } catch (pushErr) {
            console.error('Push send failed:', pushErr.message);
          }
        }
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, message: 'Missed callback logged in MySQL and agent notified.' }),
    };
  } catch (error) {
    console.error('Error handling missed call webhook:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
