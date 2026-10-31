// Owner: Person 1. Teacher shell: sidebar with the tabs Alunos / Materiais and the mock workspace store.
import { Caveat, Nunito_Sans } from "next/font/google";
import { Sidebar } from "./_components/Sidebar";
import { TopBar } from "./_components/TopBar";
import { TeacherStoreProvider } from "./_lib/store";
import "./teacher.css";

const ui = Nunito_Sans({ subsets: ["latin"], variable: "--font-teacher", display: "swap" });
const hand = Caveat({ subsets: ["latin"], variable: "--font-hand", display: "swap" });

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return (
    <TeacherStoreProvider>
      <div
        className={`teacher ${ui.variable} ${hand.variable} flex min-h-screen flex-col bg-[var(--paper)] text-[var(--ink)] md:flex-row`}
        style={{ "--font-board": "var(--font-hand), cursive" } as React.CSSProperties}
      >
        <Sidebar />
        <div className="min-w-0 flex-1">
          <TopBar />
          <main className="px-4 py-8 md:px-10 md:py-10">
            <div className="mx-auto max-w-[1180px]">{children}</div>
          </main>
        </div>
      </div>
    </TeacherStoreProvider>
  );
}
