# PalmStats: interfaces e curiosidades

> Escrito em 16/11/2026. Os números saem da carga local de 2015–2025 (784 partidas, com as correções de `dados/manual/correcoes.csv`) e **ainda não foram revisados linha a linha**. Antes de publicar qualquer recorde como fato, confira as partidas envolvidas.
> Cobertura: todas as competições oficiais desde 2015, mais 2 amistosos. Minutos são regulamentares, sem acréscimos.

## 1. Onde o site pode ser melhor que os apps grandes

Sofascore e FotMob ganham em tempo real e em dado avançado, e não vale competir nisso. O PalmStats ganha onde eles não chegam:

1. **Consultas cruzadas**: "Veiga contra o Corinthians, só fora de casa, com o Abel".
2. **Recortes por técnico, por era e por adversário**, para todo jogo e todo jogador.
3. **Recordes e sequências do próprio clube**, calculados e não copiados de matéria.
4. **Conteúdo diário quase grátis**: "neste dia", aniversários e marcas próximas.

O risco é o contrário disso: um site que só repete tabela e placar não tem motivo para existir. A régua para cada página é **responder uma pergunta que o torcedor faz na mesa do bar**.

## 2. Páginas

### MVP (construído neste PR em `web/`)

| Página | Pergunta que responde | Conteúdo |
|---|---|---|
| **Início** `/` | "Como estamos?" | Últimos jogos, artilheiros da temporada, "neste dia", três curiosidades |
| **Partidas** `/partidas` | "Quando foi aquele jogo?" | Lista com filtros por temporada, competição e adversário, e placar e resultado em cor |
| **Partida** `/partidas/[id]` | "Quem jogou? Quem fez?" | Placar, escalação com minutos, linha do tempo de gols, cartões e trocas, e estatísticas lado a lado |
| **Jogadores** `/jogadores` | "Quem mais…?" | Ranking ordenável (jogos, gols, assistências, minutos, cartões), com filtro por temporada e competição |
| **Jogador** `/jogadores/[id]` | "Quanto ele fez aqui?" | Totais, tabela por temporada, gols por adversário, últimos jogos e estreia |
| **Adversário** `/adversarios/[id]` | "Como vamos contra eles?" | Retrospecto (V/E/D, gols), por mando e por competição, artilheiros do Palmeiras no confronto e todos os jogos |
| **Técnicos** `/tecnicos` | "Quem foi melhor?" | Jogos, V/E/D e aproveitamento, com passagens |
| **Curiosidades** `/curiosidades` | "Sabia que…?" | Os recordes da seção 3, cada um com link para as partidas |

### Próximas (ordem sugerida)

1. ~~**Explorador de consultas** (`/explorar`)~~ **Feito.** Inclui "com e sem o jogador", aviso de amostra pequena e links a partir das páginas de jogador e adversário. Na descrição original: Filtros combináveis: jogador, adversário, competição, mando, técnico, período, titular ou reserva. Devolve totais e lista de jogos, e é o recurso de maior valor e diferencial. Exige uma view "participação enriquecida" e um formulário bem feito.
2. **Neste dia** (`/neste-dia/[mm-dd]`). Todas as partidas da data e os aniversariantes do elenco. Pronto para virar post diário.
3. **Comparador de jogadores** (`/comparar?a=…&b=…`): dois perfis lado a lado, por 90 minutos.
4. **Parcerias** (`/parcerias`): quem mais jogou junto, duplas de zaga com melhor aproveitamento e garçom → artilheiro.
5. **Temporada** (`/temporadas/[ano]`): campanha por competição, elenco com minutagem, artilharia e linha do tempo do técnico.
6. **Mapa de gols** (`/jogadores/[id]#chutes`): a ESPN dá a posição de onde saíram os gols (`pos_x`, `pos_y`). Dá um campo com os pontos, sem precisar de xG.
7. **Marcas próximas**: "Veiga está a 2 gols do 110º", calculado a cada carga.

### O que não fazer agora

Placar ao vivo, notícias, palpites, comentários e login. Nenhum deles depende do acervo, e todos competem com produtos maiores.

## 3. Curiosidades já encontradas

### Gols

- **Raphael Veiga é o artilheiro do período**, com 108 gols em 376 jogos (0,29 por jogo). Dudu vem a seguir, com 88 em 452.
- **Os maiores artilheiros por jogo** são **José Manuel López** e **Miguel Borja**, com 0,32 gol por jogo. Depois vêm Luiz Adriano (0,31) e Veiga (0,29).
- **Gustavo Gómez, zagueiro, tem 43 gols**: 27 de cabeça e 11 de pênalti. É o 6º maior artilheiro do período.
- **Dupla mais letal**: Veiga deu 11 assistências para gols de Rony. Scarpa → Rony e Marcos Rocha → Rony têm 7 cada.
- **Dudu é o maior garçom**, com 96 assistências, quase o dobro de Veiga (54).
- **Quem decide do banco**: Rony fez 17 gols entrando no segundo tempo, Breno 14 e López 13.
- **O Palmeiras marca mais no fim**: 294 gols entre os 76' e o apito final, a faixa mais produtiva, contra 161 nos primeiros 15 minutos.
- **23% dos gols são de cabeça.**
- **Endrick é o mais jovem a marcar**: 16 anos e 3 meses, contra o Athletico, em 26/10/2022.

### Resultados e sequências

- **Maior goleada**: 8x1 no Independiente Petrolero, Libertadores 2022.
- **Maior derrota**: 1x5 para a Chapecoense, Brasileirão 2015.
- **Maiores invencibilidades**: duas de 20 jogos, de 12/11/2023 a 29/03/2024 e de 26/07/2020 a 03/10/2020.
- **50 viradas**: jogos em que o Palmeiras saiu perdendo e venceu.
- **Mando**: 72,6% de aproveitamento em casa contra 56,2% fora. O Allianz Parque recebeu 327 jogos, com 72,4%.
- **Disputas de pênaltis**: só **6 vitórias em 19** em jogos oficiais desde 2015 (a 7ª foi num amistoso). Perdeu a semifinal da Libertadores 2023 para o Boca, a Supercopa de 2024 e a final do Paulistão 2018.
- **Pênaltis em jogo**: Raphael Veiga é o cobrador principal, com 39 de 45 (87%). Gómez tem 11 de 12 e Scarpa 14 de 16, mas Dudu converteu só 4 de 9.

### Clássicos (2015–2025)

| Adversário | J | V | E | D | Gols |
|---|---|---|---|---|---|
| São Paulo | 47 | 22 | 15 | 10 | 62 × 31 |
| Corinthians | 43 | 15 | 14 | 14 | 48 × 40 |
| Santos | 41 | 21 | 8 | 12 | 52 × 37 |
| Flamengo | 28 | 7 | 11 | 10 | 32 × 42 |

O Flamengo é o único grande com retrospecto negativo no período.

### Gente

- **Mais jogos**: Dudu (452), Weverton (448, com 40.308 minutos, o maior tempo em campo), Gómez (377), Veiga (376) e Marcos Rocha (340).
- **Estreias mais jovens**: Endrick (16,2 anos), Estêvão (16,6) e Giovani (17,2).
- **Elenco**: 154 brasileiros e 26 estrangeiros jogaram (2 sem nacionalidade na fonte); Argentina com 7 e Paraguai, Colômbia e Uruguai com 5 cada.
- **Cartões vermelhos**: Deyverson (7) e Zé Rafael (6).

### Técnicos

| Técnico | Jogos | Aproveitamento |
|---|---|---|
| Abel Ferreira | 398 | 65,7% |
| Cuca | 88 | 60,2% |
| Luiz Felipe Scolari | 79 | 69,2% |
| Marcelo Oliveira | 51 | 51,6% |
| Roger Machado | 41 | 65,9% |

Felipão tem o melhor aproveitamento entre os de passagem longa. A média do Abel caiu por causa do volume de jogos, mas é com folga o técnico com mais jogos e títulos do período.

### Arbitragem (só a partir de 2022, quando a ESPN passa a informar)

O melhor aproveitamento é com Rafael Klein (86,7% em 10 jogos) e o pior com Flávio Rodrigues de Souza (43,3%). **Cuidado**: amostras de 8 a 20 jogos não sustentam conclusão nenhuma sobre o árbitro. Se for publicar, mostre o tamanho da amostra e não ranqueie.

## 4. Problemas de dados que apareceram nesta análise

| Problema | Exemplo | Correção |
|---|---|---|
| Estádio com nomes diferentes | "Estadio do Pacaembu" e "Mercado Livre Arena Pacaembu" | Tabela de apelidos de estádio, ou correção `mesclar_em` também para estádios |
| 12 jogos em casa sem estádio | — | Completar via correções |
| Nome de árbitro em formato invertido | "Daronco, Anderson" | Normalizar "Sobrenome, Nome" na carga |
| Placar de disputa de pênaltis mostra só o jogo de volta | Copa do Brasil 2015: 2x1 e pênaltis 4x3 | Agregar o placar dos dois jogos quando for mata-mata |

## 5. Decisões técnicas do site

- **Next.js (App Router) na Vercel**, com consultas SQL diretas ao Postgres feitas só no servidor. A string de conexão nunca chega ao navegador, e não é preciso expor a API do Supabase.
- **Páginas com cache de 1 hora** (ISR). O dado muda uma vez por dia; o banco quase não é tocado e o plano gratuito sobra.
- **Sem bibliotecas de UI**: CSS próprio, verde do clube, tabelas legíveis no celular.
- **NULL aparece como "–"**, nunca como zero.

## 6. Como publicar na Vercel

1. Em [vercel.com](https://vercel.com), **Add New → Project** e importe o repositório `palmstats`.
2. **Root Directory**: `web`. O framework (Next.js) é detectado sozinho.
3. **Environment Variables**: `DATABASE_URL` com a string do Supabase em **Connect → Transaction pooler** (porta **6543**), com a senha preenchida. É a mesma senha do secret do GitHub, mas outra porta: o modo transação é o indicado para funções serverless.
4. **Deploy.** O build já consulta o banco (início, técnicos e curiosidades são pré-geradas), então a carga do Supabase precisa ter rodado antes.

As páginas se atualizam sozinhas a cada hora. O plano Hobby é gratuito e serve, já que o projeto não é comercial.

## 7. Analytics

O site usa o **Vercel Web Analytics** (`@vercel/analytics`): sem cookies, sem dados pessoais e gratuito no plano Hobby, com limite mensal de eventos. Para começar a coletar:

1. No projeto na Vercel: **Analytics → Enable**.
2. Faça um novo deploy. O script só é servido pela Vercel; localmente ele dá 404, e isso é esperado.

O que observar nas primeiras semanas: quais páginas são abertas, se o `/explorar` é usado além da primeira visita, e de onde vêm os acessos.

