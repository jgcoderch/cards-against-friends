import { describe, it, expect, beforeEach } from "vitest";
import { RoomManager, SETTINGS_LIMITS } from "../server/rooms.js";

function makeRoomWithPlayers(manager, playerCount = 3) {
  const room = manager.createRoom("p0", "Dono");
  for (let i = 1; i < playerCount; i++) {
    manager.joinRoom(room.code, `p${i}`, `Jogador${i}`);
  }
  return room;
}

describe("RoomManager", () => {
  let manager;

  beforeEach(() => {
    manager = new RoomManager();
  });

  it("cria uma sala com código de 4 caracteres e o dono como primeiro jogador", () => {
    const room = manager.createRoom("owner1", "Alice");
    expect(room.code).toHaveLength(4);
    expect(room.ownerId).toBe("owner1");
    expect(room.playerList).toHaveLength(1);
    expect(room.playerList[0].name).toBe("Alice");
  });

  it("gera códigos sem caracteres ambíguos (sem O/0/I/1)", () => {
    for (let i = 0; i < 30; i++) {
      expect(manager.generateCode()).not.toMatch(/[O0I1]/);
    }
  });

  it("busca sala ignorando maiúsculas/minúsculas", () => {
    const room = manager.createRoom("owner1", "Alice");
    expect(manager.getRoom(room.code.toLowerCase())).toBe(room);
  });

  it("entrar em sala inexistente retorna erro", () => {
    expect(manager.joinRoom("ZZZZ", "p1", "Bob").error).toBeTruthy();
  });

  it("permite vários jogadores entrarem no lobby", () => {
    const room = makeRoomWithPlayers(manager, 3);
    expect(room.playerList.map((p) => p.name)).toEqual(["Dono", "Jogador1", "Jogador2"]);
  });

  it("recusa novo jogador quando a partida já começou", () => {
    const room = makeRoomWithPlayers(manager, 3);
    room.startGame("casual", {});
    expect(manager.joinRoom(room.code, "novato", "Novato").error).toMatch(/já começou/);
  });

  it("reconecta jogador que já estava na sala em vez de duplicar", () => {
    const room = makeRoomWithPlayers(manager, 3);
    room.startGame("casual", {});
    room.disconnectPlayer("p1");
    expect(room.players.get("p1").connected).toBe(false);

    const result = manager.joinRoom(room.code, "p1", "Jogador1");
    expect(result.ok).toBe(true);
    expect(room.players.size).toBe(3);
    expect(room.players.get("p1").connected).toBe(true);
  });

  it("ao sair, promove outro jogador a dono se o dono saiu", () => {
    const room = makeRoomWithPlayers(manager, 3);
    manager.leaveRoom(room.code, "p0");
    expect(room.ownerId).toBe("p1");
  });

  it("força a fase pra 'reveal' se o juiz sair no meio da rodada", () => {
    const room = makeRoomWithPlayers(manager, 3);
    room.startGame("casual", {});
    manager.leaveRoom(room.code, room.judgeId);
    expect(room.phase).toBe("reveal");
    expect(room.winner).toBeNull();
  });

  it("remove salas vazias só depois do TTL de inatividade", () => {
    const room = manager.createRoom("owner1", "Alice");
    manager.leaveRoom(room.code, "owner1");
    expect(manager.rooms.has(room.code)).toBe(true);

    room.emptySince = Date.now() - 6 * 60 * 1000; // simula 6 min atrás (TTL é 5 min)
    manager.cleanupEmptyRooms();
    expect(manager.rooms.has(room.code)).toBe(false);
  });
});

describe("Room — ciclo da partida", () => {
  let manager, room;

  beforeEach(() => {
    manager = new RoomManager();
    room = makeRoomWithPlayers(manager, 3);
  });

  it("startGame reparte 7 cartas, sorteia carta preta e define o primeiro juiz", () => {
    room.startGame("casual", {});
    expect(room.phase).toBe("submitting");
    expect(room.judgeId).toBe("p0");
    expect(room.blackCard).not.toBeNull();
    expect(room.roundNumber).toBe(1);
    for (const player of room.playerList) {
      expect(player.hand).toHaveLength(7);
    }
  });

  it("normaliza configurações inválidas: NaN vira default, valores fora do range são clampados e arredondados pro step", () => {
    room.startGame("casual", {
      winScore: "abacate",
      submitTimerSec: 23,
      maxRounds: -5,
      judgeTimerSec: 999,
    });
    expect(room.settings.winScore).toBe(SETTINGS_LIMITS.winScore.default);
    expect(room.settings.submitTimerSec).toBe(20); // 23 -> múltiplo de 10 mais próximo
    expect(room.settings.maxRounds).toBe(0); // clamp no mínimo
    expect(room.settings.judgeTimerSec).toBe(SETTINGS_LIMITS.judgeTimerSec.max); // clamp no máximo
  });

  it("recusa carta de jogador inexistente, do juiz, fora da fase certa ou repetida", () => {
    room.startGame("casual", {});
    const judge = room.players.get(room.judgeId);
    const nonJudge = room.playerList.find((p) => p.id !== room.judgeId);

    expect(room.submitCard("fantasma", nonJudge.hand[0].id).error).toBeTruthy();
    expect(room.submitCard(judge.id, judge.hand[0].id).error).toMatch(/juiz/);

    const cardId = nonJudge.hand[0].id;
    expect(room.submitCard(nonJudge.id, cardId).ok).toBe(true);
    expect(room.submitCard(nonJudge.id, cardId).error).toMatch(/já jogou/);
  });

  it("avança pra 'judging' assim que todos os não-juízes jogaram", () => {
    room.startGame("casual", {});
    const nonJudges = room.playerList.filter((p) => p.id !== room.judgeId);
    for (const p of nonJudges) room.submitCard(p.id, p.hand[0].id);

    expect(room.phase).toBe("judging");
    expect(room.submissions).toHaveLength(nonJudges.length);
  });

  it("autoSubmitRemaining preenche cartas aleatórias de quem faltou e força a virada pra julgamento", () => {
    room.startGame("casual", {});
    const nonJudges = room.playerList.filter((p) => p.id !== room.judgeId);
    room.submitCard(nonJudges[0].id, nonJudges[0].hand[0].id); // só um joga
    expect(room.phase).toBe("submitting");

    room.autoSubmitRemaining();
    expect(room.phase).toBe("judging");
    expect(room.submissions).toHaveLength(nonJudges.length);
  });

  it("chooseWinner dá ponto ao vencedor, recusa não-juiz e recusa fora da fase de julgamento", () => {
    room.startGame("casual", {});
    const nonJudges = room.playerList.filter((p) => p.id !== room.judgeId);
    for (const p of nonJudges) room.submitCard(p.id, p.hand[0].id);

    const submission = room.submissions[0];
    expect(room.chooseWinner("intruso", submission.id).error).toBeTruthy();

    const result = room.chooseWinner(room.judgeId, submission.id);
    expect(result.ok).toBe(true);
    expect(room.phase).toBe("reveal");
    expect(room.players.get(submission.playerId).score).toBe(1);
    expect(room.winner.playerId).toBe(submission.playerId);

    expect(room.chooseWinner(room.judgeId, submission.id).error).toMatch(/julgar/);
  });

  it("autoChooseWinner escolhe uma combinação aleatória quando o juiz não responde a tempo", () => {
    room.startGame("casual", {});
    const nonJudges = room.playerList.filter((p) => p.id !== room.judgeId);
    for (const p of nonJudges) room.submitCard(p.id, p.hand[0].id);

    room.autoChooseWinner();
    expect(room.phase).toBe("reveal");
    expect(room.winner).not.toBeNull();
  });

  it("encerra a partida (gameover) ao atingir a pontuação-alvo configurada", () => {
    room.startGame("casual", { winScore: 1 });
    const nonJudges = room.playerList.filter((p) => p.id !== room.judgeId);
    for (const p of nonJudges) room.submitCard(p.id, p.hand[0].id);
    room.chooseWinner(room.judgeId, room.submissions[0].id);

    expect(room.phase).toBe("gameover");
    expect(room.matchWinner.score).toBe(1);
    expect(room.matchWinner.tiedPlayers).toEqual([]);
  });

  it("encerra a partida (gameover) ao bater o máximo de rodadas, mesmo sem ninguém atingir a meta de pontos", () => {
    room.startGame("casual", { winScore: 0, maxRounds: 1 });
    const nonJudges = room.playerList.filter((p) => p.id !== room.judgeId);
    for (const p of nonJudges) room.submitCard(p.id, p.hand[0].id);
    room.chooseWinner(room.judgeId, room.submissions[0].id);

    expect(room.phase).toBe("gameover");
  });

  it("detecta empate no fim de jogo entre os jogadores com a maior pontuação", () => {
    room.startGame("casual", {});
    const [p0, p1, p2] = room.playerList;
    p0.score = 3;
    p1.score = 3;
    p2.score = 1;

    const matchWinner = room._computeMatchWinner();
    expect(matchWinner.playerId).toBeNull();
    expect(matchWinner.tiedPlayers.map((p) => p.id).sort()).toEqual([p0.id, p1.id].sort());
  });

  it("nextRound reparte a mão, sorteia carta preta nova e roda o juiz pro próximo jogador", () => {
    room.startGame("casual", {});
    const firstJudge = room.judgeId;
    const nonJudges = room.playerList.filter((p) => p.id !== firstJudge);
    for (const p of nonJudges) room.submitCard(p.id, p.hand[0].id);
    room.chooseWinner(firstJudge, room.submissions[0].id);

    const result = room.nextRound();
    expect(result.ok).toBe(true);
    expect(room.phase).toBe("submitting");
    expect(room.roundNumber).toBe(2);
    expect(room.judgeId).not.toBe(firstJudge);
    for (const player of room.playerList) {
      expect(player.hand).toHaveLength(7);
    }
  });

  it("resetToLobby zera placar e mão mas mantém os jogadores na sala", () => {
    room.startGame("casual", { winScore: 1 });
    const nonJudges = room.playerList.filter((p) => p.id !== room.judgeId);
    for (const p of nonJudges) room.submitCard(p.id, p.hand[0].id);
    room.chooseWinner(room.judgeId, room.submissions[0].id);
    expect(room.phase).toBe("gameover");

    room.resetToLobby();
    expect(room.phase).toBe("lobby");
    expect(room.players.size).toBe(3);
    for (const player of room.playerList) {
      expect(player.score).toBe(0);
      expect(player.hand).toHaveLength(0);
    }
  });

  it("resultRecorded começa falso, fica marcável, e reseta a cada novo jogo (evita salvar 2x no Hall da Fama)", () => {
    expect(room.resultRecorded).toBe(false);

    room.startGame("casual", { winScore: 1 });
    expect(room.resultRecorded).toBe(false);

    room.resultRecorded = true; // é isso que o server.js faz ao salvar no Supabase
    room.resetToLobby();
    expect(room.resultRecorded).toBe(false);

    room.startGame("casual", { winScore: 1 });
    expect(room.resultRecorded).toBe(false);
  });

  it("buildStateFor só revela a própria mão e esconde as submissões até a fase de julgamento", () => {
    room.startGame("casual", {});
    const nonJudge = room.playerList.find((p) => p.id !== room.judgeId);

    const state = room.buildStateFor(nonJudge.id);
    expect(state.hand).toHaveLength(7);
    expect(state.submissions).toEqual([]);
    expect(state.you.id).toBe(nonJudge.id);
    expect(state.you.isJudge).toBe(false);

    const judgeState = room.buildStateFor(room.judgeId);
    expect(judgeState.you.isJudge).toBe(true);
  });
});
