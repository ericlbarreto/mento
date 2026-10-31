"use client";
// Owner: Person 1. Materials list (or the empty state) and the upload modal.
import Link from "next/link";
import { useState } from "react";
import { IconBook, IconChevronRight, IconFile, IconPlus, IconUpload } from "../_components/icons";
import { UploadMaterialModal } from "../_components/UploadMaterialModal";
import { Button, Card, Chip, PageHeader } from "../_components/ui";
import { relativeDate } from "../_lib/format";
import { useTeacher } from "../_lib/store";
import type { Material } from "../_lib/types";

function StatusChip({ status }: { status: Material["status"] }) {
  if (status === "ready") return null;
  if (status === "failed") return <Chip tone="danger">Não foi possível ler</Chip>;
  return (
    <Chip tone="blue" dot>
      Preparando…
    </Chip>
  );
}

function EmptyState({ onUpload }: { onUpload: () => void }) {
  return (
    <Card className="flex flex-col items-center px-6 py-14 text-center">
      <img src="/brand/mascot.png" alt="" className="h-32 w-auto" />
      <p className="-mt-2 rotate-[-2deg] bg-[var(--marker-yellow)] px-3 py-1 font-[family-name:var(--font-board)] text-[22px]">Pronto para ler seus PDFs!</p>
      <h2 className="mt-6 text-[26px] font-extrabold leading-8">Nenhum material ainda</h2>
      <p className="mt-2 max-w-lg text-[16px] leading-7 text-[var(--ink-soft)]">
        Envie livros ou apostilas em PDF. O tutor usa esse conteúdo para ensinar e mostra aos alunos a página de onde tirou cada explicação.
      </p>
      <Button className="mt-6" onClick={onUpload}>
        <IconUpload size={18} /> Enviar primeiro material
      </Button>
    </Card>
  );
}

export function MaterialsView({ forceEmpty }: { forceEmpty: boolean }) {
  const store = useTeacher();
  const materials = forceEmpty ? [] : store.materials;
  const [uploading, setUploading] = useState(false);

  return (
    <>
      <PageHeader
        title="Materiais"
        description="Os PDFs que o tutor usa como base para explicar e citar a página."
        actions={
          materials.length > 0 && (
            <Button onClick={() => setUploading(true)}>
              <IconPlus size={18} /> Enviar PDF
            </Button>
          )
        }
      />

      {materials.length === 0 ? (
        <EmptyState onUpload={() => setUploading(true)} />
      ) : (
        <Card className="divide-y divide-[var(--line)] overflow-hidden">
          {materials.map((m) => (
            <Link key={m.id} href={`/professor/materiais/${m.id}`} className="group flex items-center gap-4 px-6 py-5 hover:bg-[var(--paper)]">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[var(--blue-tint)] text-[var(--mento-blue)]">
                {m.subject === "História" ? <IconBook size={22} /> : <IconFile size={22} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[17px] font-bold">{m.title}</span>
                <span className="block text-[14px] text-[var(--ink-soft)]">
                  {m.subject} · {m.pages} {m.pages === 1 ? "página" : "páginas"} · enviado {relativeDate(m.created_at)}
                </span>
              </span>
              <StatusChip status={m.status} />
              <span className="flex items-center gap-1 text-[14px] font-bold text-[var(--mento-blue)] max-sm:hidden">
                Abrir <IconChevronRight size={16} />
              </span>
            </Link>
          ))}
        </Card>
      )}

      <UploadMaterialModal open={uploading} onClose={() => setUploading(false)} />
    </>
  );
}
