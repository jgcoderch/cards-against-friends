const { loadEnvConfig } = require("@next/env");
loadEnvConfig(process.cwd()); // carrega .env.local/.env antes de qualquer módulo que leia process.env

const { createServer } = require("http");
const next = require("next");
const { Server } = require("socket.io");
const { RoomManager, MIN_PLAYERS_TO_START } = require("./server/rooms");
const { recordMatchResult } = require("./server/supabase");

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3000", 10);
const app = next({ dev });
const handle = app.getRequestHandler();

const roomManager = new RoomManager();

function broadcastRoom(io, room) {
  for (const player of room.playerList) {
    // O jogador pode ter mais de uma aba/socket aberta; manda pra todas.
    for (const [sockId, meta] of io.of("/").sockets) {
      if (meta.data.playerId === player.id && meta.data.roomCode === room.code) {
        meta.emit("room_update", room.buildStateFor(player.id));
      }
    }
  }
}

/** Reagenda o temporizador de fase da sala (submissão/julgamento) e, ao
 * disparar, força o avanço automático (carta aleatória / vencedor aleatório). */
function scheduleRoomTimer(io, room) {
  if (room.timeoutHandle) {
    clearTimeout(room.timeoutHandle);
    room.timeoutHandle = null;
  }
  if (!room.phaseDeadline) return;

  const delay = Math.max(0, room.phaseDeadline - Date.now());
  room.timeoutHandle = setTimeout(() => {
    room.timeoutHandle = null;
    if (room.phase === "submitting") {
      room.autoSubmitRemaining();
    } else if (room.phase === "judging") {
      room.autoChooseWinner();
    }
    syncRoom(io, room);
  }, delay);
}

/** Broadcast + (re)agendamento do timer + registro no Hall da Fama num só
 * lugar, pra nunca esquecer nenhum dos três quando o estado da sala muda. */
function syncRoom(io, room) {
  broadcastRoom(io, room);
  scheduleRoomTimer(io, room);
  if (room.phase === "gameover" && !room.resultRecorded) {
    room.resultRecorded = true;
    recordMatchResult(room).catch((err) =>
      console.error("Falha ao salvar resultado da partida:", err)
    );
  }
}

app.prepare().then(() => {
  const httpServer = createServer((req, res) => handle(req, res));
  const io = new Server(httpServer, {
    cors: { origin: "*" },
  });

  io.on("connection", (socket) => {
    socket.on("create_room", ({ playerId, playerName }, cb) => {
      try {
        const name = (playerName || "").trim().slice(0, 20) || "Jogador";
        const room = roomManager.createRoom(playerId, name);
        socket.data.playerId = playerId;
        socket.data.roomCode = room.code;
        socket.join(room.code);
        cb({ ok: true, code: room.code, state: room.buildStateFor(playerId) });
      } catch (err) {
        cb({ error: "Não foi possível criar a sala." });
      }
    });

    socket.on("join_room", ({ playerId, playerName, code }, cb) => {
      const name = (playerName || "").trim().slice(0, 20) || "Jogador";
      const result = roomManager.joinRoom(code, playerId, name);
      if (result.error) {
        cb({ error: result.error });
        return;
      }
      socket.data.playerId = playerId;
      socket.data.roomCode = result.room.code;
      socket.join(result.room.code);
      cb({ ok: true, code: result.room.code, state: result.room.buildStateFor(playerId) });
      syncRoom(io, result.room);
    });

    socket.on("start_game", (payload, cb) => {
      const room = roomManager.getRoom(socket.data.roomCode);
      if (!room) return cb?.({ error: "Sala não encontrada." });
      if (socket.data.playerId !== room.ownerId)
        return cb?.({ error: "Só o dono da sala pode iniciar." });
      if (room.playerList.length < MIN_PLAYERS_TO_START)
        return cb?.({ error: `Mínimo de ${MIN_PLAYERS_TO_START} jogadores pra começar.` });

      room.startGame(payload?.deckId, payload?.settings);
      cb?.({ ok: true });
      syncRoom(io, room);
    });

    socket.on("submit_card", ({ cardId }, cb) => {
      const room = roomManager.getRoom(socket.data.roomCode);
      if (!room) return cb?.({ error: "Sala não encontrada." });
      const result = room.submitCard(socket.data.playerId, cardId);
      cb?.(result);
      if (result.ok) syncRoom(io, room);
    });

    socket.on("choose_winner", ({ submissionId }, cb) => {
      const room = roomManager.getRoom(socket.data.roomCode);
      if (!room) return cb?.({ error: "Sala não encontrada." });
      const result = room.chooseWinner(socket.data.playerId, submissionId);
      cb?.(result);
      if (result.ok) syncRoom(io, room);
    });

    socket.on("next_round", (_payload, cb) => {
      const room = roomManager.getRoom(socket.data.roomCode);
      if (!room) return cb?.({ error: "Sala não encontrada." });
      const result = room.nextRound();
      cb?.(result);
      if (result.ok) syncRoom(io, room);
    });

    socket.on("back_to_lobby", (_payload, cb) => {
      const room = roomManager.getRoom(socket.data.roomCode);
      if (!room) return cb?.({ error: "Sala não encontrada." });
      if (socket.data.playerId !== room.ownerId)
        return cb?.({ error: "Só o dono da sala pode reiniciar." });

      room.resetToLobby();
      cb?.({ ok: true });
      syncRoom(io, room);
    });

    socket.on("leave_room", () => {
      const room = roomManager.getRoom(socket.data.roomCode);
      if (!room || !socket.data.playerId) return;
      roomManager.leaveRoom(room.code, socket.data.playerId);
      socket.leave(room.code);
      if (room.players.size > 0) syncRoom(io, room);
      socket.data.roomCode = null;
    });

    socket.on("disconnect", () => {
      const room = roomManager.getRoom(socket.data.roomCode);
      if (!room || !socket.data.playerId) return;

      // Só marca como desconectado se não houver outro socket do mesmo jogador ativo.
      const stillConnected = [...io.of("/").sockets.values()].some(
        (s) => s.data.playerId === socket.data.playerId && s.id !== socket.id
      );
      if (!stillConnected) {
        room.disconnectPlayer(socket.data.playerId);
        syncRoom(io, room);
      }
    });
  });

  httpServer.listen(port, () => {
    console.log(`> Servidor rodando em http://localhost:${port}`);
  });
});
