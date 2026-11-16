"""Aplica dados/manual/correcoes.csv sobre o que a carga gravou.

As correções ficam no repositório (versionadas, revisáveis em PR) e são
reaplicadas no fim de toda carga; por isso sobrevivem à recarga diária.

Formato (CSV): entidade,chave,campo,valor,justificativa

  entidade      chave                        campos permitidos
  ------------  ---------------------------  ------------------------------------------
  jogador       espn_id do atleta            wikidata_id, nome, nome_completo, nascimento,
                                             nacionalidade, posicao,
                                             mesclar_em (espn_id do registro que fica — para
                                             quando a ESPN tem dois IDs para a mesma pessoa)
  partida       espn_id da partida           arbitro, publico, mando, fase, gols_pro,
                                             gols_contra, penaltis_pro, penaltis_contra,
                                             tecnico (nome, como em tecnicos.csv)
  participacao  espn_partida/espn_jogador    jogou, titular, minuto_entrada, minuto_saida, minutos,
                                             gols, assistencias, amarelos, vermelhos
  revisao       entidade/chave/motivo        resolvido (true) — "conferido, está certo"

Valor vazio grava NULL (ex.: desfazer um vínculo errado com a Wikidata).
Toda correção marca como resolvidos os itens da fila de revisão do mesmo alvo.
"""
import csv
import pathlib

CAMPOS = {
    "jogador": {"wikidata_id", "nome", "nome_completo", "nascimento", "nacionalidade", "posicao",
                "mesclar_em"},
    "partida": {"arbitro", "publico", "mando", "fase", "gols_pro", "gols_contra",
                "penaltis_pro", "penaltis_contra", "tecnico"},
    "participacao": {"jogou", "titular", "minuto_entrada", "minuto_saida", "minutos", "gols",
                     "assistencias", "amarelos", "vermelhos"},
    "revisao": {"resolvido"},
}


def aplicar(conn, caminho):
    """Retorna (aplicadas, erros)."""
    caminho = pathlib.Path(caminho)
    if not caminho.exists():
        return 0, []
    aplicadas, erros = 0, []
    for n, r in enumerate(csv.DictReader(open(caminho, encoding="utf8")), start=2):
        ent, chave, campo = (r.get(k, "").strip() for k in ("entidade", "chave", "campo"))
        valor = (r.get("valor") or "").strip() or None
        try:
            if campo not in CAMPOS.get(ent, ()):
                raise ValueError(f"campo '{campo}' não permitido para '{ent}'")
            with conn.transaction():  # savepoint: uma correção ruim não estraga as outras
                alvo = _aplicar(conn, ent, chave, campo, valor)
                if alvo:
                    conn.execute("update revisao set resolvido = true where entidade = %s and chave = %s", alvo)
            aplicadas += 1
        except Exception as e:  # noqa: BLE001 — qualquer falha vira item de revisão
            erros.append(f"linha {n} ({ent},{chave},{campo}): {e}")
    for e in erros:
        conn.execute("insert into revisao (entidade, chave, motivo, detalhe) values ('correcao', %s, 'correcao_invalida', "
                     "jsonb_build_object('erro', %s)) on conflict (entidade, chave, motivo) do update set "
                     "detalhe = excluded.detalhe, resolvido = false", (e.split(" ")[1], e))
    return aplicadas, erros


def _um(conn, sql, args, oque):
    linha = conn.execute(sql, args).fetchone()
    if not linha:
        raise ValueError(f"{oque} não encontrado")
    return linha[0]


def _aplicar(conn, ent, chave, campo, valor):
    if ent == "jogador" and campo == "mesclar_em":
        origem = _um(conn, "select id from jogadores where espn_id = %s", (chave,), f"jogador {chave}")
        destino = _um(conn, "select id from jogadores where espn_id = %s", (valor,), f"jogador {valor}")
        if origem == destino:
            raise ValueError("origem e destino são o mesmo jogador")
        conn.execute("delete from participacoes x where jogador_id = %s and exists (select 1 from participacoes y "
                     "where y.partida_id = x.partida_id and y.jogador_id = %s)", (origem, destino))
        conn.execute("update participacoes set jogador_id = %s where jogador_id = %s", (destino, origem))
        conn.execute("update eventos set jogador_id = %s where jogador_id = %s", (destino, origem))
        conn.execute("update eventos set jogador2_id = %s where jogador2_id = %s", (destino, origem))
        conn.execute("delete from jogadores where id = %s", (origem,))
        conn.execute("update revisao set resolvido = true where entidade = 'jogador' and chave = %s", (valor,))
        return ("jogador", chave)
    if ent == "jogador":
        _um(conn, f"update jogadores set {campo} = %s where espn_id = %s returning id",
            (valor, chave), f"jogador {chave}")
        return ("jogador", chave)
    if ent == "partida":
        if campo == "tecnico":
            tid = _um(conn, "select id from tecnicos where nome = %s", (valor,), f"técnico '{valor}'") if valor else None
            campo, valor = "tecnico_id", tid
        _um(conn, f"update partidas set {campo} = %s where espn_id = %s returning id",
            (valor, chave), f"partida {chave}")
        return ("partida", chave)
    if ent == "participacao":
        partida, _, jogador = chave.partition("/")
        _um(conn, f"update participacoes x set {campo} = %s from partidas p, jogadores j "
                  "where x.partida_id = p.id and x.jogador_id = j.id and p.espn_id = %s and j.espn_id = %s "
                  "returning x.partida_id", (valor, partida, jogador), f"participação {chave}")
        return ("partida", partida)
    if ent == "revisao":
        e, c, motivo = (chave.split("/", 2) + ["", ""])[:3]
        if valor not in ("true", "false"):
            raise ValueError("valor deve ser true ou false")
        _um(conn, "update revisao set resolvido = %s where entidade = %s and chave = %s and motivo = %s returning id",
            (valor == "true", e, c, motivo), f"item de revisão {chave}")
        return None
    raise ValueError(f"entidade '{ent}' desconhecida")
