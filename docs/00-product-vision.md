# 00 — Product vision

> Status: consolidated from the brief and brainstorming conversations. Last updated: 2026-10-30.

## What it is

**Mento** is a B2B2C intelligent tutoring platform for schools. The school and teachers define the pedagogical context (subject, lessons, materials). Each student gets an **AI tutor** that teaches live on an **interactive whiteboard**, converses with them, and grounds itself in **the materials the teacher actually uses**. Sessions produce **learning evidence**, which becomes a picture of how each student thinks and learns, and actionable information for the teacher.

**Thesis in one sentence:** the school defines what must be learned; Mento teaches each student individually and turns the evidence from those tutoring sessions into pedagogical intelligence.

## The problem

1. Students already use general-purpose AI to study, but it does not know the course material or lesson context, and the student must re-upload PDFs and re-explain everything in each conversation.
2. The AI may answer correctly without finding out whether the student understood.
3. The conversation ends without updating any reliable record of what the student knows.
4. Teachers and schools cannot see what happened during individual study; they find gaps only in tests and grades.

## The solution (what Mento does differently)

| Capability | Meaning |
|---|---|
| **Live board** | The AI writes and draws step by step; the student interrupts, clicks an object and asks about it |
| **Grounded in the teacher** | The tutor answers from the subject's PDFs/slides/books and **cites page and excerpt** |
| **Two-way conversation** | Real dialogue: probing, hinting, changing the explanation based on the answer |
| **Learning evidence** | Verification questions produce structured records per concept |
| **Student picture** | Session analysis shows concepts, possible misconceptions and what seems to help each student, with evidence and uncertainty |
| **Memory under school control** | The model provider retains nothing (ZDR-compatible design); memory is structured, lives in Mento's database, correctable and deletable |

## Who it is for

- **Student (primary user):** an on-demand personal tutor aligned with what the teacher taught.
- **Teacher (operational user):** sees materials per subject and the picture of each student; keeps pedagogical authority.
- **Coordination/principal (buyer):** track learning evidence beyond grades. *(Future; outside the hackathon.)*
- **Families:** future module, out of scope.

## What Mento is NOT

- Not just a chatbot with PDFs.
- Not just an exercise/summary generator.
- Not just a whiteboard where AI draws: **the board is the interface; the product is the loop** teacher content → tutoring → evidence → student picture → teacher action.
- Not an LMS, does not replace the teacher, does not decide pass/fail.
- Does not measure success by screen time or message count.

## Product principles

1. **Teach, don't just answer.** Explain in steps, ask, verify.
2. **Visible source.** Every explanation derived from the material cites where it comes from; anything outside the material is flagged.
3. **Teacher in control.** The AI suggests; the teacher decides.
4. **Evidence before labels.** Hypotheses with confidence and examples; never an "intelligence score" or a permanent label.
5. **Privacy as a requirement.** Students may be minors (LGPD). Minimal, pseudonymized data.
6. **Narrow and provable.** Broad vision, small MVP.

## Long-term vision (outside the hackathon)

A personal tutor that follows the student through school life, knows the curriculum and the student, and connects progress to the school. Details in the [brief](reference/Mento_Company_Brief.md) (sections 2, 8, 10, 11).

## Business model (hypothesis, not validated)

Institutional SaaS: per-student annual license or paid pilot per class. Price undefined. Initial segment to validate: private schools in Recife, later public. See the brief (sections 10 and 11). **There are no customers, revenue or partnership.**
