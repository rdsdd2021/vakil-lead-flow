// Global in-memory cache for media served to Meta WhatsApp Cloud API
// Key: media_id -> { buffer: Buffer, contentType: string, filename: string, createdAt: number }
global.MEDIA_STORE = global.MEDIA_STORE || new Map();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const { id } = req.query;
  if (!id) {
    return res.status(400).send('Missing media ID');
  }

  const media = global.MEDIA_STORE.get(id);
  if (!media) {
    return res.status(404).send('Media not found or expired');
  }

  res.setHeader('Content-Type', media.contentType || 'application/octet-stream');
  res.setHeader('Content-Length', media.buffer.length);
  if (media.filename) {
    res.setHeader('Content-Disposition', `inline; filename="${media.filename}"`);
  }
  res.setHeader('Cache-Control', 'public, max-age=86400');

  if (req.method === 'HEAD') {
    return res.status(200).end();
  }

  return res.status(200).send(media.buffer);
}
