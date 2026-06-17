import https from 'https';

export default async function handler(req, res) {
  // CORS headers setup
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    let token, method, payload;
    let isStream = false;

    // Check if it's the /bot<token>/<method> style
    const urlMatch = req.url.match(/\/bot([^/]+)\/([^/\?]+)/);
    if (urlMatch) {
      token = urlMatch[1];
      method = urlMatch[2];
      isStream = true;
    } else if (req.body && req.body.token && req.body.method) {
      // JSON body style
      token = req.body.token;
      method = req.body.method;
      payload = req.body.payload;
    }

    if (!token || !method) {
      return res.status(400).json({ error: 'Missing token or method' });
    }

    const telegramUrl = `https://api.telegram.org/bot${token}/${method}`;

    if (isStream) {
      // Forward headers (removing host)
      const headers = { ...req.headers };
      delete headers.host;

      const telegramReq = https.request(telegramUrl, {
        method: req.method,
        headers: headers
      }, (telegramRes) => {
        res.writeHead(telegramRes.statusCode, telegramRes.headers);
        telegramRes.pipe(res);
      });

      telegramReq.on('error', (err) => {
        if (!res.headersSent) {
          res.status(500).json({ error: 'Proxy forwarding failed', details: err.message });
        }
      });

      if (req.method === 'GET' || req.method === 'HEAD') {
        telegramReq.end();
      } else {
        // If the body has already been parsed (e.g., by some middleware), we write it, otherwise pipe
        if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
          telegramReq.write(JSON.stringify(req.body));
          telegramReq.end();
        } else if (req.body && typeof req.body === 'string') {
          telegramReq.write(req.body);
          telegramReq.end();
        } else {
          req.pipe(telegramReq);
        }
      }
    } else {
      // JSON body format
      const postData = JSON.stringify(payload || {});
      const telegramReq = https.request(telegramUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      }, (telegramRes) => {
        let body = '';
        telegramRes.on('data', (chunk) => body += chunk);
        telegramRes.on('end', () => {
          res.status(telegramRes.statusCode).send(body);
        });
      });

      telegramReq.on('error', (err) => {
        if (!res.headersSent) {
          res.status(500).json({ error: 'Proxy request failed', details: err.message });
        }
      });

      telegramReq.write(postData);
      telegramReq.end();
    }
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
  }
}
