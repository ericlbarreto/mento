# 11 — Technology research

> Status: **research notes from 2026-10-30, mostly from third-party blogs. [Unverified] — confirm on official pages before relying on any number.** Last updated: 2026-10-30.
> **Update 2026-10-30:** the board technology and the tool protocol in this document are **superseded by `16-technical-roadmap.md`** (DOM board in columns, tutor as a script of tool calls over SSE; no tldraw). Product intent here still applies.

## Speech-to-speech and voice agents

Two architectures: a **cascade** (audio → STT → LLM → TTS) lets you pick each model; **native speech-to-speech** is one model that takes and emits audio, is more natural and handles interruption better, and is billed per audio token (cost grows with context).

### Approximate per-minute costs (all [Unverified])

| Option | Type | Approx. cost | Notes |
|---|---|---|---|
| Gemini Live | Native | ~US$0.005 (in) + ~US$0.018 (out) per minute; a free tier exists | Free tier has limits and may use content to improve Google products; use fictional data only |
| OpenAI Realtime (flagship) | Native | ~US$0.05 per conversation minute; mini ~US$0.016 | Billed per token; cost rises as context grows |
| Deepgram Voice Agent | Bundled | ~US$0.075 (Standard); ~US$0.05 with own LLM/TTS | Sources disagree on whether TTS is included. **Aura-2 TTS has no Portuguese**, so the bundle is not usable for pt-BR output (STT is fine) |
| ElevenLabs Agents | Platform | US$0.08/min + LLM cost | Free plan with 15 minutes; top-tier TTS quality |
| Twilio | Telephony | — | Not a model; only needed for phone calls, not for a web app |

### Orchestration frameworks

**Pipecat** (BSD-2, by Daily) and **LiveKit Agents** (open source) both assemble STT → LLM → TTS with VAD and interruption. Managed hosting is reported at ~US$0.01/min; model costs dominate. LiveKit's guides are vendor-authored.

### Recommendation for a low budget

1. Develop and test in **text**; it costs almost nothing and validates the pedagogical loop.
2. For voice, use a **cascade with Pipecat or LiveKit**.
3. Use a high-quality TTS (e.g., ElevenLabs) for the pitch moment.
4. Gemini Live is the cheapest native option; test only with fictional data.
5. Run a real 10-minute session cost test on each option before locking in.

## Whiteboard

### tldraw (leading candidate)

- Has an **[Agent starter kit](https://tldraw.dev/starter-kits/agent)**: the agent receives a screenshot of its view plus a simplified list of shapes, and edits go through **typed actions that are validated** before touching the canvas. Supports Anthropic, OpenAI and Google. The kit is MIT.
- Supports **custom shapes** (candidates: illustration/SVG, timeline, source-linked objects).
- **SDK license is not plain MIT:** 100-day free trial; a hobby license for non-commercial projects (watermark stays); a commercial license via sales. The trial covers the hackathon.
- `draw` shape: freehand strokes; `maxPointsPerShape` default 600.

### Excalidraw

MIT, widely known, diagram/box oriented, less agent-focused. From memory, **not verified**.

### Gauth (competitor) — how its canvas works

Launched "Unlimited Digital Canvas" on 2026-10-01: continuous board, restores position/zoom, exports to PDF or link; narration in sync with notes and diagrams. Element-level Q&A, animation and 3D listed as planned in the release. Implementation is not public.

### Drawing illustrations ("draw a Colosseum")

| Approach | Quality | Effort | Risk |
|---|---|---|---|
| LLM-generated SVG | Variable (layering and proportion often fail) | Low | Ugly output live |
| Pre-made illustration library | High | Medium (manual) | Covers only what is prepared |
| Image-generation model | High but not "drawn live" | Low | Photo-like style; no stroke animation |

**Proposal:** a custom tldraw shape that takes an SVG (from the library or generated) and animates it with `stroke-dasharray`/`stroke-dashoffset`. Pre-generate and cache demo drawings. Related research: Vizart (EDM 2026 poster) uses SVG as the intermediate format for pedagogical visuals. **We found no project that draws illustrations stroke-by-stroke with a tutor voice.**

## Sources

- OpenAI Realtime pricing: https://www.layer3labs.io/guides/openai-realtime-api-pricing , https://tokencost.app/blog/openai-gpt-realtime-2-voice-pricing
- Deepgram pricing: https://www.activepieces.com/blog/deepgram-pricing-2026-per-minute-rates-and-add-ons , https://www.costbench.com/software/ai-transcription-apis/deepgram/
- ElevenLabs Agents: https://elevenlabs.io/pricing/agents , https://www.getmacha.com/blog/elevenlabs-agents-pricing-explained
- Gemini Live: https://tokenkarma.app/blog/gemini-live-api-pricing-voice-agents-2026/ , https://discuss.ai.google.dev/t/live-api-pricing-audio-tokens-second-silent-audio/92653
- LiveKit vs Pipecat: https://livekit.io/field-guides/guide/livekit-vs-pipecat
- tldraw Agent kit: https://tldraw.dev/starter-kits/agent
- tldraw license: https://tldraw.dev/sdk-features/license-key
- tldraw default shapes: https://tldraw.dev/sdk-features/default-shapes
- Gauth release: https://www.morningstar.com/news/pr-newswire/20261001cn57751/gauth-launches-unlimited-digital-canvas-gives-students-one-continuous-whiteboard-to-visualize-explore-and-understand-complex-topics
- Vizart (EDM 2026): https://educationaldatamining.org/edm2026/proceedings/2026.EDM.poster-demo-papers.446/index.html

## Round 2 (2026-10-30): competitors and voice stack — all [Unverified] unless noted

### Studdy and Flint (the two references)
- **Studdy** (https://studdyai.com/): teaches on a whiteboard step by step (equations, diagrams, reactions, graphs); upload notes/PDFs/slides; stop to ask; practice questions from materials. The site does not say how it draws or whether it has voice. No public technical detail.
- **Flint** (https://flintk12.com/): teacher builds activities by chatting with "Sparky" or uploading PDFs/slides/docs; rubrics, deadlines, live per-student monitoring with help alerts; class insights with **examples of student reasoning**; turns gaps into a follow-up activity; gradebook, SIS/LMS rostering. Students type or speak, use a whiteboard and calculator; tutor cites sources. **Flint overlaps more than expected** (board, voice, sources). Mento's differentiation: tutor draws live + click-and-ask on objects + student picture tied to evidence.
- Ideas to borrow for the teacher screen: real examples of student reasoning in each insight; "turn gap into activity" button.

### Voice stack recommendation (cascade, pt-BR)
- **STT:** Deepgram Flux Multilingual (Portuguese included, built-in end-of-turn detection; ~US$0.47/hour reported; latency claims conflict: <400 ms vs ~1.5 s).
- **TTS:** shortlist Cartesia Sonic 3.5 (reported 75–90 ms to first audio; ~US$0.038/1K chars for Sonic 4 Turbo) and ElevenLabs Flash v2.5 (~US$50/1M chars; best reputation for quality). No independent pt-BR benchmark found: run a 1-hour blind bake-off on 3 Rome-lesson sentences and measure time-to-first-audio.
- **Orchestration:** Pipecat (or LiveKit Agents). Rough all-in cost ~US$0.05–0.07 per minute (our arithmetic on unverified prices).
- **Naturalness/speed tactics:** stream LLM → TTS sentence by sentence; short voice replies; emit the board action before speech ends; preload lesson context with caching (no retrieval mid-speech); target ~1–1.5 s to first audio (estimate, measure it).
- Twilio/Telnyx are telephony, not needed for web.

### Drawing decision
The LLM does **not** draw from scratch: it **selects, composes and annotates** a curated library of 6–8 reviewed SVGs with **named anchors**. `illustration` takes `asset_id` + labels/arrows targeting anchors; stroke animation via `stroke-dashoffset`. LLM-generated SVG is a pre-cached fallback only.

### Sources
- https://studdyai.com/ , https://flintk12.com/
- https://www.implicator.ai/deepgram-launches-flux-multilingual-speech-model-with-10-language-mid-call-switching/
- https://futureagi.com/blog/best-tts-providers-voice-agents-2026/ , https://www.cekura.ai/blogs/best-tts-for-ai-voice-agents , https://codesota.com/speech/best-for-realtime

## TTS research (2026-10-30, two rounds: web searches + official doc pages)

Confidence: **[Official page]** = read from the vendor's own docs/pricing page today; **[Third-party]** = blog/search summary; **[Unverified]** = not confirmed. Prices change; reconfirm before paying.

### Comparison for our needs (pt-BR, caption highlight, low latency, low cost, persona styles)

| Provider | pt-BR | Word timing (for captions) | Streaming | Price | Retention / ZDR | Verdict |
|---|---|---|---|---|---|---|
| **Azure Speech** | **Many voices** [Official page]: HD (`pt-BR-Thalita/Macerio:DragonHDLatest`), neural (e.g., Francisca, Antonio, Thalita), multilingual, and **MAI-Voice-2** (`Caio`, `Luana`, plus a Flash variant) with styles such as excited, happy, softvoice, whispering | **Yes: `WordBoundary` event** in the JS SDK with `audioOffset`, `text`, `duration` [Official page] | Audio chunks via the `Synthesizing` event; you sync playback yourself [Official page] | ~US$15/1M chars neural, ~US$22/1M HD [Third-party; official page showed no figures] | Data stays in the region of your resource; Brazil South TTS endpoint exists [Official page]; retention period of synthesized text **[Unverified]** | Cheapest and in-region **fallback**; naturalness of the pt-BR voices **not heard yet** |
| **ElevenLabs Flash v2.5** | Portuguese as `pt` (Multilingual v2 distinguishes Brazil/Portugal; Flash lists only `pt`); 32 languages [Official page] | **Yes: WebSocket returns character-level alignment** (plus a normalized alignment; words must be rebuilt) [Official docs via search] | WebSocket streaming; median ~100 ms excluding network [Official page] | **US$0.04/1K chars** (~US$40/1M) Flash/Turbo; US$0.08/1K Multilingual v2 [Official page] | **Zero Retention Mode** (enterprise); per-request `enable_logging=false` documented [Official docs via search] | **Top candidate for naturalness + latency** (best reputation for voice quality; ~100 ms median) |
| **Cartesia Sonic** | Latest model **Sonic 3.6**, 44 languages including `pt`; whether `pt-BR` locale is accepted **[Unverified]** (page links to a locales list) [Official page] | **Yes: `add_timestamps` flag on the WebSocket returns word start/end** [Official docs via search] | WebSocket | Credits: **1 credit = 1 character**, ~750–800 credits per minute. Free 20K credits/mo (no commercial license); **Pro US$5/mo = 100K credits (~2 hours) with commercial license**; overage US$65/1M credits on Pro [Official page] | ZDR on **enterprise only** [Official docs via search] | Third; needs the pt-BR check |
| **Deepgram Aura-2** | **No Portuguese**: Aura-2 supports 7 languages (English, Spanish, German, French, Dutch, Italian, Japanese) [Official page] | n/a | n/a | n/a | n/a | **Excluded for TTS.** Portuguese works for Deepgram **STT** only |
| **Google Cloud TTS (Chirp 3 HD)** | pt-BR supported; streaming formats ALAW/MULAW/OGG_OPUS/PCM; regions global/us/eu [Official page via search] | **Unconfirmed**: SSML `mark` is **not** in the supported tag list for Chirp 3 HD | Yes | not found | not found | Skip for the hackathon |
| **OpenAI gpt-4o-mini-tts** | Described as English-centric; pt quality **[Unverified]** | None found | Streaming | ~US$0.015/min [Third-party] | n/a | Skip |

### Cost per spoken minute (our arithmetic, ~800 characters per minute)

| Option | ≈ US$/min |
|---|---|
| Azure neural (US$15/1M) | 0.012 |
| Azure HD (US$22/1M) | 0.018 |
| ElevenLabs Flash (US$40/1M) | 0.032 |
| Cartesia Pro base (US$5 per 100K credits) | 0.040 (overage 0.052) |

The tutor speaks maybe half of a session, so a 10-minute lesson costs cents with any option. **TTS cost is not the deciding factor; pt-BR naturalness and word timing are.**

### What this changes
- **Deepgram Voice Agent bundles are not an option for pt-BR voice output** (Aura-2 has no Portuguese). Deepgram stays as the **STT**.
- **Captions:** all three finalists can drive word highlighting. ElevenLabs needs word reconstruction from characters (and its normalized text can differ from ours, e.g., numbers); Azure and Cartesia give word timing directly.
- **Persona styles** (`speak.style`): Azure has real pt-BR style support on some voices (MAI-Voice-2 list; Francisca has `calm`); most pt-BR neural voices list no styles; ElevenLabs/Cartesia control delivery by voice choice and settings.
- **Latency:** none of these were **measured**. Azure Brazil South is the only one with a documented in-country endpoint; ElevenLabs reports ~100 ms median excluding network.

### Recommendation
1. **Bake-off (≈1 h, day 0):** Azure Speech (one HD/MAI pt-BR voice + one standard), ElevenLabs Flash v2.5, Cartesia Sonic 3.6 (if `pt-BR` is accepted).
2. Test lines (pt-BR): a normal sentence, a date and numbers (**"27 a.C.", "509 a.C.", "século I"**), a question with a pause, and a sentence with a proper name ("Otávio Augusto", "Coliseu"). Check pronunciation of `a.C.` and numerals.
3. Measure **time to first audio** from the demo network, **word timing** mapping to our captions, and listen blind.
4. **Default pick if no time: ElevenLabs Flash v2.5**, because the founder's priority is the most natural pt-BR voice with low latency (cost is negligible). **Azure** is the fallback if ElevenLabs fails on pt-BR pronunciation, word timing or cost; Cartesia only if its `pt-BR` check passes. Note: Flash is the speed-optimized model; Multilingual v2 sounds richer but is slower and twice the price; Eleven v3 has a 5,000-character limit and was not described as real-time (**[Unverified]**).
5. Keep keys server-side: the browser calls our `/api/tts` proxy (or uses a short-lived token); never ship keys.

### Listening test (15 minutes, no code)

Use each provider's free playground: ElevenLabs web playground, Cartesia playground (free 20K credits), Azure Speech Studio voice gallery. Paste the same lines and listen blind:

1. "Oi! Hoje vamos entender como Roma deixou de ser uma República e passou a ser um Império."
2. "Repare nessa data: 27 a.C. Foi quando Otávio recebeu o título de Augusto."
3. "O Coliseu foi concluído no século I e recebia cerca de cinquenta mil pessoas. Você consegue imaginar isso?"
4. "Hmm, quase! Pensa comigo: o que mudou no poder do Senado depois disso?"

Score each 1–5 for naturalness, pronunciation of `a.C.`/numerals/names, rhythm of the question, and whether it sounds like a Brazilian tutor (not European Portuguese).

### Still unverified
Measured latency; exact Azure pricing from the official calculator; Cartesia `pt-BR` locale and exact credit price for Sonic 3.6; Azure retention of synthesized text; Google word timing; browser auth-token flow for Azure (`fromAuthorizationToken` exists in the SDK but was not confirmed on the page read).

### Sources
- Cartesia models: https://docs.cartesia.ai/build-with-cartesia/tts-models/latest ; WebSocket API: https://docs.cartesia.ai/api-reference/tts/websocket ; pricing: https://cartesia.ai/pricing ; ZDR: https://docs.cartesia.ai/enterprise/zero-data-retention
- ElevenLabs models: https://elevenlabs.io/docs/overview/models ; API pricing: https://elevenlabs.io/pricing/api ; WebSockets: https://elevenlabs.io/docs/api-reference/websockets/overview ; Zero Retention Mode: https://elevenlabs.io/docs/resources/zero-retention-mode
- Azure language/voice support: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=tts ; synthesis events: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-speech-synthesis ; regions: https://learn.microsoft.com/azure/ai-services/speech-service/regions
- Deepgram TTS languages: https://developers.deepgram.com/docs/tts-models-languages-overview
- Google Chirp 3 HD: https://docs.cloud.google.com/text-to-speech/docs/chirp3-hd
- Pipecat ElevenLabs alignment handling: https://reference-server.pipecat.ai/en/stable/_modules/pipecat/services/elevenlabs/tts.html
