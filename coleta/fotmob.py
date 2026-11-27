"""Coletor FotMob (API pública não documentada) — xG do Palmeiras.

Baixa a lista de jogos da temporada corrente do time e o detalhe de cada
partida encerrada, salvando o JSON bruto em <saida>/fotmob/. Depois gera
dois CSVs de conferência em <saida>/fotmob/:
  xg_time.csv     partida, data, competição, adversário, mando, placar, xG pró, xG contra
  xg_jogador.csv  partida, jogador, minutos, xG, xGOT, xA (NULL quando a fonte não traz)

Uso:  python coleta/fotmob.py --saida dados/brutos

Limite conhecido: o endpoint de time só expõe a temporada corrente
("allAvailableSeasons" vem vazio), então anos anteriores exigem outro caminho
(ligas/temporadas), ainda não testado.
"""
import argparse
import csv
import json
import pathlib
import time

import requests

BASE = "https://www.fotmob.com/api/data"
PALMEIRAS = 10283
UA = "Mozilla/5.0 (palmstats; projeto de torcedor, sem fins comerciais)"
PAUSA = 1.0


def baixar(sess, url, destino, forcar=False):
    if destino.exists() and not forcar:
        return json.loads(destino.read_text())
    for tentativa in range(4):
        r = sess.get(url, timeout=30)
        if r.status_code == 200 and r.text.strip():
            destino.parent.mkdir(parents=True, exist_ok=True)
            destino.write_text(r.text)
            time.sleep(PAUSA)
            return r.json()
        time.sleep(2 ** (tentativa + 1))
    raise RuntimeError(f"{r.status_code} em {url}")


def num(v):
    if v in (None, ""):
        return None
    try:
        return float(str(v).split()[0])
    except ValueError:
        return None


def xg_time(c, casa):
    """xG pró e contra a partir da aba de estatísticas; None se ausente."""
    for grupo in c.get("stats", {}).get("Periods", {}).get("All", {}).get("stats", []):
        for s in grupo.get("stats", []):
            if s.get("key") == "expected_goals" or s.get("title", "").startswith("Expected goals"):
                h, a = (num(x) for x in s["stats"])
                return (h, a) if casa else (a, h)
    return None, None


def jogadores(c, time_id):
    out = []
    for p in (c.get("playerStats") or {}).values():
        if p.get("teamId") != time_id:
            continue
        v = {}
        for g in p.get("stats", []):
            for k, s in g.get("stats", {}).items():
                v[s.get("key") or k] = s.get("stat", {}).get("value")
        out.append({
            "jogador": p.get("name"),
            "fotmob_jogador_id": p.get("id"),
            "minutos": v.get("minutes_played"),
            # Ausência de xG para quem jogou e não chutou é 0 de fato no FotMob,
            # mas mantemos NULL e deixamos a decisão para a normalização.
            "xg": v.get("expected_goals"),
            "xgot": v.get("expected_goals_on_target_variant"),
            "xg_sem_penalti": v.get("expected_goals_non_penalty"),
            "xa": v.get("expected_assists"),
        })
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--saida", default="dados/brutos")
    a = ap.parse_args()
    raiz = pathlib.Path(a.saida) / "fotmob"
    sess = requests.Session()
    sess.headers["User-Agent"] = UA
    t = baixar(sess, f"{BASE}/teams?id={PALMEIRAS}&ccode3=BRA", raiz / "time.json", forcar=True)
    temporada = t["details"].get("latestSeason")
    # A lista do time inclui o fim da temporada anterior; fica só o ano corrente.
    jogos = [f for f in t["fixtures"]["allFixtures"]["fixtures"]
             if f.get("status", {}).get("finished")
             and f["status"].get("utcTime", "").startswith(str(temporada))]
    linhas_t, linhas_j = [], []
    for f in jogos:
        mid = f["id"]
        d = baixar(sess, f"{BASE}/matchDetails?matchId={mid}", raiz / "partidas" / f"{mid}.json")
        c = d["content"]
        casa = f["home"]["id"] == PALMEIRAS
        pro, contra = xg_time(c, casa)
        adv = f["away"] if casa else f["home"]
        linhas_t.append({
            "fotmob_partida_id": mid, "data": f["status"].get("utcTime", "")[:10],
            "competicao": f["tournament"]["name"], "adversario": adv["name"],
            "mando": "casa" if casa else "fora", "placar": f["status"].get("scoreStr"),
            "xg_pro": pro, "xg_contra": contra,
        })
        for j in jogadores(c, PALMEIRAS):
            linhas_j.append({"fotmob_partida_id": mid, **j})
    for nome, linhas in (("xg_time.csv", linhas_t), ("xg_jogador.csv", linhas_j)):
        with open(raiz / nome, "w", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=list(linhas[0]))
            w.writeheader()
            w.writerows(linhas)
    com = sum(1 for l in linhas_t if l["xg_pro"] is not None)
    print(f"temporada {temporada}: {len(linhas_t)} jogos encerrados, {com} com xG de time, "
          f"{len(linhas_j)} linhas de jogador")


if __name__ == "__main__":
    main()
