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

// Forward all requests to the main proxy handler logic directly using Express req and res
app.all('*', async (req, res) => {
  try {
    await handler(req, res);
  } catch (err) {
    console.error('Server error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal Server Error', details: err.message });
    }
  }
});

app.listen(PORT, () => {
  console.log(`Proxy server is running on port ${PORT}`);
});
