// Owner: Person 1. Teacher shell: tabs Alunos / Materiais.
import Link from "next/link";

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <nav className="flex gap-6 border-b border-[var(--line)] px-8 py-4">
        <Link href="/professor">Alunos</Link>
        <Link href="/professor/materiais">Materiais</Link>
      </nav>
      <div className="p-8">{children}</div>
    </div>
  );
}
