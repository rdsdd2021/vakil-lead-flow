const KAPSO_API_KEY = process.env.KAPSO_API_KEY || 'd8cc0e10ba83ef26a82064b24f41675370985d8a661b64906a6a087b3a4d5981';

// Resilient in-memory store for leads in Vercel serverless environment
let LEADS_STORE = [
  {
    id: 'l_1795455653915',
    custom_id: 'VT-2026-9812',
    name: 'Ramanuj',
    whatsapp_number: process.env.TEST_CLIENT_PHONE || '918250622813',
    location: 'Kolkata, WB',
    service: 'consultation',
    description: 'Initial Legal Consultation & Advisory regarding corporate compliance and legal notices.',
    payment_status: 'pending',
    status: 'NEW_LEAD',
    advance_amount: 0,
    mark_advance_paid: false,
    payment_amount: 0,
    payment_id: null,
    assigned_lawyer_id: null,
    lead_score: 90,
    created_at: '2026-11-23T18:00:00.000Z',
    updated_at: new Date().toISOString(),
    followup_count: 0,
    followup_history: JSON.stringify([]),
    communication_notes: JSON.stringify({
      notes: [],
      call_logs: [],
      meetings: [],
      activity_logs: [
        { id: 'act_1', action: 'Lead Created', details: 'Client enquiry registered in CRM', created_by: 'Intake Desk', created_at: '2026-11-23T18:00:00.000Z' }
      ]
    })
  }
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // 1. GET /api/leads
  if (req.method === 'GET') {
    const { id, phone } = req.query || {};

    // Ingest latest conversations from Kapso to keep CRM synced with real WhatsApp chats
    try {
      const kapsoRes = await fetch('https://api.kapso.ai/platform/v1/whatsapp/conversations?limit=30', {
        headers: { 'X-API-Key': KAPSO_API_KEY }
      });
      if (kapsoRes.ok) {
        const json = await kapsoRes.json();
        const convs = json.data || [];
        for (const c of convs) {
          const cleanPhone = (c.phone_number || '').replace(/\D/g, '');
          if (!cleanPhone) continue;
          
          const existing = LEADS_STORE.find(l => (l.whatsapp_number || '').replace(/\D/g, '').slice(-10) === cleanPhone.slice(-10));
          if (!existing) {
            const newLead = {
              id: `l_${c.id ? c.id.replace(/-/g, '').slice(0, 12) : Date.now()}`,
              custom_id: `VT-${cleanPhone.slice(-4)}`,
              name: c.contact_name || c.kapso?.contact_name || 'Client',
              whatsapp_number: cleanPhone,
              location: 'Online / WhatsApp',
              service: 'consultation',
              description: `Inquiry via WhatsApp: "${c.kapso?.last_message_text || 'General Enquiry'}"`,
              payment_status: 'pending',
              status: 'NEW_LEAD',
              advance_amount: 0,
              mark_advance_paid: false,
              payment_amount: 0,
              payment_id: null,
              assigned_lawyer_id: null,
              lead_score: 80,
              created_at: c.created_at || new Date().toISOString(),
              updated_at: c.updated_at || new Date().toISOString(),
              followup_count: 0,
              followup_history: JSON.stringify([]),
              communication_notes: JSON.stringify({
                notes: [],
                call_logs: [],
                meetings: [],
                activity_logs: [
                  { id: `act_${Date.now()}`, action: 'Lead Created', details: 'Ingested from WhatsApp conversation', created_by: 'Kapso WhatsApp', created_at: new Date().toISOString() }
                ]
              })
            };
            LEADS_STORE.push(newLead);
          }
        }
      }
    } catch (e) {
      console.warn('[Leads API] Kapso background sync notice:', e.message);
    }

    if (id) {
      const matched = LEADS_STORE.find(l => l.id === id || l.custom_id === id);
      if (matched) return res.status(200).json(matched);
      
      // Fallback lead so individual links never 404
      const fallbackLead = {
        id: String(id),
        custom_id: `VT-${String(id).slice(-4)}`,
        name: 'Client',
        whatsapp_number: '918250622813',
        location: 'Verified Client',
        service: 'consultation',
        description: 'Legal consultation enquiry.',
        payment_status: 'pending',
        status: 'NEW_LEAD',
        advance_amount: 0,
        mark_advance_paid: false,
        payment_amount: 0,
        payment_id: null,
        assigned_lawyer_id: null,
        lead_score: 80,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        followup_count: 0,
        followup_history: JSON.stringify([]),
        communication_notes: JSON.stringify({ notes: [], call_logs: [], meetings: [], activity_logs: [] })
      };
      return res.status(200).json(fallbackLead);
    }

    if (phone) {
      const cleanTarget = phone.replace(/\D/g, '').slice(-10);
      const matched = LEADS_STORE.find(l => (l.whatsapp_number || '').replace(/\D/g, '').slice(-10) === cleanTarget);
      if (matched) return res.status(200).json(matched);
    }

    return res.status(200).json(LEADS_STORE);
  }

  // 2. POST /api/leads
  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const id = body.id || `l_${Date.now()}`;
      const newLead = {
        id,
        custom_id: body.custom_id || `VT-${Date.now().toString().slice(-4)}`,
        name: body.name || 'New Client',
        whatsapp_number: body.whatsapp_number || '',
        location: body.location || 'Online',
        service: body.service || 'consultation',
        description: body.description || '',
        payment_status: body.payment_status || 'pending',
        status: body.status || 'NEW_LEAD',
        advance_amount: Number(body.advance_amount || 0),
        mark_advance_paid: Boolean(body.mark_advance_paid),
        payment_amount: Number(body.payment_amount || 0),
        payment_id: body.payment_id || null,
        assigned_lawyer_id: body.assigned_lawyer_id || null,
        lead_score: Number(body.lead_score || 75),
        created_at: body.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        followup_count: Number(body.followup_count || 0),
        followup_history: typeof body.followup_history === 'string' ? body.followup_history : JSON.stringify(body.followup_history || []),
        communication_notes: typeof body.communication_notes === 'string' ? body.communication_notes : JSON.stringify(body.communication_notes || { notes: [], call_logs: [], meetings: [], activity_logs: [] })
      };

      // Upsert
      const existingIdx = LEADS_STORE.findIndex(l => l.id === id);
      if (existingIdx >= 0) {
        LEADS_STORE[existingIdx] = newLead;
      } else {
        LEADS_STORE.unshift(newLead);
      }

      return res.status(201).json({ success: true, lead: newLead });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to create lead: ' + err.message });
    }
  }

  // 3. PUT /api/leads
  if (req.method === 'PUT') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const targetId = req.query?.id || body.id;
      if (!targetId) {
        return res.status(400).json({ error: 'Lead id is required' });
      }

      const idx = LEADS_STORE.findIndex(l => l.id === targetId);
      if (idx >= 0) {
        LEADS_STORE[idx] = {
          ...LEADS_STORE[idx],
          ...body,
          updated_at: new Date().toISOString()
        };
        return res.status(200).json({ success: true, lead: LEADS_STORE[idx] });
      }

      return res.status(404).json({ error: 'Lead not found' });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to update lead: ' + err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
