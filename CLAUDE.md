# PalmStats: contexto para novas conversas

> Resumo do projeto até 27/11/2026. Este arquivo é carregado automaticamente pelo Claude Code. Mantenha-o atualizado quando algo estrutural mudar.
> Detalhes: `docs/planejamento.md` (visão original), `docs/prova-de-dados.md` (teste de fontes), `docs/banco.md` (schema e regras), `docs/produto.md` (páginas, curiosidades, deploy).

## O que é

Site de estatísticas do **Palmeiras (futebol masculino)** para torcedor fanático: todos os jogos oficiais **desde 2015**, com escalações, gols, cartões, estatísticas de time, técnicos e curiosidades. O diferencial pretendido não é volume (Sofascore e FotMob ganham nisso), e sim **consultas cruzadas, recordes do clube e recortes por técnico, adversário e era**.

**Decisões já tomadas pelo dono do projeto:**
- Sem fins comerciais por ora (por isso Vercel Hobby e Supabase Free).
- Começar em 2015. A expansão para 2008–2014 é possível, mas ainda não foi feita (ver "Próximos passos").
- Nada que dependa de parceria (ex.: acervos de torcida como Verdazzo e Porcopédia).
- Repositório público.
- Fonte principal ESPN, cadastro pela Wikidata, conferência obrigatória de gols e técnicos por tabela manual.

## Como trabalhar com o dono do projeto

- Conversa em **português**. Ele prefere respostas diretas, que critiquem a ideia antes de concordar, sem elogios vazios.
- No início do projeto ele autorizou: **"já pode fazer merge do que produzir"**. O fluxo usado é branch `claude/…` → PR → squash merge na `main`.
- Se o branch remoto tiver commits antigos já incorporados via squash, junte com `git merge -s ours origin/<branch>` em vez de `push --force`.
- Antes de afirmar um número como fato, confira no banco; já houve consulta com ordenação errada que escondeu o maior cobrador de pênaltis.

## Arquitetura

```
ESPN (API pública) ─┐
Wikidata (SPARQL) ──┼─► coleta/*.py ─► dados/brutos/ (fora do git, cache do Actions)
CSVs manuais ───────┘         │
                              ▼
                     coleta/normalizar.py ─► Supabase (Postgres) ─► web/ (Next.js na Vercel)
                     (+ coleta/correcoes.py)
```

| Pasta / arquivo | Conteúdo |
|---|---|
| `coleta/espn.py` | Baixa calendário, resumo de cada partida e bio dos atletas (`site.api.espn.com`, `sports.core.api.espn.com`). Palmeiras = time `2029`. |
| `coleta/wikidata.py` | Baixa futebolistas candidatos por data de nascimento (±1 dia). |
| `coleta/normalizar.py` | Brutos → tabelas, com as regras de conferência. É idempotente e reescreve cada partida inteira. |
| `coleta/correcoes.py` + `dados/manual/correcoes.csv` | Correções manuais versionadas, reaplicadas no fim de toda carga. |
| `dados/manual/tecnicos.csv` | Passagens de técnicos (efetivo, não auxiliar). Algumas datas estão com `conferido=false`. |
| `supabase/migrations/` | Schema. Só se cria migration nova; nunca se edita uma já aplicada. |
| `.github/workflows/carga.yml` | Carga diária (cron 09:17 UTC), mais disparo manual com `de`/`ate`. |
| `web/` | Site Next.js 15.5 (App Router), React 19.1. |

## Fontes de dados

- **ESPN**: cobre todas as competições desde 2015 (Brasileirão, Paulistão, Copa do Brasil, Libertadores, Recopa, Supercopa, Mundial). Traz escalação, substituições com minuto, gols, cartões, estatísticas de time (posse, chutes, passes, desarmes), público, árbitro (só a partir de 2022) e posição dos chutes de gol. **Não traz** técnico, passes e desarmes por jogador, nota, xG nem acréscimos. Antes de 2008 o dado é inutilizável; 2008–2014 vem com titulares marcados errado (12 a 14 por jogo).
- **Wikidata (CC0)**: nome completo e vínculo do jogador. Casamento por nascimento + sobrenome não genérico; 191 de 224 jogadores ligados.
- **Testadas e descartadas**: Sofascore, FBref e TheSportsDB bloqueiam IP de datacenter; o servidor da CBF derruba a conexão; football-data.org e API-Football exigem cadastro e não foram testadas.

## Banco (Supabase)

Tabelas: `partidas`, `participacoes` (jogador do Palmeiras × partida), `eventos` (dos dois times), `estatisticas_time` (lado `pro`/`contra`), `jogadores`, `tecnicos`, `passagens_tecnico`, `clubes`, `estadios`, `competicoes` e `revisao` (fila interna, sem acesso público). Views: `v_partidas`, `v_jogador_temporada`, `v_tecnicos`. A leitura é pública por RLS.

**Regras que não podem ser quebradas:**
1. **NULL ≠ 0.** Estatística ausente na fonte fica NULL e o site mostra "–". As taxas por 90 minutos usam só os minutos em que aquele dado existe.
2. **Gols e assistências vêm dos eventos deduplicados**, não do elenco. Se a soma não bater com o placar, a partida vai para `revisao`.
3. **`participacoes.jogou`** define se o jogador entrou em campo; `minuto_entrada` pode ser NULL mesmo com `jogou = true`.
4. **Técnico da partida** é o efetivo pela passagem no CSV; auxiliar que comanda por suspensão não conta.
5. **Mando neutro** quando a ESPN marca, mais Mundial, Supercopa, final única da Libertadores (desde 2019) e qualquer "mando" do Palmeiras fora do Brasil.
6. **Minutos são regulamentares** (90' ou 120'), sem acréscimos.
7. **IDs são próprios** (identity); o ID da fonte fica em `espn_id`/`wikidata_id`. Nunca fixe IDs numéricos no código do site: eles mudam entre bancos. Busque pelo nome.

**Defeitos da ESPN já tratados na carga**: gol repetido com outro minuto (deduplicado pelo placar parcial do texto), evento repetido com outro ID, atleta repetido no elenco, reserva que jogou sem registro de entrada, campo neutro não marcado e o mesmo jogador com dois IDs (correção `mesclar_em`, ex.: Kevin).

## Site (`web/`)

Páginas: `/` (início, "neste dia"), `/explorar` (filtros combináveis e "com e sem o jogador"), `/comparar` (dois jogadores, por 90 minutos, gols decisivos, juntos e separados), `/partidas`, `/partidas/[id]`, `/jogadores`, `/jogadores/[id]`, `/adversarios/[id]`, `/tecnicos` e `/curiosidades`.

Convenções:
- SQL só no servidor (`lib/db.ts`, biblioteca `postgres`, `prepare: false`); páginas com `revalidate = 3600`.
- bigint e numeric chegam como string: use `num()`/`n()` de `lib/format.ts`. As traduções de fase, posição e país também ficam lá.
- Avisos de método: amostra pequena (< 10 jogos), menos de 900 minutos, posições diferentes e "correlação, não causa". **"Sem ele" só conta jogos do período em que o jogador estava no clube.**
- **Gols decisivos**: sem os gols do jogador naquele jogo, o resultado mudaria. **Pontos rendidos** = pontos do resultado real menos os pontos sem os gols dele (mata-mata tratado como pontos corridos).
- Clássicos = Corinthians, São Paulo e Santos.

## Operação

- **GitHub** (Settings → Secrets and variables → Actions): secret `SUPABASE_DB_URL` (string do *Session pooler*, porta 5432) e variável `CARGA_ATIVA=true`. A carga inicial é disparada manualmente com `de=2015`, `ate=2025`.
- **Vercel**: Root Directory `web`, variável `DATABASE_URL` (string do *Transaction pooler*, porta 6543). O build consulta o banco. Vercel Web Analytics está instalado; é preciso ativá-lo no painel.
- **Teste local**: Postgres 16 com os papéis `anon` e `authenticated` criados à mão; aplicar as migrations; `python coleta/normalizar.py dados/brutos`; `npm run build` em `web/`; screenshots com Playwright em desktop e iPhone 13. O 404 de `/_vercel/insights/script.js` fora da Vercel é esperado.
- **Ambiente de nuvem do Claude Code**: existe o ambiente `palmstats-dados`, com acesso liberado à ESPN, Wikidata, Wikipedia, Cartola e às demais fontes testadas.

## Estado em 27/11/2026

- 784 partidas (2015–2025) no Supabase, 224 jogadores, 47 correções aplicadas, **26 itens pendentes na revisão** (todos `sem_par_wikidata`: apelidos e jogadores da base).
- Site publicado na Vercel com as 10 páginas.
- **Carga diária**: passou de 21 a 25/11 e **falhou em 26/11** porque `supabase/setup-cli` com `version: latest` estourou o limite de requisições da API do GitHub. A versão foi fixada em `3.2.0`.
- **Lentidão conhecida**: cada execução diária leva de 30 a 40 minutos, porque `normalizar.py` reprocessa **todos** os brutos do cache (2015 em diante), linha por linha pela rede. A correção é carregar só as temporadas coletadas na execução e/ou gravar em lote.
- **Temporada 2026**: a carga diária coleta o ano corrente, mas `dados/manual/tecnicos.csv` e a validação foram feitos sobre 2015–2025. Confira 2026 antes de divulgar números dela.
- O `npm audit` ainda aponta o `postcss` embutido no Next (só no build); a correção exige migrar para o Next 16.

## Problemas de dados ainda abertos

- Estádio com nomes diferentes (Pacaembu) e 12 jogos em casa sem estádio.
- Árbitro com nome invertido ("Daronco, Anderson") e sem árbitro antes de 2022.
- Datas de algumas trocas de técnico são aproximadas (`conferido=false` no CSV); Paulistão, Copa do Brasil e Libertadores perto das trocas não foram conferidos.
- Placar de mata-mata mostra só o jogo, não o agregado.

## Próximos passos candidatos (nenhum decidido)

1. Olhar o analytics depois de 2 ou 3 semanas antes de investir mais em interface.
2. Acelerar a carga diária (ver "Lentidão conhecida").
3. Expandir para 2008–2014, com a regra "titulares ≠ 11 → revisão" e mais trabalho de casamento com a Wikidata.
4. Página "neste dia" própria (conteúdo diário para redes) e links compartilháveis com imagem de prévia no explorador e no comparador.
5. Mapa de gols (a posição do chute existe nos eventos) e "marcas próximas".
