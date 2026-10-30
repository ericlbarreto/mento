import type { Metadata } from "next";
import "@mento/ui/tokens.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mento",
  description: "Tutor com IA que escreve e desenha no quadro, baseado nos materiais do professor.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
