"use client";
// Owner: Person 1. Materials tab: three plain counts, the list of PDFs (or the empty state) and the upload modal.
import Link from "next/link";
import { useState } from "react";
import { IconBook, IconCheck, IconChevronRight, IconFile, IconLayers, IconLightbulb, IconPlus, IconSearch, IconShield, IconUpload } from "../_components/icons";
import { MaterialTile } from "../_components/MaterialTile";
import { UploadMaterialModal } from "../_components/UploadMaterialModal";
import { Button, Card, Chip, MetricCard, buttonClass } from "../_components/ui";
import { relativeDate } from "../_lib/format";
import { useTeacher } from "../_lib/store";
import type { Material } from "../_lib/types";

function Status({ status }: { status: Material["status"] }) {
  if (status === "ready")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--mento-blue)] px-3 py-1.5 text-[13px] font-bold text-white">
        <IconCheck size={14} /> Pronto
      </span>
    );
  if (status === "failed") return <Chip tone="danger">Não foi possível ler</Chip>;
  return (
    <span className="flex w-36 flex-col gap-1.5" role="status">
      <span className="flex items-center gap-1.5 text-[13px] font-bold text-[var(--mento-blue)]">
        <span className="size-2 animate-pulse rounded-full bg-[var(--mento-blue)]" aria-hidden="true" />
        Preparando…
      </span>
      <span className="h-1.5 overflow-hidden rounded-full bg-[var(--blue-tint)]" aria-hidden="true">
        <span className="block h-full w-1/2 animate-pulse rounded-full bg-[var(--mento-blue)]" />
      </span>
    </span>
  );
}

const FEATURES = [
  { icon: <IconSearch size={18} />, title: "Cita a página", body: "O tutor mostra ao aluno de qual página tirou cada explicação, o que incentiva abrir o livro.", tag: "Fonte sempre visível" },
  { icon: <IconShield size={18} />, title: "Fica no seu conteúdo", body: "O tutor ensina a partir do que você enviou e avisa quando responde algo fora do material.", tag: "Alinhado à aula" },
  { icon: <IconLayers size={18} />, title: "Leitura automática", body: "Depois do envio, o PDF é preparado sozinho. Em poucos minutos ele já pode ser usado nas conversas.", tag: "Sem configuração" },
];

function EmptyState({ onUpload }: { onUpload: () => void }) {
  return (
    <Card className="overflow-hidden px-6 py-12 md:px-12">
      <div className="flex flex-col items-center text-center">
        <span className="flex size-40 items-center justify-center rounded-full bg-[var(--blue-tint)]/70">
          <img src="/brand/mascot.png" alt="" className="h-32 w-auto" />
        </span>
        <p className="-mt-4 rotate-[-2deg] bg-[var(--marker-yellow)] px-4 py-1 font-[family-name:var(--font-board)] text-[24px] shadow-[var(--shadow-card)]">Pronto para ler seus PDFs!</p>
        <Chip tone="danger" className="mt-6">
          <IconBook size={14} /> Turma 8º B
        </Chip>
        <h2 className="mt-3 max-w-xl text-[30px] font-extrabold leading-9 tracking-[-0.01em]">Nenhum material adicionado ainda para a turma</h2>
        <p className="mt-3 max-w-xl text-[17px] leading-7 text-[var(--ink-soft)]">
          Envie livros ou apostilas em PDF. O tutor usa esse conteúdo para ensinar e cita a página exata durante as conversas com os alunos.
        </p>
        <Button className="mt-7 px-6 py-3" onClick={onUpload}>
          <IconUpload size={18} /> Enviar primeiro material
        </Button>
      </div>
      <div className="mt-12 grid gap-4 md:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="rounded-2xl bg-[var(--paper)] p-5">
            <span className="flex size-10 items-center justify-center rounded-full bg-[var(--blue-tint)] text-[var(--mento-blue)]">{f.icon}</span>
            <h3 className="mt-4 text-[18px] font-bold">{f.title}</h3>
            <p className="mt-1 text-[15px] leading-6 text-[var(--ink-soft)]">{f.body}</p>
            <p className="mt-3 text-[13px] font-bold text-[var(--mento-blue)]">{f.tag}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function MaterialRow({ material }: { material: Material }) {
  return (
    <Card className="group flex flex-wrap items-center gap-5 p-5 transition-shadow hover:shadow-[var(--shadow-float)] md:flex-nowrap md:px-6">
      <MaterialTile subject={material.subject} />
      <div className="min-w-0 flex-1">
        <Link href={`/professor/materiais/${material.id}`} className="block truncate text-[19px] font-bold leading-7 hover:text-[var(--mento-blue)]">
          {material.title}
        </Link>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-[var(--ink-soft)]">
          <span className="flex items-center gap-1.5">
            <IconFile size={15} /> {material.pages} {material.pages === 1 ? "página" : "páginas"}
          </span>
          <span aria-hidden="true">•</span>
          <span>Enviado {relativeDate(material.created_at)}</span>
          <span aria-hidden="true">•</span>
          <span className="font-[family-name:var(--font-board)] text-[19px] text-[var(--mento-blue)]">{material.subject}</span>
        </p>
      </div>
      <div className="flex items-center gap-3 max-md:w-full max-md:justify-between">
        <Status status={material.status} />
        <Link href={`/professor/materiais/${material.id}`} className={buttonClass("secondary")}>
          Abrir PDF <IconChevronRight size={16} />
        </Link>
      </div>
    </Card>
  );
}

export function MaterialsView({ forceEmpty }: { forceEmpty: boolean }) {
  const store = useTeacher();
  const materials = forceEmpty ? [] : store.materials;
  const [uploading, setUploading] = useState(false);
  const ready = materials.filter((m) => m.status === "ready");
  const subjects = [...new Set(materials.map((m) => m.subject))];

  return (
    <>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <p className="flex items-center gap-2 text-[14px] font-bold text-[var(--mento-blue)]">
            <IconBook size={17} /> Acervo didático · Turma 8º B
          </p>
          <h1 className="mt-1 text-[36px] font-extrabold leading-[44px] tracking-[-0.02em]">Materiais</h1>
          <p className="mt-2 text-[17px] leading-7 text-[var(--ink-soft)]">Livros e apostilas em PDF que o tutor usa para explicar e citar a página exata.</p>
        </div>
        <Button className="px-6 py-3" onClick={() => setUploading(true)}>
          <IconPlus size={18} /> Enviar PDF
        </Button>
      </header>

      <section aria-label="Resumo do acervo" className="mb-10 grid gap-4 sm:grid-cols-3">
        <MetricCard label="Materiais" value={ready.length} unit={ready.length === 1 ? "pronto" : "prontos"} note={materials.length > ready.length ? `${materials.length - ready.length} sendo preparado` : "disponíveis para o tutor"} icon={<IconBook size={18} />} />
        <MetricCard label="Páginas" value={ready.reduce((n, m) => n + m.pages, 0)} unit="no acervo" note="que o tutor pode citar" icon={<IconFile size={18} />} />
        <MetricCard label="Matérias" value={subjects.length} unit={subjects.length === 1 ? "matéria" : "matérias"} note={subjects.join(", ") || "nenhuma ainda"} icon={<IconLayers size={18} />} tone="warn" />
      </section>

      {materials.length === 0 ? (
        <EmptyState onUpload={() => setUploading(true)} />
      ) : (
        <section aria-labelledby="files">
          <div className="mb-4 flex items-center gap-3">
            <h2 id="files" className="text-[22px] font-bold">
              Arquivos da turma
            </h2>
            <Chip>
              {materials.length} {materials.length === 1 ? "arquivo" : "arquivos"}
            </Chip>
          </div>
          <div className="space-y-4">
            {materials.map((m) => (
              <MaterialRow key={m.id} material={m} />
            ))}
          </div>
          <p className="mt-8 flex items-start gap-3 rounded-2xl bg-[var(--blue-tint)]/60 px-5 py-4 text-[15px] leading-6">
            <IconLightbulb size={20} className="mt-0.5 shrink-0 text-[var(--mento-blue)]" />
            <span>
              <strong>Dica:</strong> PDFs com sumário e títulos de capítulo claros ajudam o tutor a encontrar e citar a página certa quando os alunos fazem perguntas.
            </span>
          </p>
        </section>
      )}

      <UploadMaterialModal open={uploading} onClose={() => setUploading(false)} />
    </>
  );
}
