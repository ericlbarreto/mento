import type { AnalysisInput, Finding, Lesson, MaterialRef, RuleId, WriterInsight, WriterOutput } from "@mento/contracts";

export const TEMPLATE_VERSION = "template-v1";

/** Neutral wording on purpose: the analysis does not know a student's gender or personality, only concepts and answers. */
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const pages = (l: Lesson) => `páginas ${l.pages[0]}–${l.pages[1]}`;

function lessonOf(input: AnalysisInput, id: string | null | undefined): Lesson | undefined {
  return id ? input.material.sequence.find((l) => l.lesson_id === id) : undefined;
}

function whereSentence(input: AnalysisInput, f: Finding): string {
  const studying = lessonOf(input, input.studying_lesson_id);
  if (f.diagnosis === "prerequisite" && f.root_cause) {
    const root = lessonOf(input, f.root_cause.lesson_id);
    const taught = f.root_cause.taught_in_class ? "já trabalhada em aula" : "ainda não trabalhada em aula";
    const before = studying ? ` Esse conteúdo vem antes de "${studying.title}", que está sendo estudada agora.` : "";
    return `Provavelmente a origem está em "${f.root_cause.title}" (Lição ${root?.order ?? "?"}, páginas ${f.root_cause.pages[0]}–${f.root_cause.pages[1]}, ${taught}).${before}`;
  }
  if (f.diagnosis === "current_topic" && studying) return `A dificuldade aparece no próprio conteúdo em estudo ("${studying.title}").`;
  return "";
}

function reasoningFor(input: AnalysisInput, f: Finding): string | null {
  if (f.diagnosis !== "prerequisite" || !f.root_cause) return null;
  const studying = lessonOf(input, input.studying_lesson_id);
  const root = lessonOf(input, f.root_cause.lesson_id);
  const target = studying ? `"${studying.title}"` : "o conteúdo em estudo";
  return `As respostas sobre "${f.concept}" vêm de perguntas da Lição ${root?.order ?? "?"} ("${f.root_cause.title}"), que é pré-requisito de ${target}. Quando o conteúdo anterior não está firme, o seguinte tende a gerar dúvidas.`;
}

const TEXT: Record<RuleId, (f: Finding) => { title: string; body: string }> = {
  R1_repeated_errors: (f) => ({
    title: `Erros repetidos em "${f.concept}"`,
    body: `Houve ${plural(f.metrics.incorrect, "resposta incorreta", "respostas incorretas")} sobre ${f.concept} na mesma conversa.`,
  }),
  R3_recurring: (f) => ({
    title: `"${f.concept}" continua sendo uma dificuldade`,
    body: `As respostas incorretas sobre ${f.concept} se repetiram em ${f.metrics.incorrect_sessions} conversas diferentes (${f.metrics.incorrect} no total).`,
  }),
  M1_single_error: (f) => ({
    title: `Primeiro sinal de dúvida em "${f.concept}"`,
    body: `Evidência inicial: ${plural(f.metrics.incorrect, "resposta incorreta", "respostas incorretas")} e ${plural(f.metrics.partial, "parcial", "parciais")} sobre ${f.concept}. Ainda é cedo para tratar como lacuna confirmada.`,
  }),
  M2_needs_hints: (f) => ({
    title: `"${f.concept}" ainda precisa de apoio`,
    body: `As respostas corretas sobre ${f.concept} vieram depois de dicas (${f.metrics.hints_used} no total).`,
  }),
  P1_consistent: (f) => ({
    title: `Respostas consistentes em "${f.concept}"`,
    body: `${plural(f.metrics.independent_correct, "resposta correta", "respostas corretas")} sobre ${f.concept}, sem nenhuma dica.`,
  }),
  P2_resolved: (f) => ({
    title: `Superou a dificuldade em "${f.concept}"`,
    body: `Depois de erros em conversas anteriores, as respostas mais recentes sobre ${f.concept} foram corretas e sem dicas (${f.metrics.last_independent_correct} na última conversa). A lacuna pode ser considerada resolvida.`,
  }),
  P3_first_success: (f) => ({
    title: `Primeira resposta correta e sem ajuda em "${f.concept}"`,
    body: `Evidência inicial: uma resposta correta sobre ${f.concept}, sem dicas. Vale confirmar nas próximas conversas.`,
  }),
};

function suggestionFor(input: AnalysisInput, f: Finding): { title: string; body: string; material_ref: MaterialRef | null } {
  const studying = lessonOf(input, input.studying_lesson_id);
  const root = f.diagnosis === "prerequisite" ? lessonOf(input, f.root_cause?.lesson_id) : undefined;
  const target = root ?? (f.diagnosis === "current_topic" ? studying : undefined);
  if (!target) {
    return {
      title: `Acompanhar "${f.concept}" nas próximas conversas`,
      body: "Ainda não há evidência de onde vem a dúvida. Observar nas próximas conversas e, se continuar, retomar o tema em aula.",
      material_ref: studying ? { lesson_id: studying.lesson_id, pages: studying.pages } : null,
    };
  }
  const activity = target.activities[0];
  const how = activity ? `Fazer ou refazer a ${activity.charAt(0).toLowerCase()}${activity.slice(1)} (${pages(target)})` : `Revisar ${pages(target)}`;
  return {
    title: root ? `Retomar "${target.title}" antes de avançar` : `Reforçar "${f.concept}" em "${target.title}"`,
    body: root && studying ? `${how}, com foco em "${f.concept}". Depois, voltar a "${studying.title}".` : `${how}, com foco em "${f.concept}".`,
    material_ref: { lesson_id: target.lesson_id, pages: target.pages },
  };
}

function summaryFor(input: AnalysisInput, findings: Finding[]): string {
  if (input.skip_reason === "short_session") return "Conversa curta, sem evidência suficiente para gerar insights.";
  if (findings.length === 0) return "Conversa sem perguntas de verificação; não há evidência suficiente para gerar insights.";
  const studying = lessonOf(input, input.studying_lesson_id);
  const what = studying ? `"${studying.title}"` : "o conteúdo da conversa";
  const gaps = findings.filter((f) => f.kind === "gap");
  const progress = findings.filter((f) => f.kind === "progress");
  const parts: string[] = [];
  const top = gaps.find((g) => g.diagnosis === "prerequisite" && g.root_cause);
  if (top?.root_cause) {
    const order = lessonOf(input, top.root_cause.lesson_id)?.order ?? "?";
    parts.push(`Está estudando ${what}, mas as dificuldades em "${top.concept}" parecem vir de "${top.root_cause.title}" (Lição ${order}).`);
  } else {
    parts.push(`Está estudando ${what}.`);
  }
  const others = gaps.filter((g) => g !== top).map((g) => g.concept);
  if (gaps.length > 0 && (!top || others.length > 0)) parts.push(`Pontos de atenção: ${(top ? others : gaps.map((g) => g.concept)).join(", ")}.`);
  if (progress.length > 0) parts.push(`Avanços: ${progress.map((p) => p.concept).join(", ")}.`);
  return parts.join(" ");
}

/** The deterministic writer: the same findings always produce byte-identical text. */
export function templateWrite(input: AnalysisInput, findings: Finding[]): WriterOutput {
  const insights: WriterInsight[] = findings.map((f) => {
    const { title, body } = TEXT[f.rule](f);
    const diagnosisText = whereSentence(input, f);
    return {
      concept_key: f.concept_key,
      rule: f.rule,
      severity: f.severity,
      title,
      body: diagnosisText ? `${body} ${diagnosisText}` : body,
      confidence: f.confidence,
      ...(reasoningFor(input, f) ? { reasoning: reasoningFor(input, f)! } : {}),
      evidence: f.evidence,
      suggestion: f.kind === "gap" ? suggestionFor(input, f) : null,
    };
  });
  return { summary: summaryFor(input, findings), insights };
}
