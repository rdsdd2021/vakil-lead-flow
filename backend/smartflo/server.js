/**
 * Vakil Lead Flow CRM - Unified Backend & Telephony Server (MySQL-Backed)
 * 
 * Run with: node backend/smartflo/server.js
 * Or: npm run server
 * Default Port: 3001
 * 
 * Provides:
 * 1. Tata Smartflo Cloud Telephony Webhooks (Dialplan, Hangup, Missed Calls)
 * 2. Full REST API for CRM Entities (Leads, Tickets, Users, Activity Logs) connected to MySQL
 * 3. Audio Streaming Proxy for TTBS Call Recordings
 * 4. Health Check with Live MySQL Connection Status
 */

const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');

// Auto-load .env file if present
const envPath = path.resolve(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const { query, testConnection } = require('../db/mysql');
const { resolveDialplanRoute } = require('./smartflo-dialplan-webhook');
const hangupWebhook = require('./smartflo-hangup-webhook');
const missedWebhook = require('./smartflo-missed-webhook');
const callInitiate = require('./smartflo-call-initiate');
const { 
  sendWhatsAppMessage, 
  fetchKapsoConversationMessages, 
  markWhatsAppMessageRead, 
  parseKapsoWebhookPayload, 
  formatWhatsAppNumber 
} = require('../kapso/whatsapp');

const PORT = parseInt(process.env.PORT || '3001', 10);

// In-memory message store for hybrid local resilience (active when MySQL is not running)
const inMemoryWhatsAppMessages = [];

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(JSON.stringify(data));
}

function parseJsonBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

function parseRowJson(row, fields) {
  if (!row) return row;
  const cloned = { ...row };
  for (const f of fields) {
    if (cloned[f] && typeof cloned[f] === 'string') {
      try {
        cloned[f] = JSON.parse(cloned[f]);
      } catch (e) {}
    }
  }
  return cloned;
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // Global CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    // -----------------------------------------------------------------
    // 1. Health Check (with live MySQL connectivity test)
    // -----------------------------------------------------------------
    if ((pathname === '/health' || pathname === '/api/health') && method === 'GET') {
      const dbStatus = await testConnection();
      return sendJson(res, 200, {
        status: 'ok',
        service: 'Vakil Lead Flow CRM Backend',
        database: 'MySQL',
        dbConnected: dbStatus.connected,
        dbMessage: dbStatus.message,
        timestamp: new Date().toISOString(),
      });
    }

    // -----------------------------------------------------------------
    // 2. Telephony: Tata Smartflo Inbound API Dialplan
    // -----------------------------------------------------------------
    if (pathname === '/webhooks/smartflo/dialplan' && (method === 'POST' || method === 'GET')) {
      let body = {};
      if (method === 'POST') {
        body = await parseJsonBody(req);
      }
      
      const callerId = body.caller_id || body.caller_number || body.customer_number || parsedUrl.query.caller_id || '';
      const didNumber = body.did_number || body.caller_id_num || parsedUrl.query.did_number || '';

      // Check MySQL for caller match to implement sticky lawyer routing
      let targetLawyerPhone = null;
      if (callerId) {
        try {
          const cleanCaller = callerId.replace(/^\+/, '').replace(/\s/g, '').slice(-10);
          const rows = await query(
            `SELECT l.assigned_lawyer_id, u.phone AS lawyer_phone 
             FROM leads l 
             LEFT JOIN users u ON l.assigned_lawyer_id = u.id 
             WHERE l.phone LIKE ? OR l.whatsapp_number LIKE ? 
             LIMIT 1`,
            [`%${cleanCaller}`, `%${cleanCaller}`]
          );
          if (rows && rows.length > 0 && rows[0].lawyer_phone) {
            targetLawyerPhone = rows[0].lawyer_phone;
          }
        } catch (dbErr) {
          console.warn('[Dialplan] MySQL lookup skipped:', dbErr.message);
        }
      }

      if (targetLawyerPhone) {
        const clean10 = targetLawyerPhone.replace(/\D/g, '').slice(-10);
        return sendJson(res, 200, [
          {
            disable_call_recording: false,
            transfer: {
              type: 'number',
              data: [clean10],
              ring_type: 'order_by',
              skip_active: true,
            },
          },
        ]);
      }

      const fallbackResponse = await resolveDialplanRoute(callerId, didNumber);
      return sendJson(res, 200, fallbackResponse);
    }

    // -----------------------------------------------------------------
    // 3. Telephony: Hangup Webhook (Recording Sync to MySQL)
    // -----------------------------------------------------------------
    if (pathname === '/webhooks/smartflo/hangup' && method === 'POST') {
      const body = await parseJsonBody(req);
      const result = await hangupWebhook.handler({ body });
      return sendJson(res, result.statusCode || 200, JSON.parse(result.body || '{}'));
    }

    // -----------------------------------------------------------------
    // 4. Telephony: Missed Call Webhook (Agent Busy / Push Alert)
    // -----------------------------------------------------------------
    if (pathname === '/webhooks/smartflo/missed' && method === 'POST') {
      const body = await parseJsonBody(req);
      const result = await missedWebhook.handler({ body });
      return sendJson(res, result.statusCode || 200, JSON.parse(result.body || '{}'));
    }

    // -----------------------------------------------------------------
    // 5. Telephony: Outbound Click-to-Call Initiate
    // -----------------------------------------------------------------
    if (pathname === '/api/calls/initiate' && method === 'POST') {
      const body = await parseJsonBody(req);
      const result = await callInitiate.handler({ body });
      return sendJson(res, result.statusCode || 200, JSON.parse(result.body || '{}'));
    }

    // -----------------------------------------------------------------
    // 6. Audio Streaming Proxy: /api/recording
    // -----------------------------------------------------------------
    if (pathname === '/api/recording' && method === 'GET') {
      const audioUrl = parsedUrl.query.url;
      if (!audioUrl) {
        return sendJson(res, 400, { error: 'Missing recording url' });
      }

      try {
        const targetUrl = new URL(audioUrl);
        const protocol = targetUrl.protocol === 'https:' ? https : http;

        const proxyReq = protocol.get(targetUrl, (proxyRes) => {
          res.writeHead(200, {
            'Content-Type': 'audio/mpeg',
            'Accept-Ranges': 'bytes',
            'Access-Control-Allow-Origin': '*',
          });
          proxyRes.pipe(res);
        });

        proxyReq.on('error', (err) => {
          sendJson(res, 502, { error: 'Failed to fetch recording: ' + err.message });
        });
        return;
      } catch (err) {
        return sendJson(res, 400, { error: 'Invalid URL parameter' });
      }
    }

    // -----------------------------------------------------------------
    // 7. REST API: Leads CRUD (MySQL)
    // -----------------------------------------------------------------
    if (pathname === '/api/leads' && method === 'GET') {
      try {
        const rows = await query('SELECT * FROM leads ORDER BY created_at DESC');
        const parsed = (rows || []).map(r => parseRowJson(r, ['communication_notes', 'followup_history']));
        return sendJson(res, 200, parsed);
      } catch (err) {
        return sendJson(res, 500, { error: 'MySQL Query Error: ' + err.message });
      }
    }

    if (pathname === '/api/leads' && method === 'POST') {
      try {
        const data = await parseJsonBody(req);
        const id = data.id || `l_${Date.now()}`;
        const customId = data.custom_id || `VT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
        const name = data.name || 'Untitled Lead';
        const location = data.location || '';
        const whatsappNumber = data.whatsapp_number || data.phone || '';
        const phone = data.phone || data.whatsapp_number || '';
        const service = data.service || 'consultation';
        const description = data.description || '';
        const paymentStatus = data.payment_status || 'pending';
        const status = data.status || 'NEW_LEAD';
        const advanceAmount = parseFloat(data.advance_amount || '0') || 0;
        const markAdvancePaid = data.mark_advance_paid ? 1 : 0;
        const paymentAmount = parseFloat(data.payment_amount || '0') || 0;
        const paymentId = data.payment_id || null;
        const assignedLawyerId = data.assigned_lawyer_id || null;
        const leadScore = parseInt(data.lead_score || '50', 10) || 50;
        const followupCount = parseInt(data.followup_count || '0', 10) || 0;
        const followupHistory = JSON.stringify(data.followup_history || []);
        const commNotes = JSON.stringify(data.communication_notes || { notes: [], call_logs: [], meetings: [], activity_logs: [] });
        const conversionSource = data.conversion_source || 'website';

        await query(
          `INSERT INTO leads (id, custom_id, name, location, whatsapp_number, phone, service, description, payment_status, status, advance_amount, mark_advance_paid, payment_amount, payment_id, assigned_lawyer_id, lead_score, followup_count, followup_history, communication_notes, conversion_source)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             name = VALUES(name), location = VALUES(location), whatsapp_number = VALUES(whatsapp_number),
             phone = VALUES(phone), service = VALUES(service), description = VALUES(description),
             status = VALUES(status), communication_notes = VALUES(communication_notes)`,
          [id, customId, name, location, whatsappNumber, phone, service, description, paymentStatus, status, advanceAmount, markAdvancePaid, paymentAmount, paymentId, assignedLawyerId, leadScore, followupCount, followupHistory, commNotes, conversionSource]
        );

        const [created] = await query('SELECT * FROM leads WHERE id = ?', [id]);
        return sendJson(res, 201, parseRowJson(created, ['communication_notes', 'followup_history']) || { id, ...data });
      } catch (err) {
        return sendJson(res, 500, { error: 'Failed to create lead in MySQL: ' + err.message });
      }
    }

    if (pathname.startsWith('/api/leads/') && method === 'PUT') {
      const id = pathname.replace('/api/leads/', '');
      try {
        const data = await parseJsonBody(req);
        const updates = [];
        const params = [];

        const allowedFields = ['custom_id', 'name', 'location', 'whatsapp_number', 'phone', 'service', 'description', 'payment_status', 'status', 'advance_amount', 'mark_advance_paid', 'payment_amount', 'payment_id', 'assigned_lawyer_id', 'lead_score', 'followup_count', 'conversion_source', 'converted_at_followup', 'converted_by', 'converted_at', 'last_called_by', 'last_called_at'];
        for (const field of allowedFields) {
          if (data[field] !== undefined) {
            updates.push(`\`${field}\` = ?`);
            params.push(data[field]);
          }
        }

        if (data.communication_notes !== undefined) {
          updates.push('`communication_notes` = ?');
          params.push(typeof data.communication_notes === 'string' ? data.communication_notes : JSON.stringify(data.communication_notes));
        }

        if (data.followup_history !== undefined) {
          updates.push('`followup_history` = ?');
          params.push(typeof data.followup_history === 'string' ? data.followup_history : JSON.stringify(data.followup_history));
        }

        if (updates.length > 0) {
          params.push(id);
          await query(`UPDATE leads SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ?`, params);
        }

        const [updated] = await query('SELECT * FROM leads WHERE id = ?', [id]);
        return sendJson(res, 200, parseRowJson(updated, ['communication_notes', 'followup_history']) || { id, ...data });
      } catch (err) {
        return sendJson(res, 500, { error: 'Failed to update lead in MySQL: ' + err.message });
      }
    }

    if (pathname.startsWith('/api/leads/') && method === 'DELETE') {
      const id = pathname.replace('/api/leads/', '');
      try {
        await query('DELETE FROM leads WHERE id = ?', [id]);
        return sendJson(res, 200, { success: true, message: 'Lead deleted from MySQL' });
      } catch (err) {
        return sendJson(res, 500, { error: 'Failed to delete lead from MySQL: ' + err.message });
      }
    }

    // -----------------------------------------------------------------
    // 8. REST API: Tickets CRUD (MySQL)
    // -----------------------------------------------------------------
    if (pathname === '/api/tickets' && method === 'GET') {
      try {
        const rows = await query('SELECT * FROM tickets ORDER BY created_at DESC');
        const parsed = (rows || []).map(r => parseRowJson(r, ['communication_notes', 'followup_history', 'documents']));
        return sendJson(res, 200, parsed);
      } catch (err) {
        return sendJson(res, 500, { error: 'MySQL Query Error: ' + err.message });
      }
    }

    if (pathname === '/api/tickets' && method === 'POST') {
      try {
        const data = await parseJsonBody(req);
        const ticketId = data.ticket_id || data.id || `t_${Date.now()}`;
        const clientId = data.client_id || '';
        const clientName = data.client_name || '';
        const lawyerId = data.lawyer_id || null;
        const lawyerName = data.lawyer_name || null;
        const serviceType = data.service_type || data.service || 'consultation';
        const description = data.description || '';
        const status = data.status || 'WORK_UNDER_PROCESS';
        const priority = data.priority || 'medium';
        const amount = parseFloat(data.amount || data.total_fee || '0') || 0;
        const advancePaid = parseFloat(data.advance_paid || '0') || 0;
        const followupHistory = JSON.stringify(data.followup_history || []);
        const commNotes = JSON.stringify(data.communication_notes || { notes: [], call_logs: [], meetings: [], activity_logs: [] });
        const documents = JSON.stringify(data.documents || []);

        await query(
          `INSERT INTO tickets (ticket_id, client_id, client_name, lawyer_id, lawyer_name, service_type, description, status, priority, amount, advance_paid, followup_history, communication_notes, documents)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             client_name = VALUES(client_name), lawyer_id = VALUES(lawyer_id), lawyer_name = VALUES(lawyer_name),
             service_type = VALUES(service_type), description = VALUES(description), status = VALUES(status),
             amount = VALUES(amount), advance_paid = VALUES(advance_paid), communication_notes = VALUES(communication_notes)`,
          [ticketId, clientId, clientName, lawyerId, lawyerName, serviceType, description, status, priority, amount, advancePaid, followupHistory, commNotes, documents]
        );

        const [created] = await query('SELECT * FROM tickets WHERE ticket_id = ?', [ticketId]);
        return sendJson(res, 201, parseRowJson(created, ['communication_notes', 'followup_history', 'documents']) || { ticket_id: ticketId, ...data });
      } catch (err) {
        return sendJson(res, 500, { error: 'Failed to create ticket in MySQL: ' + err.message });
      }
    }

    if (pathname.startsWith('/api/tickets/') && method === 'PUT') {
      const id = pathname.replace('/api/tickets/', '');
      try {
        const data = await parseJsonBody(req);
        const updates = [];
        const params = [];

        const allowedFields = ['client_id', 'client_name', 'lawyer_id', 'lawyer_name', 'service_type', 'description', 'status', 'priority', 'amount', 'advance_paid'];
        for (const field of allowedFields) {
          if (data[field] !== undefined) {
            updates.push(`\`${field}\` = ?`);
            params.push(data[field]);
          }
        }

        if (data.communication_notes !== undefined) {
          updates.push('`communication_notes` = ?');
          params.push(typeof data.communication_notes === 'string' ? data.communication_notes : JSON.stringify(data.communication_notes));
        }

        if (data.followup_history !== undefined) {
          updates.push('`followup_history` = ?');
          params.push(typeof data.followup_history === 'string' ? data.followup_history : JSON.stringify(data.followup_history));
        }

        if (data.documents !== undefined) {
          updates.push('`documents` = ?');
          params.push(typeof data.documents === 'string' ? data.documents : JSON.stringify(data.documents));
        }

        if (updates.length > 0) {
          params.push(id);
          await query(`UPDATE tickets SET ${updates.join(', ')}, updated_at = NOW() WHERE ticket_id = ?`, params);
        }

        const [updated] = await query('SELECT * FROM tickets WHERE ticket_id = ?', [id]);
        return sendJson(res, 200, parseRowJson(updated, ['communication_notes', 'followup_history', 'documents']) || { ticket_id: id, ...data });
      } catch (err) {
        return sendJson(res, 500, { error: 'Failed to update ticket in MySQL: ' + err.message });
      }
    }

    // -----------------------------------------------------------------
    // 9. REST API: Users & Activity Logs
    // -----------------------------------------------------------------
    if (pathname === '/api/users' && method === 'GET') {
      try {
        const rows = await query('SELECT id, name, email, phone, role, created_at FROM users ORDER BY created_at ASC');
        return sendJson(res, 200, rows || []);
      } catch (err) {
        return sendJson(res, 500, { error: 'MySQL Query Error: ' + err.message });
      }
    }

    if (pathname === '/api/activity-logs' && method === 'POST') {
      try {
        const data = await parseJsonBody(req);
        const id = data.id || `act_${Date.now()}`;
        await query(
          `INSERT INTO activity_logs (id, entity_type, entity_id, action, details, call_duration, call_status, recording_url, masked_number, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            data.entity_type || 'lead',
            data.entity_id || '',
            data.action || 'Note',
            data.details || '',
            data.call_duration || null,
            data.call_status || null,
            data.recording_url || null,
            data.masked_number || null,
            data.created_by || 'Staff',
          ]
        );
        return sendJson(res, 201, { id, success: true });
      } catch (err) {
        return sendJson(res, 500, { error: 'Failed to insert activity log in MySQL: ' + err.message });
      }
    }

    // -----------------------------------------------------------------
    // 10. Kapso AI WhatsApp Webhook (Verification & Inbound Events)
    // -----------------------------------------------------------------
    if ((pathname === '/webhooks/whatsapp' || pathname === '/webhooks/kapso/whatsapp') && method === 'GET') {
      const mode = parsedUrl.query['hub.mode'];
      const token = parsedUrl.query['hub.verify_token'];
      const challenge = parsedUrl.query['hub.challenge'];

      const expectedToken = process.env.KAPSO_WEBHOOK_VERIFY_TOKEN || 'vakil_kapso_token';
      if (mode === 'subscribe' && (!token || token === expectedToken)) {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(challenge || 'OK');
        return;
      }
      return sendJson(res, 403, { error: 'Verification token mismatch' });
    }

    if ((pathname === '/webhooks/whatsapp' || pathname === '/webhooks/kapso/whatsapp') && method === 'POST') {
      const headerEvent = req.headers['x-webhook-event'] || '';
      const body = await parseJsonBody(req);
      const events = parseKapsoWebhookPayload(body, headerEvent);

      for (const ev of events) {
        if (ev.type === 'message') {
          const cleanPhone = ev.from.slice(-10);
          const msgId = ev.messageId || `in_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

          // Find matching lead in MySQL
          let leadId = null;
          let existingNotes = { notes: [], call_logs: [], meetings: [], activity_logs: [] };
          try {
            const rows = await query(
              'SELECT id, communication_notes FROM leads WHERE whatsapp_number LIKE ? OR phone LIKE ? LIMIT 1',
              [`%${cleanPhone}`, `%${cleanPhone}`]
            );
            if (rows && rows.length > 0) {
              leadId = rows[0].id;
              if (rows[0].communication_notes) {
                existingNotes = typeof rows[0].communication_notes === 'string'
                  ? JSON.parse(rows[0].communication_notes)
                  : rows[0].communication_notes;
              }
            }
          } catch (e) {}

          // Insert into in-memory store and MySQL whatsapp_messages table
          const inboundMsg = {
            id: msgId,
            lead_id: leadId,
            ticket_id: null,
            phone_number: ev.from,
            direction: 'inbound',
            sender_id: null,
            sender_name: ev.name || 'Client',
            message_type: 'text',
            content: ev.text,
            status: 'delivered',
            kapso_message_id: ev.messageId,
            created_at: ev.timestamp || new Date().toISOString(),
          };

          const existingIdx = inMemoryWhatsAppMessages.findIndex(m => m.id === msgId || (m.kapso_message_id && m.kapso_message_id === msgId));
          if (existingIdx >= 0) {
            inMemoryWhatsAppMessages[existingIdx] = inboundMsg;
          } else {
            inMemoryWhatsAppMessages.push(inboundMsg);
          }

          try {
            await query(
              `INSERT INTO whatsapp_messages (id, lead_id, phone_number, direction, sender_name, message_type, content, status, kapso_message_id)
               VALUES (?, ?, ?, 'inbound', ?, 'text', ?, 'delivered', ?)`,
              [msgId, leadId, ev.from, ev.name, ev.text, ev.messageId]
            );
          } catch (dbErr) {
            console.warn('[Kapso Webhook] Could not insert whatsapp_message into MySQL (cached in memory):', dbErr.message);
          }

          // If lead exists, append to communication notes activity
          if (leadId) {
            try {
              const waActivityLog = {
                id: `act_${Date.now()}`,
                action: 'WhatsApp Received',
                details: `Inbound WhatsApp from client: "${ev.text.slice(0, 100)}${ev.text.length > 100 ? '...' : ''}"`,
                created_by: ev.name || 'Client',
                created_at: ev.timestamp || new Date().toISOString(),
              };
              existingNotes.activity_logs = [waActivityLog, ...(existingNotes.activity_logs || [])];
              await query('UPDATE leads SET communication_notes = ?, updated_at = NOW() WHERE id = ?', [
                JSON.stringify(existingNotes),
                leadId,
              ]);
            } catch (noteErr) {
              console.warn('[Kapso Webhook] Could not update lead notes:', noteErr.message);
            }
          }
        } else if (ev.type === 'status_update') {
          // Update in-memory message status for real-time delivery and read receipts
          const match = inMemoryWhatsAppMessages.find(m => m.id === ev.messageId || m.kapso_message_id === ev.messageId);
          if (match) {
            match.status = ev.status;
            if (ev.status === 'delivered') match.delivered_at = ev.timestamp;
            if (ev.status === 'read') match.read_at = ev.timestamp;
          }

          try {
            await query('UPDATE whatsapp_messages SET status = ? WHERE kapso_message_id = ?', [
              ev.status,
              ev.messageId,
            ]);
          } catch (stErr) {}
        }
      }

      return sendJson(res, 200, { success: true, processedEvents: events.length });
    }

    // -----------------------------------------------------------------
    // 11. REST API: Kapso WhatsApp Chat (Send, Fetch & Mark Read)
    // -----------------------------------------------------------------
    if (pathname === '/api/whatsapp/messages' && method === 'GET') {
      const phone = parsedUrl.query.phone ? formatWhatsAppNumber(parsedUrl.query.phone) : '';
      const leadId = parsedUrl.query.leadId || '';
      const ticketId = parsedUrl.query.ticketId || '';
      const cleanLast10 = phone ? phone.slice(-10) : '';

      // 1. Fetch live messages directly from Kapso Cloud Platform API
      let cloudMsgs = [];
      if (phone) {
        try {
          cloudMsgs = await fetchKapsoConversationMessages(phone);
        } catch (cloudErr) {
          console.warn('[WhatsApp] Could not fetch from Kapso Cloud API:', cloudErr.message);
        }
      }

      // Merge Cloud messages into inMemory store
      for (const cm of cloudMsgs) {
        const idx = inMemoryWhatsAppMessages.findIndex(m => 
          (m.kapso_message_id && (m.kapso_message_id === cm.id || m.kapso_message_id === cm.kapso_message_id)) ||
          m.id === cm.id
        );
        if (idx >= 0) {
          const ex = inMemoryWhatsAppMessages[idx];
          inMemoryWhatsAppMessages[idx] = { 
            ...ex, 
            ...cm, 
            sender_name: cm.direction === 'outbound' ? (ex.sender_name || 'Staff') : cm.sender_name 
          };
        } else {
          inMemoryWhatsAppMessages.push({ ...cm, lead_id: leadId || null, ticket_id: ticketId || null });
        }
      }

      // 2. Query MySQL if online
      try {
        let sql = 'SELECT * FROM whatsapp_messages WHERE 1=1';
        const params = [];

        if (leadId) {
          sql += ' AND (lead_id = ? OR phone_number LIKE ?)';
          params.push(leadId, `%${phone.slice(-10)}`);
        } else if (ticketId) {
          sql += ' AND (ticket_id = ? OR phone_number LIKE ?)';
          params.push(ticketId, `%${phone.slice(-10)}`);
        } else if (phone) {
          sql += ' AND phone_number LIKE ?';
          params.push(`%${phone.slice(-10)}`);
        }

        sql += ' ORDER BY created_at ASC LIMIT 100';

        const rows = await query(sql, params);
        if (rows && rows.length > 0) {
          // Merge with Cloud messages using canonical key
          const map = new Map();
          for (const r of rows) {
            const key = r.kapso_message_id || r.id;
            map.set(key, r);
          }
          for (const m of cloudMsgs) {
            const key = m.kapso_message_id || m.id;
            const existing = map.get(key) || {};
            map.set(key, { 
              ...existing, 
              ...m, 
              sender_name: m.direction === 'outbound' ? (existing.sender_name || 'Staff') : m.sender_name 
            });
          }
          const combined = Array.from(map.values()).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
          return sendJson(res, 200, combined);
        }
      } catch (err) {
        // MySQL unavailable, fall through
      }

      // 3. Fallback to merged in-memory store
      const matched = inMemoryWhatsAppMessages.filter(m => {
        if (leadId && m.lead_id === leadId) return true;
        if (ticketId && m.ticket_id === ticketId) return true;
        if (cleanLast10 && m.phone_number && String(m.phone_number).includes(cleanLast10)) return true;
        return false;
      });

      // Deduplicate using canonical key (kapso_message_id || id) and sort chronologically
      const map = new Map();
      for (const m of matched) {
        const key = m.kapso_message_id || m.id;
        map.set(key, m);
      }
      for (const m of cloudMsgs) {
        const key = m.kapso_message_id || m.id;
        const existing = map.get(key) || {};
        map.set(key, { 
          ...existing, 
          ...m, 
          sender_name: m.direction === 'outbound' ? (existing.sender_name || 'Staff') : m.sender_name 
        });
      }
      const finalSorted = Array.from(map.values()).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      return sendJson(res, 200, finalSorted);
    }

    if (pathname === '/api/whatsapp/mark-read' && method === 'POST') {
      try {
        const data = await parseJsonBody(req);
        const { messageId } = data;
        if (!messageId) {
          return sendJson(res, 400, { error: 'messageId is required' });
        }
        const result = await markWhatsAppMessageRead(messageId);
        return sendJson(res, 200, { success: true, result });
      } catch (err) {
        return sendJson(res, 500, { error: 'Failed to mark message read: ' + err.message });
      }
    }

    if (pathname === '/api/whatsapp/send' && method === 'POST') {
      try {
        const data = await parseJsonBody(req);
        const { leadId, ticketId, to, text, templateName, senderId, senderName } = data;

        if (!to || (!text && !templateName)) {
          return sendJson(res, 400, { error: 'Destination phone number and text/template are required' });
        }

        // 1. Dispatch through Kapso AI WhatsApp Cloud API
        const kapsoResult = await sendWhatsAppMessage({
          to,
          text,
          templateName,
        });

        if (!kapsoResult.success) {
          const rawErr = kapsoResult.raw?.error;
          const userFriendlyError = typeof rawErr === 'string'
            ? rawErr
            : (rawErr?.message || kapsoResult.error || 'Meta WhatsApp rejected the message.');
          return sendJson(res, 400, {
            error: userFriendlyError,
            kapso: kapsoResult,
          });
        }

        // 2. Prepare standardized message entity using canonical Meta WAMID as primary ID
        const kapsoMsgId = kapsoResult.messages?.[0]?.id || null;
        const msgId = kapsoMsgId || `wa_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const cleanPhone = formatWhatsAppNumber(to);

        const savedMessage = {
          id: msgId,
          lead_id: leadId || null,
          ticket_id: ticketId || null,
          phone_number: cleanPhone,
          direction: 'outbound',
          sender_id: senderId || 'staff',
          sender_name: senderName || 'Vakil Staff',
          message_type: templateName ? 'template' : 'text',
          content: String(text || `Template: ${templateName}`).trim(),
          status: 'sent',
          kapso_message_id: kapsoMsgId,
          created_at: new Date().toISOString(),
        };

        // Cache in memory (update if existing or push new)
        const existIdx = inMemoryWhatsAppMessages.findIndex(m => 
          (m.kapso_message_id && m.kapso_message_id === kapsoMsgId) || m.id === msgId
        );
        if (existIdx >= 0) {
          inMemoryWhatsAppMessages[existIdx] = savedMessage;
        } else {
          inMemoryWhatsAppMessages.push(savedMessage);
        }

        // 3. Gracefully persist in MySQL (wrapped so db errors never fail outbound messages)
        try {
          await query(
            `INSERT INTO whatsapp_messages (id, lead_id, ticket_id, phone_number, direction, sender_id, sender_name, message_type, content, status, kapso_message_id)
             VALUES (?, ?, ?, ?, 'outbound', ?, ?, ?, ?, 'sent', ?)`,
            [
              msgId,
              leadId || null,
              ticketId || null,
              cleanPhone,
              senderId || 'staff',
              senderName || 'Vakil Staff',
              templateName ? 'template' : 'text',
              String(text || `Template: ${templateName}`).trim(),
              kapsoMsgId,
            ]
          );

          if (leadId) {
            const rows = await query('SELECT communication_notes FROM leads WHERE id = ?', [leadId]);
            if (rows && rows.length > 0) {
              let notes = { notes: [], call_logs: [], meetings: [], activity_logs: [] };
              if (rows[0].communication_notes) {
                notes = typeof rows[0].communication_notes === 'string'
                  ? JSON.parse(rows[0].communication_notes)
                  : rows[0].communication_notes;
              }
              const logEntry = {
                id: `act_${Date.now()}`,
                action: 'WhatsApp Sent',
                details: `Outbound WhatsApp: "${(text || templateName).slice(0, 100)}"`,
                created_by: senderName || 'Staff',
                created_at: new Date().toISOString(),
              };
              notes.activity_logs = [logEntry, ...(notes.activity_logs || [])];
              await query('UPDATE leads SET communication_notes = ?, updated_at = NOW() WHERE id = ?', [
                JSON.stringify(notes),
                leadId,
              ]);
            }
          }
        } catch (dbErr) {
          console.warn('[WhatsApp Send] MySQL persistence skipped (message cached in memory):', dbErr.message);
        }

        return sendJson(res, 201, {
          success: true,
          message: savedMessage,
          kapso: kapsoResult,
        });
      } catch (err) {
        console.error('Failed to send WhatsApp message via Kapso:', err);
        return sendJson(res, 500, { error: 'Failed to send WhatsApp message: ' + err.message });
      }
    }

    // Root status endpoint
    if (req.method === 'GET' && (parsedUrl.pathname === '/' || parsedUrl.pathname === '')) {
      return sendJson(res, 200, {
        status: 'online',
        service: 'Vakil Lead Flow Backend & Kapso WhatsApp Webhook Server',
        version: '2.4.0',
        port: PORT,
        endpoints: {
          health: '/api/health',
          whatsapp_webhook: '/webhooks/whatsapp',
          whatsapp_messages: '/api/whatsapp/messages',
          leads: '/api/leads',
          tickets: '/api/tickets'
        },
        frontend_ui: 'http://localhost:8080',
        note: 'This is the backend API and webhook listener. To access the CRM UI, open http://localhost:8080 in your browser.'
      });
    }

    // Not Found
    return sendJson(res, 404, { error: 'Route not found' });
  } catch (globalErr) {
    console.error('Unhandled server error:', globalErr);
    return sendJson(res, 500, { error: 'Internal Server Error: ' + globalErr.message });
  }
});

server.listen(PORT, async () => {
  console.log(`=======================================================`);
  console.log(`🚀 Vakil Lead Flow CRM & Telephony Server running on port ${PORT}`);
  console.log(`Database: MySQL Engine (mysql2/promise)`);
  console.log(`Inbound Dialplan: http://localhost:${PORT}/webhooks/smartflo/dialplan`);
  console.log(`WhatsApp API:     http://localhost:${PORT}/api/whatsapp/messages`);
  console.log(`WhatsApp Webhook: http://localhost:${PORT}/webhooks/whatsapp`);
  console.log(`Leads REST API:   http://localhost:${PORT}/api/leads`);
  console.log(`Tickets REST API: http://localhost:${PORT}/api/tickets`);
  console.log(`Health Check:     http://localhost:${PORT}/api/health`);
  console.log(`=======================================================`);

  // Test MySQL connection on boot
  const dbTest = await testConnection();
  if (dbTest.connected) {
    console.log(`✓ Connected to MySQL database successfully.`);
  } else {
    console.warn(`ℹ MySQL Connection Status: ${dbTest.message}`);
    console.warn(`  (The CRM frontend will seamlessly use local persistence until MySQL is started)`);
  }
});
