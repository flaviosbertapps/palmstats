"""Baixa da Wikidata (CC0) os futebolistas candidatos aos atletas da ESPN.

Muitos jogadores do Palmeiras não têm o clube cadastrado na Wikidata, então a
busca é por data de nascimento (±1 dia) entre todos os futebolistas; o
normalizador casa depois pelo nome.

Uso:  python coleta/wikidata.py --saida dados/brutos   (depois de coleta/espn.py)
Grava <saida>/wikidata/jogadores.json
"""
import argparse
import datetime as dt
import json
import pathlib
import time

import requests

CONSULTA = """
SELECT ?p ?nomePt ?nomeEn ?nomeCompleto ?nasc ?espn ?pal WHERE {
  VALUES ?nasc { %s }
  ?p wdt:P569 ?nasc; wdt:P106 wd:Q937857.
  OPTIONAL { ?p wdt:P1477 ?nomeCompleto }
  OPTIONAL { ?p wdt:P3681 ?espn }
  OPTIONAL { ?p wdt:P54 ?pal FILTER(?pal = wd:Q80964) }
  OPTIONAL { ?p rdfs:label ?nomePt FILTER(LANG(?nomePt) = "pt") }
  OPTIONAL { ?p rdfs:label ?nomeEn FILTER(LANG(?nomeEn) = "en") }
}"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--saida", default="dados/brutos")
    a = ap.parse_args()
    raiz = pathlib.Path(a.saida)
    datas = set()
    for f in (raiz / "espn/atletas").glob("*.json"):
        n = (json.loads(f.read_text()).get("dateOfBirth") or "")[:10]
        if n:
            d = dt.date.fromisoformat(n)
            datas |= {d + dt.timedelta(days=k) for k in (-1, 0, 1)}
    datas = sorted(datas)
    out = {}
    for i in range(0, len(datas), 15):
        lote = " ".join(f'"{d}T00:00:00Z"^^xsd:dateTime' for d in datas[i:i + 15])
        for tentativa in range(5):
            try:
                r = requests.get("https://query.wikidata.org/sparql",
                                 params={"query": CONSULTA % lote, "format": "json"},
                                 headers={"User-Agent": "palmstats/0.1 (projeto de torcedor)"}, timeout=180)
                r.raise_for_status()
                linhas = r.json()["results"]["bindings"]
                break
            except (requests.RequestException, ValueError):
                if tentativa == 4:
                    raise
                time.sleep(5 * (tentativa + 1))
        for b in linhas:
            qid = b["p"]["value"].rsplit("/", 1)[1]
            o = out.setdefault(qid, {"qid": qid, "nascimentos": set(), "palmeiras": False})
            for k in ("nomeCompleto", "espn"):
                if k in b:
                    o[k] = b[k]["value"]
            nome = b.get("nomePt") or b.get("nomeEn")
            if nome and ("nome" not in o or "nomePt" in b):
                o["nome"] = nome["value"]
            o["nascimentos"].add(b["nasc"]["value"][:10])
            o["palmeiras"] |= "pal" in b
        time.sleep(1)
    for o in out.values():
        o["nascimentos"] = sorted(o["nascimentos"])
    dest = raiz / "wikidata" / "jogadores.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(list(out.values()), ensure_ascii=False, indent=1))
    print(len(out), "futebolistas candidatos na Wikidata")


if __name__ == "__main__":
    main()
