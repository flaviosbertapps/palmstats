# Coleta e carga

| Script | O que faz |
|---|---|
| `espn.py` | Baixa calendário, partidas e bio dos atletas do Palmeiras (API pública da ESPN) |
| `wikidata.py` | Baixa da Wikidata os futebolistas candidatos (por data de nascimento) |
| `normalizar.py` | Brutos → tabelas do Postgres/Supabase, com as regras de conferência |
| `cobertura_espn.py` | Relatório de cobertura usado na prova de dados |

Passo a passo e regras: [`docs/banco.md`](../docs/banco.md). Os brutos ficam em `dados/brutos/`, fora do git.
