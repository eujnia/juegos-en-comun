import express from 'express';
import { fileURLToPath } from 'node:url';
import { AppError, compareLibraries, getMultiplayerApps } from './steam.js';

export function createApp(key = process.env.STEAM_API_KEY ?? '', fetcher: typeof fetch = fetch, frontendOrigin = process.env.FRONTEND_ORIGIN ?? '') {
  const app = express();
  app.disable('x-powered-by');
  app.use('/api', express.json({ limit: '10kb' }));
  const allowedOrigin = frontendOrigin.trim().replace(/\/$/, '');
  if (allowedOrigin) {
    const url = new URL(allowedOrigin);
    if (!['https:', 'http:'].includes(url.protocol) || url.origin !== allowedOrigin) throw new Error('FRONTEND_ORIGIN debe ser un origen, por ejemplo https://tusitio.neocities.org');
  }
  app.use('/api', (req, res, next) => {
    res.vary('Origin');
    if (allowedOrigin && req.get('Origin') === allowedOrigin) {
      res.set('Access-Control-Allow-Origin', allowedOrigin);
      res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type');
    }
    if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
    next();
  });
  app.get('/api/health', (_req, res) => { res.json({ ok: true }); });
  app.post('/api/multiplayer', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const appids = req.body?.appids;
      if (!Array.isArray(appids) || appids.length === 0 || appids.length > 250 ||
          appids.some(appid => !Number.isInteger(appid) || appid <= 0) ||
          new Set(appids).size !== appids.length) {
        throw new AppError(400, 'INVALID_APPIDS', 'No pudimos revisar esos juegos. Volvé a realizar la comparación.');
      }
      res.json(await getMultiplayerApps(appids, fetcher));
    } catch (error) {
      const known = error instanceof AppError;
      res.status(known ? error.status : 502).json({ error: {
        code: known ? error.code : 'STORE_ERROR',
        message: known ? error.message : 'No pudimos consultar las categorías de Steam. Intentá nuevamente.'
      } });
    }
  });
  app.get('/api/compare', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const { user, user1, user2 } = req.query;
      const inputs = user === undefined ? [user1, user2] : Array.isArray(user) ? user : [user];
      if (!inputs.every((input): input is string => typeof input === 'string')) throw new AppError(400, 'EMPTY_INPUT', 'Completá todos los perfiles para comparar.');
      res.json(await compareLibraries(inputs, key, fetcher));
    } catch (error) {
      const known = error instanceof AppError;
      res.status(known ? error.status : 500).json({ error: {
        code: known ? error.code : 'INTERNAL_ERROR',
        message: known ? error.message : 'No pudimos completar la comparación. Intentá nuevamente.'
      } });
    }
  });
  app.use('/api', (_req, res) => { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'La ruta solicitada no existe.' } }); });
  app.use(express.static(fileURLToPath(new URL('../../public', import.meta.url))));
  return app;
}
