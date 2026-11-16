# PalmStats: prova de dados (2015–2025)

> Executada em 16/11/2026. Escopo definido: sem fins comerciais, início em 2015, nenhuma fonte que dependa de parceria, repositório público.
> Scripts em [`coleta/`](../coleta). Os números abaixo saem de `coleta/cobertura_espn.py` rodando sobre os dados brutos baixados nesta sessão.

## Conclusão em uma frase

**A API pública da ESPN cobre sozinha ~95% do que o MVP precisa** para todas as competições do Palmeiras desde 2015: escalação, substituições com minuto, gols, cartões, estatísticas de time e público. As outras fontes gratuitas servem para conferência ou para preencher buracos pontuais, não como base. Estatística individual rica (passes por jogador, desarmes, notas, xG) **continua inacessível de graça**, e isso ficou confirmado na prática.

---

## 1. O que foi testado e o que aconteceu

O teste foi feito a partir de um servidor em nuvem, que é onde a coleta automática vai rodar (GitHub Actions). Fonte que bloqueia datacenter aqui vai bloquear lá também.

| Fonte | Resultado | Veredito |
|---|---|---|
| **ESPN** (`site.api.espn.com`, API pública não documentada) | 200 OK, sem chave, sem bloqueio. 784 partidas baixadas, 2015–2025, todas as competições | **Fonte principal** |
| **Cartola FC** (API da Globo) | 200 OK. Scouts por jogador por rodada, só na temporada corrente e só no Brasileirão | Complemento para o Brasileirão |
| **Histórico do Cartola** (repositório `henriquepgomide/caRtola`) | Arquivos de 2014 a 2026, em pelo menos 4 formatos diferentes. Scouts **acumulados** na temporada, o que exige subtrair rodada a rodada | Complemento, com custo alto de normalização |
| **Dataset Brasileirão** (`adaoduque/Brasileirao_Dataset`) | CSV de 2003 a 2024: partidas, técnicos, formação, gols, cartões, estatísticas de time. Ainda sem 2025 | Conferência do Brasileirão |
| **Wikidata** | 200 OK. 363 jogadores com passagem pelo Palmeiras desde 2015, 362 com data de nascimento | **Fonte de cadastro** (CC0) |
| **Wikipedia (pt)** | Páginas de temporada só para 2015, 2016 e 2020–2023, apenas com totais da temporada. A API limita requisições de servidor | Só conferência de totais |
| **RSSSF** | 200 OK | Não explorado: só interessa para o período anterior a 2015 |
| **football-data.org** | 403 sem chave: "restricted… check your subscription" | Não testado. Exige cadastro gratuito, e a ESPN já supera o que ele oferece |
| **API-Football** | 403 "Missing application key" | Não testado. Exige cadastro gratuito. Ver seção 5 |
| **Sofascore** | 403 para IP de datacenter | **Descartado**, como previsto |
| **FBref** | 403 com desafio do Cloudflare (`cf-mitigated: challenge`) | **Descartado** |
| **TheSportsDB** | 403 do Cloudflare | Descartado |
| **CBF (súmulas)** | Conexão derrubada pelo servidor, tanto no site quanto no repositório de PDFs | **Descartado** a partir de nuvem |

## 2. Cobertura da ESPN, medida

Percentual de partidas concluídas que trazem cada item, considerando o elenco do Palmeiras:

| Temporada | Partidas | Escalação | Substituições com minuto | Gols por jogador batem com o placar | Estatísticas de time | Passes (time) | Árbitro | Público | Estádio |
|---|---|---|---|---|---|---|---|---|---|
| 2015 | 70 | 100% | 100% | 99% | 100% | 100% | 1% | 66% | 100% |
| 2016 | 65 | 100% | 100% | 92% | 91% | 88% | 2% | 83% | 100% |
| 2017 | 66 | 100% | 100% | 100% | 100% | 100% | 0% | 76% | 100% |
| 2018 | 74 | 100% | 100% | 100% | 100% | 100% | 0% | 53% | 92% |
| 2019 | 68 | 100% | 100% | 99% | 99% | 97% | 1% | 78% | 94% |
| 2020 | 79 | 97% | 97% | 99% | 97% | 85% | 5% | 15%¹ | 87% |
| 2021 | 74 | 100% | 100% | 97% | 97% | 93% | 5% | 27%¹ | 100% |
| 2022 | 72 | 100% | 100% | 100% | 100% | 99% | 81% | 89% | 94% |
| 2023 | 73 | 100% | 100% | 100% | 100% | 100% | 100% | 97% | 100% |
| 2024 | 67 | 100% | 100% | 100% | 100% | 99% | 100% | 99% | 100% |
| 2025 | 76 | 100% | 100% | 86% | 80% | 78% | 100% | 97% | 100% |

¹ Pandemia: boa parte dos jogos foi sem público, então a ausência do dado é real e não falha da fonte.

Partidas por competição:

| Temporada | Brasileirão | Paulistão | Copa do Brasil | Libertadores | Supercopa | Recopa | Mundial | Amistoso |
|---|---|---|---|---|---|---|---|---|
| 2015 | 38 | 19 | 13 | 0 | 0 | 0 | 0 | 0 |
| 2016 | 38 | 17 | 4 | 6 | 0 | 0 | 0 | 0 |
| 2017 | 38 | 16 | 4 | 8 | 0 | 0 | 0 | 0 |
| 2018 | 38 | 18 | 6 | 12 | 0 | 0 | 0 | 0 |
| 2019 | 38 | 16 | 4 | 10 | 0 | 0 | 0 | 0 |
| 2020 | 38 | 16 | 8 | 13 | 0 | 0 | 2 | 2 |
| 2021 | 38 | 16 | 2 | 13 | 1 | 2 | 2 | 0 |
| 2022 | 38 | 16 | 4 | 12 | 0 | 2 | 0 | 0 |
| 2023 | 38 | 16 | 6 | 12 | 1 | 0 | 0 | 0 |
| 2024 | 38 | 16 | 4 | 8 | 1 | 0 | 0 | 0 |
| 2025 | 38 | 16 | 4 | 13 | 0 | 0 | 5 | 0 |

Ainda não conferi esses totais contra uma lista oficial de jogos. Os que conferi batem: Paulistão 2015 com 19 jogos e Mundial 2025 com 5.

Estatísticas individuais presentes, por competição:

| Competição | Partidas | Com estatística individual |
|---|---|---|
| Brasileirão | 418 | 100% |
| Paulistão | 182 | 100% |
| Copa do Brasil | 59 | 90% |
| Libertadores | 107 | **83%** |
| Mundial / Supercopa / Recopa | 16 | 100% |
| Amistosos | 2 | 0% |

### O que a ESPN entrega por partida

- **Partida:** data e hora, competição, mando, estádio, público, árbitro (só a partir de 2022) e placar.
- **Elenco, por jogador:** titular ou reserva, número da camisa, posição em campo (ex.: "zagueiro pela esquerda"), minuto de entrada e saída, gols, assistências, finalizações, finalizações no alvo, faltas cometidas e sofridas, impedimentos, cartões, gols contra e defesas (goleiro).
- **Time:** posse, finalizações (total, no alvo, bloqueadas), passes (total e certos), cruzamentos, bolas longas, desarmes, interceptações, cortes, escanteios, faltas e impedimentos.
- **Eventos:** gols (tipo: cabeça, falta, pênalti), cartões e substituições, com minuto e participantes.
- **Narração** lance a lance (~130 entradas por jogo), em inglês.

**O que não vem:** técnico, passes e desarmes **por jogador**, nota, xG, coordenadas de chute e mapa de calor.

## 3. Qualidade: a ESPN não pode ser a única fonte

Três testes de consistência:

1. **Placares conferem com o dataset independente.** 379 partidas do Brasileirão casadas entre ESPN e o CSV `adaoduque`: **0 divergências**.
2. **Minutos derivados conferem com a Wikipedia.** Calculando minutos a partir das substituições (titular conta do 0', quem entra conta do minuto da troca, fim no 90'), a ordem dos jogadores mais utilizados em 2015 é idêntica à da página da temporada. Os números absolutos ficam ~5% abaixo, porque a Wikipedia soma os acréscimos e a ESPN não informa o tempo total de jogo. Exemplo: Fernando Prass aparece com 5.940 min pela ESPN e 6.345 min pela Wikipedia.
3. **Gols por jogador falham em 21 de 784 partidas (2,7%).** Dois defeitos diferentes:
   - **Elenco sem estatísticas** (Libertadores e Copa do Brasil). O gol existe nos eventos-chave, mas não aparece no jogador. É recuperável pelos eventos.
   - **Eventos duplicados.** Exemplo: Palmeiras 2x0 Santos, 07/11/2021: cada gol aparece duas vezes e Rony e Veiga ficam com 2 gols cada. Sem conferência, os artilheiros sairiam errados.

**Implicação:** a camada de normalização precisa de uma regra simples, *soma dos gols individuais = placar, senão vai para a fila de revisão*, e de uma segunda fonte para desempate: o dataset `adaoduque` no Brasileirão até 2024 e o Cartola no Brasileirão corrente. Para Libertadores, Copa do Brasil e Paulistão **não existe segunda fonte gratuita acessível**, e a revisão será manual. São poucas partidas por ano.

## 4. Lacunas que nenhuma fonte gratuita fechou

| Lacuna | Situação | Saída possível |
|---|---|---|
| **Técnico por partida** | ESPN não tem. O dataset do Brasileirão tem até 2024 | Tabela manual de passagens (data início/fim). São ~15 técnicos desde 2015: uma tarde de trabalho, e a Wikidata ajuda |
| **Árbitro antes de 2022** | ESPN só a partir de 2022 | Dataset do Brasileirão não tem árbitro. Súmula da CBF está bloqueada a partir de nuvem. Fica em aberto |
| **Passes, desarmes e notas por jogador** | Só no Cartola (Brasileirão), com definições de fantasy game | Aceitar que, fora do Brasileirão, o dado individual se limita a gols, assistências, chutes e cartões |
| **xG e mapas de chute** | Indisponível | Fora do escopo sem orçamento |
| **Acréscimos** | ESPN não informa | Minutos "regulamentares" (90'), declarados como tal no site |

## 5. Volume e operação

- **Bruto:** 276 MB para 784 partidas (~350 KB cada), quase tudo narração, notícias e vídeos. Depois de recortar só o que interessa, a estimativa é de poucos MB por temporada. **Não cabe versionar o bruto inteiro no git.** Ou se guarda um bruto recortado (só `header`, `rosters`, `boxscore`, `keyEvents` e `gameInfo`), ou se usa o armazenamento do Supabase ou um *release* do GitHub como arquivo.
- **Tempo de coleta:** ~11 temporadas em ~15 minutos, com pausa de 0,5 s entre requisições. A atualização semanal é de segundos.
- **Banco:** ~800 partidas × ~23 atletas ≈ 18 mil linhas de participação desde 2015. Irrelevante para o limite de 500 MB do Supabase gratuito.
- **API-Football e football-data.org** não foram testados porque exigem cadastro, mesmo gratuito. Dado o resultado da ESPN, o único motivo para testá-los seria uma terceira fonte de conferência para Libertadores e Copa do Brasil. O plano gratuito da API-Football (100 requisições/dia) baixaria ~800 partidas em pouco mais de uma semana, **se** liberar temporadas antigas, o que continua sem confirmação.

## 6. Riscos específicos da fonte escolhida

- **A API da ESPN não é documentada nem oficial.** Pode mudar de formato ou exigir chave sem aviso. É o mesmo risco do Cartola. Mitigação: bruto guardado (recortado) e coletor isolado num único arquivo, fácil de trocar.
- **Termos de uso.** A ESPN não oferece licença para os dados. O uso é para projeto de torcedor, não comercial, com volume baixíssimo e atribuição. Fato esportivo não é protegido por direito autoral, mas a compilação pode ser. É o mesmo patamar de risco do plano anterior, só que agora com uma fonte concreta. Se o projeto um dia virar comercial, esse ponto precisa ser revisto.

---

## 7. Decisões para seguir

| # | Decisão | Recomendo | Por quê |
|---|---|---|---|
| 1 | **ESPN como fonte principal** de partidas, escalações, eventos e estatísticas de time | Sim | É a única fonte gratuita que cobriu todas as competições sem bloqueio, e passou na conferência de placares |
| 2 | **Wikidata como fonte de cadastro** (nome completo, nascimento, nacionalidade) | Sim | Licença CC0, 362 de 363 jogadores com data de nascimento, que é a chave para desambiguar homônimos |
| 3 | **Conferência obrigatória de gols** (soma = placar, senão fila de revisão) | Sim | 2,7% das partidas da ESPN têm gols errados ou ausentes por jogador |
| 4 | **Técnicos por tabela manual** | Sim | Nenhuma fonte gratuita completa. São poucos técnicos e o trabalho é curto |
| 5 | **Cartola para scouts individuais do Brasileirão** | Adiar para depois do MVP | Agrega passes e desarmes por jogador, mas só no Brasileirão e com 4+ formatos para normalizar |
| 6 | **Cadastro na API-Football** (gratuito) para servir de terceira fonte | Opcional, só se a revisão manual da Libertadores incomodar | Precisa da sua conta. Tem custo zero e pouco ganho esperado |
| 7 | **Árbitro antes de 2022** | Aceitar a lacuna por ora | Nenhuma fonte acessível a partir de nuvem |

**Próximo passo proposto:** modelo de dados no Supabase e um normalizador `ESPN bruto → tabelas`, com as regras de conferência acima, carregando 2015–2025. Depois disso, as primeiras páginas do site (partida, jogador, temporada).
