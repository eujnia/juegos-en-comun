# Render + Neocities

La app completa se ejecuta en Render. Una página de Neocities la muestra dentro de un iframe. La clave de Steam queda únicamente en Render.

Se eligió esta opción porque `https://eujnia.neocities.org/` tiene `connect-src 'self'`, que bloquea consultas directas a Render, pero permite frames externos. [Referencia de Neocities](https://github.com/neocities/neocities/issues/484).

## 1. GitHub

Creá un repositorio vacío para esta app en https://github.com/new. Subí estos archivos y carpetas conservando su estructura:

- `src/`, `public/`, `scripts/`, `tests/`
- `package.json`, `package-lock.json`
- `tsconfig.json`, `tsconfig.client.json`
- `render.yaml`, `.gitignore`, `.env.example`, `README.md`, `DEPLOY.md`

No subas `.env`, `node_modules`, `dist` ni `neocities-upload`. El JavaScript generado en `public/assets` tampoco hace falta: Render lo compila.

## 2. Render

En https://dashboard.render.com: **New → Blueprint**, conectá el repositorio. `render.yaml` ya selecciona un Web Service gratuito y configura build, arranque y dominio de Neocities. Completá `STEAM_API_KEY` con tu clave en el formulario de Render.

Si preferís **New → Web Service**, configurá:

- Runtime: Node; plan: Free.
- Build: `npm ci --include=dev && npm run build`
- Start: `npm start`
- Health check: `/api/health`
- Variables: `NODE_VERSION=22.19.0`, `STEAM_API_KEY` y `FRONTEND_ORIGIN=https://eujnia.neocities.org`.

Render asigna `PORT` automáticamente. [Referencia de configuración](https://render.com/docs/blueprint-spec).

Cuando termine, abrí la URL `https://TU-SERVICIO.onrender.com` y compará dos perfiles públicos. `/api/health` debe responder `{"ok":true}`, aunque ese chequeo por sí solo no verifica la clave de Steam.

## 3. Neocities

En PowerShell, reemplazá la dirección por la URL real de Render:

```powershell
$env:API_BASE_URL = 'https://TU-SERVICIO.onrender.com'
npm.cmd run export:neocities
```

Se genera `neocities-upload/index.html`, una página de aproximadamente 1 KB. En Neocities creá la carpeta `steam` y subí **sólo ese archivo** dentro de ella. No reemplaces el `index.html` de tu portada.

Abrí https://eujnia.neocities.org/steam/. La página incorpora la aplicación de Render, con un enlace para abrirla en otra pestaña. No necesita claves ni JavaScript adicional en Neocities.

El plan gratuito de Render puede tardar alrededor de un minuto en arrancar después de 15 minutos de inactividad. [Límites](https://render.com/docs/free).

## Actualizaciones

Publicá los cambios en GitHub para desplegarlos en Render. La página de Neocities no necesita cambios salvo que cambie la URL de Render. El funcionamiento local con `npm start` se conserva.
