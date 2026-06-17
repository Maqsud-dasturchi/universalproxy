import express from 'express';
import cors from 'cors';
import handler from './api/telegram-proxy.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// Dynamically parse JSON only if the request is NOT a /bot stream forwarding request
app.use((req, res, next) => {
  if (req.path.startsWith('/bot')) {
    next();
  } else {
    express.json()(req, res, next);
  }
});

// Forward all requests to the main proxy handler logic
app.all('*', async (req, res) => {
  // Mock Vercel req/res API for the handler
  const vercelReq = {
    method: req.method,
    body: req.body,
    headers: req.headers,
    url: req.url
  };

  const vercelRes = {
    statusCode: 200,
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
      res.setHeader(name, value);
    },
    status(code) {
      this.statusCode = code;
      res.status(code);
      return this;
    },
    json(data) {
      res.json(data);
    },
    send(data) {
      res.send(data);
    },
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      res.writeHead(statusCode, headers);
    },
    pipe(dest) {
      // Mock for pipe if handler tries to pipe to res (which we handle)
      return res.pipe(dest);
    },
    end() {
      res.end();
    }
  };

  // If it's a stream, we must forward the original req stream or mock pipe
  if (req.path.startsWith('/bot')) {
    vercelReq.pipe = (dest) => req.pipe(dest);
    vercelReq.on = (event, listener) => req.on(event, listener);
  }

  try {
    await handler(vercelReq, vercelRes);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal Server Error', details: err.message });
    }
  }
});

app.listen(PORT, () => {
  console.log(`Proxy server is running on port ${PORT}`);
});
