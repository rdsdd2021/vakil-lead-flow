/**
 * MySQL-Backed Webhook Handler: POST /webhooks/smartflo/hangup
 * 
 * Called automatically by Tata Tele Smartflo when a call ends (Hangup event).
 * 
 * Actions:
 * 1. Attaches the recording_url and call log to the lead's communication_notes in MySQL.
 * 2. Appends an entry to the lead's activity_logs so it appears on the Activity Timeline.
 */

const { query } = require('../db/mysql');

exports.handler = async (event) => {
  console.log('Received Tata Smartflo Hangup Webhook:', event.body);

  try {
    const payload = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : (event.body || {});
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

    // Fetch existing communication_notes from MySQL
    const rows = await query('SELECT communication_notes FROM leads WHERE id = ?', [lead_id]);
    if (!rows || rows.length === 0) {
      return { statusCode: 404, body: 'Lead not found' };
    }

    let notes = { notes: [], call_logs: [], meetings: [], activity_logs: [] };
    try {
      const raw = rows[0].communication_notes;
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

    // Save back to MySQL
    await query(
      'UPDATE leads SET communication_notes = ?, updated_at = NOW() WHERE id = ?',
      [JSON.stringify(notes), lead_id]
    );

    // Also insert into activity_logs table for relational querying
    try {
      await query(
        `INSERT INTO activity_logs (id, entity_type, entity_id, action, details, call_duration, call_status, recording_url, created_by)
         VALUES (?, 'lead', ?, 'Call Made', ?, ?, ?, ?, ?)`,
        [
          activityLogEntry.id,
          lead_id,
          activityLogEntry.details,
          durationFormatted,
          call_status,
          recording_url || null,
          activityLogEntry.created_by,
        ]
      );
    } catch (logErr) {
      console.warn('Could not insert separate activity_logs row:', logErr.message);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, message: 'Call recording synced to MySQL lead history' }),
    };
  } catch (err) {
    console.error('Failed to process Smartflo Hangup webhook:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
