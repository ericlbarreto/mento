# 12 — Glossary

> Last updated: 2026-10-30.

| Term | Meaning |
|---|---|
| **Mento** | The product and company |
| **Tutor / Tutor Core** | The AI agent and the single LLM loop that runs a session (tools, retrieval, evidence) |
| **Board / whiteboard** | The shared, structured canvas where the tutor and student write and draw |
| **Tool action** | A typed instruction the tutor emits (`speak`, `write_text`, `draw`, ...); earlier docs called board instructions `board_op` |
| **Click-and-ask** | The student selects a board object and asks about it; the tutor gets the object and board state |
| **Material** | A PDF uploaded by the teacher (e.g., a book); has a subject, status, pages and outline. Replaces the earlier subject → lesson → source hierarchy |
| **Subject** | A label on a material (História, Matemática, ...) that selects the subject profile |
| **Class context (turma)** | The single global description written by the teacher: grade level (7º–9º ano) and class characteristics; applied to every chat |
| **Teacher workspace** | The single-teacher, no-login area with two tabs: Students and Materials |
| **Student** | A person created by the teacher; picks their own name to start a conversation |
| **Conversation / session** | One tutoring dialogue of one student with one material; stored with its event log |
| **Gap** | A concept the student seems to be missing, with evidence and confidence (`insights.kind = gap`) |
| **Insight** | A generated, teacher-facing item: `gap`, `progress` or `suggestion` |
| **Chunk** | A page/section of a source stored as text with its page number |
| **Citation** | `material_id` + `page` + `quote`, shown as a chip; opens the PDF at the excerpt |
| **Outside the material** | Marker for tutor answers not supported by the teacher's sources |
| **Subject profile** | File describing how a subject is taught (method, misconceptions, verification types, board ops); chosen from the material's subject |
| **Three-layer prompt** | Base + subject profile + course context (class context + material excerpts + learner summary + topic) |
| **Evidence** | A structured record (concept, correct, independent, source, time) from a verification or reasoning moment |
| **Verification question** | A new question (not a repeat of the example) used to check understanding |
| **Transfer** | Applying a concept to a new situation |
| **Misconception** | A recurring conceptual error; always a *hypothesis* with confidence, never a verdict |
| **Analysis** | Post-session job: counters + LLM structured output |
| **Student picture** | Aggregate of analyses: concepts, misconceptions, what seems to work, next action |
| **Learner model** | Persistent structured representation of what a student appears to know, with evidence and uncertainty |
| **Open learner model (OLM)** | A learner model shown to the student/teacher with uncertainty |
| **BKT** | Bayesian Knowledge Tracing: estimates mastery probability from answers (future upgrade) |
| **ZDR** | Zero Data Retention: provider stores neither prompts nor outputs |
| **LGPD** | Brazilian data protection law (Lei 13.709/2018) |
| **STT / TTS** | Speech-to-text / text-to-speech |
| **VAD** | Voice activity detection (detects when the user is speaking) |
| **Cascade** | Voice architecture: STT → LLM → TTS |
| **Native speech-to-speech** | One model that takes and emits audio |
| **Simulated data** | Fictional data used for demo; always badged "simulated data" |
| **Must / Should / Nice / Out** | Scope tiers; see `01-hackathon-scope.md` |
| **Cut line** | ~hour 18: if Must is not working end to end, Should does not start |
| **Teachy** | Brazilian EdTech company that backs the hackathon |
| **Code freeze** | Moment after which code cannot change for the hackathon submission |
| **Turn / script** | One LLM response: an ordered list of tool actions streamed to the client |
| **SSE** | Server-Sent Events: the one-way stream that carries a turn's actions |
| **Action queue** | Client-side ordered playback of a script; `speak` is the clock; cancelled on interruption |
| **Element / column** | A board item with a stable id; the board is organized in columns, not coordinates |
| **Placeholder** | Temporary element shown while an image or diagram is being generated |
| **Judge** | Small LLM call that decides whether a verification answer is correct and independent |
| **Ephemeral token** | Short-lived credential minted by our server so the browser can talk directly to the STT provider |
| **Fixture** | A prerecorded script/event log replayed through the real SSE path for development and demo fallback |
| **Contracts** | Frozen shared schemas and interfaces in `packages/contracts` |
| **Lane (A/B/C)** | One of three parallel work areas with directory ownership (`17-work-split.md`) |
| **Kickoff** | First 90 minutes, all three together: skeleton, contracts, fixtures, tokens |
| **Orb** | Bottom-center voice indicator: mascot + animated ring (idle/listening/thinking/speaking) |
| **Mascot** | The round blue Mento character; also the face of the orb (`19-brand-assets.md`) |
| **Studdy / Flint** | Reference products: Studdy for the whiteboard tutor, Flint for the teacher side (`15`, `18`) |