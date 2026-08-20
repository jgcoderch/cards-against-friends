# Cards Against Friends

Jogo multiplayer estilo Cards Against Humanity, com baralho de conteúdo próprio. Next.js (App Router) + servidor Socket.io customizado, salas mantidas em memória. Tem um banco de dados opcional (Supabase) só pro **Hall da Fama** — o placar histórico entre partidas (ver seção própria abaixo).

## Rodando localmente

```bash
npm install
npm run dev
```

Abre em `http://localhost:3000`. Pra testar multiplayer localmente, abra várias abas/dispositivos na mesma rede e use o IP da máquina (ex.: `http://192.168.0.10:3000`) em vez de `localhost` nos outros aparelhos.

## Como funciona

- `server.js`: servidor HTTP customizado que integra o Next.js e o Socket.io.
- `server/rooms.js`: toda a lógica de sala e rodada (estado em memória, `Map<code, Room>`).
- `server/cards.js`: baralho de exemplo — **troque pelo conteúdo definitivo aqui**.
- `app/providers.tsx`: contexto React (`GameProvider`) que centraliza a conexão do socket e as ações do jogo.
- `app/page.tsx`: tela inicial (criar sala / entrar com código).
- `app/room/[code]/page.tsx`: sala de espera + jogo (lobby, submissão, julgamento, revelação).

### Fluxo de uma rodada

1. `lobby`: jogadores entram, dono escolhe baralho + configurações e inicia a partida (mínimo de 3 jogadores).
2. `submitting`: uma carta preta é sorteada; todos exceto o juiz escolhem uma carta branca da mão, dentro do tempo configurado (se houver).
3. `judging`: as combinações aparecem embaralhadas e anônimas; o juiz escolhe a vencedora, dentro do tempo configurado (se houver).
4. `reveal`: o nome do vencedor é revelado, o placar atualiza, e o dono da sala avança pra próxima rodada (o juiz roda para o próximo jogador).
5. `gameover`: quando alguém atinge a pontuação-alvo ou o máximo de rodadas é alcançado, a partida encerra com um resumo final; o dono pode "Jogar de novo" (volta pro lobby mantendo os jogadores e zerando o placar).

O id do jogador é gerado no navegador (`localStorage`), o que permite reconectar na mesma sala se a conexão cair e reabrir a aba.

## Configurações da partida

O dono define, no lobby, antes de iniciar:

- **Pontos pra vencer** — quantas rodadas um jogador precisa ganhar pra vencer a partida (0 = sem limite).
- **Máximo de rodadas** — encerra a partida após N rodadas mesmo sem ninguém bater a meta de pontos (0 = sem limite).
- **Tempo pra escolher carta** — limite, em incrementos de 10s, pros jogadores escolherem a carta branca. Se estourar, quem não jogou recebe uma carta aleatória da mão automaticamente, pra não travar o jogo (0 = sem tempo).
- **Tempo pro juiz escolher** — mesma ideia, mas pro juiz; se estourar, uma combinação aleatória é escolhida como vencedora (0 = sem tempo).

Os limites/steps de cada configuração vêm do servidor (`SETTINGS_LIMITS` em `server/rooms.js`) e são enviados ao cliente em `room.settingsLimits`, então o front-end nunca precisa hardcodar esses valores.

## Baralhos

O dono da sala escolhe o baralho no lobby, antes de iniciar a partida:

- **Modo Casual** — baralho autoral (humor genérico/absurdo), seguro pra qualquer grupo.
- **Modo Cancelável** — baralho oficial de *Cards Against Humanity* (edição em português), incluído sob a licença [Creative Commons BY-NC-SA 2.0](https://creativecommons.org/licenses/by-nc-sa/2.0/). Conteúdo adulto, ofensivo e non-PC por design; o lobby exige uma confirmação antes de liberar o início da partida com esse baralho.

**Sobre a licença do Modo Cancelável**: o conteúdo é © Cards Against Humanity LLC, usado sob CC BY-NC-SA 2.0, o que exige (1) atribuição — já incluída no rodapé da sala e nos comentários de `server/cards.js` —, (2) uso **não comercial** e (3) que qualquer distribuição/modificação desse baralho mantenha a mesma licença. Cartas "Pick 2" do material original foram omitidas porque o motor do jogo (v1) só suporta uma lacuna por rodada.

Ambos os baralhos ficam em `server/cards.js`, dentro do objeto `DECKS`. Pra adicionar um baralho novo, siga o mesmo formato (`id`, `name`, `description`, `mature`, `black`, `white`) e registre no `DECKS`:

```js
const DECKS = {
  casual: { id: "casual", name: "Modo Casual", black: CASUAL_BLACK, white: CASUAL_WHITE, ... },
  cancelavel: { id: "cancelavel", name: "Modo Cancelável", black: CANCELAVEL_BLACK, white: CANCELAVEL_WHITE, ... },
};
```

Não há limite de tamanho por baralho — cada um embaralha e, se acabar, reaproveita as cartas já descartadas.

## Banco de dados (Hall da Fama)

Salas e rodadas continuam 100% em memória (isso não muda). Mas quando uma partida termina (fase `gameover`), o resultado — sala, baralho usado, jogadores e pontuações, quem venceu — é salvo no [Supabase](https://supabase.com) (Postgres hospedado). Isso alimenta o **Hall da Fama** (`/hall-da-fama`): um placar histórico global com vitórias e partidas jogadas por jogador, que sobrevive a restart do servidor e a novos deploys — diferente do resto do estado do jogo.

**Por que Supabase em vez de SQLite local**: o plano free do Render (onde fazemos deploy) tem disco efêmero — qualquer arquivo local (tipo um `.sqlite`) some a cada redeploy/restart. Um banco hospedado separado do processo da app é a única forma de ter persistência de verdade nesse setup.

**O app funciona inteiro sem o banco configurado** — é só o Hall da Fama que fica desativado (mostra um aviso amigável em vez de quebrar). Ninguém precisa configurar isso pra jogar.

### Configurando

1. Crie um projeto grátis em [supabase.com](https://supabase.com).
2. No SQL Editor do projeto, rode o script `supabase/schema.sql` deste repo (cria a tabela `matches`).
3. Em **Project Settings → API**, copie a **Project URL** e a **service_role key** (não a `anon` — o backend precisa da service role pra escrever ignorando RLS).
4. Localmente: copie `.env.example` pra `.env.local` e preencha `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`.
5. No Render: essas duas variáveis já estão declaradas no `render.yaml` (com `sync: false`, ou seja, sem guardar o segredo no repo) — o dashboard pede pra colar os valores na hora de criar o Blueprint, ou dá pra adicionar depois em **Environment**.

A `service_role key` tem acesso total ao projeto Supabase — nunca exponha ela no cliente. Ela só é usada aqui dentro de `server/supabase.js` e `app/api/hall-da-fama/route.ts`, ambos server-only.

## Deploy

Esse projeto usa um **servidor HTTP customizado** (`server.js`) que integra Next.js e Socket.io no mesmo processo Node — não é uma app 100% serverless. Isso significa que **não dá pra fazer deploy no Vercel do jeito padrão** (o modelo de funções serverless dele não sustenta conexões WebSocket persistentes nem um `server.js` de longa duração).

Plataformas que funcionam bem por rodarem um processo Node persistente:

- [Render](https://render.com) (Web Service, plano free funciona pra testar)
- [Railway](https://railway.app)
- [Fly.io](https://fly.io)
- Qualquer VPS (rodando via `pm2`, `systemd`, Docker, etc.)

Configuração típica em qualquer uma dessas plataformas:

- **Build command**: `npm install && npm run build`
- **Start command**: `npm start`
- **Porta**: o servidor lê `process.env.PORT` automaticamente (a maioria das plataformas injeta isso sozinha)
- Variáveis de ambiente são opcionais — só necessárias pro Hall da Fama (ver seção "Banco de dados" acima)

Como as salas ficam em memória, cada novo deploy (restart do processo) apaga as salas ativas — isso é esperado nessa v1.

### Deploy no Render (recomendado)

O repo já tem um `render.yaml` (Blueprint) configurado pra criar um Web Service free que acompanha a branch `main`.

**Fluxo de trabalho**: mudanças são feitas e testadas localmente na branch `develop` (`npm run dev`). Só quando algo está validado é que vai pra `main` (merge ou PR) — e é nesse momento que o Render pega a mudança e redeploya sozinho. `develop` nunca é deployada; ela existe só pra isolar trabalho em andamento do que já está estável e no ar.

1. Crie conta em [render.com](https://render.com) (dá pra logar direto com GitHub, sem cartão de crédito no plano free).
2. No dashboard: **New +** → **Blueprint**.
3. Autorize o Render a acessar o repositório `cards-against-friends` no GitHub e selecione ele.
4. O Render lê o `render.yaml` sozinho e já sugere criar o serviço `cards-against-friends` na branch `main`. Ele vai pedir pra colar `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` **direto no dashboard** — nunca no `render.yaml` (esses campos só guardam o *nome* da variável no arquivo; o valor não vaza pro repositório). Pode deixar em branco se ainda não configurou o Supabase, dá pra preencher depois em **Environment**. Confirme.
5. Espera o primeiro build/deploy (alguns minutos) — a URL pública aparece no dashboard (algo como `https://cards-against-friends.onrender.com`).

Depois disso, **todo push (ou merge) na branch `main` faz redeploy automático**.

**Sobre o plano free**: o serviço "dorme" depois de ~15 min sem tráfego, e a primeira requisição depois disso demora uns 30-50s pra acordar (é só avisar a galera "abre o link e espera um pouco" na primeira vez). Sem custo, sem cartão cadastrado.

## Testes automatizados

```bash
npm test          # roda a suíte uma vez
npm run test:watch # modo watch, reroda ao salvar
```

Usa [Vitest](https://vitest.dev). A suíte cobre a lógica de sala/rodada em `server/rooms.js` (a parte mais arriscada do projeto — pontuação, temporizadores, condição de vitória, reconexão) e a integridade dos baralhos em `server/cards.js` (sem cartas vazias/duplicadas, tamanhos esperados). Ainda não há testes de componentes React — ver limitações abaixo.

## Limitações da v1 (próximos passos sugeridos)

- Sem persistência de salas: reiniciar o servidor apaga todas as salas em andamento (só o resultado final das partidas fica salvo, no Hall da Fama — ver seção "Banco de dados").
- Se o juiz cair no meio da rodada (e não reconectar), o servidor pula direto pra tela de revelação para não travar o jogo. Jogadores comuns reconectam automaticamente (o client reenvia `join_room` sozinho quando o socket cai e volta — comum em celular ao bloquear a tela).
- Sem suporte a cartas pretas com múltiplas lacunas ("pick 2") — todas as cartas de exemplo são "pick 1".
- Testes automatizados cobrem só a lógica de servidor (`server/`); a UI React ainda não tem testes de componente/integração.
