# 2026-10-30 (time not recorded) — Voice architecture decision, provider keys and Mongo connection string

- **Person / agent:** Person 3 (founder as proxy) / Claude Code
- **Task id** (from your workstreams file): T9 (voice) decision · Day-0 prerequisites
- **Docs read first:** workstreams/03-whiteboard-backend.md, docs/11-technology-research.md, docs/15-studdy-teardown.md, docs/16-technical-roadmap.md

## Prompt 1 of 4 (verbatim)

```text
Seguinte: eu quero começar o teste do backend e, primeiro, eu queria entender como é que a gente vai fazer a questão da arquitetura de voz:

* se a gente vai contemplar toda a arquitetura STT/TTS na nossa API
* se a gente vai usar alguma orquestração, como Deepgram.io
* se a gente vai chamar as APIs de cada coisa e tentar fazer a layer de LLM na nossa API

 Enfim, me diga o que você acha melhor nesse sentido. Eu vi que, no Deepgram, a gente tem as três opções:

* speech-to-text
* text-to-speech
* voice agent, que é a plataforma all-in-one e é toda a questão da orquestração

 Eu queria entender, de ti, o que é que tu acha que faz mais sentido: usar o Deepgram, usar o Eleven Labs ou algum outro provedor.
```

## Prompt 2 of 4 (verbatim)

```text
Dito isso, então, o que é que tu acha que faz mais sentido: eu gerar API aqui do STT no Deepgram e o TTS no ElevenLabs? Pode me confirmar isso, por favor?
```

## Prompt 3 of 4 (verbatim)

```text
onde que eu pego uma api key na eleven labs?
```

## Prompt 4 of 4 (verbatim)

```text
me de a env do mongo, a connection string pfvr
```

## Outcome (English)

Answered with a recommendation: keep the cascade (Deepgram STT from the browser with a short-lived token, our own LLM layer, ElevenLabs Flash v2.5 TTS through a server proxy) and do not use the Deepgram Voice Agent, because the product needs control of tool calls, word timings, interruption and event storage. Confirmed Deepgram for STT and ElevenLabs for TTS, explained where to create each key and the Mongo connection string (local or Atlas). No repository files changed in this step.

## Files changed

none

## Decisions and contracts touched

Confirms the voice decision of `docs/11` and `docs/16` §9; recorded later as D48 in the spec.

## Follow-ups / questions for other people

Founder generates the Deepgram, ElevenLabs and Anthropic keys and puts them in `.env`.

## Commit / PR

none (conversation only)
