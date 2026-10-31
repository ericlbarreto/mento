# Which model for the tutor? (latency research, 2026-10-30)

> Question from the founder: Sonnet may not be the right model for the tutor (it thinks too much); research a faster model, e.g. GLM, that makes the voice loop feel natural.
> Status: **research done, not yet measured end to end**. Facts carry a source; claims from vendor blogs are marked as such.

## 1. What we measured ourselves

A realistic History turn (real retrieval on the Coimbra book, real prompt and tools), `claude-sonnet-5-5` with its defaults, 3 runs:

| Stage | Time |
|---|---|
| Retrieval (query embedding + vector + text search) | 0.6–1.0 s (the Voyage query embedding is ~0.77 s of it) |
| First streamed block from the model | **a `thinking` block**, starting ~0.7–0.9 s after the call |
| Thinking ends, first tool call starts | **~3 s later** |
| First `speak` complete | 4.3–5.4 s from the start of the turn |

So the ~4 s "first action" is mostly **adaptive thinking that Sonnet 5.5 runs before acting**, plus ~0.8 s of retrieval. Earlier direct calls without retrieval measured the first tool block at 1.46–1.95 s with 27/27 valid tool calls and a working prompt cache (spec §11).

## 2. What the providers document

- **Claude Sonnet 5.5:** adaptive thinking is always on, default effort `high`. To turn off up-front thinking, send `thinking: {"type": "between_tools"}` (the lowest setting; works at `low`, `medium` and `high` effort); `output_config.effort` lowers how much it thinks. Changing these settings invalidates the prompt cache, so keep them fixed per session. ([Anthropic: Effort](https://platform.claude.com/docs/en/build-with-claude/effort))
- **Claude Haiku 5.5:** default effort `medium`; `thinking: {"type": "disabled"}` is allowed at `high` effort or below. (same page)
- Fine-grained tool streaming (`eager_input_streaming`) and prompt caching are already used by the tutor.

## 3. What third parties report (use with care)

| Model / host | Reported time to first token | Source and caveats |
|---|---|---|
| DeepSeek V4.1 Flash (Baseten) | ~353 ms | [Regal, Oct 2026](https://www.regal.ai/blog/voice-cx-benchmark-new-llms-october-2026); vendor benchmark, 1,300 ms bar for voice |
| GPT-6 Sol | 870 ms (top voice score) | Regal, same |
| Gemini 3.8 Flash | 2,516 ms (best at calling required tools, too slow for voice) | Regal, same |
| Claude Haiku 5.5 | not given; 1st on intent accuracy, 2nd on context retention, but "calls tools too often" | Regal, same |
| Claude Sonnet 5.5 | not given; Regal says thinking "cannot be turned off" (it tried `disabled`; Anthropic documents `between_tools` instead) | Regal, same |
| GLM-5.1 (non-reasoning) | 0.84 s (FriendliAI), 0.97 s (DeepInfra), 1.16 s (SiliconFlow); model deprecated in favor of GLM-5.2 | [Artificial Analysis](https://artificialanalysis.ai/models/glm-5-1-non-reasoning/providers) |
| GLM-5 | p50 0.94 s best provider; p95 3.0 s on Z.ai | [OpenRouter](https://openrouter.ai/z-ai/glm-5), [llm-stats](https://llm-stats.com/models/glm-5) |
| GLM 4.7 vs Claude Haiku 4.5 | 584 ms vs 662 ms median | [Regal listicle](https://www.regal.ai/listicles/best-llms-for-voice-ai-agents) (vendor) |
| gpt-oss-120b on Groq | 0.8 s median from São Paulo | [30-day latency study](https://dev.to/max_bob/fastest-ai-inference-api-in-2026-30-days-of-latency-data-for-groq-cerebras-sambanova-and-43-386k) |

None of these measured our case: a ~5k-token cached prompt, 10 tools, Portuguese, and the time until the **first complete tool call** (not just the first token).

## 4. Reading of the evidence

1. **The orchestration of STT and TTS does not depend on the LLM.** It is our code (Deepgram in the browser, ElevenLabs on the server, the action queue); a different LLM only changes how fast and how well the script is written.
2. **The biggest win is a setting, not a model:** removing Sonnet's up-front thinking should cut ~3 s. Haiku 5.5 with thinking disabled is the fast option in the same family (same SDK, prompt cache, tool streaming, ZDR path).
3. **GLM and other open models are plausible but unproven for us:** reported first-token times (~0.6–1.2 s) are in the same range as Haiku, the hosts vary a lot (p95 up to 3–5 s), quality of Portuguese pedagogy and reliability with our 10 tools are unknown, prompt caching differs per host, and data from minors would go to another provider (choose a host with a clear no-retention policy). Adding one requires an OpenAI-compatible `LlmClient` (one new file; the engine already talks to an interface).

## 5. Recommendation

1. **Now:** set the tutor request to `thinking: {"type": "between_tools"}` with `effort: "low"` (Sonnet 5.5) and compare it with `claude-haiku-5-5` + `thinking: {"type": "disabled"}` on `pnpm turn:bench` and in `/dev/conversation`. Keep the one that reaches a p50 first action ≤ 1.5 s with good pedagogy.
2. **Only if both miss the target:** add an OpenAI-compatible client and run the same bench with GLM-5.2 (on a US host such as DeepInfra or FriendliAI) and DeepSeek V4.1 Flash.
3. **Independently:** take the ~0.8 s query embedding off the critical path (start it when the student's speech ends, or run the first LLM call without passages and rely on the search round).

## 6. Result (2026-10-30)

Applied: `claude-haiku-5-5` with `thinking: {"type": "disabled"}` (env `TUTOR_MODEL`, `TUTOR_THINKING`, `TUTOR_EFFORT`). `pnpm turn:bench 3` end to end, retrieval included: first action p50 1664 ms, p95 2298 ms; script done p50 3842 ms; 0 errors. Effort `low` was not faster and wrote poorer scripts. Remaining gap to the 1.5 s target is mostly the ~0.8 s query embedding (§5 item 3).
