export type Phase = "lobby" | "submitting" | "judging" | "reveal" | "gameover";

export interface CardData {
  id: string;
  text: string;
}

export interface PlayerPublic {
  id: string;
  name: string;
  score: number;
  connected: boolean;
  isJudge: boolean;
  isOwner: boolean;
  hasSubmitted: boolean;
}

export interface WinnerInfo {
  playerId: string;
  playerName: string;
  cardText: string;
}

export interface MatchWinner {
  playerId: string | null;
  playerName: string | null;
  score: number;
  tiedPlayers: { id: string; name: string; score: number }[];
}

export interface DeckInfo {
  id: string;
  name: string;
  description: string;
  mature: boolean;
}

export interface GameSettings {
  /** Pontos necessários pra vencer a partida. 0 = sem limite. */
  winScore: number;
  /** Máximo de rodadas antes de encerrar a partida. 0 = sem limite. */
  maxRounds: number;
  /** Segundos pra cada jogador escolher a carta branca. 0 = sem tempo. */
  submitTimerSec: number;
  /** Segundos pro juiz escolher a vencedora. 0 = sem tempo. */
  judgeTimerSec: number;
}

export interface SettingLimit {
  min: number;
  max: number;
  step: number;
  default: number;
}

export type SettingsLimits = Record<keyof GameSettings, SettingLimit>;

export interface RoomState {
  code: string;
  phase: Phase;
  ownerId: string | null;
  judgeId: string | null;
  deckId: string | null;
  availableDecks: DeckInfo[];
  settings: GameSettings;
  settingsLimits: SettingsLimits;
  roundNumber: number;
  phaseDeadline: number | null;
  blackCard: CardData | null;
  players: PlayerPublic[];
  hand: CardData[];
  submissionsCount: number;
  submittersNeeded: number;
  submissions: CardData[];
  winner: WinnerInfo | null;
  matchWinner: MatchWinner | null;
  you: {
    id: string;
    name: string;
    isOwner: boolean;
    isJudge: boolean;
  } | null;
}

export interface AckError {
  error: string;
}

export interface AckOk {
  ok: true;
}
