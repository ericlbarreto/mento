# 08 — Privacy, ZDR and security

> Status: design principles. Not legal advice; a legal review is needed before real use with students. Last updated: 2026-10-30.

## Why this matters

Mento targets schools and therefore children and teenagers. Privacy and trust are product requirements and part of the sales process.

## ZDR (Zero Data Retention) — what it is and how we use it

- **ZDR is a provider-level policy:** the model provider (LLM, STT, TTS) does not store prompts or outputs. It usually requires an enterprise agreement.
- **Hackathon posture:** we **design for ZDR**; we do not claim certification. Say "ZDR-compatible architecture", not "we are ZDR".
- **Memory lives with Mento.** The LLM is stateless. The learner model lives in Mento's database, structured, editable by the teacher and deletable (LGPD). Each turn sends only minimal context: current concept, a few relevant evidence items, relevant excerpts.
- **Pitch line:** "The AI forgets everything. The school remembers, with its own data."
- Prefer a stack where every provider (LLM, STT, TTS) has a zero-retention option.
- **Free tiers:** some free API tiers may use content to improve products (e.g., a free Gemini tier was reported to do so, **[Unverified]**). Use only fictional data on such tiers.

## Principles

- LGPD compliance (Lei 13.709/2018) and the best interest of children and teenagers.
- **Data minimization and pseudonymization:** send student IDs, not names, to model providers.
- Isolation of data between schools (future multi-tenancy).
- Encryption in transit and at rest; limited retention and controlled deletion.
- Access logs and auditability.
- Transparency about AI use and its limitations.
- Do not use school data to train third-party models by default.
- Voice: define policy for recording/transcription before real use; the hackathon uses fictional or team members' data.
- Human review for relevant pedagogical decisions; the teacher can correct or contest.

## Limits on inference

The system builds **educational** hypotheses only: concepts, misconceptions, strategies that helped. It must not:

- Create psychological profiles or sensitive inferences (attention, anxiety, personality, health).
- Use "learning styles" labels.
- Conclude from insufficient data or from non-use.
- Rank or permanently label students.

## Hackathon data policy

- Use **only fictional or team-member data** for students. Never real minors' data.
- No secrets in the repo (`.env`, git-ignored).
- Simulated data always carries a visible badge.

## Open items for any real pilot

Legal basis per processing activity; controller/operator roles between school and Mento; subprocessor policy; international transfer assessment; retention periods; complaint/correction mechanism for inappropriate content. See the brief, section 19.

## Third-party data flows (from the technical roadmap)

| Flow | Data sent | Rules |
|---|---|---|
| **LLM (tutor, judge, analysis)** | Lesson excerpts, learner summary, recent events, board snapshot | Pseudonymized student id (no names); provider with a ZDR option; no training on our data (verify terms) |
| **STT (Deepgram, browser → provider)** | Student's voice audio | Direct WebSocket with a **short-lived token** minted by our server; keys never reach the browser; check retention terms; fictional/team voices only in the hackathon |
| **TTS** | Tutor text | Text only; no student personal data in `speak` text; check retention terms |
| **Image generation** | The `draw` prompt | Prompts describe the lesson subject only, **never student data**; cache by prompt hash so the same prompt is not re-sent |
| **Analytics/telemetry** | None planned for the hackathon | If added later, no student content in events |

- Verify each provider's retention/ZDR terms before real use; **free tiers may use content to improve products** (reported for one voice provider, unverified).
- Model-emitted HTML/SVG is sanitized (allowlist); citations are validated against the chunk text (`16` §5.4, §6).
