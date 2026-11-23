// In-memory / persistent seed for Vercel serverless environment
let USERS_STORE = [
  { id: 'admin', name: 'Priya Sharma (Super Admin)', email: 'admin@vakiltech.com', phone: '9800000001', role: 'super_admin', status: 'active', specialization: 'Managing Partner' },
  { id: 'frontdesk', name: 'Rahul Verma (Front Desk)', email: 'frontdesk@vakiltech.com', phone: '9800000002', role: 'front_desk', status: 'active', specialization: 'Client Intake & Onboarding' },
  { id: 'devika', name: 'Adv. Devika', email: 'devika@vakiltech.com', phone: '9800000003', role: 'lawyer', status: 'active', specialization: 'Corporate & Contract Drafting' },
  { id: 'aaditya', name: 'Adv. Aaditya', email: 'aaditya@vakiltech.com', phone: '9800000004', role: 'lawyer', status: 'active', specialization: 'Civil & Property Disputes' },
  { id: 'pritam', name: 'Adv. Pritam Banik', email: 'pritam@vakiltech.com', phone: '9800000005', role: 'lawyer', status: 'active', specialization: 'Consumer & Commercial Law' },
  { id: 'lawyer', name: 'Adv. Meera Patel', email: 'lawyer@vakiltech.com', phone: '9800000006', role: 'lawyer', status: 'active', specialization: 'IPR & Trademark Protection' },
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // 1. GET /api/users
  if (req.method === 'GET') {
    return res.status(200).json(USERS_STORE);
  }

  // 2. POST /api/users (Create User)
  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const { name, email, phone, role = 'front_desk', specialization = '' } = body;

      if (!name || !email) {
        return res.status(400).json({ error: 'Name and email are required' });
      }

      const id = body.id || `usr_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
      const cleanPhone = String(phone || '').replace(/\D/g, '').slice(-10);

      const newUser = {
        id,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: cleanPhone || '9800000001',
        role,
        specialization: specialization.trim() || (role === 'lawyer' ? 'General Legal Practice' : ''),
        status: 'active',
        created_at: new Date().toISOString(),
      };

      USERS_STORE.push(newUser);
      return res.status(201).json({ success: true, user: newUser });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to create user: ' + err.message });
    }
  }

  // 3. PUT /api/users (Update User)
  if (req.method === 'PUT') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const { id } = body;

      if (!id) {
        return res.status(400).json({ error: 'User ID is required for updates' });
      }

      const index = USERS_STORE.findIndex(u => u.id === id);
      if (index === -1) {
        // Upsert if not found
        USERS_STORE.push(body);
        return res.status(200).json({ success: true, user: body });
      }

      const cleanPhone = body.phone ? String(body.phone).replace(/\D/g, '').slice(-10) : USERS_STORE[index].phone;

      USERS_STORE[index] = {
        ...USERS_STORE[index],
        ...body,
        phone: cleanPhone,
        updated_at: new Date().toISOString(),
      };

      return res.status(200).json({ success: true, user: USERS_STORE[index] });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to update user: ' + err.message });
    }
  }

  // 4. DELETE /api/users (Delete / Deactivate User)
  if (req.method === 'DELETE') {
    try {
      const { id } = req.query;
      if (!id) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      USERS_STORE = USERS_STORE.filter(u => u.id !== id);
      return res.status(200).json({ success: true, message: `User ${id} removed` });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to delete user: ' + err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
