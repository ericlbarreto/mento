# 2026-10-30 (time not recorded) — How to test, voice keys, and the conversation test bench

- **Person / agent:** Person 3 (founder as proxy) / Claude Code (Opus 5.5)
- **Task id** (from your workstreams file): testing (T9, T11)
- **Docs read first:** docs/frontend-integration.md, docs/superpowers/specs/2026-10-30-whiteboard-backend-design.md §11

## Prompt 1 of 5 (verbatim)

```text
Show, perfeito. Eu queria entender se a peita tá toda feita, no caso, no sentido do whiteboard. Eu queria saber como é que eu posso testar isso: se a gente pode testar se a latência tá legal, se ele tá puxando ali o assunto de algum livro, se tá trazendo e enviando as turns de forma correta. Enfim, quero entender se está tudo funcionando de forma perfeita.
```

## Prompt 2 of 5 (verbatim)

```text
Beijo, eu quero testar o fluxo de conversa. Eu quero testar isso. Como é que eu faço para testar isso? Enfim, me diz o que é que ainda está dependente para que tudo funcione: se é só o Eleven Labs Voice ID ou se tem que fazer uma coisa lá no Deepgram também?
```

## Prompt 3 of 5 (verbatim)

```text
so tem de portugal?

[image: ElevenLabs voice library language filter showing "Portuguese" with a Portugal flag]
```

## Prompt 4 of 5 (verbatim)

```text
pronto fiz as duas coisas, como é que eu posso testar o fluxo conversacional do Whiteboard?
```

## Prompt 5 of 5 (verbatim)

```text
onde que eu adiciono meu cartao la na eleven labs?
```

## Outcome (English)

Explained what works and how to test each part (tests, curl turns, `turn:bench`, `retrieval:check`, `llm:smoke`, `voice:smoke`, fixtures). With the founder's new keys: the Deepgram key now mints tokens and the browser subprotocol `["bearer", jwt]` works (loopback transcript correct); the chosen ElevenLabs library voice returns HTTP 402 `paid_plan_required` on the free plan (premade voices work, 333–363 ms first audio). Built `/dev/conversation`, a full conversation test bench (subject picker, voice or text, board actions, citations, images, verification answers, click-and-ask, interruption, per-turn latency) and tested it in text mode in the browser: the tutor opened, explained the Gracchi citing pages 325, 328 and 329, drew the Senate, asked and accepted a verification answer. First action 1.8 s on the opening, 3.5–4.0 s on the next turns (bridging line spoken).

## Files changed

`apps/web/src/app/dev/conversation/page.tsx`, `docs/frontend-integration.md` §11, spec §11 results

## Decisions and contracts touched

none

## Follow-ups / questions for other people

ElevenLabs paid plan for a Brazilian library voice.

## Commit / PR

64284e5, e491e01
