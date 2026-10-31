"use client";
// Owner: Person 1. Left navigation: logo and the two tabs (Alunos, Materiais), plus the class card.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTeacher } from "../_lib/store";
import { IconBook, IconStudents } from "./icons";
import { cx } from "./ui";

const TABS = [
  { href: "/professor", label: "Alunos", icon: IconStudents, match: (p: string) => p === "/professor" || p.startsWith("/professor/alunos") },
  { href: "/professor/materiais", label: "Materiais", icon: IconBook, match: (p: string) => p.startsWith("/professor/materiais") },
];

export function Sidebar() {
  const pathname = usePathname();
  const { classContext, students } = useTeacher();
  return (
    <aside className="flex shrink-0 flex-col border-[var(--line)] bg-[var(--paper-2)] md:sticky md:top-0 md:h-screen md:w-[248px] md:border-r max-md:border-b">
      <div className="flex items-center justify-between gap-4 px-5 py-4 md:block md:pt-6">
        <Link href="/professor" className="block">
          <span className="flex items-center gap-2">
            <img src="/brand/logo-symbol.png" alt="" className="h-6 w-auto" />
            <span className="text-[24px] font-extrabold tracking-[-0.02em] text-[var(--ink)]">mento</span>
          </span>
          <span className="mt-1 block text-[13px] font-semibold text-[var(--ink-soft)] max-md:hidden">Painel do professor</span>
        </Link>
      </div>
      <nav aria-label="Seções do painel" className="flex gap-1 px-3 pb-3 md:mt-4 md:flex-col">
        {TABS.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex items-center gap-3 rounded-xl px-4 py-2.5 text-[15px] font-semibold transition-colors",
                active ? "bg-[var(--card)] text-[var(--mento-blue)] shadow-[var(--shadow-card)]" : "text-[var(--ink)] hover:bg-[var(--card)]/60",
              )}
            >
              <Icon />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto hidden p-3 md:block">
        <div className="rounded-xl border border-[var(--line)] bg-[var(--card)] px-4 py-3">
          <p className="text-[15px] font-bold">Turma · {classContext.grade_level}</p>
          <p className="text-[13px] text-[var(--ink-soft)]">{students.length} alunos</p>
        </div>
      </div>
    </aside>
  );
}
