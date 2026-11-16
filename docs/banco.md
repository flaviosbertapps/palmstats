# PalmStats: banco de dados

Schema em [`supabase/migrations/`](../supabase/migrations). Carga em [`coleta/normalizar.py`](../coleta/normalizar.py), rodada pelo workflow [`carga`](../.github/workflows/carga.yml).

## Estado atual (testado em Postgres 16 local, 16/11/2026)

| Item | Quantidade |
|---|---|
| Partidas (2015–2025, todas as competições) | 784 |
| Participações jogador × partida | 17.473 |
| Eventos (gols, cartões, substituições, VAR…) | 12.200 |
| Estatísticas de time (Palmeiras e adversário) | 1.516 |
| Jogadores | 224 (191 ligados à Wikidata) |
| Tamanho do banco | 28 MB (limite gratuito do Supabase: 500 MB) |

## Tabelas

| Tabela | Conteúdo |
|---|---|
| `partidas` | Uma linha por jogo do Palmeiras: data, temporada, competição, fase, mando (`casa`/`fora`/`neutro`), adversário, placar, pênaltis, prorrogação, estádio, público, árbitro, técnico e `resultado` (V/E/D, calculado) |
| `participacoes` | Jogador do Palmeiras × partida: titular, camisa, posição, minuto de entrada e saída, minutos, gols, assistências, finalizações, faltas, cartões, defesas… |
| `eventos` | Eventos dos **dois** times. Jogador do adversário só pelo nome. Gols trazem a posição do chute (`pos_x`, `pos_y`) |
| `estatisticas_time` | Posse, chutes, passes, cruzamentos, desarmes etc., `lado = pro` (Palmeiras) ou `contra` |
| `jogadores` | Cadastro: nome, nome completo, nascimento, nacionalidade, posição, `wikidata_id` |
| `tecnicos`, `passagens_tecnico` | Técnico **efetivo** por período, vindo de [`dados/manual/tecnicos.csv`](../dados/manual/tecnicos.csv) |
| `clubes`, `estadios`, `competicoes` | Cadastros de apoio |
| `revisao` | Fila do que a carga não conseguiu validar. **Não é visível ao público** |

Visões prontas: `v_partidas` (partida com nomes), `v_jogador_temporada` (totais por jogador, temporada e competição) e `v_tecnicos` (jogos, V/E/D e aproveitamento).

## Regras da carga

1. **NULL ≠ 0.** Quando a ESPN não traz a estatística do jogador (comum na Libertadores), a coluna fica NULL. O site precisa mostrar "sem dado", não zero.
2. **Gols e assistências vêm dos eventos, deduplicados**, não do elenco. Se a soma não bater com o placar, a partida vai para `revisao` e mantém o número do elenco. Isso reduziu as partidas com gols inconsistentes de 21 para 1.
3. **Jogador ↔ Wikidata**: por data de nascimento (±1 dia) e sobrenome não genérico. O vínculo com o Palmeiras na Wikidata desempata. Casamento ambíguo ou sem par vai para `revisao`, e casamento só pelo primeiro nome é feito mas marcado como `wikidata_conferir`.
4. **Técnico da partida** = passagem vigente no CSV manual. Auxiliar que comanda por suspensão do titular **não** substitui o técnico efetivo.
5. **Mando neutro**: Mundial, Supercopa, final única da Libertadores (desde 2019) e qualquer "mando" do Palmeiras fora do Brasil. A ESPN não marca isso de forma confiável.
6. **Minutos são regulamentares** (90' ou 120' com prorrogação), sem acréscimos.
7. **Idempotente.** Pode rodar de novo à vontade: cada partida é reescrita por inteiro.

## Validações feitas

- **Técnicos**: 380 jogos do Brasileirão 2015–2024 comparados com o técnico registrado no dataset `adaoduque`. 360 batem, 20 tiveram auxiliar no banco por suspensão (esperado) e nenhum diverge.
- **Placar × gols individuais**: só 2 partidas não fecham, e ambas estão na fila de revisão.
- **Artilheiros**: Dudu com 16 gols em 2015 (igual à Wikipedia) e Rony com 23 em 2022.
- **Idempotência**: duas cargas seguidas produzem o mesmo resultado.

## Fila de revisão (143 itens)

| Motivo | Itens | O que fazer |
|---|---|---|
| `wikidata_conferir` | 43 | Confirmar se o vínculo com a Wikidata está certo (casou só pelo primeiro nome) |
| `sem_par_wikidata` | 26 | Apelidos e jovens da base: ligar à mão ou deixar sem vínculo |
| `evento_duplicado_descartado` | 24 | Informativo: duplicatas da ESPN já removidas |
| `wikidata_ambiguo` | 7 | Escolher entre os candidatos listados |
| `sem_escalacao` | 2 | Partida sem elenco na ESPN |
| `atleta_duplicado_descartado` | 2 | Informativo |
| `gols_nao_conferem` | 1 | Corrigir à mão |

Ainda não existe um mecanismo de correção manual que sobreviva à recarga. É o próximo item técnico (tabela `correcoes` aplicada no fim da carga).

## Datas de técnicos a verificar

Em `dados/manual/tecnicos.csv`, as passagens com `conferido=false` têm datas aproximadas. Como só importa a data cair **entre** dois jogos, o efeito é nulo enquanto a troca não acontece numa sequência de jogos colados. A validação contra o dataset do Brasileirão não achou nenhum erro, mas Paulistão, Copa do Brasil e Libertadores perto das trocas não foram conferidos.

## Como ativar no Supabase

1. Crie um projeto no [Supabase](https://supabase.com) (plano gratuito).
2. Em **Connect → Session pooler**, copie a string de conexão (`postgresql://postgres.<ref>:<senha>@aws-…pooler.supabase.com:5432/postgres`). Use o *pooler*: a conexão direta é só IPv6, e o GitHub Actions não alcança.
3. No GitHub: **Settings → Secrets and variables → Actions**:
   - *Secret* `SUPABASE_DB_URL` = a string acima;
   - *Variable* `CARGA_ATIVA` = `true`.
4. Em **Actions → carga → Run workflow**, preencha `de = 2015` e `ate = 2025` para a carga inicial (~20 minutos). A partir daí ele roda sozinho todo dia às 06:17 (Brasília), atualizando a temporada corrente e mantendo o projeto gratuito ativo.

Para rodar localmente:

```bash
pip install -r coleta/requirements.txt
python coleta/espn.py --de 2015 --ate 2025 --saida dados/brutos
python coleta/wikidata.py --saida dados/brutos
supabase db push --db-url "$DATABASE_URL" --include-all --yes
DATABASE_URL=... python coleta/normalizar.py dados/brutos
```
