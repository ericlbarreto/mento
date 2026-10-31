"use client";
// Owner: Person 1. Upload a PDF: drop zone and title (defaults to the file name). The teacher has one subject.
import { useState } from "react";
import { useTeacher } from "../_lib/store";
import { IconFile, IconUpload } from "./icons";
import { Button, Modal, cx, inputClass } from "./ui";

const MAX_MB = 50;

export function UploadMaterialModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { uploadMaterial } = useTeacher();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [sending, setSending] = useState(false);

  const reset = () => {
    setFile(null);
    setTitle("");
    setError(null);
  };
  const close = () => {
    reset();
    onClose();
  };

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) return setError("Envie um arquivo PDF.");
    if (f.size > MAX_MB * 1024 * 1024) return setError(`O arquivo passa de ${MAX_MB} MB.`);
    setError(null);
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.pdf$/i, ""));
  };

  return (
    <Modal open={open} onClose={close} title="Enviar material" description="Livros, apostilas ou textos em PDF que o tutor usa para explicar e citar a página.">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!file) return;
          setSending(true);
          try {
            await uploadMaterial({ title: title.trim() || file.name, file });
            close();
          } catch {
            setError("Não foi possível enviar. Tente de novo.");
          } finally {
            setSending(false);
          }
        }}
        className="space-y-5"
      >
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pick(e.dataTransfer.files[0]);
          }}
          className={cx(
            "flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-[var(--focus)]",
            dragging ? "border-[var(--mento-blue)] bg-[var(--blue-tint)]" : "border-[var(--line)] bg-[var(--paper)] hover:border-[var(--mento-blue)]",
          )}
        >
          <input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
          {file ? (
            <>
              <span className="flex size-14 items-center justify-center rounded-full bg-[var(--blue-tint)] text-[var(--mento-blue)]">
                <IconFile size={26} />
              </span>
              <span className="mt-3 max-w-full truncate text-[16px] font-bold">{file.name}</span>
              <span className="text-[13px] text-[var(--ink-soft)]">{file.size < 1024 * 1024 ? `${Math.max(1, Math.round(file.size / 1024))} KB` : `${(file.size / 1024 / 1024).toFixed(1)} MB`} · clique para trocar</span>
            </>
          ) : (
            <>
              <span className="flex size-14 items-center justify-center rounded-full bg-[var(--blue-tint)] text-[var(--mento-blue)]">
                <IconUpload size={26} />
              </span>
              <span className="mt-3 text-[17px] font-bold">Arraste um PDF aqui ou clique para escolher</span>
              <span className="mt-1 text-[14px] text-[var(--ink-soft)]">PDF com texto, até {MAX_MB} MB</span>
            </>
          )}
        </label>
        {error && (
          <p role="alert" className="text-[14px] font-semibold text-[var(--danger)]">
            {error}
          </p>
        )}

        <div>
          <label htmlFor="mat-title" className="mb-2 block text-[15px] font-bold">
            Título do material
          </label>
          <input id="mat-title" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder="Ex.: Roma Antiga · Capítulo 4" />
          <p className="mt-1 text-[13px] text-[var(--ink-soft)]">É o nome que aparece para os alunos quando o tutor cita uma página.</p>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={close}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!file || sending}>
            {sending ? "Enviando…" : "Enviar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
