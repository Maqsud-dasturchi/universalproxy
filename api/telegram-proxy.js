import https from 'https';

function proxyGet(telegramUrl, res) {
  return new Promise((resolve, reject) => {
    const telegramReq = https.request(telegramUrl, { method: 'GET' }, (telegramRes) => {
      res.writeHead(telegramRes.statusCode, telegramRes.headers);
      telegramRes.pipe(res);
      telegramRes.on('end', resolve);
    });

    telegramReq.on('error', (err) => {
      if (!res.headersSent) {
        res.status(500).json({ error: 'File proxy failed', details: err.message });
      }
      reject(err);
    });

    telegramReq.end();
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Fayl yuklash: /file/bot{token}/photos/file_7.jpg
    const fileMatch = req.url.match(/\/file\/bot([^/]+)\/(.+)/);
    if (fileMatch) {
      const token = fileMatch[1];
      const filePath = fileMatch[2].split('?')[0];
      const queryIndex = req.url.indexOf('?');
      const queryString = queryIndex !== -1 ? req.url.substring(queryIndex) : '';
      const telegramUrl = `https://api.telegram.org/file/bot${token}/${filePath}${queryString}`;
      await proxyGet(telegramUrl, res);
      return;
    }

    let token, method;
    let isStream = false;

    const urlMatch = req.url.match(/\/bot([^/]+)\/([^/\?]+)/);
    if (urlMatch) {
      token = urlMatch[1];
      method = urlMatch[2];
      isStream = true;
    } else if (req.body && req.body.token && req.body.method) {
      token = req.body.token;
      method = req.body.method;
    }

    if (!token || !method) {
      return res.status(400).json({ error: 'Missing token or method' });
    }

    const queryIndex = req.url.indexOf('?');
    const queryString = queryIndex !== -1 ? req.url.substring(queryIndex) : '';
    const telegramUrl = `https://api.telegram.org/bot${token}/${method}${queryString}`;

    if (isStream) {
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
        if (Buffer.isBuffer(req.body)) {
          telegramReq.write(req.body);
          telegramReq.end();
        } else if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
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
      const payload = req.body?.payload;
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
