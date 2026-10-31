#!/usr/bin/env python3
"""Servidor local do Fio (somente biblioteca padrão do Python).

Serve o site e responde perguntas sobre um texto colado pelo usuário.
Fluxo: divide o texto em trechos, escolhe os mais parecidos com a pergunta
e pede ao modelo que responda usando só esses trechos, citando o número.

Provedores (variável FIO_PROVEDOR):
  ollama     modelo local, sem custo e sem chave (padrão)
  anthropic  usa ANTHROPIC_API_KEY, que fica só no seu computador
  simulado   não chama modelo nenhum; devolve os trechos (testes e demonstração)
"""
import argparse
import json
import math
import os
import re
import sys
import urllib.error
import urllib.request
from collections import Counter
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
LIMITE_TEXTO = 200_000      # caracteres
LIMITE_PERGUNTA = 500
TAM_TRECHO = 600
TRECHOS_USADOS = 4
STOP = set("a o as os um uma de da do das dos em no na nos nas por para com que e é ou se ao à the of and to in is are".split())


def dividir(texto, tamanho=TAM_TRECHO):
    """Quebra o texto em trechos por parágrafo, agrupando até `tamanho` caracteres."""
    trechos, atual = [], ""
    for par in re.split(r"\n\s*\n", texto.strip()):
        par = " ".join(par.split())
        if not par:
            continue
        while len(par) > tamanho:  # parágrafo gigante: corta em frases/limite
            corte = par.rfind(". ", 0, tamanho)
            corte = corte + 1 if corte > tamanho // 2 else tamanho
            if atual:
                trechos.append(atual)
                atual = ""
            trechos.append(par[:corte].strip())
            par = par[corte:].strip()
        if len(atual) + len(par) + 1 > tamanho and atual:
            trechos.append(atual)
            atual = par
        else:
            atual = (atual + " " + par).strip()
    if atual:
        trechos.append(atual)
    return trechos


def palavras(texto):
    return [p for p in re.findall(r"\w+", texto.lower()) if p not in STOP and len(p) > 1]


def escolher(trechos, pergunta, n=TRECHOS_USADOS):
    """Ranking simples por TF-IDF; devolve [(indice, trecho)] em ordem do documento."""
    docs = [Counter(palavras(t)) for t in trechos]
    df = Counter(p for d in docs for p in d)
    total = max(len(docs), 1)
    consulta = set(palavras(pergunta))
    pontos = []
    for i, d in enumerate(docs):
        s = sum((1 + math.log(d[p])) * math.log(1 + total / df[p]) for p in consulta if p in d)
        pontos.append((s, i))
    pontos.sort(reverse=True)
    melhores = sorted(i for s, i in pontos[:n] if s > 0) or [0]
    return [(i, trechos[i]) for i in melhores]


def montar_prompt(trechos_escolhidos, pergunta):
    corpo = "\n\n".join("[%d] %s" % (i + 1, t) for i, t in trechos_escolhidos)
    sistema = ("Você responde perguntas sobre um documento. Use apenas os trechos fornecidos. "
               "Cite o número do trecho entre colchetes, como [2]. Se a resposta não estiver "
               "nos trechos, diga que o documento não informa. Responda em português, em poucas frases.")
    return sistema, "Trechos:\n\n%s\n\nPergunta: %s" % (corpo, pergunta)


def _post(url, corpo, cabecalhos, timeout=120):
    req = urllib.request.Request(url, json.dumps(corpo).encode(), cabecalhos, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def chamar_ollama(sistema, usuario):
    base = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")
    modelo = os.environ.get("FIO_MODELO", "llama3.2:3b")
    r = _post(base + "/api/chat", {"model": modelo, "stream": False, "messages": [
        {"role": "system", "content": sistema}, {"role": "user", "content": usuario}]},
        {"Content-Type": "application/json"})
    return r["message"]["content"].strip()


def chamar_anthropic(sistema, usuario):
    chave = os.environ.get("ANTHROPIC_API_KEY")
    if not chave:
        raise RuntimeError("Defina ANTHROPIC_API_KEY para usar este provedor.")
    modelo = os.environ.get("FIO_MODELO", "claude-haiku-5-5")
    r = _post("https://api.anthropic.com/v1/messages",
              {"model": modelo, "max_tokens": 600, "system": sistema,
               "messages": [{"role": "user", "content": usuario}]},
              {"Content-Type": "application/json", "x-api-key": chave, "anthropic-version": "2023-06-01"})
    return "".join(b.get("text", "") for b in r["content"]).strip()


def chamar_simulado(sistema, usuario):
    return "(modo simulado, sem modelo) Os trechos mais relevantes estão abaixo."


PROVEDORES = {"ollama": chamar_ollama, "anthropic": chamar_anthropic, "simulado": chamar_simulado}


def responder(texto, pergunta, provedor):
    if not texto.strip():
        raise ValueError("Cole ou envie um texto primeiro.")
    if len(texto) > LIMITE_TEXTO:
        raise ValueError("O texto passa de %d caracteres." % LIMITE_TEXTO)
    if not pergunta.strip() or len(pergunta) > LIMITE_PERGUNTA:
        raise ValueError("Escreva uma pergunta de até %d caracteres." % LIMITE_PERGUNTA)
    escolhidos = escolher(dividir(texto), pergunta)
    sistema, usuario = montar_prompt(escolhidos, pergunta)
    resposta = PROVEDORES[provedor](sistema, usuario)
    return {"resposta": resposta,
            "fontes": [{"n": i + 1, "trecho": t} for i, t in escolhidos]}


class Handler(BaseHTTPRequestHandler):
    provedor = "ollama"
    server_version = "FioLocal/1.0"

    def _json(self, codigo, dados):
        corpo = json.dumps(dados, ensure_ascii=False).encode()
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(corpo)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(corpo)

    def do_GET(self):
        if self.path == "/api/health":
            return self._json(200, {"ok": True, "provedor": self.provedor})
        caminho = self.path.split("?", 1)[0]
        alvo = (RAIZ / ("index.html" if caminho == "/" else caminho.lstrip("/"))).resolve()
        if RAIZ not in alvo.parents and alvo != RAIZ or not alvo.is_file() or alvo.parent.name == "servidor":
            return self._json(404, {"erro": "não encontrado"})
        tipos = {".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
                 ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml"}
        dados = alvo.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", tipos.get(alvo.suffix, "application/octet-stream"))
        self.send_header("Content-Length", str(len(dados)))
        self.end_headers()
        self.wfile.write(dados)

    def do_POST(self):
        if self.path != "/api/perguntar":
            return self._json(404, {"erro": "não encontrado"})
        try:
            tam = int(self.headers.get("Content-Length", 0))
            if tam > LIMITE_TEXTO * 4:
                return self._json(413, {"erro": "Requisição grande demais."})
            dados = json.loads(self.rfile.read(tam) or b"{}")
            saida = responder(str(dados.get("texto", "")), str(dados.get("pergunta", "")), self.provedor)
            self._json(200, saida)
        except ValueError as e:
            self._json(400, {"erro": str(e)})
        except (urllib.error.URLError, RuntimeError, KeyError, TimeoutError) as e:
            self._json(502, {"erro": "Não consegui falar com o modelo (%s). Veja o README." % e})

    def log_message(self, fmt, *args):  # sem registrar o texto do usuário
        sys.stderr.write("%s %s\n" % (self.command, self.path))


def main():
    ap = argparse.ArgumentParser(description="Servidor local do Fio")
    ap.add_argument("--porta", type=int, default=8000)
    ap.add_argument("--provedor", choices=PROVEDORES, default=os.environ.get("FIO_PROVEDOR", "ollama"))
    a = ap.parse_args()
    Handler.provedor = a.provedor
    srv = ThreadingHTTPServer(("127.0.0.1", a.porta), Handler)  # só aceita conexões deste computador
    print("Fio em http://127.0.0.1:%d  (provedor: %s)" % (a.porta, a.provedor))
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nEncerrado.")


if __name__ == "__main__":
    main()
