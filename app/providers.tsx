"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getPlayerId, getSocket } from "@/lib/socket";
import type { AckError, AckOk, GameSettings, RoomState } from "@/lib/types";

interface GameContextValue {
  connected: boolean;
  room: RoomState | null;
  error: string | null;
  clearError: () => void;
  createRoom: (playerName: string) => Promise<string | null>;
  joinRoom: (code: string, playerName: string) => Promise<string | null>;
  startGame: (deckId: string, settings: GameSettings) => void;
  submitCard: (cardId: string) => void;
  chooseWinner: (submissionId: string) => void;
  nextRound: () => void;
  backToLobby: () => void;
  leaveRoom: () => void;
}

const GameContext = createContext<GameContextValue | null>(null);

type Ack = AckOk | AckError;

export function GameProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef(getSocket());
  // Guarda a última sala/nome usados com sucesso, pra re-associar
  // automaticamente quando o socket reconectar (celulares derrubam a conexão
  // com frequência ao bloquear a tela ou trocar de rede — o servidor perde a
  // referência de sala daquele socket, então precisamos reentrar em silêncio).
  const lastJoinRef = useRef<{ code: string; name: string } | null>(null);

  useEffect(() => {
    const socket = socketRef.current;

    const rejoin = () => {
      const last = lastJoinRef.current;
      if (!last) return;
      const playerId = getPlayerId();
      socket.emit(
        "join_room",
        { playerId, playerName: last.name, code: last.code },
        (ack: Ack & { state?: RoomState }) => {
          if ("error" in ack) {
            setError(ack.error);
            return;
          }
          setRoom(ack.state ?? null);
        }
      );
    };

    const onConnect = () => {
      setConnected(true);
      rejoin();
    };
    const onDisconnect = () => setConnected(false);
    const onRoomUpdate = (state: RoomState) => setRoom(state);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("room_update", onRoomUpdate);
    setConnected(socket.connected);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("room_update", onRoomUpdate);
    };
  }, []);

  const createRoom = useCallback((playerName: string) => {
    return new Promise<string | null>((resolve) => {
      const playerId = getPlayerId();
      socketRef.current.emit(
        "create_room",
        { playerId, playerName },
        (ack: Ack & { code?: string; state?: RoomState }) => {
          if ("error" in ack) {
            setError(ack.error);
            resolve(null);
            return;
          }
          setRoom(ack.state ?? null);
          if (ack.code) lastJoinRef.current = { code: ack.code, name: playerName };
          resolve(ack.code ?? null);
        }
      );
    });
  }, []);

  const joinRoom = useCallback((code: string, playerName: string) => {
    return new Promise<string | null>((resolve) => {
      const playerId = getPlayerId();
      const normalizedCode = code.trim().toUpperCase();
      socketRef.current.emit(
        "join_room",
        { playerId, playerName, code: normalizedCode },
        (ack: Ack & { code?: string; state?: RoomState }) => {
          if ("error" in ack) {
            setError(ack.error);
            resolve(null);
            return;
          }
          setRoom(ack.state ?? null);
          if (ack.code) lastJoinRef.current = { code: ack.code, name: playerName };
          resolve(ack.code ?? null);
        }
      );
    });
  }, []);

  const startGame = useCallback((deckId: string, settings: GameSettings) => {
    socketRef.current.emit("start_game", { deckId, settings }, (ack: Ack) => {
      if ("error" in ack) setError(ack.error);
    });
  }, []);

  const submitCard = useCallback((cardId: string) => {
    socketRef.current.emit("submit_card", { cardId }, (ack: Ack) => {
      if ("error" in ack) setError(ack.error);
    });
  }, []);

  const chooseWinner = useCallback((submissionId: string) => {
    socketRef.current.emit("choose_winner", { submissionId }, (ack: Ack) => {
      if ("error" in ack) setError(ack.error);
    });
  }, []);

  const nextRound = useCallback(() => {
    socketRef.current.emit("next_round", {}, (ack: Ack) => {
      if ("error" in ack) setError(ack.error);
    });
  }, []);

  const backToLobby = useCallback(() => {
    socketRef.current.emit("back_to_lobby", {}, (ack: Ack) => {
      if ("error" in ack) setError(ack.error);
    });
  }, []);

  const leaveRoom = useCallback(() => {
    socketRef.current.emit("leave_room");
    lastJoinRef.current = null;
    setRoom(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return (
    <GameContext.Provider
      value={{
        connected,
        room,
        error,
        clearError,
        createRoom,
        joinRoom,
        startGame,
        submitCard,
        chooseWinner,
        nextRound,
        backToLobby,
        leaveRoom,
      }}
    >
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame precisa estar dentro de <GameProvider>.");
  return ctx;
}
