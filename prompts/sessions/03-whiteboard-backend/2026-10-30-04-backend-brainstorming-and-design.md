# 2026-10-30 (time not recorded) — Brainstorming and approved design of the whiteboard back-end

- **Person / agent:** Person 3 (founder as proxy) / Claude Code
- **Task id** (from your workstreams file): T1–T11 (design) · spec
- **Docs read first:** workstreams/03-whiteboard-backend.md, workstreams/contracts-spec.md, docs/15-studdy-teardown.md, docs/16-technical-roadmap.md, provider documentation (Anthropic, ElevenLabs, Deepgram)

## Prompt 1 of 9 (verbatim)

```text
Legal, legal, legal. Agora eu quero que você use Superpowers Brainstorming para a gente começar a atividade do backend do whiteboard. Pesquise a documentação da Eleven Labs, do TTS e do Deepgram para o STT. Inclua isso em todo o planejamento e garanta que os contratos estão sendo cumpridos para que o frontend consiga integrar de forma correta. 

Inclusive, me diga qual elemento você vai usar na camada de orquestração ali do STT, do TTS, porque talvez eu precise gerar uma API key para isso também.
```

## Prompt 2 of 9 (verbatim)

```text
qual odelo da anthropic vc vai usar?
```

## Prompt 3 of 9 (verbatim)

```text
Massa, vamos fazer a questão do planejamento, mas acho que a gente precisa focar realmente na performance. Precisa ser algo realmente bem natural. Use a skill /brainstorming  para a gente poder planejar tudo isso, certo? Precisa ser algo bem natural, com boa performance. Pesquise todas as documentações dos provedores que você vai utilizar para garantir que realmente funcione.

Nosso teste vai ser basicamente o backend do whiteboard. Garanta que o esquema está sendo totalmente correto ali com o que o frontend pede e tudo isso, tá bom?
```

## Prompt 4 of 9 (verbatim)

```text
Vai ser voz, certo? Vai ser toda a parte de voz. Através da interface, eu posso iniciar um novo chat, e esse chat vai talvez criar uma sessão, não sei, alguma coisa. Não sei se já estava incluso no planejamento, mas depois que eu iniciei o chat, eu começo o fluxo de voz. Eu posso tanto falar como escutar. É meio que uma coisa de dois caminhos, seguindo toda aquela questão das tools que você falou, para poder renderizar e mexer em coisas lá no front-end.
```

## Prompt 5 of 9 (verbatim)

```text
Show, tá muito bacana. Seria legal que eu possa enviar para o front-end também as palavras que foram transcritas, porque a gente consegue exibir em formato de legenda, tá? Então, inclua isso também no contrato, que aí eu posso combinar aqui com o front-end para ele também utilizar isso.
```

## Prompt 6 of 9 (verbatim)

```text
Agora, me tira uma dúvida: como é que você sabe o element ID? Como é que você sabe o que mexer lá no front-end? Diga como é que isso vai funcionar.
```

## Prompt 7 of 9 (verbatim)

```text
Tá show, tá perfeito, tá ótimo, então pode prosseguir. Só garanta realmente a performance baseada no que você aprendeu sobre a [studdy](https://studdyai.com/).
```

## Prompt 8 of 9 (verbatim)

```text
ta correta
```

## Prompt 9 of 9 (verbatim)

```text
ta certinho
```

## Outcome (English)

Ran the brainstorming flow (architectural path): read the provider docs (Anthropic fine-grained tool streaming and prompt caching, ElevenLabs timestamps/WebSocket/latency, Deepgram streaming/tokens/Flux) and reread the Studdy teardown. Chose voice-first with SSE for the turn plus audio prefetched over HTTP, models Sonnet 5.5 (tutor) and Haiku 5.5 (judge), and a design in five sections (contracts, voice, turn, drawing, measurement/tests/order) that the founder approved section by section. Explained how element ids work (the model chooses them; the server validates them against board state derived from events). Wrote the spec.

## Files changed

`docs/superpowers/specs/2026-10-30-whiteboard-backend-design.md`

## Decisions and contracts touched

Proposed contract additions (turn stream union, `script_done`, `speech_alignment`, `audio_url`, `SttCaption`, `spoken_ms`) and decisions D47–D51; they are written into `contracts-spec.md` and `docs/10` by Plan 1, Task 6.

## Follow-ups / questions for other people

Person 2 should read `docs/frontend-contract.md` (created by Plan 1) and agree on `script_done` and the caption events.

## Commit / PR

95c9de1 on `feat/whiteboard-api`.
