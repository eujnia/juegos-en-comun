export interface User {
  steamId: string;
  name: string;
}

export interface CommonGame {
  appid: number;
  name: string;
  iconUrl?: string;
  playtimes: { steamId: string; minutes: number }[];
}

export interface CompareResult {
  count: number;
  users: User[];
  games: CommonGame[];
  notices: string[];
}

export interface ApiError {
  error: { code: string; message: string };
}
