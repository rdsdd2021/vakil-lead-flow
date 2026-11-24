import https from 'https';
import http from 'http';

/**
 * Smartflo Audio Recording Proxy & Normalizer
 * Fixes Tata Smartflo's malformed HTTP headers:
 * 1. Replaces comma-separated Content-Type ('audio/mp3, audio/x-mpeg...') with standard 'audio/mpeg'
 * 2. Removes broken Content-Disposition ('filename="http://172.17...') with clean 'call-recording.mp3'
 * 3. Supports HTTP 206 Partial Content Range streaming for scrubbing & seeking
 * 4. Detects and rejects empty 144-byte stub files (missed / unanswered calls)
 */
export default async function handler(req, res) {
  // Polyfill Express-style methods on native Node.js ServerResponse if needed
  if (!res.status) {
    res.status = function(code) {
      this.statusCode = code;
      return this;
    };
  }
  if (!res.json) {
    res.json = function(obj) {
      this.setHeader('Content-Type', 'application/json');
      return this.end(JSON.stringify(obj));
    };
  }

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const { url, callId, token } = req.query;

  let targetUrl = '';
  if (url) {
    targetUrl = decodeURIComponent(url);
  } else if (callId && token) {
    targetUrl = `https://cloudphone.tatateleservices.com/file/recording?callId=${encodeURIComponent(callId)}&type=rec&token=${encodeURIComponent(token)}`;
  }

  if (!targetUrl || !targetUrl.startsWith('http')) {
    return res.status(400).json({ error: 'Missing or invalid recording url or callId parameter' });
  }

  try {
    const parsedUrl = new URL(targetUrl);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    const fetchAudio = () => new Promise((resolve, reject) => {
      client.get(targetUrl, {
        headers: {
          'User-Agent': 'Vakiltech-CRM-Proxy/1.0',
          'Accept': '*/*',
        },
      }, (remoteRes) => {
        if (remoteRes.statusCode >= 300 && remoteRes.statusCode < 400 && remoteRes.headers.location) {
          // Handle redirect if any
          return resolve({ redirect: remoteRes.headers.location });
        }

        const chunks = [];
        remoteRes.on('data', chunk => chunks.push(chunk));
        remoteRes.on('end', () => {
          const buffer = Buffer.concat(chunks);
          resolve({
            statusCode: remoteRes.statusCode,
            headers: remoteRes.headers,
            buffer,
          });
        });
      }).on('error', reject);
    });

    let result = await fetchAudio();
    if (result.redirect) {
      targetUrl = result.redirect;
      result = await fetchAudio();
    }

    const { buffer } = result;

    if (!buffer || buffer.length === 0) {
      return res.status(404).json({ error: 'Recording audio file is empty' });
    }

    // Tata Smartflo sends a 144-byte stub MP3 with 0 audio frames when a call was missed/rejected
    if (buffer.length <= 256) {
      return res.status(404).json({ 
        error: 'No audio recorded. The call was missed or rejected before connecting.',
        bytes: buffer.length 
      });
    }

    const totalSize = buffer.length;
    const rangeHeader = req.headers.range;

    // Standard RFC-compliant audio headers
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    res.setHeader('Content-Disposition', 'inline; filename="call-recording.mp3"');

    if (rangeHeader) {
      // Support HTTP 206 Partial Content for seeking & scrubbing
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

      if (start >= totalSize || end >= totalSize) {
        res.setHeader('Content-Range', `bytes */${totalSize}`);
        return res.status(416).end();
      }

      const chunk = buffer.subarray(start, end + 1);
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${totalSize}`,
        'Content-Length': chunk.length,
        'Content-Type': 'audio/mpeg',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      });
      return res.end(chunk);
    }

    res.setHeader('Content-Length', totalSize);
    return res.status(200).end(buffer);
  } catch (error) {
    console.error('Recording proxy error:', error);
    return res.status(500).json({ error: 'Failed to retrieve recording from telecom server' });
  }
}
