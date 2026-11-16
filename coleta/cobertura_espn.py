"""Mede a cobertura e a consistência dos dados ESPN já baixados.

Uso:  python coleta/cobertura_espn.py dados/brutos [--csv-brasileirao CAMINHO]

Para cada temporada × competição conta quantas partidas têm: placar,
escalação do Palmeiras, minuto das substituições, gols conferindo com o
placar, estatísticas de time, árbitro e público. Também deriva minutos
jogados por atleta (titular = 0', entrou = minuto da substituição,
fim = 90') e, se recebido o CSV do Brasileirão (adaoduque), confere placares.
"""
import argparse
import collections
import csv
import json
import pathlib
import re
import unicodedata

PALMEIRAS = "2029"


def minuto(txt):
    m = re.match(r"(\d+)'", txt or "")
    return int(m.group(1)) if m else None


def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z]", "", s)


def analisar(d):
    comp = d["header"]["league"]["slug"] if "league" in d["header"] else "?"
    c = d["header"]["competitions"][0]
    concluida = c.get("status", {}).get("type", {}).get("completed", False)
    times = {t["id"]: t for t in c["competitors"]}
    pal = times.get(PALMEIRAS)
    adv = next(t for i, t in times.items() if i != PALMEIRAS)
    r = {
        "id": d["header"]["id"], "data": c["date"][:10], "comp": comp,
        "concluida": concluida, "mando": pal.get("homeAway"),
        "adversario": adv["team"]["displayName"],
        "gp": int(pal.get("score") or 0), "gc": int(adv.get("score") or 0),
    }
    ros = next((x for x in d.get("rosters", []) if x["team"]["id"] == PALMEIRAS), None)
    jog = (ros or {}).get("roster", [])
    titulares = [p for p in jog if p.get("starter")]
    r["escalacao"] = len(titulares) >= 11
    subs_min, gols_jog, mins = [], 0, {}
    for p in jog:
        stats = {s["abbreviation"]: s.get("value") for s in p.get("stats", [])}
        gols_jog += int(stats.get("G") or 0)
        entrou = 0 if p.get("starter") else None
        saiu = 90
        for pl in p.get("plays") or []:
            if pl.get("substitution"):
                mm = minuto(pl["clock"]["displayValue"])
                subs_min.append(mm)
                if p.get("subbedIn") or not p.get("starter"):
                    entrou = mm
                else:
                    saiu = mm
        if p.get("subbedOut") and saiu == 90:
            saiu = None  # saiu, mas sem minuto
        if entrou is not None and saiu is not None:
            mins[p["athlete"]["displayName"]] = max(0, saiu - entrou)
    r["subs_com_minuto"] = bool(subs_min) and all(m is not None for m in subs_min)
    gols_contra_adv = 0
    for k in d.get("keyEvents", []):
        if k.get("type", {}).get("text", "").startswith("Own Goal"):
            gols_contra_adv += 1
    r["gols_conferem"] = gols_jog == r["gp"] or gols_jog + gols_contra_adv >= r["gp"] >= gols_jog
    bs = next((t for t in d.get("boxscore", {}).get("teams", []) if t["team"]["id"] == PALMEIRAS), {})
    st = {s["name"]: s.get("displayValue") for s in bs.get("statistics", [])}
    r["stats_time"] = bool(st.get("totalShots"))
    r["stats_passes"] = st.get("totalPasses") not in (None, "", "0")
    gi = d.get("gameInfo", {})
    r["arbitro"] = bool(gi.get("officials"))
    r["publico"] = bool(gi.get("attendance"))
    r["estadio"] = bool(gi.get("venue", {}).get("fullName"))
    r["minutos"] = mins
    return r


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("brutos")
    ap.add_argument("--csv-brasileirao")
    a = ap.parse_args()
    pasta = pathlib.Path(a.brutos) / "espn"
    ids_temporada = {}
    for f in sorted((pasta / "calendario").glob("*.json")):
        for ev in json.loads(f.read_text()).get("events", []):
            ids_temporada[ev["id"]] = int(f.stem)
    linhas = []
    for eid, ano in ids_temporada.items():
        f = pasta / "partidas" / f"{eid}.json"
        if f.exists():
            r = analisar(json.loads(f.read_text()))
            r["temporada"] = ano
            linhas.append(r)
    feitas = [r for r in linhas if r["concluida"]]

    campos = ["escalacao", "subs_com_minuto", "gols_conferem", "stats_time",
              "stats_passes", "arbitro", "publico", "estadio"]
    print("## Cobertura por temporada (partidas concluídas)\n")
    print("| Temporada | Partidas | " + " | ".join(campos) + " |")
    print("|---" * (len(campos) + 2) + "|")
    por_ano = collections.defaultdict(list)
    for r in feitas:
        por_ano[r["temporada"]].append(r)
    for ano in sorted(por_ano):
        rs = por_ano[ano]
        pct = [f"{100 * sum(x[c] for x in rs) / len(rs):.0f}%" for c in campos]
        print(f"| {ano} | {len(rs)} | " + " | ".join(pct) + " |")

    print("\n## Partidas por competição e temporada\n")
    comps = sorted({r["comp"] for r in feitas})
    print("| Temporada | " + " | ".join(comps) + " |")
    print("|---" * (len(comps) + 1) + "|")
    for ano in sorted(por_ano):
        cnt = collections.Counter(r["comp"] for r in por_ano[ano])
        print(f"| {ano} | " + " | ".join(str(cnt.get(c, 0)) for c in comps) + " |")

    falhas = [r for r in feitas if not r["gols_conferem"]]
    print(f"\n## Gols por jogador que não somam o placar: {len(falhas)}\n")
    for r in falhas[:15]:
        print(f"- {r['data']} {r['comp']} vs {r['adversario']} ({r['gp']}x{r['gc']}) id={r['id']}")

    # minutos 2015 por competição (para conferir com a Wikipedia)
    tot = collections.defaultdict(lambda: collections.Counter())
    for r in por_ano.get(2015, []):
        for nome, m in r["minutos"].items():
            tot[nome][r["comp"]] += m
    print("\n## Minutos derivados, 2015 (top 8)\n")
    print("| Jogador | Paulista | Brasileiro | Copa do Brasil | Total |")
    print("|---|---|---|---|---|")
    for nome, c in sorted(tot.items(), key=lambda x: -sum(x[1].values()))[:8]:
        print(f"| {nome} | {c['bra.camp.paulista']} | {c['bra.1']} | "
              f"{c['bra.copa_do_brazil']} | {sum(c.values())} |")

    if a.csv_brasileirao:
        alias = {"atleticomineiro": "atleticomg", "atleticoparanaense": "athleticopr",
                 "athleticoparanaense": "athleticopr", "americamineiro": "americamg",
                 "vascodagama": "vasco", "redbullbragantino": "bragantino",
                 "atleticogoianiense": "atleticogo", "cuiaba": "cuiaba"}
        base = {}
        for x in csv.DictReader(open(a.csv_brasileirao, encoding="utf8")):
            if "Palmeiras" not in (x["mandante"], x["visitante"]):
                continue
            d, m, y = x["data"].split("/")
            casa = x["mandante"] == "Palmeiras"
            adv = norm(x["visitante"] if casa else x["mandante"])
            gp = int(x["mandante_Placar"] if casa else x["visitante_Placar"])
            gc = int(x["visitante_Placar"] if casa else x["mandante_Placar"])
            base[(f"{y}-{m}-{d}", alias.get(adv, adv))] = (gp, gc)
        espn = [r for r in feitas if r["comp"] == "bra.1"]
        achou = div = 0
        exemplos = []
        for r in espn:
            adv = norm(r["adversario"])
            adv = alias.get(adv, adv)
            hit = None
            for k, v in base.items():  # tolera ±1 dia (fuso UTC da ESPN)
                if k[1][:5] == adv[:5] and abs(int(k[0].replace("-", "")) - int(r["data"].replace("-", ""))) <= 1:
                    hit = v
            if hit is None:
                continue
            achou += 1
            if hit != (r["gp"], r["gc"]):
                div += 1
                exemplos.append(f"{r['data']} vs {r['adversario']}: ESPN {r['gp']}x{r['gc']} / CSV {hit[0]}x{hit[1]}")
        print(f"\n## ESPN × dataset Brasileirão (adaoduque)\n\nPartidas do Brasileirão na ESPN: {len(espn)}; "
              f"casadas com o CSV: {achou}; placares divergentes: {div}\n")
        for e in exemplos[:10]:
            print("-", e)


if __name__ == "__main__":
    main()
