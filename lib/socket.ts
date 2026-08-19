"use client";

import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

/** Singleton do socket — sobrevive à navegação client-side entre páginas. */
export function getSocket(): Socket {
  if (!socket) {
    socket = io({
      autoConnect: true,
      reconnection: true,
    });
  }
  return socket;
}

const PLAYER_ID_KEY = "caf_player_id";

/** Id estável do jogador nesse navegador, usado para reconectar na mesma sala. */
export function getPlayerId(): string {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(PLAYER_ID_KEY);
  if (!id) {
    id = `p_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
    window.localStorage.setItem(PLAYER_ID_KEY, id);
  }
  return id;
}
