import json, sys, threading, unittest, urllib.request
from pathlib import Path
from http.server import ThreadingHTTPServer
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "servidor"))
import fio_server as s

TEXTO = ("O contrato dura 30 meses a partir da entrega das chaves.\n\n"
         "O locatário paga o IPTU e o condomínio.\n\n"
         "A saída antecipada exige aviso de 30 dias e multa proporcional.")

class Logica(unittest.TestCase):
    def test_dividir_respeita_limite(self):
        for t in s.dividir("palavra. " * 500):
            self.assertLessEqual(len(t), s.TAM_TRECHO)
    def test_escolhe_trecho_certo(self):
        ts = s.dividir(TEXTO, 60)
        i, t = s.escolher(ts, "Quem paga o IPTU?", 1)[0]
        self.assertIn("IPTU", t)
    def test_valida_entrada(self):
        with self.assertRaises(ValueError): s.responder("", "oi?", "simulado")
        with self.assertRaises(ValueError): s.responder("x", " ", "simulado")
        with self.assertRaises(ValueError): s.responder("x" * (s.LIMITE_TEXTO + 1), "oi?", "simulado")

class Http(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        s.Handler.provedor = "simulado"
        cls.srv = ThreadingHTTPServer(("127.0.0.1", 0), s.Handler)
        cls.porta = cls.srv.server_address[1]
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
    @classmethod
    def tearDownClass(cls): cls.srv.shutdown()
    def url(self, p): return "http://127.0.0.1:%d%s" % (self.porta, p)
    def test_health_e_pagina(self):
        self.assertTrue(json.load(urllib.request.urlopen(self.url("/api/health")))["ok"])
        self.assertIn(b"<html", urllib.request.urlopen(self.url("/")).read().lower())
    def test_perguntar(self):
        req = urllib.request.Request(self.url("/api/perguntar"),
            json.dumps({"texto": TEXTO, "pergunta": "Quem paga o IPTU?"}).encode(),
            {"Content-Type": "application/json"})
        r = json.load(urllib.request.urlopen(req))
        self.assertTrue(r["fontes"])
    def test_nao_serve_codigo_do_servidor(self):
        with self.assertRaises(urllib.error.HTTPError) as c:
            urllib.request.urlopen(self.url("/servidor/fio_server.py"))
        self.assertEqual(c.exception.code, 404)
    def test_nao_sai_da_pasta(self):
        with self.assertRaises(urllib.error.HTTPError):
            urllib.request.urlopen(self.url("/../README.md"))

if __name__ == "__main__":
    unittest.main()
