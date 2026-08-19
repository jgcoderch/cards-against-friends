const { DECKS, DECK_LIST } = require("./cards");

const HAND_SIZE = 7;
const DEFAULT_DECK_ID = "casual";
const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem O/0/I/1 pra evitar confusão
const MIN_PLAYERS_TO_START = 3;
const EMPTY_ROOM_TTL_MS = 5 * 60 * 1000; // limpa sala vazia após 5 min

const SETTINGS_LIMITS = {
  winScore: { min: 0, max: 20, step: 1, default: 7 }, // 0 = sem limite
  maxRounds: { min: 0, max: 50, step: 1, default: 0 }, // 0 = sem limite
  submitTimerSec: { min: 0, max: 180, step: 10, default: 60 }, // 0 = sem tempo
  judgeTimerSec: { min: 0, max: 180, step: 10, default: 40 }, // 0 = sem tempo
};

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function makeId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

/** Valida/normaliza as configurações vindas do cliente — nunca confia nelas cruas. */
function normalizeSettings(raw) {
  const settings = {};
  for (const [key, { min, max, step, default: fallback }] of Object.entries(SETTINGS_LIMITS)) {
    const n = Number(raw?.[key]);
    if (!Number.isFinite(n)) {
      settings[key] = fallback;
      continue;
    }
    const snapped = Math.round(n / step) * step;
    settings[key] = Math.min(max, Math.max(min, snapped));
  }
  return settings;
}

class Room {
  constructor(code, ownerId) {
    this.code = code;
    this.ownerId = ownerId;
    /** @type {Map<string, {id:string,name:string,score:number,connected:boolean,hand:{id:string,text:string}[]}>} */
    this.players = new Map();
    this.phase = "lobby"; // lobby | submitting | judging | reveal | gameover
    this.deckId = null;
    this.settings = normalizeSettings({});
    this.roundNumber = 0;
    this.judgeId = null;
    this.blackCard = null;
    this.blackDeck = [];
    this.blackDiscard = [];
    this.whiteDeck = [];
    this.whiteDiscard = [];
    /** @type {{id:string, playerId:string, cardId:string, text:string}[]} */
    this.submissions = [];
    this.winner = null; // { playerId, playerName, cardText }
    this.matchWinner = null; // { playerId, playerName, score, tiedPlayers } — só na fase "gameover"
    this.phaseDeadline = null; // epoch ms em que a fase atual expira (null = sem timer)
    this.timeoutHandle = null; // handle do setTimeout do temporizador atual (uso interno do server.js)
    this.emptySince = null;
  }

  get playerList() {
    return [...this.players.values()];
  }

  addPlayer(id, name) {
    this.players.set(id, {
      id,
      name,
      score: 0,
      connected: true,
      hand: [],
    });
    this.emptySince = null;
  }

  removePlayer(id) {
    this.players.delete(id);
    if (this.players.size === 0) {
      this.emptySince = Date.now();
    }
    if (this.ownerId === id) {
      const next = this.playerList[0];
      this.ownerId = next ? next.id : null;
    }
  }

  disconnectPlayer(id) {
    const p = this.players.get(id);
    if (p) p.connected = false;
  }

  reconnectPlayer(id) {
    const p = this.players.get(id);
    if (p) p.connected = true;
  }

  drawBlackCard() {
    if (this.blackDeck.length === 0) {
      if (this.blackDiscard.length === 0) return null;
      this.blackDeck = shuffle(this.blackDiscard);
      this.blackDiscard = [];
    }
    const card = this.blackDeck.pop();
    this.blackDiscard.push(card);
    return card;
  }

  drawWhiteCard() {
    if (this.whiteDeck.length === 0) {
      if (this.whiteDiscard.length === 0) return null;
      this.whiteDeck = shuffle(this.whiteDiscard);
      this.whiteDiscard = [];
    }
    const card = this.whiteDeck.pop();
    this.whiteDiscard.push(card);
    return card;
  }

  refillHand(player) {
    while (player.hand.length < HAND_SIZE) {
      const card = this.drawWhiteCard();
      if (!card) break;
      player.hand.push(card);
    }
  }

  submitDeadline() {
    return this.settings.submitTimerSec
      ? Date.now() + this.settings.submitTimerSec * 1000
      : null;
  }

  judgeDeadline() {
    return this.settings.judgeTimerSec
      ? Date.now() + this.settings.judgeTimerSec * 1000
      : null;
  }

  startGame(deckId, rawSettings) {
    this.deckId = DECKS[deckId] ? deckId : DEFAULT_DECK_ID;
    this.settings = normalizeSettings(rawSettings);
    const deck = DECKS[this.deckId];

    this.blackDeck = shuffle(
      deck.black.map((text, i) => ({ id: `b${i}`, text }))
    );
    this.blackDiscard = [];
    this.whiteDeck = shuffle(
      deck.white.map((text, i) => ({ id: `w${i}`, text }))
    );
    this.whiteDiscard = [];

    for (const player of this.playerList) {
      player.score = 0;
      player.hand = [];
      this.refillHand(player);
    }

    const ids = this.playerList.map((p) => p.id);
    this.judgeId = ids[0];
    this.blackCard = this.drawBlackCard();
    this.submissions = [];
    this.winner = null;
    this.matchWinner = null;
    this.roundNumber = 1;
    this.phase = "submitting";
    this.phaseDeadline = this.submitDeadline();
  }

  activePlayers() {
    return this.playerList.filter((p) => p.connected);
  }

  submittersNeeded() {
    return this.activePlayers().filter((p) => p.id !== this.judgeId).length;
  }

  submitCard(playerId, cardId) {
    const player = this.players.get(playerId);
    if (!player) return { error: "Jogador não encontrado." };
    if (this.phase !== "submitting") return { error: "Não é hora de jogar uma carta." };
    if (playerId === this.judgeId) return { error: "O juiz não joga carta nessa rodada." };
    if (this.submissions.some((s) => s.playerId === playerId))
      return { error: "Você já jogou sua carta." };

    const cardIndex = player.hand.findIndex((c) => c.id === cardId);
    if (cardIndex === -1) return { error: "Carta inválida." };

    const [card] = player.hand.splice(cardIndex, 1);
    this.submissions.push({
      id: makeId("sub"),
      playerId,
      cardId: card.id,
      text: card.text,
    });

    if (this.submissions.length >= this.submittersNeeded()) {
      this._beginJudging();
    }

    return { ok: true };
  }

  /** Chamado pelo temporizador de submissão: joga uma carta aleatória por
   * quem ainda não jogou e força a virada pra fase de julgamento. */
  autoSubmitRemaining() {
    if (this.phase !== "submitting") return;
    const submitted = new Set(this.submissions.map((s) => s.playerId));
    for (const player of this.activePlayers()) {
      if (player.id === this.judgeId || submitted.has(player.id)) continue;
      if (player.hand.length === 0) continue;
      const idx = Math.floor(Math.random() * player.hand.length);
      const [card] = player.hand.splice(idx, 1);
      this.submissions.push({
        id: makeId("sub"),
        playerId: player.id,
        cardId: card.id,
        text: card.text,
      });
    }
    this._beginJudging();
  }

  _beginJudging() {
    this.phase = "judging";
    this.submissions = shuffle(this.submissions);
    this.phaseDeadline = this.judgeDeadline();
  }

  chooseWinner(judgeId, submissionId) {
    if (this.phase !== "judging") return { error: "Não é hora de julgar." };
    if (judgeId !== this.judgeId) return { error: "Só o juiz escolhe a vencedora." };

    const submission = this.submissions.find((s) => s.id === submissionId);
    if (!submission) return { error: "Carta inválida." };

    const winnerPlayer = this.players.get(submission.playerId);
    if (winnerPlayer) winnerPlayer.score += 1;

    this.winner = {
      playerId: submission.playerId,
      playerName: winnerPlayer ? winnerPlayer.name : "?",
      cardText: submission.text,
    };

    const reachedScoreGoal =
      this.settings.winScore > 0 && winnerPlayer && winnerPlayer.score >= this.settings.winScore;
    const reachedRoundCap =
      this.settings.maxRounds > 0 && this.roundNumber >= this.settings.maxRounds;

    if (reachedScoreGoal || reachedRoundCap) {
      this.phase = "gameover";
      this.matchWinner = this._computeMatchWinner();
      this.phaseDeadline = null;
    } else {
      this.phase = "reveal";
      this.phaseDeadline = null;
    }

    return { ok: true };
  }

  /** Chamado pelo temporizador de julgamento: escolhe uma combinação aleatória. */
  autoChooseWinner() {
    if (this.phase !== "judging") return;
    if (this.submissions.length === 0) {
      this.phase = "reveal";
      this.winner = null;
      this.phaseDeadline = null;
      return;
    }
    const idx = Math.floor(Math.random() * this.submissions.length);
    this.chooseWinner(this.judgeId, this.submissions[idx].id);
  }

  _computeMatchWinner() {
    const sorted = [...this.playerList].sort((a, b) => b.score - a.score);
    const top = sorted[0];
    if (!top) return { playerId: null, playerName: null, score: 0, tiedPlayers: [] };
    const tied = sorted.filter((p) => p.score === top.score);
    return {
      playerId: tied.length === 1 ? top.id : null,
      playerName: tied.length === 1 ? top.name : null,
      score: top.score,
      tiedPlayers:
        tied.length > 1 ? tied.map((p) => ({ id: p.id, name: p.name, score: p.score })) : [],
    };
  }

  nextRound() {
    if (this.phase !== "reveal") return { error: "Ainda não terminou a rodada." };

    for (const player of this.playerList) {
      this.refillHand(player);
    }

    const ids = this.playerList.map((p) => p.id);
    const currentIndex = ids.indexOf(this.judgeId);
    const nextIndex = ids.length > 0 ? (currentIndex + 1) % ids.length : -1;
    this.judgeId = nextIndex >= 0 ? ids[nextIndex] : null;

    this.blackCard = this.drawBlackCard();
    this.submissions = [];
    this.winner = null;
    this.roundNumber += 1;
    this.phase = "submitting";
    this.phaseDeadline = this.submitDeadline();

    return { ok: true };
  }

  /** Reseta a sala pro lobby mantendo os jogadores, pra jogar de novo. */
  resetToLobby() {
    this.phase = "lobby";
    this.deckId = null;
    this.judgeId = null;
    this.blackCard = null;
    this.submissions = [];
    this.winner = null;
    this.matchWinner = null;
    this.roundNumber = 0;
    this.phaseDeadline = null;
    for (const player of this.playerList) {
      player.score = 0;
      player.hand = [];
    }
  }

  /** Estado público + privado (mão) construído para um jogador específico. */
  buildStateFor(playerId) {
    const me = this.players.get(playerId);
    return {
      code: this.code,
      phase: this.phase,
      ownerId: this.ownerId,
      judgeId: this.judgeId,
      deckId: this.deckId,
      availableDecks: DECK_LIST,
      settings: this.settings,
      settingsLimits: SETTINGS_LIMITS,
      roundNumber: this.roundNumber,
      phaseDeadline: this.phaseDeadline,
      blackCard: this.blackCard,
      players: this.playerList.map((p) => ({
        id: p.id,
        name: p.name,
        score: p.score,
        connected: p.connected,
        isJudge: p.id === this.judgeId,
        isOwner: p.id === this.ownerId,
        hasSubmitted: this.submissions.some((s) => s.playerId === p.id),
      })),
      hand: me ? me.hand : [],
      submissionsCount: this.submissions.length,
      submittersNeeded: this.submittersNeeded(),
      // Na fase de julgamento/reveal, mostra as cartas (sem dono) pro juiz/todos julgarem.
      submissions:
        this.phase === "judging" || this.phase === "reveal"
          ? this.submissions.map((s) => ({ id: s.id, text: s.text }))
          : [],
      winner: this.winner,
      matchWinner: this.matchWinner,
      you: me
        ? {
            id: me.id,
            name: me.name,
            isOwner: me.id === this.ownerId,
            isJudge: me.id === this.judgeId,
          }
        : null,
    };
  }
}

class RoomManager {
  constructor() {
    /** @type {Map<string, Room>} */
    this.rooms = new Map();
    setInterval(() => this.cleanupEmptyRooms(), 60 * 1000).unref();
  }

  generateCode() {
    let code;
    do {
      code = Array.from({ length: 4 }, () =>
        ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)]
      ).join("");
    } while (this.rooms.has(code));
    return code;
  }

  createRoom(ownerId, ownerName) {
    const code = this.generateCode();
    const room = new Room(code, ownerId);
    room.addPlayer(ownerId, ownerName);
    this.rooms.set(code, room);
    return room;
  }

  getRoom(code) {
    return this.rooms.get((code || "").toUpperCase());
  }

  joinRoom(code, playerId, playerName) {
    const room = this.getRoom(code);
    if (!room) return { error: "Sala não encontrada." };
    if (room.phase !== "lobby" && !room.players.has(playerId)) {
      return { error: "Essa sala já começou o jogo." };
    }
    if (!room.players.has(playerId)) {
      room.addPlayer(playerId, playerName);
      if (room.phase !== "lobby") {
        room.refillHand(room.players.get(playerId));
      }
    } else {
      // Jogador já estava na sala: isso é uma reconexão (troca de rede,
      // aba em segundo plano, etc.) — só restaura o status de conectado.
      room.reconnectPlayer(playerId);
    }
    return { ok: true, room };
  }

  leaveRoom(code, playerId) {
    const room = this.getRoom(code);
    if (!room) return;
    room.removePlayer(playerId);
    if (room.players.size === 0) {
      room.emptySince = Date.now();
      if (room.timeoutHandle) {
        clearTimeout(room.timeoutHandle);
        room.timeoutHandle = null;
      }
    } else if (room.phase !== "lobby" && room.phase !== "gameover") {
      // Se o juiz saiu no meio da rodada, avança pra manter o jogo fluindo.
      if (room.judgeId === playerId && room.phase !== "reveal") {
        room.phase = "reveal";
        room.winner = null;
        room.phaseDeadline = null;
      }
    }
  }

  cleanupEmptyRooms() {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      if (room.players.size === 0 && room.emptySince && now - room.emptySince > EMPTY_ROOM_TTL_MS) {
        if (room.timeoutHandle) clearTimeout(room.timeoutHandle);
        this.rooms.delete(code);
      }
    }
  }
}

module.exports = { RoomManager, MIN_PLAYERS_TO_START, SETTINGS_LIMITS };
