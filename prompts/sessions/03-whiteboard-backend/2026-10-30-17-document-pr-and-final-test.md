# 17: Document the PR and run the final test

## Prompt (verbatim, Portuguese)

> Pronto, eu tô no plano pago do Everlabs já. Eu quero que você documente tudo que você fez, suba tudo no PR e faça um teste final, porque meu limite está atingido. Daí eu vou mover aqui todos os movimentos para um outro provedor. Então faça o teste, mas, antes de tudo, documente tudo que você fez nesse PR. Depois que você documentar, você roda o teste.

## What was done

- Decision D55 (tutor on Haiku 5.5, thinking disabled) in `docs/10-decisions.md`; spec model line updated; PR #8 description rewritten to cover everything in the PR and how to continue.
- Final test: full test suite, typecheck, `pnpm turn:bench`, ElevenLabs TTS with the paid plan (results in the PR description).

## Final test results (2026-10-30, 22:42 -03)

- Typecheck clean; tests: contracts 29, db 16 (Atlas integration included), sources 29, voice 31, tutor 77, api 25, all passing.
- `pnpm turn:bench 3` (text, retrieval included): first action p50 1786 ms, p95 2558 ms; script done p50 3352 ms; 0 errors.
- `pnpm voice:smoke`: ElevenLabs WebSocket first byte 338–443 ms with word timings; Deepgram token minted and a pt-BR transcript returned with the `["bearer", jwt]` subprotocol.
- Voice opening turn through the API: 1.8 s, `speech_alignment` sent, `GET /api/tts/act_1_0` returned 5.0 s of PCM audio; the session appears in `GET /api/sessions` with `turn_count: 1`.
