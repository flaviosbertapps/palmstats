"""Carrega o xG do FotMob (brutos de coleta/fotmob.py) no banco.

Uso:  DATABASE_URL=postgresql://... python coleta/xg.py dados/brutos

Roda depois de normalizar.py. Reescreve xg_partida e xg_participacao inteiras.
Casamento:
  * partida: mesma data (±1 dia, por fuso) entre as partidas do Palmeiras;
    mais de uma candidata ou nenhuma -> revisao;
  * jogador: número da camisa naquela partida; sem camisa, sobrenome em comum
    entre quem jogou; sem par -> revisao.
Também confere o técnico que o FotMob registra contra o técnico da partida no
banco (o CSV manual não foi validado para 2026) e manda divergências à revisão.
"""
import datetime as dt
import json
import os
import pathlib
import re
import sys
import unicodedata

import psycopg
from psycopg.types.json import Jsonb

PALMEIRAS = 10283


def tokens(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return set(re.findall(r"[a-z]{3,}", s))


def num(v):
    try:
        return None if v in (None, "") else float(str(v).split()[0])
    except ValueError:
        return None


def stats_jogador(p):
    v = {}
    for g in p.get("stats", []):
        for k, s in g.get("stats", {}).items():
            v[s.get("key") or k] = s.get("stat", {}).get("value")
    return v


def xg_time(c, casa):
    for grupo in c.get("stats", {}).get("Periods", {}).get("All", {}).get("stats", []):
        for s in grupo.get("stats", []):
            if s.get("key") == "expected_goals":
                h, a = (num(x) for x in s["stats"])
                return (h, a) if casa else (a, h)
    return None, None


def main():
    if len(sys.argv) != 2 or "DATABASE_URL" not in os.environ:
        sys.exit(__doc__)
    raiz = pathlib.Path(sys.argv[1]) / "fotmob"
    if not (raiz / "time.json").exists():
        sys.exit("sem brutos do FotMob; rode coleta/fotmob.py antes")
    time_ = json.loads((raiz / "time.json").read_text())
    jogos = [f for f in time_["fixtures"]["allFixtures"]["fixtures"] if f.get("status", {}).get("finished")]
    revisoes = []
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        c = conn.cursor()
        c.execute("delete from xg_participacao")
        c.execute("delete from xg_partida")
        c.execute("delete from revisao where entidade = 'xg'")
        partidas = c.execute(
            "select p.id, (p.data at time zone 'UTC')::date, t.nome from partidas p "
            "left join tecnicos t on t.id = p.tecnico_id").fetchall()
        n_p = n_j = 0
        for f in jogos:
            arq = raiz / "partidas" / f"{f['id']}.json"
            if not arq.exists():
                continue
            d = json.loads(arq.read_text())["content"]
            dia = dt.date.fromisoformat(f["status"]["utcTime"][:10])
            cand = [p for p in partidas if abs((p[1] - dia).days) <= 1]
            if len(cand) != 1:
                revisoes.append(("xg", str(f["id"]), "partida_sem_par" if not cand else "partida_ambigua",
                                 {"data": str(dia), "jogo": f"{f['home']['name']} x {f['away']['name']}",
                                  "candidatas": [p[0] for p in cand]}))
                continue
            pid, _, tecnico_banco = cand[0]
            casa = f["home"]["id"] == PALMEIRAS
            pro, contra = xg_time(d, casa)
            c.execute("insert into xg_partida values (%s,%s,%s,%s)", (pid, str(f["id"]), pro, contra))
            n_p += 1

            lado = (d.get("lineup") or {}).get("homeTeam" if casa else "awayTeam") or {}
            coach = (lado.get("coach") or {}).get("name")
            if coach and tecnico_banco and not (tokens(coach) & tokens(tecnico_banco)):
                revisoes.append(("xg", f"{f['id']}/tecnico", "tecnico_divergente_fotmob",
                                 {"partida_id": pid, "data": str(dia), "fotmob": coach, "banco": tecnico_banco}))
            camisas = {str(p["id"]): str(p.get("shirtNumber") or "")
                       for p in lado.get("starters", []) + lado.get("subs", [])}

            elenco = c.execute(
                "select x.jogador_id, x.camisa, j.nome, j.nome_completo from participacoes x "
                "join jogadores j on j.id = x.jogador_id where x.partida_id = %s and x.jogou", (pid,)).fetchall()
            usados = set()
            for p in (d.get("playerStats") or {}).values():
                if p.get("teamId") != PALMEIRAS:
                    continue
                v = stats_jogador(p)
                if not v.get("minutes_played"):
                    continue
                fid = str(p["id"])
                cam = camisas.get(fid, "")
                alvo = [e for e in elenco if cam and str(e[1]) == cam]
                if len(alvo) != 1:
                    tk = tokens(p["name"])
                    alvo = [e for e in elenco if tk & (tokens(e[2]) | tokens(e[3]))]
                alvo = [e for e in alvo if e[0] not in usados]
                if len(alvo) != 1:
                    revisoes.append(("xg", f"{f['id']}/{fid}", "jogador_sem_par",
                                     {"partida_id": pid, "nome": p["name"], "camisa": cam}))
                    continue
                usados.add(alvo[0][0])
                c.execute("insert into xg_participacao values (%s,%s,%s,%s,%s,%s,%s,%s)",
                          (pid, alvo[0][0], fid, v.get("minutes_played"), v.get("expected_goals"),
                           v.get("expected_goals_non_penalty"), v.get("expected_goals_on_target_variant"),
                           v.get("expected_assists")))
                n_j += 1
        for r in revisoes:
            # Técnico divergente costuma ser auxiliar em jogo de suspensão (regra 4):
            # fica registrado para conferência, sem contar como pendência.
            c.execute("insert into revisao (entidade, chave, motivo, detalhe, resolvido) values (%s,%s,%s,%s,%s) "
                      "on conflict (entidade, chave, motivo) do update set detalhe = excluded.detalhe",
                      (*r[:3], Jsonb(r[3]), r[2] == "tecnico_divergente_fotmob"))
    print(f"xG: {n_p} partidas, {n_j} participações, {len(revisoes)} itens na revisão")
    for r in revisoes:
        print(f"  {r[2]}: {r[3]}")


if __name__ == "__main__":
    main()
