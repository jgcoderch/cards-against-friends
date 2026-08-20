"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useGame } from "./providers";

type Mode = "idle" | "create" | "join";

const NAME_KEY = "caf_player_name";

export default function HomePage() {
  const router = useRouter();
  const { createRoom, joinRoom, error, clearError } = useGame();
  const [mode, setMode] = useState<Mode>("idle");
  const [name, setName] = useState(
    typeof window !== "undefined" ? window.localStorage.getItem(NAME_KEY) ?? "" : ""
  );
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    window.localStorage.setItem(NAME_KEY, name.trim());
    const roomCode = await createRoom(name.trim());
    setLoading(false);
    if (roomCode) router.push(`/room/${roomCode}`);
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !code.trim()) return;
    setLoading(true);
    window.localStorage.setItem(NAME_KEY, name.trim());
    const roomCode = await joinRoom(code.trim(), name.trim());
    setLoading(false);
    if (roomCode) router.push(`/room/${roomCode}`);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-6 py-10">
      <header className="text-center">
        <div className="mb-5 flex justify-center gap-2" aria-hidden="true">
          <span className="card-black flex h-16 w-12 -rotate-6 items-center justify-center rounded-lg text-[10px] font-bold text-white/70">
            ?
          </span>
          <span className="card-white flex h-16 w-12 rotate-3 items-center justify-center rounded-lg text-[10px] font-bold text-ink/60">
            !
          </span>
          <span className="card-black flex h-16 w-12 rotate-12 items-center justify-center rounded-lg text-[10px] font-bold text-white/70">
            ?
          </span>
        </div>
        <h1 className="font-display text-4xl font-bold tracking-tight">
          Cards{" "}
          <span className="bg-gradient-to-r from-amber-300 via-orange-400 to-pink-400 bg-clip-text text-transparent">
            Against
          </span>{" "}
          Friends
        </h1>
        <p className="mt-2 text-sm text-white/60">
          O clássico jogo de combinações absurdas — com baralho próprio.
        </p>
      </header>

      {error && (
        <div
          className="animate-in rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300"
          onClick={clearError}
        >
          {error}
        </div>
      )}

      {mode === "idle" && (
        <div className="animate-in flex flex-col gap-3">
          <button
            className="btn-primary tap-scale rounded-xl py-4 text-lg font-bold font-display"
            onClick={() => setMode("create")}
          >
            Criar sala
          </button>
          <button
            className="tap-scale rounded-xl border border-white/15 bg-white/5 py-4 text-lg font-bold backdrop-blur-sm"
            onClick={() => setMode("join")}
          >
            Entrar com código
          </button>
          <Link href="/hall-da-fama" className="mt-1 text-center text-sm text-white/50 underline">
            🏆 Hall da Fama
          </Link>
        </div>
      )}

      {mode === "create" && (
        <form className="animate-in flex flex-col gap-3" onSubmit={handleCreate}>
          <label className="text-sm text-white/70">
            Seu nome
            <input
              autoFocus
              maxLength={20}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Como te chamam?"
              className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-base outline-none focus:border-amber-400"
            />
          </label>
          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="btn-primary tap-scale rounded-xl py-4 text-lg font-bold font-display disabled:opacity-50"
          >
            {loading ? "Criando..." : "Criar sala"}
          </button>
          <button
            type="button"
            className="text-sm text-white/50 underline"
            onClick={() => setMode("idle")}
          >
            Voltar
          </button>
        </form>
      )}

      {mode === "join" && (
        <form className="animate-in flex flex-col gap-3" onSubmit={handleJoin}>
          <label className="text-sm text-white/70">
            Código da sala
            <input
              autoFocus
              maxLength={4}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="EX: AB3D"
              className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-base uppercase tracking-widest outline-none focus:border-amber-400"
            />
          </label>
          <label className="text-sm text-white/70">
            Seu nome
            <input
              maxLength={20}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Como te chamam?"
              className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-base outline-none focus:border-amber-400"
            />
          </label>
          <button
            type="submit"
            disabled={loading || !name.trim() || code.trim().length < 4}
            className="btn-primary tap-scale rounded-xl py-4 text-lg font-bold font-display disabled:opacity-50"
          >
            {loading ? "Entrando..." : "Entrar na sala"}
          </button>
          <button
            type="button"
            className="text-sm text-white/50 underline"
            onClick={() => setMode("idle")}
          >
            Voltar
          </button>
        </form>
      )}
    </main>
  );
}
