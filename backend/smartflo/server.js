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
const { query, testConnection } = require('../db/mysql');
const { resolveDialplanRoute } = require('./smartflo-dialplan-webhook');
const hangupWebhook = require('./smartflo-hangup-webhook');
const missedWebhook = require('./smartflo-missed-webhook');
const callInitiate = require('./smartflo-call-initiate');

const PORT = parseInt(process.env.PORT || '3001', 10);

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
