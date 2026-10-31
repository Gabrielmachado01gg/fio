/* Fio: comportamento da página (JavaScript sem build). */
(function () {
  "use strict";

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.documentElement.classList.add("js");

  var qs = function (s, r) { return (r || document).querySelector(s); };
  var qsa = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var token = function (n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); };

  function mulberry(seed) {
    return function () {
      seed = (seed + 0x6d2b79f5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- Página de pixels no hero ----------
     Cada linha é uma sequência de "palavras". A linha perto do mouse e a
     linha tocada pela varredura ficam azuis e ganham um marcador de fonte. */
  function heroPage(canvas) {
    var ctx = canvas.getContext("2d");
    var cell = 8, padX = 28, padY = 36, gap = cell * 2;
    var w = 0, h = 0, rows = [], mouseY = -1e4, running = true, raf = 0;
    var ink = token("--ink"), accent = token("--accent"), paper = token("--paper");

    function layout() {
      var r = canvas.getBoundingClientRect();
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width; h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var rand = mulberry(11);
      var cols = Math.floor((w - padX * 2) / cell);
      var count = Math.floor((h - padY * 2) / gap);
      rows = [];
      for (var i = 0; i < count; i++) {
        var segs = [], x = i % 7 === 0 ? 2 : 0;
        var short = i % 7 === 6;
        var limit = short ? Math.floor(cols * (0.25 + rand() * 0.3)) : cols - Math.floor(rand() * 3);
        while (x < limit) {
          var len = Math.min(2 + Math.floor(rand() * 7), limit - x);
          segs.push([x, len]);
          x += len + 1;
        }
        rows.push({ y: padY + i * gap, segs: segs, hit: rand() > 0.86 });
      }
    }

    function draw(time) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = paper;
      ctx.fillRect(0, 0, w, h);
      var span = h - padY * 2;
      var scanY = padY + ((time * 0.045) % span);
      rows.forEach(function (row) {
        var near = Math.abs(row.y - mouseY) < gap * 1.2;
        var scanned = !reduce && Math.abs(row.y - scanY) < gap * 0.9;
        var on = near || scanned || (reduce && row.hit);
        ctx.fillStyle = on ? accent : ink;
        ctx.globalAlpha = on ? 1 : 0.2;
        row.segs.forEach(function (s) {
          ctx.fillRect(padX + s[0] * cell, row.y, s[1] * cell, cell - 2);
        });
        if (on) ctx.fillRect(w - padX + 8, row.y, cell, cell - 2);
      });
      ctx.globalAlpha = 1;
    }

    function loop(t) {
      if (running) draw(t);
      raf = requestAnimationFrame(loop);
    }

    canvas.addEventListener("pointermove", function (e) {
      mouseY = e.clientY - canvas.getBoundingClientRect().top;
      if (reduce) draw(0);
    });
    canvas.addEventListener("pointerleave", function () { mouseY = -1e4; if (reduce) draw(0); });
    window.addEventListener("resize", function () { layout(); draw(0); });

    layout();
    draw(0);
    if (!reduce) {
      raf = requestAnimationFrame(loop);
      if ("IntersectionObserver" in window) {
        new IntersectionObserver(function (en) { running = en[0].isIntersecting; }).observe(canvas);
      }
    }
  }

  /* ---------- Ícones em bitmap ----------
     1 = tinta, 2 = tom suave, 3 = destaque. As cores vêm do contexto do cartão. */
  var BITMAPS = {
    doc: [
      "..11111111....",
      "..1......11...",
      "..1.2222...11.",
      "..1........1..",
      "..1.222222.1..",
      "..1........1..",
      "..1.222222.1..",
      "..1........1..",
      "..1.22222..1..",
      "..1........1..",
      "..1.2222...1..",
      "..1........1..",
      "..111111111.."
    ],
    chat: [
      "1111111111111.",
      "1...........1.",
      "1.22222222..1.",
      "1...........1.",
      "1.2222222...1.",
      "1...........1.",
      "1111111.11111.",
      "......1.1.....",
      "......11......"
    ],
    cite: [
      "..11111111....",
      "..1......11...",
      "..1.2222...11.",
      "..1........1..",
      "..13333333.1..",
      "..13333333.1..",
      "..1........1..",
      "..1.222222.1..",
      "..1........1..",
      "..1.22222..1..",
      "..1........1..",
      "..1.2222...1..",
      "..111111111.."
    ]
  };

  function drawBitmap(canvas) {
    var map = BITMAPS[canvas.dataset.bitmap];
    if (!map) return;
    var host = canvas.closest(".stack__card, .tile");
    var color = host ? getComputedStyle(host).color : token("--ink");
    var accent = host && host.classList.contains("stack__card--accent") ? "#ffffff" : token("--accent");
    var cols = map[0].length, rowsN = map.length, px = 16;
    canvas.width = cols * px;
    canvas.height = cols * px;
    var ctx = canvas.getContext("2d");
    var offY = Math.floor((cols - rowsN) / 2);
    map.forEach(function (line, y) {
      line.split("").forEach(function (ch, x) {
        if (ch === ".") return;
        ctx.globalAlpha = ch === "2" ? 0.45 : 1;
        ctx.fillStyle = ch === "3" ? accent : color;
        ctx.fillRect(x * px, (y + offY) * px, px - 2, px - 2);
      });
    });
  }

  /* ---------- Cartões empilhados ----------
     O empilhamento é CSS (position: sticky). O GSAP só encolhe o cartão que
     fica para trás, para mostrar que o próximo está chegando por cima. */
  function stack() {
    if (reduce || !window.gsap || !window.ScrollTrigger) return;
    gsap.registerPlugin(ScrollTrigger);
    var cards = qsa(".stack__card");
    cards.forEach(function (card, i) {
      var next = cards[i + 1];
      if (!next) return;
      gsap.to(qs(".stack__in", card), {
        scale: 0.92, opacity: 0.45, ease: "none", transformOrigin: "50% 100%",
        scrollTrigger: { trigger: next, start: "top bottom", end: "top top+=64", scrub: true }
      });
    });
  }

  /* ---------- Demonstração ---------- */
  var DOCS = {
    aluguel: {
      nome: "Contrato de aluguel residencial",
      perguntas: [
        { q: "Qual é o prazo do contrato?", a: "O contrato dura 30 meses, contados a partir da entrega das chaves. A renovação só vale se as duas partes assinarem um aditivo.", fonte: "Cláusula 3, página 2" },
        { q: "Quem paga o IPTU?", a: "O locatário paga o IPTU e a taxa ordinária de condomínio. Obras estruturais ficam por conta do proprietário.", fonte: "Cláusula 7, página 5" },
        { q: "Como encerrar antes do fim?", a: "A saída antecipada exige aviso por escrito com 30 dias de antecedência e multa proporcional ao tempo que falta.", fonte: "Cláusula 11, página 9" }
      ]
    },
    relatorio: {
      nome: "Relatório trimestral de operações",
      perguntas: [
        { q: "Qual foi o principal risco citado?", a: "O relatório aponta a dependência de um único fornecedor de embalagens como o maior risco do trimestre.", fonte: "Seção 4, página 14" },
        { q: "O que mudou no atendimento?", a: "O tempo de primeira resposta caiu depois da troca do sistema de chamados, e a equipe passou a registrar motivos de contato.", fonte: "Seção 2, página 6" },
        { q: "Quais são os próximos passos?", a: "Três frentes: contratar um segundo fornecedor, revisar metas do suporte e automatizar o fechamento mensal.", fonte: "Conclusão, página 21" }
      ]
    },
    artigo: {
      nome: "Artigo sobre sono e aprendizagem",
      perguntas: [
        { q: "Qual é a pergunta da pesquisa?", a: "Os autores investigam se dormir após o estudo melhora a retenção de vocabulário em comparação a ficar acordado pelo mesmo período.", fonte: "Introdução, página 1" },
        { q: "Como o estudo foi feito?", a: "Dois grupos estudaram a mesma lista de palavras. Um dormiu em seguida e o outro permaneceu acordado. Ambos fizeram o teste no dia seguinte.", fonte: "Métodos, página 3" },
        { q: "Quais são as limitações?", a: "A amostra é pequena e formada por estudantes universitários, então o resultado pode não valer para outras idades.", fonte: "Discussão, página 8" }
      ]
    }
  };

  function demo() {
    var boxDocs = qs("#docs"), boxQs = qs("#perguntas-lista");
    var title = qs("#doc-titulo"), ans = qs("#resposta"), src = qs("#fonte");
    if (!boxDocs || !boxQs) return;
    var timer = 0, current = "aluguel";

    function press(group, active) {
      qsa("button", group).forEach(function (b) { b.setAttribute("aria-pressed", String(b === active)); });
    }

    function answer(i, instant) {
      var item = DOCS[current].perguntas[i];
      clearInterval(timer);
      src.hidden = true;
      var finish = function () { ans.textContent = item.a; src.textContent = "Fonte: " + item.fonte; src.hidden = false; };
      if (instant || reduce) { finish(); return; }
      var n = 0;
      ans.textContent = "";
      timer = setInterval(function () {
        n += 2;
        ans.textContent = item.a.slice(0, n);
        if (n >= item.a.length) { clearInterval(timer); finish(); }
      }, 16);
    }

    function renderQuestions(instant) {
      boxQs.textContent = "";
      DOCS[current].perguntas.forEach(function (p, i) {
        var b = document.createElement("button");
        b.type = "button"; b.className = "q"; b.textContent = p.q;
        b.setAttribute("aria-pressed", "false");
        b.addEventListener("click", function () { press(boxQs, b); answer(i, false); });
        boxQs.appendChild(b);
      });
      press(boxQs, boxQs.firstChild);
      answer(0, instant);
    }

    function select(key, btn, instant) {
      current = key;
      title.textContent = DOCS[key].nome;
      press(boxDocs, btn);
      renderQuestions(instant);
    }

    Object.keys(DOCS).forEach(function (key, i) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "chip"; b.textContent = DOCS[key].nome;
      b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", function () { select(key, b, false); });
      boxDocs.appendChild(b);
      if (i === 0) select(key, b, true);
    });
  }

  /* ---------- Modo real: só aparece quando o servidor local responde ---------- */
  function modoReal() {
    var box = qs("#real");
    if (!box || !window.fetch || location.protocol === "file:") return;
    var form = qs("#real-form"), texto = qs("#real-texto"), arq = qs("#real-arq");
    var perg = qs("#real-q"), btn = qs("#real-btn"), ans = qs("#real-ans"), src = qs("#real-src");

    fetch("api/health", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .then(function (j) {
        if (!j || j.ok !== true) return;
        box.hidden = false;
        qs("#local-dica").hidden = true;
        qs("#demo-nota").textContent = "Servidor local detectado (" + j.provedor + "). O modo real está logo abaixo da demonstração.";
      })
      .catch(function () { /* sem servidor: fica só a demonstração */ });

    arq.addEventListener("change", function () {
      var f = arq.files[0];
      if (!f) return;
      if (f.size > 200000) { ans.textContent = "Arquivo grande demais (máximo 200 mil caracteres)."; return; }
      var rd = new FileReader();
      rd.onload = function () { texto.value = String(rd.result).slice(0, 200000); };
      rd.readAsText(f);
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!texto.value.trim() || !perg.value.trim()) { ans.textContent = "Cole um texto e escreva uma pergunta."; return; }
      btn.disabled = true; btn.textContent = "Lendo...";
      ans.textContent = "Procurando nos trechos do documento...";
      src.textContent = "";
      fetch("api/perguntar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: texto.value, pergunta: perg.value })
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (x) {
          if (!x.ok) { ans.textContent = x.j.erro || "Algo deu errado."; return; }
          ans.textContent = x.j.resposta;
          x.j.fontes.forEach(function (f) {
            var li = document.createElement("li");
            li.value = f.n;
            li.textContent = f.trecho;
            src.appendChild(li);
          });
        })
        .catch(function () { ans.textContent = "Não consegui falar com o servidor local."; })
        .then(function () { btn.disabled = false; btn.textContent = "Perguntar"; });
    });
  }

  /* ---------- Revelar ao rolar ---------- */
  function reveal() {
    var targets = qsa(".features .tile, .faq__list details, .cta, .demo__grid > *, .logos");
    targets.forEach(function (el) { el.classList.add("reveal"); });
    if (!("IntersectionObserver" in window) || reduce) {
      targets.forEach(function (el) { el.classList.add("in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { threshold: 0.12 });
    targets.forEach(function (el) { io.observe(el); });
  }

  heroPage(qs("#hero-page"));
  qsa("canvas[data-bitmap]").forEach(drawBitmap);
  stack();
  demo();
  modoReal();
  reveal();
})();
