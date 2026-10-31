import type { ComponentPropsWithRef } from "react";
import { cx } from "./cx";

export type FooterProps = Omit<ComponentPropsWithRef<"footer">, "children"> & { logoSrc?: string };

/** Static student footer (Stitch): logo, tagline and the handwritten "Caderno de Estudos" signature. */
export function Footer({ logoSrc = "/brand/logo.png", className, ...rest }: FooterProps) {
  return (
    <footer className={cx("w-full border-t border-(--line) bg-(--paper-2) py-6", className)} {...rest}>
      <div className="flex w-full flex-col items-center justify-between gap-3 px-4 text-center sm:flex-row sm:px-8 sm:text-left">
        <p className="flex flex-wrap items-center justify-center gap-2 text-sm text-(--ink-soft)">
          <img src={logoSrc} alt="Mento" className="h-5 w-auto" />
          <span aria-hidden="true">·</span>
          <span>Ambiente de Aprendizado com Inteligência Pedagógica</span>
        </p>
        <p className="font-(family-name:--font-board) text-[22px] leading-tight text-(--ink-soft)">
          Caderno de Estudos · Ensino Fundamental II
        </p>
      </div>
    </footer>
  );
}
