import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.API_BASE_URL?.trim();
if (!base) throw new Error('Indicá API_BASE_URL con la URL HTTPS de Render antes de exportar.');
const url = new URL(base);
if (url.protocol !== 'https:' || url.origin !== base.replace(/\/$/, '')) throw new Error('API_BASE_URL debe ser un origen HTTPS sin rutas.');

await mkdir('neocities-upload', { recursive: true });
// Sólo un HTML: nunca copiar .env, código del servidor ni dependencias.
await writeFile('neocities-upload/index.html', `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Juegos en común · Steam</title>
  <style>
    :root { color-scheme: dark; font-family: system-ui, sans-serif; background: #111820; color: #e8edf2; }
    body { margin: 0; }
    header { padding: 12px 20px; text-align: center; font-size: 12px; line-height: 1.5; }
    a { color: #94c9d6; }
    iframe { display: block; width: 100%; height: calc(100vh - 60px); height: calc(100dvh - 60px); min-height: 600px; border: 0; }
  </style>
</head>
<body>
  <header>La primera carga puede tardar alrededor de un minuto. <a href="${url.origin}/" target="_blank" rel="noopener noreferrer">Abrir la app en otra pestaña ↗</a></header>
  <iframe src="${url.origin}/" title="Comparar bibliotecas de Steam" referrerpolicy="no-referrer"></iframe>
</body>
</html>
`);
console.log('Página lista en neocities-upload/index.html. Subí sólo ese archivo a /steam/index.html en Neocities.');
