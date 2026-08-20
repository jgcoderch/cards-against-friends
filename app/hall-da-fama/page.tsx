"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";

interface LeaderboardEntry {
  playerId: string;
  name: string;
  wins: number;
  matches: number;
}

interface ApiResponse {
  configured: boolean;
  leaderboard: LeaderboardEntry[];
  error?: string;
}

const MEDALS = ["🥇", "🥈", "🥉"];

export default function HallDaFamaPage() {
  const [state, setState] = useState<{ loading: boolean; data: ApiResponse | null }>({
    loading: true,
    data: null,
  });

  useEffect(() => {
    fetch("/api/hall-da-fama")
      .then((res) => res.json())
      .then((data: ApiResponse) => setState({ loading: false, data }))
      .catch(() =>
        setState({
          loading: false,
          data: { configured: true, leaderboard: [], error: "Falha ao carregar." },
        })
      );
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-10">
      <header className="text-center">
        <p className="text-5xl">🏆</p>
        <h1 className="font-display mt-2 text-3xl font-bold tracking-tight">Hall da Fama</h1>
        <p className="mt-2 text-sm text-white/60">
          Placar histórico de todas as partidas jogadas, sobrevive a restart do servidor.
        </p>
      </header>

      {state.loading && <p className="text-center text-sm text-white/50">Carregando...</p>}

      {!state.loading && state.data && !state.data.configured && (
        <div className="animate-in rounded-xl border border-white/10 bg-white/5 p-5 text-center text-sm text-white/60">
          O Hall da Fama ainda não foi configurado nesse deploy — falta ligar o banco de dados
          (Supabase). Veja a seção "Banco de dados" do README pra configurar.
        </div>
      )}

      {!state.loading && state.data?.error && (
        <div className="animate-in rounded-xl border border-red-500/40 bg-red-500/10 p-5 text-center text-sm text-red-300">
          Não deu pra carregar o placar agora: {state.data.error}
        </div>
      )}

      {!state.loading &&
        state.data?.configured &&
        !state.data.error &&
        (state.data.leaderboard.length === 0 ? (
          <p className="text-center text-sm text-white/50">
            Ninguém terminou uma partida ainda. Joga uma rodada com os amigos pra aparecer aqui!
          </p>
        ) : (
          <ul className="animate-in flex flex-col gap-2">
            {state.data.leaderboard.map((entry, i) => (
              <li
                key={entry.playerId}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3"
              >
                <span className="w-6 text-center text-sm">{MEDALS[i] ?? i + 1}</span>
                <Avatar id={entry.playerId} name={entry.name} />
                <span className="flex-1">
                  <span className="block font-medium">{entry.name}</span>
                  <span className="block text-xs text-white/50">
                    {entry.matches} partida{entry.matches === 1 ? "" : "s"} jogada
                    {entry.matches === 1 ? "" : "s"}
                  </span>
                </span>
                <span className="font-display text-lg font-bold text-amber-300">{entry.wins}</span>
              </li>
            ))}
          </ul>
        ))}

      <Link href="/" className="mt-auto text-center text-sm text-white/50 underline">
        Voltar pro início
      </Link>
    </main>
  );
}
