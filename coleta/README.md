# Coleta

Scripts da prova de dados (ver `docs/prova-de-dados.md`).

```bash
pip install -r coleta/requirements.txt
python coleta/espn.py --de 2015 --ate 2025 --saida dados/brutos
python coleta/cobertura_espn.py dados/brutos --csv-brasileirao CAMINHO/campeonato-brasileiro-full.csv
```

O CSV de conferência vem de https://github.com/adaoduque/Brasileirao_Dataset (opcional).
Os brutos (~276 MB) ficam em `dados/`, fora do git.
