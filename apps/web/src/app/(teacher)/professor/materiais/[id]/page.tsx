"use client";
// Owner: Person 1. Material viewer: the PDF in the browser's own viewer, with its details beside it.
import Link from "next/link";
import { use } from "react";
import { IconArrowLeft, IconCheck, IconExternal, IconShield } from "../../_components/icons";
import { MaterialTile } from "../../_components/MaterialTile";
import { Card, Chip, buttonClass } from "../../_components/ui";
import { relativeDate } from "../../_lib/format";
import { useTeacher } from "../../_lib/store";
import { SUBJECT } from "../../_lib/types";

export default function MaterialViewer({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const material = useTeacher().materials.find((m) => m.id === id);

  if (!material) {
    return (
      <div className="py-20 text-center">
        <p className="text-xl font-bold">Material não encontrado</p>
        <Link href="/professor/materiais" className="mt-4 inline-block font-bold text-[var(--mento-blue)]">
          Voltar para Materiais
        </Link>
      </div>
    );
  }

  const ready = material.status === "ready";
  const details = [
    ["Matéria", SUBJECT],
    ["Páginas", material.pages === 0 ? "—" : String(material.pages)],
    ["Enviado", relativeDate(material.created_at)],
  ];

  return (
    <>
      <Link href="/professor/materiais" className="mb-6 inline-flex items-center gap-2 text-[15px] font-bold text-[var(--mento-blue)] hover:underline">
        <IconArrowLeft size={18} /> Voltar para Materiais
      </Link>
      <div className="mb-6 flex flex-wrap items-center gap-5">
        <MaterialTile size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="text-[30px] font-extrabold leading-9 tracking-[-0.01em]">{material.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {ready ? (
              <Chip tone="blue">
                <IconCheck size={14} /> Pronto para o tutor
              </Chip>
            ) : (
              <Chip tone="blue" dot>
                Preparando…
              </Chip>
            )}
            <Chip>
              {material.pages === 0 ? "páginas: calculando" : `${material.pages} ${material.pages === 1 ? "página" : "páginas"}`}
            </Chip>
          </div>
        </div>
        {material.file_url && (
          <a href={material.file_url} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary")}>
            <IconExternal size={18} /> Abrir em nova aba
          </a>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="overflow-hidden">
          {material.file_url ? (
            <iframe src={material.file_url} title={`PDF: ${material.title}`} className="h-[calc(100vh-260px)] min-h-[560px] w-full bg-[var(--paper-2)]" />
          ) : (
            <p className="p-10 text-center text-[var(--ink-soft)]">O arquivo deste material não está disponível.</p>
          )}
        </Card>
        <aside className="space-y-4">
          <Card className="p-5">
            <h2 className="text-[17px] font-bold">Sobre este material</h2>
            <dl className="mt-3 divide-y divide-[var(--line)] text-[15px]">
              {details.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 py-2.5">
                  <dt className="text-[var(--ink-soft)]">{k}</dt>
                  <dd className="text-right font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card className="p-5">
            <p className="font-[family-name:var(--font-board)] text-[21px] text-[var(--accent-ink)]">como o tutor usa</p>
            <p className="mt-1 text-[15px] leading-6">
              Quando um aluno pergunta sobre este conteúdo, o tutor explica a partir deste PDF e mostra a página, como <span className="whitespace-nowrap rounded-full bg-[var(--blue-tint)] px-2 py-0.5 text-[13px] font-bold text-[var(--mento-blue)]">Livro · p. 4</span>.
            </p>
            <p className="mt-3 flex items-start gap-2 text-[13px] leading-5 text-[var(--ink-soft)]">
              <IconShield size={14} className="mt-0.5 shrink-0" />
              Se a resposta vier de fora do material, o tutor avisa o aluno.
            </p>
          </Card>
        </aside>
      </div>
    </>
  );
}
