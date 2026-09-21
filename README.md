# Steam Games in Common

Para publicar el frontend en Neocities y el backend en Render, seguí [DEPLOY.md](DEPLOY.md).

Compara de 2 a 10 bibliotecas públicas por `appid`: muestra juegos que tengan al menos dos personas, aunque la primera no los tenga. Cada juego muestra los nombres y horas sólo de sus propietarios. Los resultados se ordenan por cantidad de propietarios y, en caso de empate, alfabéticamente. Permite agregar y quitar perfiles. Express + TypeScript + HTML/CSS, sin base de datos ni autenticación propia.

## Ejecutar

Requiere Node.js 22.9 o superior.

1. `npm install`
2. Copiá `.env.example` a `.env` y completá `STEAM_API_KEY` con tu [clave de Steam](https://steamcommunity.com/dev/apikey).
3. `npm run build`
4. `npm start` y abrí http://localhost:3000.

En PowerShell, usá `npm.cmd` si la política de ejecución bloquea `npm.ps1`.
`npm test` compila y ejecuta pruebas sin necesitar una clave real. `npm run dev` compila y observa el servidor compilado; después de editar TypeScript, ejecutá `npm run build` en otra terminal y recargá la página.

## Estructura

- `src/server/`: endpoint y servicio de Steam.
- `src/client/`: interfaz sin framework.
- `src/shared/`: tipos de respuesta.
- `public/`: HTML, CSS y JavaScript generado.
- `tests/`: pruebas con respuestas simuladas de Steam.

`GET /api/compare?user=...&user=...&user=...` acepta de 2 a 10 perfiles como URL, vanity name o SteamID64, sin cuentas repetidas. También acepta los parámetros anteriores `user1` y `user2` para dos perfiles. Devuelve `users` como lista y cada juego incluye `playtimes: [{ steamId, minutes }]`, junto a cantidad, juegos alfabéticos y avisos. Los tiempos de la API propia están en minutos; la interfaz muestra horas con hasta un decimal.

Se comparan juegos propios de todas las cuentas ingresadas. Agregar familiares no importa automáticamente los préstamos de Steam Families.

La clave se lee sólo en el servidor. Se usan [ResolveVanityURL y GetPlayerSummaries](https://partner.steamgames.com/doc/webapi/ISteamUser), y [GetOwnedGames](https://partner.steamgames.com/doc/webapi/IPlayerService) con `include_appinfo=true` e `include_played_free_games=true`.

Los perfiles y «Detalles de juegos» deben ser públicos. Una respuesta explícita con `game_count: 0` se informa como biblioteca sin juegos. Si Steam omite los datos, se informa biblioteca no accesible: esa respuesta por sí sola no demuestra si está vacía o privada. Los tiempos ocultos u omitidos por Steam se muestran como 0 h; no se pueden recuperar tiempos privados. No todos los juegos compartidos permiten multijugador.
