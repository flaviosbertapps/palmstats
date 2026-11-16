"""Brutos (ESPN + Wikidata + manuais) -> tabelas do Postgres/Supabase.

Uso:  DATABASE_URL=postgresql://... python coleta/normalizar.py dados/brutos

Idempotente: pode rodar quantas vezes quiser; faz upsert por espn_id.
Regras de conferência (ver docs/prova-de-dados.md):
  * gols e assistências por jogador vêm dos eventos (deduplicados), não do
    elenco; se a soma não bater com o placar, a partida vai para `revisao`;
  * jogador casa com a Wikidata por data de nascimento + nome; ambíguo ou
    sem par vai para `revisao`;
  * técnico da partida = passagem vigente em dados/manual/tecnicos.csv.
"""
import csv
import datetime as dt
import json
import os
import pathlib
import re
import sys
import unicodedata

import psycopg
from psycopg.types.json import Jsonb

import correcoes

PALMEIRAS = "2029"
RAIZ = pathlib.Path(__file__).resolve().parent.parent
COMPETICOES = {
    "bra.1": "Campeonato Brasileiro",
    "bra.camp.paulista": "Campeonato Paulista",
    "bra.copa_do_brazil": "Copa do Brasil",
    "conmebol.libertadores": "Copa Libertadores",
    "conmebol.recopa": "Recopa Sul-Americana",
    "bra.supercopa_do_brazil": "Supercopa do Brasil",
    "fifa.cwc": "Mundial de Clubes",
    "club.friendly": "Amistoso",
}
TIPOS_EVENTO = {
    "Goal": "gol", "Goal - Header": "gol", "Goal - Volley": "gol", "Goal - Free-kick": "gol",
    "Penalty - Scored": "penalti_convertido", "Own Goal": "gol_contra",
    "Penalty - Saved": "penalti_perdido", "Penalty - Missed": "penalti_perdido",
    "Penalty - Hit Woodwork": "penalti_perdido",
    "Yellow Card": "amarelo", "Red Card": "vermelho", "Substitution": "substituicao",
}
IGNORAR = {"Kickoff", "Halftime", "Start 2nd Half", "End Regular Time", "End Match",
           "Start Extra Time", "Halftime Extra Time", "Start 2nd Half Extra Time",
           "End Extra Time", "Start Shootout"}
STATS_JOGADOR = {"G": "gols", "A": "assistencias", "SHOT": "finalizacoes",
                 "SOG": "finalizacoes_no_alvo", "FC": "faltas_cometidas",
                 "FA": "faltas_sofridas", "OFF": "impedimentos", "YC": "amarelos",
                 "RC": "vermelhos", "OG": "gols_contra", "SV": "defesas", "GA": "gols_sofridos"}
STATS_TIME = {"possessionPct": "posse", "totalShots": "finalizacoes",
              "shotsOnTarget": "finalizacoes_no_alvo", "blockedShots": "finalizacoes_bloqueadas",
              "totalPasses": "passes", "accuratePasses": "passes_certos",
              "totalCrosses": "cruzamentos", "accurateCrosses": "cruzamentos_certos",
              "totalLongBalls": "bolas_longas", "accurateLongBalls": "bolas_longas_certas",
              "totalTackles": "desarmes", "effectiveTackles": "desarmes_certos",
              "interceptions": "interceptacoes", "totalClearance": "cortes",
              "wonCorners": "escanteios", "foulsCommitted": "faltas", "offsides": "impedimentos",
              "yellowCards": "amarelos", "redCards": "vermelhos", "saves": "defesas"}


GENERICOS = {"silva", "santos", "souza", "sousa", "oliveira", "pereira", "costa", "junior",
             "filho", "neto", "lima", "rodrigues", "ferreira", "almeida", "alves", "gomes",
             "martins", "carvalho", "ribeiro", "lopes", "barbosa", "araujo", "nascimento",
             "dos", "das", "del", "los", "las"}


PLACAR_PARCIAL = re.compile(r"([^.!]+? \d+, [^.!]+? \d+)\.")


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return set(re.findall(r"[a-z]{3,}", s))


def relogio(txt):
    """"45'+3'" -> (45, 3); "64'" -> (64, None)."""
    m = re.match(r"(\d+)'(?:\+(\d+)')?", txt or "")
    if not m:
        return None, None
    return int(m.group(1)), int(m.group(2)) if m.group(2) else None


def num(v):
    if v in (None, ""):
        return None
    try:
        f = float(v)
    except ValueError:
        return None
    return f


class Carga:
    def __init__(self, conn, brutos):
        self.c = conn
        self.brutos = pathlib.Path(brutos)
        self.revisoes = []
        self.cache = {}

    # -- utilidades -----------------------------------------------------------
    def upsert(self, tabela, chave, dados):
        cols = list(dados)
        upd = [c for c in cols if c != chave] or [chave]
        sql = (f"insert into {tabela} ({', '.join(cols)}) values ({', '.join(['%s'] * len(cols))}) "
               f"on conflict ({chave}) do update set "
               + ", ".join(f"{c} = excluded.{c}" for c in upd) + " returning id")
        return self.c.execute(sql, [dados[c] for c in cols]).fetchone()[0]

    def revisar(self, entidade, chave, motivo, detalhe):
        self.revisoes.append((entidade, chave, motivo, Jsonb(detalhe)))

    def clube(self, team):
        k = ("clube", team["id"])
        if k not in self.cache:
            logo = (team.get("logos") or [{}])[0].get("href") or team.get("logo")
            self.cache[k] = self.upsert("clubes", "espn_id", {
                "espn_id": team["id"], "nome": team["displayName"],
                "abreviacao": team.get("abbreviation"), "escudo_url": logo})
        return self.cache[k]

    def estadio(self, v):
        if not v or not v.get("id"):
            return None
        k = ("estadio", v["id"])
        if k not in self.cache:
            ad = v.get("address", {})
            self.cache[k] = self.upsert("estadios", "espn_id", {
                "espn_id": v["id"], "nome": v["fullName"],
                "cidade": ad.get("city"), "pais": ad.get("country")})
        return self.cache[k]

    # -- cadastros ------------------------------------------------------------
    def carregar_competicoes(self):
        for k, v in COMPETICOES.items():
            self.c.execute("insert into competicoes (id, nome) values (%s, %s) "
                           "on conflict (id) do update set nome = excluded.nome", (k, v))

    def carregar_tecnicos(self):
        self.passagens = []
        self.c.execute("delete from passagens_tecnico")
        for r in csv.DictReader(open(RAIZ / "dados/manual/tecnicos.csv", encoding="utf8")):
            tid = self.c.execute(
                "insert into tecnicos (nome) values (%s) on conflict (nome) do update "
                "set nome = excluded.nome returning id", (r["tecnico"],)).fetchone()[0]
            ini = dt.date.fromisoformat(r["inicio"])
            fim = dt.date.fromisoformat(r["fim"]) if r["fim"] else None
            self.c.execute(
                "insert into passagens_tecnico (tecnico_id, inicio, fim, interino, conferido, fonte) "
                "values (%s,%s,%s,%s,%s,%s)",
                (tid, ini, fim, r["interino"] == "true", r["conferido"] == "true", r["fonte"]))
            self.passagens.append((ini, fim, tid))

    def tecnico_em(self, data):
        hits = [t for ini, fim, t in self.passagens if ini <= data and (fim is None or data <= fim)]
        return hits[0] if len(hits) == 1 else None

    def carregar_jogadores(self):
        wd = json.loads((self.brutos / "wikidata/jogadores.json").read_text())
        por_espn = {w["espn"]: w for w in wd if w.get("espn")}
        por_nasc = {}
        for w in wd:
            for n in w["nascimentos"]:
                por_nasc.setdefault(n, []).append(w)
        usados = set()
        self.jogadores = {}
        for f in sorted((self.brutos / "espn/atletas").glob("*.json")):
            a = json.loads(f.read_text())
            nasc = (a.get("dateOfBirth") or "")[:10] or None
            # A ESPN grava o nascimento em UTC; tolera ±1 dia.
            cands, nomes = [], set()
            if a["id"] in por_espn:
                cands = [por_espn[a["id"]]]
            elif nasc:
                d = dt.date.fromisoformat(nasc)
                nomes = (norm(a.get("fullName")) | norm(a.get("displayName"))) - GENERICOS
                for delta in (0, -1, 1):
                    for w in por_nasc.get(str(d + dt.timedelta(days=delta)), []):
                        if nomes & (norm(w.get("nome")) | norm(w.get("nomeCompleto"))):
                            cands.append(w)
                cands = list({w["qid"]: w for w in cands}.values())
                if len(cands) > 1:  # desempate 1: mais tokens do nome em comum
                    pontos = {w["qid"]: len(nomes & (norm(w.get("nome")) | norm(w.get("nomeCompleto"))))
                              for w in cands}
                    melhor = max(pontos.values())
                    if sum(1 for v in pontos.values() if v == melhor) == 1:
                        cands = [w for w in cands if pontos[w["qid"]] == melhor]
                if len(cands) > 1:  # desempate 2: quem tem o Palmeiras cadastrado
                    pal = [w for w in cands if w.get("palmeiras")]
                    cands = pal if len(pal) == 1 else cands
            w = cands[0] if len(cands) == 1 and cands[0]["qid"] not in usados else None
            if w:
                usados.add(w["qid"])
                comuns = nomes & (norm(w.get("nome")) | norm(w.get("nomeCompleto"))) if nasc else set()
                if a["id"] not in por_espn and not w.get("palmeiras") and len(comuns) < 2:
                    self.revisar("jogador", a["id"], "wikidata_conferir",
                                 {"nome": a.get("fullName"), "wikidata": w["qid"],
                                  "nome_wikidata": w.get("nome"), "em_comum": sorted(comuns)})
            else:
                self.revisar("jogador", a["id"], "sem_par_wikidata" if not cands else "wikidata_ambiguo",
                             {"nome": a.get("fullName"), "nascimento": nasc,
                              "candidatos": [c["qid"] for c in cands]})
            if w:  # QID já atribuído (por correção) a outro jogador: não disputa
                dono = self.c.execute("select espn_id from jogadores where wikidata_id = %s",
                                      (w["qid"],)).fetchone()
                if dono and dono[0] != a["id"]:
                    w = None
            self.jogadores[a["id"]] = self.upsert("jogadores", "espn_id", {
                "espn_id": a["id"], "nome": a.get("displayName") or a.get("fullName"),
                "nome_completo": (w or {}).get("nomeCompleto") or a.get("fullName"),
                "nascimento": nasc, "nacionalidade": a.get("citizenship"),
                "posicao": (a.get("position") or {}).get("displayName"),
                "wikidata_id": w["qid"] if w else None})

    # -- partidas -------------------------------------------------------------
    def carregar_partidas(self):
        temporada = {}
        for f in (self.brutos / "espn/calendario").glob("*.json"):
            for ev in json.loads(f.read_text()).get("events", []):
                temporada[ev["id"]] = int(f.stem)
        n = 0
        for eid in sorted(temporada):
            f = self.brutos / "espn/partidas" / f"{eid}.json"
            if f.exists():
                self.partida(json.loads(f.read_text()), temporada[eid])
                n += 1
        return n

    def partida(self, d, temporada):
        h = d["header"]
        comp = h["competitions"][0]
        times = {t["id"]: t for t in comp["competitors"]}
        pal, adv = times[PALMEIRAS], next(t for i, t in times.items() if i != PALMEIRAS)
        slug = h.get("league", {}).get("slug", "?")
        if slug not in COMPETICOES:
            self.c.execute("insert into competicoes (id, nome) values (%s, %s) on conflict do nothing",
                           (slug, h.get("league", {}).get("name", slug)))
        data = dt.datetime.fromisoformat(comp["date"].replace("Z", "+00:00"))
        data_local = (data - dt.timedelta(hours=3)).date()
        encerrada = comp.get("status", {}).get("type", {}).get("completed", False)
        ke = d.get("keyEvents", [])
        prorrog = any(k["type"]["text"] == "Start Extra Time" for k in ke)
        gi = d.get("gameInfo", {})
        fase = (h.get("season", {}).get("name") or "").split(",", 1)
        # A ESPN nem sempre marca campo neutro. Regras: Mundial e Supercopa são
        # sempre em campo neutro; a final da Libertadores é jogo único neutro
        # desde 2019; e o Palmeiras nunca manda jogo fora do Brasil.
        pais = (gi.get("venue") or {}).get("address", {}).get("country")
        fase_txt = fase[1].strip() if len(fase) > 1 else ""
        if (comp.get("neutralSite") or slug in ("fifa.cwc", "bra.supercopa_do_brazil")
                or (slug == "conmebol.libertadores" and fase_txt in ("Final", "Finals") and temporada >= 2019)
                or (pal["homeAway"] == "home" and pais and pais != "Brazil")):
            mando = "neutro"
        else:
            mando = "casa" if pal["homeAway"] == "home" else "fora"
        tid = self.tecnico_em(data_local)
        if tid is None:
            self.revisar("partida", h["id"], "sem_tecnico", {"data": str(data_local)})
        pid = self.upsert("partidas", "espn_id", {
            "espn_id": h["id"], "data": data, "temporada": temporada, "competicao_id": slug,
            "fase": fase[1].strip() if len(fase) > 1 else None,
            "mando": mando,
            "adversario_id": self.clube(adv["team"]),
            "gols_pro": int(pal["score"]) if encerrada else None,
            "gols_contra": int(adv["score"]) if encerrada else None,
            "penaltis_pro": int(pal["shootoutScore"]) if pal.get("shootoutScore") is not None else None,
            "penaltis_contra": int(adv["shootoutScore"]) if adv.get("shootoutScore") is not None else None,
            "prorrogacao": prorrog,
            "estadio_id": self.estadio(gi.get("venue")),
            "publico": gi.get("attendance") or None,
            "arbitro": (gi.get("officials") or [{}])[0].get("displayName"),
            "tecnico_id": tid, "encerrada": encerrada})
        for t in ("participacoes", "eventos", "estatisticas_time"):
            self.c.execute(f"delete from {t} where partida_id = %s", (pid,))
        if not encerrada:
            return
        gols_ev, assist_ev = self.eventos(pid, ke, h["id"])
        self.elenco(pid, d, h["id"], int(pal["score"]), gols_ev, assist_ev, 120 if prorrog else 90)
        self.stats_time(pid, d)

    def eventos(self, pid, ke, eid):
        vistos, gols, assist = set(), {}, {}
        for k in ke:
            txt = k["type"]["text"]
            if txt in IGNORAR:
                continue
            tipo = TIPOS_EVENTO.get(txt, "var" if txt.startswith("VAR") else txt.lower())
            parts = [p["athlete"] for p in k.get("participants", [])]
            minuto, acr = relogio(k.get("clock", {}).get("displayValue"))
            # A ESPN às vezes repete o mesmo evento com IDs diferentes.
            assinatura = (txt, minuto, acr, tuple(p["id"] for p in parts), k.get("shootout"))
            # Gol: o placar parcial no texto ("CSA 0, Palmeiras 1") identifica o gol
            # mesmo quando a ESPN repete o evento com outro minuto.
            parcial = PLACAR_PARCIAL.search(k.get("text") or "") if k.get("scoringPlay") else None
            if parcial and not k.get("shootout"):
                assinatura = ("gol", " ".join(parcial.group(1).split()))
            if assinatura in vistos:
                self.revisar("partida", eid, "evento_duplicado_descartado",
                             {"tipo": txt, "minuto": minuto, "id": k["id"]})
                continue
            vistos.add(assinatura)
            time_id = (k.get("team") or {}).get("id")
            pal = time_id == PALMEIRAS
            j1 = parts[0] if parts else None
            j2 = parts[1] if len(parts) > 1 else None
            shoot = bool(k.get("shootout"))
            if pal and not shoot and k.get("scoringPlay") and tipo in ("gol", "penalti_convertido") and j1:
                gols[j1["id"]] = gols.get(j1["id"], 0) + 1
                if j2 and tipo == "gol":
                    assist[j2["id"]] = assist.get(j2["id"], 0) + 1
            self.c.execute(
                "insert into eventos (partida_id, espn_id, tipo, tipo_fonte, periodo, minuto, acrescimo, "
                "do_palmeiras, jogador_id, jogador_nome, jogador2_id, jogador2_nome, disputa_penaltis, "
                "pos_x, pos_y, descricao) values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                (pid, k["id"], tipo, txt, (k.get("period") or {}).get("number"), minuto, acr, pal,
                 self.jogadores.get(j1["id"]) if j1 else None, j1["displayName"] if j1 else None,
                 self.jogadores.get(j2["id"]) if j2 else None, j2["displayName"] if j2 else None,
                 shoot, num(k.get("fieldPositionX")) if k.get("scoringPlay") else None,
                 num(k.get("fieldPositionY")) if k.get("scoringPlay") else None, k.get("text")))
        return gols, assist

    def elenco(self, pid, d, eid, placar, gols_ev, assist_ev, fim_jogo):
        ros = next((r for r in d.get("rosters", []) if r["team"]["id"] == PALMEIRAS), None)
        if not ros or not ros.get("roster"):
            self.revisar("partida", eid, "sem_escalacao", {})
            return
        # Gols contra do adversário contam no placar mas não para jogador nosso.
        gc_adv = sum(1 for k in d.get("keyEvents", [])
                     if k["type"]["text"] == "Own Goal" and (k.get("team") or {}).get("id") == PALMEIRAS)
        eventos_ok = sum(gols_ev.values()) + gc_adv == placar
        if not eventos_ok:
            self.revisar("partida", eid, "gols_nao_conferem",
                         {"placar": placar, "gols_eventos": sum(gols_ev.values()), "gols_contra_adv": gc_adv})
        vistos = set()
        for p in ros["roster"]:
            aid = p["athlete"]["id"]
            if aid in vistos:  # a ESPN às vezes repete o atleta no elenco
                self.revisar("partida", eid, "atleta_duplicado_descartado", {"atleta": aid})
                continue
            vistos.add(aid)
            if aid not in self.jogadores:  # sem bio baixada: cria mínimo
                self.jogadores[aid] = self.upsert("jogadores", "espn_id",
                                                  {"espn_id": aid, "nome": p["athlete"]["displayName"]})
            st = {s["abbreviation"]: s.get("value") for s in p.get("stats", [])} if "stats" in p else None
            entrada = 0 if p.get("starter") else None
            saida = None
            for pl in p.get("plays") or []:
                m, _ = relogio(pl.get("clock", {}).get("displayValue"))
                if pl.get("substitution"):
                    if not p.get("starter") and entrada is None:
                        entrada = m
                    else:
                        saida = m
                if pl.get("redCard"):
                    saida = m
            if entrada is not None and saida is None:
                saida = fim_jogo
            jogou = (entrada is not None or bool(p.get("subbedIn")) or aid in gols_ev
                     or bool(st and st.get("APP")))
            if jogou and entrada is None:
                self.revisar("partida", eid, "entrada_sem_minuto", {"atleta": aid, "nome": p["athlete"]["displayName"]})
            linha = {"partida_id": pid, "jogador_id": self.jogadores[aid],
                     "titular": bool(p.get("starter")), "jogou": jogou, "camisa": int(p["jersey"]) if p.get("jersey", "").isdigit() else None,
                     "posicao": (p.get("position") or {}).get("displayName"),
                     "minuto_entrada": entrada, "minuto_saida": saida if entrada is not None else None,
                     "minutos": max(0, saida - entrada) if entrada is not None and saida is not None else None}
            for k, col in STATS_JOGADOR.items():
                linha[col] = int(st[k]) if st and st.get(k) is not None else None
            if eventos_ok:  # eventos deduplicados são a fonte de gols/assistências
                linha["gols"] = gols_ev.get(aid, 0) if jogou else 0
                linha["assistencias"] = assist_ev.get(aid, 0) if jogou else 0
            cols = list(linha)
            self.c.execute(f"insert into participacoes ({', '.join(cols)}) values ({', '.join(['%s'] * len(cols))})",
                           [linha[c] for c in cols])

    def stats_time(self, pid, d):
        for t in d.get("boxscore", {}).get("teams", []):
            st = {s["name"]: s.get("displayValue") for s in t.get("statistics", [])}
            if not st.get("totalShots"):
                continue
            linha = {"partida_id": pid, "lado": "pro" if t["team"]["id"] == PALMEIRAS else "contra"}
            for k, col in STATS_TIME.items():
                v = num(st.get(k))
                linha[col] = v if col == "posse" or v is None else int(v)
            cols = list(linha)
            self.c.execute(f"insert into estatisticas_time ({', '.join(cols)}) values ({', '.join(['%s'] * len(cols))})",
                           [linha[c] for c in cols])

    # Registrados para auditoria, mas já tratados pela carga: não exigem ação.
    INFORMATIVOS = {"evento_duplicado_descartado", "atleta_duplicado_descartado", "entrada_sem_minuto"}

    def gravar_revisoes(self):
        for r in self.revisoes:
            self.c.execute("insert into revisao (entidade, chave, motivo, detalhe, resolvido) values (%s,%s,%s,%s,%s) "
                           "on conflict (entidade, chave, motivo) do update set detalhe = excluded.detalhe",
                           (*r, r[2] in self.INFORMATIVOS))


def main():
    if len(sys.argv) != 2 or "DATABASE_URL" not in os.environ:
        sys.exit(__doc__)
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        c = Carga(conn, sys.argv[1])
        c.carregar_competicoes()
        c.carregar_tecnicos()
        c.carregar_jogadores()
        n = c.carregar_partidas()
        c.gravar_revisoes()
        aplicadas, erros = correcoes.aplicar(conn, RAIZ / "dados/manual/correcoes.csv")
        for e in erros:
            print(f"::warning title=Correção inválida::{e}")
        pend = conn.execute("select count(*) from revisao where not resolvido").fetchone()[0]
        print(f"{n} partidas, {len(c.jogadores)} jogadores, {aplicadas} correções aplicadas, "
              f"{len(erros)} inválidas, {pend} itens pendentes na revisão")


if __name__ == "__main__":
    main()
