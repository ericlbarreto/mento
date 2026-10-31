# 18: Push the prompts again and how to test the voice flow end to end

## Prompt (verbatim, Portuguese)

> suba os prompts novamente, alem disso, existe alguma forma que eu possa testar o fluxo end to end? o fluxo de voz sabe?

## What was done

- Prompt log pushed to PR #8.
- Explained the end-to-end voice test: `pnpm dev`, then `http://localhost:3000/dev/conversation` in voice mode (Deepgram STT in the browser → turn SSE → board actions → ElevenLabs audio), with headphones.
