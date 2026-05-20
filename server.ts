import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import app from './api/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;
  
  // Serve static files / Vite
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), 'dist', 'client')));
    app.get('*', (req, res) => res.sendFile(path.join(process.cwd(), 'dist', 'client', 'index.html')));
  }

  app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server on http://localhost:${PORT}`));
}

startServer();
