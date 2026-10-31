"use client";
// Owner: Person 1. Top bar: breadcrumb of the current page and the class it belongs to.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTeacher } from "../_lib/store";
import { IconHome } from "./icons";

export function TopBar() {
  const pathname = usePathname();
  const { students, materials, classContext } = useTeacher();
  const [, , section, id] = pathname.split("/");

  const crumbs: { label: string; href?: string }[] = [];
  if (section === "materiais") {
    crumbs.push({ label: "Materiais", href: id ? "/professor/materiais" : undefined });
    if (id) crumbs.push({ label: materials.find((m) => m.id === id)?.title ?? "Material" });
  } else {
    crumbs.push({ label: "Alunos", href: id ? "/professor" : undefined });
    if (id) crumbs.push({ label: students.find((s) => s.id === id)?.name ?? "Aluno" });
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-[var(--line)] bg-[var(--paper)]/85 px-4 backdrop-blur-xl md:px-10">
      <nav aria-label="Você está em" className="flex min-w-0 items-center gap-2 text-[15px] text-[var(--ink-soft)]">
        <IconHome size={18} />
        <span className="max-sm:hidden">Painel pedagógico</span>
        {crumbs.map((c) => (
          <span key={c.label} className="flex min-w-0 items-center gap-2">
            <span aria-hidden="true">/</span>
            {c.href ? (
              <Link href={c.href} className="hover:text-[var(--ink)] hover:underline">
                {c.label}
              </Link>
            ) : (
              <span className="truncate font-bold text-[var(--ink)]" aria-current="page">
                {c.label}
              </span>
            )}
          </span>
        ))}
      </nav>
      <span className="flex shrink-0 items-center gap-2 rounded-full bg-[var(--blue-tint)] px-3 py-1.5 text-[13px] font-bold text-[var(--mento-blue)]">
        <span className="size-2 rounded-full bg-[var(--mento-blue)]" aria-hidden="true" />
        Turma · {classContext.grade_level}
      </span>
    </header>
  );
}
