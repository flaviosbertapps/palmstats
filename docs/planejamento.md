# PalmStats — planejamento inicial

> Documento de descoberta, escrito em 11/11/2026. Nada aqui foi construído ainda.
> Itens marcados com **[verificar]** são afirmações que não confirmei em fonte primária.
> O resumo executivo com as decisões está no [final](#9-resumo-executivo-e-decisões).

---

## 1. O problema com o pedido como está formulado

Três pontos fracos, antes de qualquer plano:

1. **"Concentrar tudo" não é um produto.** Sofascore, FotMob, ogol e Transfermarkt já concentram dados de todos os clubes, com orçamento e licenças. Um agregador genérico só do Palmeiras perde para eles em tudo, exceto em duas coisas: **profundidade histórica** (1914 em diante, que os apps modernos cobrem mal) e **perguntas que só um palmeirense faz** (retrospecto em Derby, desempenho por técnico, quem jogou com quem, sequências, "neste dia"). O diferencial tem que vir daí, não do volume.

2. **"Grátis" e "todas as estatísticas" são objetivos em conflito.** Estatística rica de jogador por partida (passes, desarmes, xG, mapa de chutes) é produto comercial da Opta/StatsPerform e similares. O que existe de graça é ou raso (placar, escalação, gols, cartões), ou obtido por raspagem de sites cujos termos proíbem isso. Não existe terceira opção. Em janeiro de 2026 o FBref perdeu todos os dados avançados depois que a Opta encerrou o contrato — é a prova de que fonte gratuita de dado avançado pode sumir de um dia para o outro.

3. **O trabalho difícil não é o site, é a ingestão.** Next.js + Supabase para exibir tabelas é o fim de semana. Reconciliar "Dudu", "Eduardo Pereira Rodrigues" e o ID 123456 de três fontes diferentes, em 7 mil partidas, é o projeto. Quem planeja pelo front-end primeiro costuma abandonar na etapa de dados.

Consequência prática: o plano abaixo é organizado por **camadas de dados**, da mais barata e estável para a mais frágil, e o site cresce conforme cada camada fica confiável.

---

## 2. Que dados existem (taxonomia)

| Camada | Conteúdo | Disponibilidade gratuita | Período realista |
|---|---|---|---|
| **A. Partida** | data, competição, fase, adversário, mando, estádio, placar, público, renda, árbitro, técnico | Alta | 1914 → hoje |
| **B. Súmula** | titulares, reservas, substituições (minuto), gols (autor, minuto, tipo), cartões | Alta para o período recente; média/baixa antes dos anos 1970 | ~1914 → hoje, com lacunas |
| **C. Estatística agregada de partida** | posse, finalizações, escanteios, faltas, impedimentos (time); minutos, chutes, passes, desarmes, nota (jogador) | Só via raspagem ou plano gratuito limitado de API | ~2013 → hoje |
| **D. Evento** | cada chute/passe com coordenadas, xG, mapas de calor | Só via raspagem de fonte frágil | ~2018 → hoje |
| **E. Cadastro** | jogadores (nascimento, posição, nacionalidade, passagens), técnicos, títulos, transferências | Alta | completo |
| **F. Contexto** | classificação rodada a rodada, valor de mercado, lesões, contratos | Média | ~2003 → hoje |

As camadas A, B e E sozinhas já respondem à maioria das perguntas de torcedor (artilheiros, quem mais jogou, retrospectos, sequências, técnicos, estreias). C e D são o que dá aparência de "app de estatística moderna", e são as que custam.

---

## 3. Fontes de dados

### 3.1 Baixo risco (licença aberta ou API com plano gratuito oficial)

| Fonte | O que dá | Limitações |
|---|---|---|
| **CBF — súmulas oficiais** (PDFs públicos) | Camada B oficial para Brasileirão e Copa do Brasil: escalação, substituições, gols, cartões, árbitro, público e renda (borderô) | PDF, exige parser; só competições CBF; histórico online limitado **[verificar desde que ano]** |
| **Wikidata / Wikipedia** | Cadastro de jogadores, técnicos, títulos, temporadas | CC0 / CC BY-SA; cobertura irregular por partida |
| **football-data.org** | Partidas, placar, tabela; plano gratuito de 12 competições, 10 req/min | Brasileirão e Libertadores aparecem como cobertos **[verificar se estão no plano gratuito]**; sem estatística de jogador |
| **API-Football** (plano gratuito) | Partidas, escalações, eventos, estatísticas de time e jogador (camada C) | 100 req/dia, 10 req/min; o plano gratuito restringe temporadas **[verificar quais — isso decide se serve]** |
| **TheSportsDB** | Partidas, escudos, metadados | Dado colaborativo, qualidade variável |
| **Base dos Dados / Kaggle / GitHub** (`adaoduque/Brasileirao_Dataset`, `williamorim/brasileirao`, `footballcsv`) | CSVs prontos do Brasileirão desde 2003 | Só Brasileirão; atualização depende de voluntário; checar licença de cada um |
| **StatsBomb Open Data** | Evento completo (camada D) | Não cobre Brasileirão; útil só para jogadores do Palmeiras em Copas/seleções — marginal |

### 3.2 Risco médio (API não oficial ou raspagem de site tolerante)

| Fonte | O que dá | Risco |
|---|---|---|
| **Cartola FC (API pública não documentada da Globo)** | "Scouts" por jogador por rodada do Brasileirão: finalizações, desarmes, assistências, defesas, faltas etc. Repositório `henriquepgomide/caRtola` tem histórico desde 2014 | Não oficial; só Brasileirão; métricas definidas para fantasy, não para análise |
| **FBref** | Camadas A, B e C básicas para Brasileirão, Copa do Brasil, Libertadores | Perdeu dados avançados em jan/2026; limite de taxa rígido; termos restringem raspagem |
| **Transfermarkt** | Cadastro, transferências, valor de mercado, escalações, técnicos | Termos proíbem raspagem; bloqueio ativo |
| **ogol / zerozero** | Histórico profundo de partidas e escalações do futebol brasileiro | Termos proíbem raspagem |
| **RSSSF Brasil** | Resultados históricos em texto puro, desde os primórdios | Formato livre, parser artesanal; uso com atribuição |

### 3.3 Risco alto (melhor dado, pior sustentação)

| Fonte | O que dá | Risco |
|---|---|---|
| **Sofascore** (API interna) | Camadas C e D completas para todas as competições do Palmeiras, inclusive Paulistão: notas, mapa de chutes, xG, heatmap | Cloudflare bloqueia IPs de datacenter (GitHub Actions, Vercel) com 403; termos proíbem; contornar exige proxy residencial, que não é grátis e é evasão deliberada |
| **FotMob** (API interna) | Semelhante, com xG Opta | API passou a exigir cabeçalho assinado; quebra com frequência |
| **WhoScored** | Evento Opta completo | Anti-bot agressivo |

### 3.4 Fontes de torcida (as mais valiosas para o histórico)

Sites como **Verdazzo** e **Porcopédia** mantêm o acervo de partidas do Palmeiras desde 1914, com fichas técnicas — trabalho manual de anos. É exatamente a camada A+B histórica que nenhuma API tem.

Raspar isso sem pedir é a pior jogada possível: são pessoas da mesma comunidade que o app quer atingir, o acervo é obra autoral de curadoria, e o custo de reputação é imediato. **O caminho é pedir parceria** (crédito visível, link de volta, devolução de correções). Se disserem não, o histórico pré-2003 vem de RSSSF + Wikipedia + digitação manual, bem mais devagar.

### 3.5 Leitura jurídica (não sou advogado)

- Fato esportivo (placar, quem jogou, quem fez gol) não é protegido por direito autoral. A **compilação** e o **acesso** são: termos de uso e, na UE, direito de banco de dados.
- Escudo e marca do Palmeiras são registrados. Projeto de fã sem fins lucrativos costuma ser tolerado, mas não usar o escudo oficial como logotipo do app e deixar claro "não oficial" reduz o risco.
- Fotos de jogadores são de agências. Não usar, ou usar só Wikimedia Commons com atribuição.
- **Vercel Hobby é restrito a uso pessoal e não comercial.** Anúncio, doação ou assinatura exige o plano Pro (US$ 20/mês). Isso precisa ser decidido antes, não depois de ter audiência.

---

## 4. Arquitetura proposta

```
 fontes ──► coletores (Python, GitHub Actions) ──► JSON/HTML bruto (versionado)
                                                        │
                                                        ▼
                                            normalização + reconciliação
                                                        │
                                                        ▼
                                              Supabase (Postgres)
                                                        │
                                                        ▼
                                          Next.js na Vercel (ISR / estático)
```

### 4.1 Decisões de arquitetura e o porquê

- **Ingestão fora da Vercel.** Cron do plano Hobby roda no máximo uma vez por dia e função serverless tem tempo curto. GitHub Actions agendado é gratuito em repositório público e roda Python com tempo de sobra. (Cuidado: workflows agendados são desativados após 60 dias sem atividade no repositório.)
- **Guardar o bruto antes de normalizar.** Toda resposta de fonte é salva como arquivo antes de virar linha de tabela. Quando o parser tiver um bug — e terá — reprocessa-se sem depender da fonte ainda existir. É a lição direta do caso FBref.
- **Site quase estático.** O dado muda algumas vezes por semana. Páginas geradas com ISR e revalidação após cada ingestão gastam quase nada de banda e de banco, e resolvem de graça os limites do plano gratuito.
- **Supabase gratuito aguenta o volume.** Estimativa: ~7 mil partidas na história, ~200 mil linhas de participação jogador-partida, ~500 mil eventos se a camada D entrar para os últimos anos. Fica bem abaixo dos 500 MB. O risco real é outro: **projeto gratuito pausa após 7 dias sem requisição** — a própria ingestão diária evita isso.
- **Contra-argumento honesto ao Supabase:** para um site só de leitura, um arquivo SQLite/DuckDB gerado no build e servido estático seria mais simples, sem pausa, sem limite e sem RLS para configurar. Supabase só se justifica se houver busca livre no servidor, contas de usuário, ou edição colaborativa de dados. Recomendo manter Supabase porque a etapa de correção manual do histórico (seção 6, fase 3) precisa de uma interface de edição — mas se essa fase cair do escopo, o banco também pode cair.
- **Sem tempo real.** Placar ao vivo exige fonte paga ou raspagem agressiva, e é exatamente onde os apps grandes são imbatíveis. Atualizar algumas horas depois do apito final é suficiente para o propósito.

### 4.2 Modelo de dados (esboço)

- `competicoes`, `temporadas`, `fases`
- `clubes`, `estadios`, `arbitros`, `tecnicos`
- `jogadores` (cadastro) e `passagens` (período no clube)
- `partidas` (camada A)
- `participacoes` (jogador × partida: titular, minutos, entrou/saiu, número) — camada B
- `eventos` (gol, cartão, substituição, pênalti; opcionalmente chute com coordenadas) — camadas B e D
- `stats_time_partida`, `stats_jogador_partida` (colunas esparsas ou JSONB) — camada C
- `ids_externos` (entidade, fonte, id na fonte) — **a tabela mais importante do projeto**
- `proveniencia` (de onde veio cada registro, quando, e nível de confiança)

Dois princípios: todo registro sabe de que fonte veio, e ausência de dado é `NULL`, nunca zero. "0 desarmes" e "não temos o dado de desarmes" são coisas diferentes e o site precisa mostrar a diferença.

### 4.3 Reconciliação de entidades

É o ponto onde o projeto ganha ou morre. Propostas:

- ID próprio para cada jogador, clube e partida; fontes externas apontam para ele via `ids_externos`.
- Partida casa por (data, adversário, competição) — razoavelmente determinístico.
- Jogador casa por (nome normalizado, data de nascimento) quando houver; caso contrário vai para uma fila de revisão manual em vez de ser casado por aproximação. Homônimos são frequentes no elenco histórico.
- Clubes adversários mudam de nome e se fundem; precisa de tabela de apelidos.

---

## 5. O que mostrar (ideias de produto)

**Páginas-base**
- **Partida:** ficha técnica completa, estatísticas disponíveis, contexto (posição na tabela, sequência na época).
- **Jogador:** números totais e por temporada/competição/técnico, estreia e despedida, todos os jogos, gols por adversário.
- **Temporada:** elenco, campanha por competição, artilharia, minutagem.
- **Adversário:** retrospecto completo, por mando, por competição, por era.
- **Técnico:** aproveitamento, passagens, jogadores mais usados.

**O que diferencia de um app genérico**
- **Explorador de consultas:** filtros combináveis ("jogos fora, na Libertadores, com o técnico X, desde 2015") com resultado agregado e lista de partidas. É a ferramenta que o torcedor que discute no bar realmente quer.
- **Recordes e sequências:** maiores invencibilidades, goleadas, jejuns, mais jovem a marcar, recordes de público.
- **Neste dia:** partidas históricas na data de hoje — conteúdo diário quase gratuito.
- **Parcerias em campo:** quem mais jogou junto, duplas de zaga por aproveitamento, quem deu mais assistências para quem.
- **Clássicos:** página própria para cada rival, com linha do tempo.
- **Estádio e arbitragem:** aproveitamento no Allianz Parque vs. outros mandos; retrospecto por árbitro.
- **Base:** minutos e gols de jogadores formados no clube, por temporada.

**O que eu não faria no início:** palpites, previsão de resultado, notícias, comentários, tempo real, aplicativo nativo. Cada um é um projeto à parte e nenhum depende do acervo.

---

## 6. Fases sugeridas

| Fase | Entrega | Fontes | Critério de saída |
|---|---|---|---|
| **0. Prova de dados** (antes de qualquer código de site) | Scripts que baixam uma temporada inteira (ex.: 2025) de 2–3 fontes e relatório do que cada uma realmente entrega | API-Football grátis, football-data.org, súmulas CBF, Cartola | Saber, com dado na mão, o que é viável; responder os **[verificar]** deste documento |
| **1. MVP moderno** | Site com partidas, fichas, jogadores e temporadas de ~2015 em diante (camadas A, B, E) | As aprovadas na fase 0 | Toda partida oficial do período com escalação e gols conferidos |
| **2. Estatística** | Camada C onde houver; explorador de consultas; recordes | Cartola, API-Football; raspagem só se decidido | Cobertura declarada por competição e ano |
| **3. Histórico** | 1914 → início do período moderno | Parceria com acervo de torcida, RSSSF, Wikipedia, correção manual | Cobertura por década publicada e honesta sobre lacunas |
| **4. Avançado** | Mapas de chute, xG, eventos | Depende da decisão de risco | — |

A fase 0 existe porque metade das escolhas deste documento depende de fatos que só um teste real resolve (quais temporadas o plano gratuito libera, se a súmula da CBF é parseável, se o Cartola cobre o que interessa). Planejar mais antes disso é especulação.

---

## 7. Riscos principais

| Risco | Probabilidade | Efeito | Mitigação |
|---|---|---|---|
| Fonte gratuita some ou bloqueia | Alta | Para a atualização de uma camada | Bruto versionado; ao menos duas fontes para A e B; C e D tratadas como bônus |
| Reconciliação de jogadores vira trabalho manual sem fim | Alta | Dado errado publicado, perda de credibilidade com o público que mais repara | Fila de revisão; começar pelo período moderno, com IDs estáveis |
| Escopo "tudo" impede lançar | Alta | Projeto abandonado | Fases com critério de saída; MVP só com A+B+E |
| Notificação por raspagem ou uso de marca | Baixa/média | Retirada de dados ou do ar | Priorizar fontes abertas; não oficial e sem fins lucrativos; parceria com acervos |
| Monetização exigir sair do plano gratuito | Certa, se monetizar | US$ 20–45/mês | Decidir a intenção agora |
| Competições sem cobertura gratuita (Paulistão, amistosos, Mundial) | Alta | Buracos no período moderno | Entrada manual — são poucas dezenas de jogos por ano |

---

## 8. Custos

| Item | Grátis | Quando deixa de ser |
|---|---|---|
| Vercel Hobby | sim | Qualquer uso comercial → Pro, US$ 20/mês |
| Supabase Free | sim (500 MB, pausa após 7 dias inativo) | Passar de 500 MB ou querer backup automático → US$ 25/mês |
| GitHub Actions | sim, repositório público | Repositório privado com muito uso |
| Domínio | não | ~R$ 40/ano (`.com.br`) |
| API paga com camada C/D confiável | não | A partir de ~US$ 20/mês; resolve de vez o problema de raspagem |

O projeto roda a custo de um domínio. Mas note a última linha: se o objetivo for estatística rica e sustentável, pagar ~US$ 20/mês por uma API provavelmente custa menos do que as horas gastas mantendo raspadores quebrando.

---

## 9. Resumo executivo e decisões

**Diagnóstico.** O projeto é viável a custo quase zero, mas não na forma "todas as estatísticas, de graça". De graça e com baixo risco dá para ter, com qualidade, **quem jogou, quem marcou, contra quem, quando, onde e com que técnico — de toda a história**. Estatística avançada por jogador (passes, xG, mapas) só existe via raspagem de fontes que bloqueiam e proíbem, ou pagando. O valor real para o torcedor fanático está no acervo histórico e nas consultas cruzadas, que é justamente o que os apps grandes não oferecem — então a limitação dói menos do que parece.

**Stack.** Supabase + Vercel serve, com um ajuste: a ingestão roda em GitHub Actions (Python), não na Vercel. O site é Next.js quase estático.

**Decisões que preciso de você** (com a minha recomendação):

| # | Decisão | Opções | Recomendo |
|---|---|---|---|
| 1 | **Intenção comercial** | (a) hobby sem receita; (b) pode ter anúncio/apoio | Decidir já. (a) mantém tudo grátis; (b) exige Vercel Pro e mais cuidado com fontes |
| 2 | **Tolerância a raspagem** | (a) só fontes abertas/APIs oficiais; (b) raspagem educada de sites tolerantes; (c) vale tudo, inclusive Sofascore | (a) para o MVP, reavaliar (b) na fase 2. (c) não: depende de contornar bloqueio, o que quebra o "grátis" e o "sustentável" ao mesmo tempo |
| 3 | **Por onde começar no tempo** | (a) moderno (2015+) e depois recuar; (b) histórico completo raso primeiro | (a). Dados mais fáceis, IDs estáveis, valida o pipeline. O histórico entra na fase 3 |
| 4 | **Acervos de torcida** | (a) propor parceria; (b) ignorar; (c) raspar | (a). Você conhece a comunidade melhor do que eu — é um contato que precisa partir de você |
| 5 | **Competições no MVP** | (a) só Brasileirão; (b) + Copa do Brasil e Libertadores; (c) + Paulistão e amistosos | (b). Paulistão tem cobertura gratuita ruim; entra por digitação depois |
| 6 | **Orçamento-teto** | (a) R$ 0 além do domínio; (b) até ~US$ 20/mês se destravar a camada C | Responder depois da fase 0, com o resultado do teste em mãos |
| 7 | **Projeto aberto?** | (a) repositório e dados públicos; (b) fechado | (a). Actions grátis, atrai colaboradores para corrigir histórico, e é mais defensável perante as fontes |

**Próximo passo proposto: fase 0 (prova de dados).** Sem site. Escrever os coletores para a temporada 2025 em API-Football (grátis), football-data.org, súmulas da CBF e Cartola, e produzir um relatório comparando cobertura, qualidade e esforço. Isso resolve os itens **[verificar]** e transforma as decisões 2, 5 e 6 de opinião em dado. As decisões 1, 3, 4 e 7 não dependem disso e podem ser respondidas agora.

---

### Fontes consultadas nesta pesquisa

- [Sports Reference retira dados avançados do FBref (Awful Announcing)](https://awfulannouncing.com/soccer/sports-reference-pulls-advanced-data-agreement-violation-dispute.html)
- [API-Football — preços](https://www.api-football.com/pricing) e [limites de taxa](https://www.api-football.com/news/post/how-ratelimit-works)
- [Vercel — plano Hobby](https://vercel.com/docs/plans/hobby) e [cron jobs: uso e preços](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- [Supabase — limites do plano gratuito (resumo de terceiros)](https://www.jetadmin.io/blog/supabase-pricing-2026-guide-to-plans-limits-and-real-world-costs/)
- [football-data.org — resumo do plano gratuito (terceiros)](https://sportsapis.dev/apis/football-data-org)
- [Bloqueio do Sofascore a IPs de datacenter (documentação de ator Apify)](https://apify.com/rl1987/sofascore-api-scraper)
- [adaoduque/Brasileirao_Dataset](https://github.com/adaoduque/Brasileirao_Dataset)
- [henriquepgomide/caRtola](https://docsearch.algolia.com/mcp/docs/repo/henriquepgomide/cartola)
