"""Coletor ESPN (API pública não documentada) — partidas do Palmeiras.

Baixa o calendário de cada temporada e o resumo completo de cada partida,
salvando o JSON bruto em <saida>/espn/. Nada é normalizado aqui: o bruto é
guardado primeiro para poder ser reprocessado sem voltar à fonte.

Uso:  python coleta/espn.py --de 2015 --ate 2025 --saida dados/brutos
"""
import argparse
import json
import pathlib
import time

import requests

BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer/all"
PALMEIRAS = "2029"
UA = "palmstats/0.1 (projeto de torcedor, sem fins comerciais)"
PAUSA = 0.5  # segundos entre requisições


def baixar(sess, url, destino, forcar=False):
    if destino.exists() and not forcar:
        return json.loads(destino.read_text())
    for tentativa in range(4):
        r = sess.get(url, timeout=30)
        if r.status_code == 200:
            destino.parent.mkdir(parents=True, exist_ok=True)
            destino.write_text(r.text)
            time.sleep(PAUSA)
            return r.json()
        time.sleep(2 ** (tentativa + 1))
    raise RuntimeError(f"{r.status_code} em {url}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--de", type=int, default=2015)
    ap.add_argument("--ate", type=int, default=2025)
    ap.add_argument("--saida", default="dados/brutos")
    a = ap.parse_args()
    raiz = pathlib.Path(a.saida) / "espn"
    sess = requests.Session()
    sess.headers["User-Agent"] = UA
    for ano in range(a.de, a.ate + 1):
        cal = baixar(sess, f"{BASE}/teams/{PALMEIRAS}/schedule?season={ano}",
                     raiz / "calendario" / f"{ano}.json", forcar=True)
        eventos = cal.get("events", [])
        for ev in eventos:
            baixar(sess, f"{BASE}/summary?event={ev['id']}",
                   raiz / "partidas" / f"{ev['id']}.json")
        print(ano, len(eventos), "partidas")


if __name__ == "__main__":
    main()
