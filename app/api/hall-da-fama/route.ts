import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";

export const dynamic = "force-dynamic";

interface MatchPlayer {
  playerId: string;
  name: string;
  score: number;
}

interface LeaderboardEntry {
  playerId: string;
  name: string;
  wins: number;
  matches: number;
}

export async function GET() {
  // Checar a instância diretamente (em vez de isSupabaseConfigured()) deixa o
  // TypeScript estreitar `client` pra não-nulo no resto da função.
  const client = supabaseAdmin;
  if (!client) {
    return NextResponse.json({ configured: false, leaderboard: [] });
  }

  const { data, error, count } = await client
    .from("matches")
    .select("players, winner_player_id", { count: "exact" })
    .order("created_at", { ascending: true })
    .limit(2000);

  if (error) {
    return NextResponse.json(
      { configured: true, leaderboard: [], error: error.message, debugCount: count },
      { status: 500 }
    );
  }

  const stats = new Map<string, LeaderboardEntry>();
  for (const match of data ?? []) {
    const players = (match.players ?? []) as MatchPlayer[];
    for (const p of players) {
      const entry = stats.get(p.playerId) ?? {
        playerId: p.playerId,
        name: p.name,
        wins: 0,
        matches: 0,
      };
      entry.matches += 1;
      entry.name = p.name; // mantém sempre o nome mais recente usado
      if (match.winner_player_id === p.playerId) entry.wins += 1;
      stats.set(p.playerId, entry);
    }
  }

  const leaderboard = [...stats.values()]
    .sort((a, b) => b.wins - a.wins || b.matches - a.matches)
    .slice(0, 50);

  // TODO(temporário): campos de debug pra investigar por que o leaderboard
  // vem vazio mesmo com linhas na tabela — remover depois de resolver.
  return NextResponse.json({
    configured: true,
    leaderboard,
    debugCount: count,
    debugRawLength: data?.length ?? null,
    debugSample: (data ?? []).slice(0, 2),
  });
}
