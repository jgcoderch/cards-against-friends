// Cliente Supabase server-only, usado pra persistir o resultado das partidas
// (Hall da Fama). Se as variáveis de ambiente não estiverem configuradas, o
// app inteiro continua funcionando normalmente — só o Hall da Fama fica
// desativado (ver README, seção "Banco de dados").
const { createClient } = require("@supabase/supabase-js");

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin =
  url && serviceKey ? createClient(url, serviceKey, { auth: { persistSession: false } }) : null;

function isSupabaseConfigured() {
  return supabaseAdmin !== null;
}

/** Salva o resultado final de uma partida (chamado quando room.phase vira "gameover"). */
async function recordMatchResult(room) {
  if (!supabaseAdmin) return;

  const players = room.playerList.map((p) => ({ playerId: p.id, name: p.name, score: p.score }));
  const isTie = (room.matchWinner?.tiedPlayers.length ?? 0) > 1;

  const { error } = await supabaseAdmin.from("matches").insert({
    room_code: room.code,
    deck_id: room.deckId,
    players,
    winner_player_id: isTie ? null : room.matchWinner?.playerId ?? null,
    is_tie: isTie,
  });

  if (error) {
    console.error("Falha ao salvar resultado da partida no Supabase:", error.message);
  }
}

module.exports = { supabaseAdmin, isSupabaseConfigured, recordMatchResult };
