/**
 * AWS Lambda Handler: POST /webhooks/smartflo/hangup
 * 
 * Called automatically by Tata Tele Smartflo when a call ends (Hangup event).
 * 
 * Webhook Payload from Smartflo includes:
 * - call_id: Unique call identifier
 * - custom_identifier: { lead_id, agent_id }
 * - duration: Total connected seconds
 * - recording_url: Downloadable audio file URL
 * - call_status: 'answered' | 'missed' | 'busy'
 * 
 * Actions:
 * 1. Attaches the recording_url and call log to the lead's communication_notes.
 * 2. Appends an entry to the lead's activity_logs so it appears on the Activity Timeline.
 */

const { Client } = require('pg');

exports.handler = async (event) => {
  console.log('Received Tata Smartflo Hangup Webhook:', event.body);

  try {
    const payload = JSON.parse(event.body || '{}');
    const {
      call_id,
      custom_identifier = {},
      duration = 0,
      recording_url,
      call_status = 'answered',
      agent_email,
      caller_id,
    } = payload;

    const lead_id = custom_identifier.lead_id;
    if (!lead_id) {
      console.warn('Webhook received without lead_id in custom_identifier');
      return { statusCode: 200, body: JSON.stringify({ message: 'Ignored: No lead_id' }) };
    }

    const durationMins = Math.floor(duration / 60);
    const durationSecs = duration % 60;
    const durationFormatted = `${durationMins}m ${durationSecs}s`;

    // Connect to PostgreSQL DB
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
    await client.connect();

    // Fetch existing communication_notes
    const res = await client.query('SELECT communication_notes FROM leads WHERE id = $1', [lead_id]);
    if (res.rows.length === 0) {
      await client.end();
      return { statusCode: 404, body: 'Lead not found' };
    }

    let notes = { notes: [], call_logs: [], meetings: [], activity_logs: [] };
    try {
      const raw = res.rows[0].communication_notes;
      if (raw) notes = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (e) {
      console.error('Error parsing notes:', e);
    }

    // Append call log
    const callLogEntry = {
      id: `call_${call_id || Date.now()}`,
      text: `Call ${call_status} (${durationFormatted}) via Tata Smartflo`,
      recording_url: recording_url || null,
      duration: durationFormatted,
      created_by: agent_email || custom_identifier.agent_id || 'Frontdesk Agent',
      created_at: new Date().toISOString(),
    };

    // Append activity log
    const activityLogEntry = {
      id: `act_${Date.now()}`,
      action: 'Call Made',
      details: `Call completed (${durationFormatted}). Audio recording attached.`,
      recording_url: recording_url || null,
      call_duration: durationFormatted,
      call_status,
      created_by: agent_email || custom_identifier.agent_id || 'Frontdesk Agent',
      created_at: new Date().toISOString(),
    };

    notes.call_logs = [callLogEntry, ...(notes.call_logs || [])];
    notes.activity_logs = [activityLogEntry, ...(notes.activity_logs || [])];

    // Save back to DB
    await client.query(
      'UPDATE leads SET communication_notes = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(notes), lead_id]
    );

    await client.end();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, message: 'Call recording synced to CRM lead history' }),
    };
  } catch (err) {
    console.error('Failed to process Smartflo Hangup webhook:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
