"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useGame } from "../../providers";
import { Avatar } from "@/components/Avatar";
import type {
  CardData,
  DeckInfo,
  GameSettings,
  MatchWinner,
  PlayerPublic,
  SettingLimit,
  SettingsLimits,
} from "@/lib/types";

const NAME_KEY = "caf_player_name";
const MIN_PLAYERS = 3;
const CONFETTI_COLORS = ["#f2c744", "#ec4899", "#8b5cf6", "#34d399", "#60a5fa"];

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const code = (params.code || "").toUpperCase();
  const router = useRouter();
  const {
    room,
    connected,
    error,
    clearError,
    joinRoom,
    startGame,
    submitCard,
    chooseWinner,
    nextRound,
    backToLobby,
    leaveRoom,
  } = useGame();

  const inRoom = room && room.code === code;

  if (!inRoom) {
    return (
      <JoinFallback
        code={code}
        joinRoom={joinRoom}
        connected={connected}
        error={error}
        clearError={clearError}
      />
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-4 py-4">
      <TopBar
        code={room.code}
        playerCount={room.players.length}
        roundNumber={room.roundNumber}
        maxRounds={room.settings.maxRounds}
        showRound={room.phase !== "lobby" && room.phase !== "gameover"}
        onLeave={() => {
          leaveRoom();
          router.push("/");
        }}
      />

      {error && (
        <div
          className="animate-in mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-300"
          onClick={clearError}
        >
          {error}
        </div>
      )}

      {room.phase === "lobby" && (
        <LobbyView
          players={room.players}
          availableDecks={room.availableDecks}
          settings={room.settings}
          settingsLimits={room.settingsLimits}
          isOwner={room.you?.isOwner ?? false}
          onStart={startGame}
        />
      )}

      {room.phase === "submitting" && (
        <SubmittingView
          blackCard={room.blackCard}
          hand={room.hand}
          isJudge={room.you?.isJudge ?? false}
          submittedCount={room.submissionsCount}
          neededCount={room.submittersNeeded}
          players={room.players}
          deadline={room.phaseDeadline}
          onSubmit={submitCard}
          alreadySubmitted={
            room.players.find((p) => p.id === room.you?.id)?.hasSubmitted ?? false
          }
        />
      )}

      {room.phase === "judging" && (
        <JudgingView
          blackCard={room.blackCard}
          submissions={room.submissions}
          isJudge={room.you?.isJudge ?? false}
          deadline={room.phaseDeadline}
          onChoose={chooseWinner}
        />
      )}

      {room.phase === "reveal" && (
        <RevealView
          winner={room.winner}
          blackCard={room.blackCard}
          isOwner={room.you?.isOwner ?? false}
          onNext={nextRound}
        />
      )}

      {room.phase === "gameover" && (
        <GameOverView
          matchWinner={room.matchWinner}
          players={room.players}
          isOwner={room.you?.isOwner ?? false}
          onPlayAgain={backToLobby}
        />
      )}

      {room.phase !== "gameover" && <Scoreboard players={room.players} />}

      {room.deckId === "cancelavel" && (
        <p className="mt-4 text-center text-[11px] leading-relaxed text-white/30">
          Baralho "Modo Cancelável" baseado em Cards Against Humanity, © Cards
          Against Humanity LLC, usado sob licença{" "}
          <a
            href="https://creativecommons.org/licenses/by-nc-sa/2.0/"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            CC BY-NC-SA 2.0
          </a>
          .
        </p>
      )}
    </main>
  );
}

/* ---------- pequenos blocos reutilizáveis ---------- */

/** Contagem regressiva client-side baseada num epoch ms vindo do servidor. */
function Countdown({ deadline }: { deadline: number | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!deadline) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [deadline]);

  if (!deadline) return null;
  const remaining = Math.max(0, Math.ceil((deadline - now) / 1000));
  const urgent = remaining <= 10;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${
        urgent
          ? "border-red-400/60 bg-red-500/15 text-red-300"
          : "border-white/15 bg-white/5 text-white/70"
      }`}
    >
      {urgent && (
        <span className="animate-pulse-ring h-1.5 w-1.5 rounded-full bg-red-400" aria-hidden="true" />
      )}
      {/* key força um nó de texto novo a cada segundo, em vez de mutar o
       * existente — evita "ghosting" de repintura em navegadores mobile
       * mais fracos quando combinado com a animação da bolinha ao lado. */}
      <span key={remaining}>⏱ {remaining}s</span>
    </span>
  );
}

/** Confete CSS-only em forma de explosão, disparado sempre que `trigger` muda.
 * Cada peça sai de um ponto central e voa numa direção/distância aleatória,
 * com uma leve gravidade puxando pra baixo no fim. Só roda no cliente
 * (populado via useEffect) pra não gerar posições aleatórias divergentes na SSR. */
function Confetti({ trigger }: { trigger: string }) {
  const [pieces, setPieces] = useState<
    { id: number; color: string; dx: number; dy: number; rot: number; delay: number }[]
  >([]);

  useEffect(() => {
    setPieces(
      Array.from({ length: 32 }, (_, i) => {
        const angle = Math.random() * Math.PI * 2;
        const distance = 70 + Math.random() * 130;
        return {
          id: i,
          color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          dx: Math.cos(angle) * distance,
          dy: Math.sin(angle) * distance * 0.7 + 55, // gravidade: puxa mais pra baixo
          rot: (Math.random() - 0.5) * 720,
          delay: Math.random() * 80,
        };
      })
    );
  }, [trigger]);

  return (
    <div className="pointer-events-none absolute left-1/2 top-10 h-0 w-0" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={`${trigger}-${p.id}`}
          className="confetti-piece"
          style={
            {
              backgroundColor: p.color,
              animationDelay: `${p.delay}ms`,
              "--dx": `${p.dx}px`,
              "--dy": `${p.dy}px`,
              "--rot": `${p.rot}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

function Stepper({
  label,
  value,
  limit,
  onChange,
  formatValue,
}: {
  label: string;
  value: number;
  limit: SettingLimit;
  onChange: (value: number) => void;
  formatValue: (value: number) => string;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
      <div>
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs text-white/50">{formatValue(value)}</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(limit.min, value - limit.step))}
          disabled={value <= limit.min}
          className="tap-scale flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-lg font-bold disabled:opacity-30"
        >
          −
        </button>
        <button
          type="button"
          onClick={() => onChange(Math.min(limit.max, value + limit.step))}
          disabled={value >= limit.max}
          className="tap-scale flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-lg font-bold disabled:opacity-30"
        >
          +
        </button>
      </div>
    </div>
  );
}

function TopBar({
  code,
  playerCount,
  roundNumber,
  maxRounds,
  showRound,
  onLeave,
}: {
  code: string;
  playerCount: number;
  roundNumber: number;
  maxRounds: number;
  showRound: boolean;
  onLeave: () => void;
}) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div>
        <p className="text-xs uppercase tracking-widest text-white/50">
          Sala {showRound && `· Rodada ${roundNumber}${maxRounds ? `/${maxRounds}` : ""}`}
        </p>
        <p className="font-display text-xl font-bold tracking-widest text-amber-400">{code}</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-white/60">{playerCount} jogador(es)</span>
        <button
          onClick={onLeave}
          className="tap-scale rounded-lg border border-white/15 px-3 py-2 text-xs text-white/70"
        >
          Sair
        </button>
      </div>
    </div>
  );
}

function JoinFallback({
  code,
  joinRoom,
  connected,
  error,
  clearError,
}: {
  code: string;
  joinRoom: (code: string, name: string) => Promise<string | null>;
  connected: boolean;
  error: string | null;
  clearError: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(
    typeof window !== "undefined" ? window.localStorage.getItem(NAME_KEY) ?? "" : ""
  );
  const [loading, setLoading] = useState(false);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    window.localStorage.setItem(NAME_KEY, name.trim());
    await joinRoom(code, name.trim());
    setLoading(false);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-10">
      <header className="text-center">
        <p className="text-xs uppercase tracking-widest text-white/50">Entrando na sala</p>
        <h1 className="font-display text-3xl font-bold tracking-widest text-amber-400">{code}</h1>
      </header>

      {error && (
        <div
          className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300"
          onClick={clearError}
        >
          {error}
        </div>
      )}

      <form className="flex flex-col gap-3" onSubmit={handleJoin}>
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
          disabled={loading || !name.trim() || !connected}
          className="btn-primary tap-scale rounded-xl py-4 text-lg font-bold font-display disabled:opacity-50"
        >
          {loading ? "Entrando..." : connected ? "Entrar na sala" : "Conectando..."}
        </button>
        <button
          type="button"
          className="text-sm text-white/50 underline"
          onClick={() => router.push("/")}
        >
          Voltar pro início
        </button>
      </form>
    </main>
  );
}

function LobbyView({
  players,
  availableDecks,
  settings: initialSettings,
  settingsLimits,
  isOwner,
  onStart,
}: {
  players: PlayerPublic[];
  availableDecks: DeckInfo[];
  settings: GameSettings;
  settingsLimits: SettingsLimits;
  isOwner: boolean;
  onStart: (deckId: string, settings: GameSettings) => void;
}) {
  const canStart = players.length >= MIN_PLAYERS;
  const [selectedDeck, setSelectedDeck] = useState(
    availableDecks.find((d) => !d.mature)?.id ?? availableDecks[0]?.id ?? "casual"
  );
  const [confirmedMature, setConfirmedMature] = useState(false);
  const [settings, setSettings] = useState<GameSettings>(initialSettings);

  const chosenDeck = availableDecks.find((d) => d.id === selectedDeck);
  const readyToStart = canStart && (!chosenDeck?.mature || confirmedMature);

  function updateSetting<K extends keyof GameSettings>(key: K, value: number) {
    setSettings((s) => ({ ...s, [key]: value }));
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <p className="text-center text-sm text-white/60">
        Compartilhe o código da sala com os amigos e esperem todo mundo entrar.
      </p>

      <ul className="flex flex-col gap-2">
        {players.map((p) => (
          <li
            key={p.id}
            className="animate-in flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3"
          >
            <Avatar id={p.id} name={p.name} />
            <span className="flex-1 font-medium">{p.name}</span>
            <span className="flex items-center gap-2 text-xs text-white/50">
              {p.isOwner && (
                <span className="rounded bg-amber-400/20 px-2 py-1 text-amber-300">dono</span>
              )}
              {!p.connected && <span className="text-red-400">desconectado</span>}
            </span>
          </li>
        ))}
      </ul>

      {isOwner ? (
        <>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-white/70">Escolha o baralho:</p>
            {availableDecks.map((deck) => (
              <button
                key={deck.id}
                onClick={() => {
                  setSelectedDeck(deck.id);
                  setConfirmedMature(false);
                }}
                className={`tap-scale rounded-xl border p-4 text-left ${
                  selectedDeck === deck.id
                    ? "border-amber-400 bg-amber-400/10"
                    : "border-white/10 bg-white/5"
                }`}
              >
                <p className="font-bold">
                  {deck.name} {deck.mature && <span className="text-red-400">🔞</span>}
                </p>
                <p className="mt-1 text-xs text-white/60">{deck.description}</p>
              </button>
            ))}
          </div>

          {chosenDeck?.mature && (
            <label className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
              <input
                type="checkbox"
                checked={confirmedMature}
                onChange={(e) => setConfirmedMature(e.target.checked)}
                className="mt-0.5"
              />
              Confirmo que todo mundo na sala tem 18+ e topa humor pesado, ofensivo e non-PC.
            </label>
          )}

          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-white/70">Configurações da partida:</p>
            <Stepper
              label="Pontos pra vencer"
              value={settings.winScore}
              limit={settingsLimits.winScore}
              onChange={(v) => updateSetting("winScore", v)}
              formatValue={(v) => (v === 0 ? "Sem limite" : `${v} ${v === 1 ? "ponto" : "pontos"}`)}
            />
            <Stepper
              label="Máximo de rodadas"
              value={settings.maxRounds}
              limit={settingsLimits.maxRounds}
              onChange={(v) => updateSetting("maxRounds", v)}
              formatValue={(v) => (v === 0 ? "Sem limite" : `${v} rodadas`)}
            />
            <Stepper
              label="Tempo pra escolher carta"
              value={settings.submitTimerSec}
              limit={settingsLimits.submitTimerSec}
              onChange={(v) => updateSetting("submitTimerSec", v)}
              formatValue={(v) => (v === 0 ? "Sem tempo" : `${v}s`)}
            />
            <Stepper
              label="Tempo pro juiz escolher"
              value={settings.judgeTimerSec}
              limit={settingsLimits.judgeTimerSec}
              onChange={(v) => updateSetting("judgeTimerSec", v)}
              formatValue={(v) => (v === 0 ? "Sem tempo" : `${v}s`)}
            />
          </div>

          <button
            onClick={() => onStart(selectedDeck, settings)}
            disabled={!readyToStart}
            className="btn-primary tap-scale mt-auto rounded-xl py-4 text-lg font-bold font-display disabled:opacity-40"
          >
            {canStart ? "Iniciar partida" : `Esperando jogadores (mín. ${MIN_PLAYERS})`}
          </button>
        </>
      ) : (
        <p className="mt-auto text-center text-sm text-white/50">
          Esperando o dono da sala iniciar a partida...
        </p>
      )}
    </div>
  );
}

function BlackCard({ card }: { card: CardData | null }) {
  if (!card) return null;
  return (
    <div className="card-black animate-in min-h-[140px] rounded-2xl p-5 text-lg font-semibold leading-snug">
      {card.text}
    </div>
  );
}

function SubmittingView({
  blackCard,
  hand,
  isJudge,
  submittedCount,
  neededCount,
  players,
  deadline,
  onSubmit,
  alreadySubmitted,
}: {
  blackCard: CardData | null;
  hand: CardData[];
  isJudge: boolean;
  submittedCount: number;
  neededCount: number;
  players: { id: string; name: string; hasSubmitted: boolean; isJudge: boolean }[];
  deadline: number | null;
  onSubmit: (cardId: string) => void;
  alreadySubmitted: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  function confirm() {
    if (!selected) return;
    onSubmit(selected);
    setSelected(null);
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex justify-end">
        <Countdown deadline={deadline} />
      </div>

      <BlackCard card={blackCard} />

      {isJudge && (
        <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/5 p-4 text-center">
          <p className="font-semibold">Você é o juiz dessa rodada 👑</p>
          <p className="text-sm text-white/60">
            {submittedCount}/{neededCount} jogadores já escolheram uma carta.
          </p>
          <ul className="mt-2 flex flex-col gap-1 text-sm text-white/70">
            {players
              .filter((p) => !p.isJudge)
              .map((p) => (
                <li key={p.id} className="flex items-center justify-between">
                  <span>{p.name}</span>
                  <span>{p.hasSubmitted ? "✅" : "⏳"}</span>
                </li>
              ))}
          </ul>
        </div>
      )}

      {!isJudge && alreadySubmitted && (
        <p className="rounded-xl border border-white/10 bg-white/5 p-4 text-center text-sm text-white/60">
          Carta enviada! Aguardando os outros jogadores...
          <br />
          {submittedCount}/{neededCount} enviaram.
        </p>
      )}

      {!isJudge && !alreadySubmitted && (
        <>
          <p className="text-center text-sm text-white/60">Escolha sua carta:</p>
          <div className="grid grid-cols-2 gap-3">
            {hand.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelected(c.id === selected ? null : c.id)}
                className={`card-white tap-scale rounded-xl p-3 text-left text-sm font-medium ${
                  selected === c.id ? "selected" : ""
                }`}
              >
                {c.text}
              </button>
            ))}
          </div>
          <button
            onClick={confirm}
            disabled={!selected}
            className="btn-primary tap-scale sticky bottom-4 mt-auto rounded-xl py-4 text-lg font-bold font-display disabled:opacity-40"
          >
            Confirmar carta
          </button>
        </>
      )}
    </div>
  );
}

function JudgingView({
  blackCard,
  submissions,
  isJudge,
  deadline,
  onChoose,
}: {
  blackCard: CardData | null;
  submissions: CardData[];
  isJudge: boolean;
  deadline: number | null;
  onChoose: (submissionId: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  function confirm() {
    if (!selected) return;
    onChoose(selected);
    setSelected(null);
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex justify-end">
        <Countdown deadline={deadline} />
      </div>

      <BlackCard card={blackCard} />
      <p className="text-center text-sm text-white/60">
        {isJudge ? "Escolha a combinação vencedora:" : "O juiz está escolhendo a vencedora..."}
      </p>
      <div className="grid grid-cols-2 gap-3">
        {submissions.map((s) => (
          <button
            key={s.id}
            disabled={!isJudge}
            onClick={() => setSelected(s.id === selected ? null : s.id)}
            className={`card-white tap-scale rounded-xl p-3 text-left text-sm font-medium disabled:opacity-90 ${
              selected === s.id ? "selected" : ""
            }`}
          >
            {s.text}
          </button>
        ))}
      </div>
      {isJudge && (
        <button
          onClick={confirm}
          disabled={!selected}
          className="btn-primary tap-scale sticky bottom-4 mt-auto rounded-xl py-4 text-lg font-bold font-display disabled:opacity-40"
        >
          Escolher vencedora
        </button>
      )}
    </div>
  );
}

function RevealView({
  winner,
  blackCard,
  isOwner,
  onNext,
}: {
  winner: { playerId: string; playerName: string; cardText: string } | null;
  blackCard: CardData | null;
  isOwner: boolean;
  onNext: () => void;
}) {
  return (
    <div className="relative flex flex-1 flex-col gap-4">
      {winner && <Confetti trigger={`${winner.playerId}-${winner.cardText}`} />}
      <BlackCard card={blackCard} />
      {winner ? (
        <div className="animate-in flex flex-col items-center gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 p-5 text-center">
          <p className="text-sm text-white/60">Vencedor da rodada</p>
          <div className="flex items-center gap-2">
            <Avatar id={winner.playerId} name={winner.playerName} />
            <p className="font-display text-lg font-bold text-amber-300">{winner.playerName}</p>
          </div>
          <p className="card-white w-full rounded-xl p-4 text-sm font-medium">{winner.cardText}</p>
        </div>
      ) : (
        <p className="rounded-xl border border-white/10 bg-white/5 p-4 text-center text-sm text-white/60">
          Ninguém jogou uma carta a tempo — vamos pra próxima rodada.
        </p>
      )}
      {isOwner ? (
        <button
          onClick={onNext}
          className="btn-primary tap-scale mt-auto rounded-xl py-4 text-lg font-bold font-display"
        >
          Próxima rodada
        </button>
      ) : (
        <p className="mt-auto text-center text-sm text-white/50">
          Esperando o dono da sala avançar a rodada...
        </p>
      )}
    </div>
  );
}

function GameOverView({
  matchWinner,
  players,
  isOwner,
  onPlayAgain,
}: {
  matchWinner: MatchWinner | null;
  players: PlayerPublic[];
  isOwner: boolean;
  onPlayAgain: () => void;
}) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  const isTie = (matchWinner?.tiedPlayers.length ?? 0) > 1;
  const medals = ["🥇", "🥈", "🥉"];

  return (
    <div className="relative flex flex-1 flex-col items-center gap-5 py-2 text-center">
      <Confetti trigger={matchWinner?.playerId ?? matchWinner?.tiedPlayers.map((p) => p.id).join(",") ?? "gameover"} />

      <p className="animate-in text-6xl">🏆</p>

      {isTie ? (
        <div className="animate-in">
          <p className="font-display text-2xl font-bold text-amber-300">Empate!</p>
          <p className="mt-1 text-sm text-white/60">
            {matchWinner?.tiedPlayers.map((p) => p.name).join(", ")} — {matchWinner?.score} pontos
          </p>
        </div>
      ) : (
        <div className="animate-in">
          <p className="text-sm text-white/60">Vencedor da partida</p>
          <p className="font-display bg-gradient-to-r from-amber-300 via-orange-400 to-pink-400 bg-clip-text text-3xl font-bold text-transparent">
            {matchWinner?.playerName ?? "—"}
          </p>
          <p className="mt-1 text-sm text-white/50">{matchWinner?.score} pontos</p>
        </div>
      )}

      <ul className="flex w-full max-w-xs flex-col gap-2 text-left">
        {sorted.map((p, i) => (
          <li
            key={p.id}
            className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3"
          >
            <span className="w-6 text-center text-sm">{medals[i] ?? i + 1}</span>
            <Avatar id={p.id} name={p.name} />
            <span className="flex-1 font-medium">{p.name}</span>
            <span className="font-bold text-amber-300">{p.score}</span>
          </li>
        ))}
      </ul>

      {isOwner ? (
        <button
          onClick={onPlayAgain}
          className="btn-primary tap-scale mt-auto w-full rounded-xl py-4 text-lg font-bold font-display"
        >
          Jogar de novo
        </button>
      ) : (
        <p className="mt-auto text-sm text-white/50">Esperando o dono da sala reiniciar...</p>
      )}

      <Link href="/hall-da-fama" className="text-sm text-white/50 underline">
        🏆 Ver Hall da Fama
      </Link>
    </div>
  );
}

function Scoreboard({ players }: { players: PlayerPublic[] }) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  return (
    <details className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-white/70">Placar</summary>
      <ul className="mt-3 flex flex-col gap-2">
        {sorted.map((p) => (
          <li key={p.id} className="flex items-center gap-3 text-sm">
            <Avatar id={p.id} name={p.name} />
            <span className="flex-1">
              {p.name} {p.isJudge && <span title="Juiz da rodada">👑</span>}
            </span>
            <span className="font-semibold text-amber-300">{p.score}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
