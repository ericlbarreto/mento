"use client";
// Owner: Person 1. Material viewer: the PDF in the browser's own viewer.
import Link from "next/link";
import { use } from "react";
import { IconArrowLeft, IconExternal } from "../../_components/icons";
import { Card, Chip, buttonClass } from "../../_components/ui";
import { relativeDate } from "../../_lib/format";
import { useTeacher } from "../../_lib/store";

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

  return (
    <>
      <Link href="/professor/materiais" className="mb-6 inline-flex items-center gap-2 text-[15px] font-bold text-[var(--mento-blue)] hover:underline">
        <IconArrowLeft size={18} /> Voltar para Materiais
      </Link>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[28px] font-extrabold leading-9">{material.title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[15px] text-[var(--ink-soft)]">
            {material.subject} · {material.pages} {material.pages === 1 ? "página" : "páginas"} · enviado {relativeDate(material.created_at)}
            {material.status !== "ready" && (
              <Chip tone="blue" dot>
                Preparando…
              </Chip>
            )}
          </p>
        </div>
        {material.file_url && (
          <a href={material.file_url} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary")}>
            <IconExternal size={18} /> Abrir em nova aba
          </a>
        )}
      </div>
      <Card className="overflow-hidden">
        {material.file_url ? (
          <iframe src={material.file_url} title={`PDF: ${material.title}`} className="h-[calc(100vh-220px)] min-h-[520px] w-full bg-[var(--paper-2)]" />
        ) : (
          <p className="p-10 text-center text-[var(--ink-soft)]">O arquivo deste material não está disponível.</p>
        )}
      </Card>
    </>
  );
}
