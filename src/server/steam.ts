import type { CommonGame, CompareResult, User } from '../shared/types.js';

export class AppError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

interface SteamGame {
  appid: number;
  name?: string;
  img_icon_url?: string;
  playtime_forever?: number;
}

interface Player {
  steamid: string;
  personaname: string;
  communityvisibilitystate: number;
}

const steamFailure = () => new AppError(502, 'STEAM_ERROR', 'No pudimos consultar Steam. Intentá nuevamente en unos minutos.');

export function parseProfile(input: string): { kind: 'id' | 'vanity'; value: string } {
  let value = input.trim();
  const invalid = () => new AppError(400, 'INVALID_PROFILE', 'Ingresá una URL de perfil de Steam, un vanity name o un SteamID64 válido.');
  if (!value) throw new AppError(400, 'EMPTY_INPUT', 'Completá todos los perfiles para comparar.');
  if (value.length > 256) throw invalid();
  if (/^(https?:\/\/|(?:www\.)?steamcommunity\.com\/)/i.test(value)) {
    let url: URL;
    try { url = new URL(value.includes('://') ? value : `https://${value}`); }
    catch { throw invalid(); }
    if (!['steamcommunity.com', 'www.steamcommunity.com'].includes(url.hostname) || url.username || url.password || url.port) throw invalid();
    const match = url.pathname.match(/^\/(id|profiles)\/([^/]+)\/?$/);
    if (!match) throw invalid();
    value = match[2];
    if (match[1] === 'profiles') {
      if (!/^7656119\d{10}$/.test(value)) throw invalid();
      return { kind: 'id', value };
    }
    if (!/^[a-zA-Z0-9_-]{2,64}$/.test(value)) throw invalid();
    return { kind: 'vanity', value };
  }
  if (/^7656119\d{10}$/.test(value)) return { kind: 'id', value };
  if (/^\d{17}$/.test(value) || !/^[a-zA-Z0-9_-]{2,64}$/.test(value)) throw invalid();
  return { kind: 'vanity', value };
}

export async function compareLibraries(inputs: string[], key: string, fetcher: typeof fetch = fetch): Promise<CompareResult> {
  if (inputs.length < 2 || inputs.length > 10) throw new AppError(400, 'PROFILE_COUNT', 'Ingresá entre 2 y 10 perfiles para comparar.');
  const profiles = inputs.map(parseProfile);
  if (!key.trim()) throw new AppError(503, 'MISSING_API_KEY', 'Falta configurar la clave de Steam en el servidor (STEAM_API_KEY).');

  async function request<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(`https://api.steampowered.com/${path}/`);
    url.search = new URLSearchParams({ key, ...params }).toString();
    try {
      const response = await fetcher(url, { signal: AbortSignal.timeout(12000) });
      if (response.status === 401 || response.status === 403) throw new AppError(502, 'INVALID_API_KEY', 'Steam rechazó la clave del servidor. Revisá su configuración.');
      if (!response.ok) throw steamFailure();
      const body = await response.json();
      if (!body?.response || typeof body.response !== 'object' || Array.isArray(body.response)) throw steamFailure();
      return body.response as T;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw steamFailure();
    }
  }

  const ids = await Promise.all(profiles.map(async (profile, index) => {
    if (profile.kind === 'id') return profile.value;
    const result = await request<{ success: number; steamid?: string }>('ISteamUser/ResolveVanityURL/v1', { vanityurl: profile.value });
    if (result.success === 42) throw new AppError(404, 'PROFILE_NOT_FOUND', `No encontramos el perfil de Usuario ${index + 1}. Revisá el nombre o la URL.`);
    if (result.success !== 1 || !result.steamid || !/^\d{17}$/.test(result.steamid)) throw steamFailure();
    return result.steamid;
  }));
  if (new Set(ids).size !== ids.length) throw new AppError(400, 'DUPLICATE_PROFILE', 'Hay perfiles repetidos. Ingresá una cuenta diferente por persona.');
  const summaries = await request<{ players: Player[] }>('ISteamUser/GetPlayerSummaries/v2', { steamids: ids.join(',') });
  if (!Array.isArray(summaries.players)) throw steamFailure();
  const users: User[] = ids.map((id, index) => {
    const player = summaries.players.find(player => player.steamid === id);
    if (!player) throw new AppError(404, 'PROFILE_NOT_FOUND', `No encontramos el perfil de Usuario ${index + 1}.`);
    if (typeof player.communityvisibilitystate !== 'number' || typeof player.personaname !== 'string') throw steamFailure();
    if (player.communityvisibilitystate !== 3) throw new AppError(403, 'PRIVATE_PROFILE', `El perfil de Usuario ${index + 1} no es público. Cambiá su visibilidad en Steam para compararlo.`);
    return { steamId: id, name: player.personaname };
  });
  const libraries = await Promise.all(ids.map(async (steamid, index) => {
    const library = await request<{ game_count?: number; games?: SteamGame[] }>('IPlayerService/GetOwnedGames/v1', {
      steamid, include_appinfo: 'true', include_played_free_games: 'true'
    });
    if (library.game_count === undefined && library.games === undefined) {
      throw new AppError(403, 'LIBRARY_UNAVAILABLE', `Steam no permite consultar la biblioteca de Usuario ${index + 1}. Revisá que «Detalles de juegos» sea público; una respuesta vacía no permite confirmar si tiene juegos.`);
    }
    if (!Number.isInteger(library.game_count) || library.game_count! < 0) throw steamFailure();
    if (library.game_count === 0) return [];
    if (!Array.isArray(library.games) || library.games.length !== library.game_count) throw steamFailure();
    if (library.games.some(game => !Number.isInteger(game.appid) || game.appid <= 0 || (game.name !== undefined && typeof game.name !== 'string') || (game.playtime_forever !== undefined && (!Number.isFinite(game.playtime_forever) || game.playtime_forever < 0)))) throw steamFailure();
    return library.games;
  }));
  const maps = libraries.map(library => new Map(library.map(game => [game.appid, game])));
  const games: CommonGame[] = [];
  for (const game of libraries[0]) {
    if (!maps.every(library => library.has(game.appid))) continue;
    const copies = maps.map(library => library.get(game.appid)!);
    const hash = copies.find(copy => copy.img_icon_url)?.img_icon_url;
    games.push({
      appid: game.appid, name: copies.find(copy => copy.name)?.name || `Juego ${game.appid}`,
      ...(typeof hash === 'string' && /^[a-f0-9]{40}$/i.test(hash) ? { iconUrl: `https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/${game.appid}/${hash}.jpg` } : {}),
      playtimes: copies.map((copy, index) => ({ steamId: ids[index], minutes: copy.playtime_forever ?? 0 }))
    });
  }
  games.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  return { count: games.length, users, games,
    notices: libraries.flatMap((games, index) => games.length ? [] : [`${users[index].name} no tiene juegos visibles en su biblioteca.`]) };
}
