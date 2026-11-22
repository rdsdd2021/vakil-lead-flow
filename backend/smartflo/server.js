/**
 * Standalone Tata Smartflo Webhook & API Dialplan Server
 * 
 * Run with: node backend/smartflo/server.js
 * Default Port: 3001
 * 
 * Endpoints for Tata Smartflo Portal:
 * - API Dialplan: POST/GET http://<your-domain-or-ip>:3001/webhooks/smartflo/dialplan
 * - Hangup Webhook: POST http://<your-domain-or-ip>:3001/webhooks/smartflo/hangup
 * - Missed Call Webhook: POST http://<your-domain-or-ip>:3001/webhooks/smartflo/missed
 */

const http = require('http');
const url = require('url');
const { resolveDialplanRoute } = require('./smartflo-dialplan-webhook');

const PORT = process.env.PORT || 3001;

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const path = parsedUrl.pathname;
  const method = req.method;

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (path === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'Tata Smartflo Dynamic Dialplan Server' }));
    return;
  }

  // Method 2: Smartflo API Dialplan Endpoint (Inbound Lead Routing)
  if (path === '/webhooks/smartflo/dialplan') {
    let bodyData = '';

    req.on('data', chunk => {
      bodyData += chunk;
    });

    req.on('end', async () => {
      try {
        let callerId = '';
        let didNumber = '';

        if (bodyData) {
          try {
            const body = JSON.parse(bodyData);
            callerId = body.caller_id || body.caller_number || body.customer_number || '';
            didNumber = body.did_number || body.caller_id_num || '';
          } catch (e) {}
        }

        // Also check query string (some Smartflo configurations send GET parameters)
        if (!callerId && parsedUrl.query) {
          callerId = parsedUrl.query.caller_id || parsedUrl.query.customer_number || '';
          didNumber = parsedUrl.query.did_number || '';
        }

        const dialplanResponse = await resolveDialplanRoute(callerId, didNumber);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(dialplanResponse));
      } catch (err) {
        console.error('Error handling dialplan request:', err);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([
          {
            transfer: {
              type: 'number',
              data: [process.env.FALLBACK_AGENT_PHONE || '919800000000'],
            },
          },
        ]));
      }
    });
    return;
  }

  // Smartflo Hangup Webhook (Recording Sync)
  if (path === '/webhooks/smartflo/hangup' && method === 'POST') {
    let bodyData = '';
    req.on('data', chunk => bodyData += chunk);
    req.on('end', () => {
      console.log('[Smartflo Hangup Event]:', bodyData);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Hangup processed' }));
    });
    return;
  }

  // Smartflo Missed Call Webhook (Agent Busy Alert)
  if (path === '/webhooks/smartflo/missed' && method === 'POST') {
    let bodyData = '';
    req.on('data', chunk => bodyData += chunk);
    req.on('end', () => {
      console.log('[Smartflo Missed Call Event]:', bodyData);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Missed call notification received' }));
    });
    return;
  }

  // Not found
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint not found' }));
});

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 Tata Smartflo API Dialplan Server running on port ${PORT}`);
  console.log(`Inbound Dialplan URL: http://localhost:${PORT}/webhooks/smartflo/dialplan`);
  console.log(`=======================================================`);
});
