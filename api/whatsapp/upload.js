global.MEDIA_STORE = global.MEDIA_STORE || new Map();

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { dataUrl, base64, contentType = 'application/octet-stream', filename = 'file' } = body;

    let buffer;
    let finalContentType = contentType;

    if (dataUrl && dataUrl.startsWith('data:')) {
      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        finalContentType = match[1];
        buffer = Buffer.from(match[2], 'base64');
      } else {
        return res.status(400).json({ error: 'Invalid data URL format' });
      }
    } else if (base64) {
      buffer = Buffer.from(base64, 'base64');
    } else {
      return res.status(400).json({ error: 'dataUrl or base64 is required' });
    }

    const id = `med_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    
    // Clean up older items if store grows beyond 100 items
    if (global.MEDIA_STORE.size > 100) {
      const firstKey = global.MEDIA_STORE.keys().next().value;
      if (firstKey) global.MEDIA_STORE.delete(firstKey);
    }

    global.MEDIA_STORE.set(id, {
      buffer,
      contentType: finalContentType,
      filename,
      createdAt: Date.now(),
    });

    const host = req.headers['x-forwarded-host'] || req.headers.host || 'vakil-lead-flow-main.vercel.app';
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const mediaUrl = `${proto}://${host}/api/whatsapp/media?id=${id}`;

    return res.status(200).json({
      success: true,
      media_id: id,
      media_url: mediaUrl,
      filename,
      content_type: finalContentType,
      byte_size: buffer.length,
    });
  } catch (err) {
    console.error('Error handling media upload:', err);
    return res.status(500).json({ error: 'Upload failed: ' + err.message });
  }
}
