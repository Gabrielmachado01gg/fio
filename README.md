# Fio

![Verificar site](https://github.com/Gabrielmachado01gg/fio/actions/workflows/verificar.yml/badge.svg)
![Licença MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-green)

Landing page de um assistente de IA fictício que lê documentos longos e mostra a página de onde saiu cada resposta. Projeto de demonstração para praticar interface, acessibilidade e animação no navegador.

**Ver online:** https://gabrielmachado01gg.github.io/fio/

## O que tem de interessante

- **Canvas autoral:** a "página" do hero é desenhada com blocos de pixel. As linhas perto do mouse e a varredura ganham destaque e um marcador de fonte.
- **Ícones em bitmap:** os três ícones são matrizes de texto desenhadas em canvas, sem imagens nem SVG.
- **Cartões empilhados:** o empilhamento é CSS puro (`position: sticky`). O GSAP ScrollTrigger só encolhe o cartão que fica para trás.
- **Demonstração interativa:** escolha um documento de exemplo e uma pergunta; a resposta aparece digitada, com a fonte. No site publicado as respostas são pré-escritas. Rodando o servidor local (abaixo), aparece um modo real que responde sobre o texto que você colar.
- **Acessibilidade:** link para pular ao conteúdo, foco visível, `aria-pressed` nos botões, região `aria-live` na resposta e respeito a `prefers-reduced-motion`.

## Como rodar

Só a demonstração (sem IA): abra `index.html` no navegador ou sirva a pasta com `python -m http.server 8000`.

## Rodar localmente

O modo real usa um servidor em Python (somente biblioteca padrão, Python 3.9 ou mais novo). Ele escuta apenas em `127.0.0.1`, então nada sai do seu computador, a não ser que você escolha o provedor `anthropic`.

**Opção 1: modelo local com Ollama (sem custo e sem chave)**

```bash
ollama pull llama3.2:3b
python servidor/fio_server.py
```

Abra http://127.0.0.1:8000, cole um texto ou envie um `.txt`/`.md` e pergunte. Para outro modelo: `FIO_MODELO=nome python servidor/fio_server.py`.

**Opção 2: API da Anthropic com a sua chave**

```bash
export ANTHROPIC_API_KEY=sua-chave
python servidor/fio_server.py --provedor anthropic
```

A chave fica só na variável de ambiente da sua máquina. Nunca a coloque no código nem no navegador.

**Como funciona:** o servidor divide o texto em trechos, escolhe os mais parecidos com a pergunta (TF-IDF) e pede ao modelo que responda só com eles, citando o número do trecho. Os trechos usados aparecem sob a resposta para você conferir. PDF ainda não é aceito; por enquanto, cole o texto.

**Testes:** `python -m unittest discover -s tests -v`

Verificação de links e textos alternativos (a mesma do CI):

```bash
python scripts/verificar_site.py
```

## Tecnologias

HTML, CSS e JavaScript puros. GSAP 3.12.5 (ScrollTrigger) por CDN. Fontes Pixelify Sans, Geist e Geist Mono pelo Google Fonts.

## Autor

Gabriel Wiedenhoft. Licença [MIT](LICENSE).
