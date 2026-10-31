import type { ComponentPropsWithRef } from "react";
import { cx, transition } from "./cx";

const base = "block rounded-(--radius-lg) border border-(--line) bg-(--card) p-5 text-left text-(--ink) shadow-(--shadow-card)";

type StaticCardProps = ComponentPropsWithRef<"div"> & { interactive?: false; selected?: never };
type InteractiveCardProps = ComponentPropsWithRef<"button"> & {
  /** Renders a <button>, lifts on hover; use for material and student pickers. */
  interactive: true;
  /** Blue outline + soft tint; exposed as aria-pressed. */
  selected?: boolean;
};
export type CardProps = StaticCardProps | InteractiveCardProps;

/** Raised card on the beige paper. */
export function Card(props: CardProps) {
  if (props.interactive) {
    const { interactive: _interactive, selected = false, type = "button", className, ...rest } = props;
    return (
      <button
        type={type}
        aria-pressed={selected}
        className={cx(
          base,
          "w-full cursor-pointer outline-none hover:-translate-y-0.5 hover:shadow-(--shadow-pop) active:translate-y-0",
          "focus-visible:shadow-[var(--focus-ring),var(--shadow-pop)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0",
          "transition-[background-color,border-color,box-shadow,transform] duration-(--dur-base) ease-(--ease-out)",
          selected && "border-(--mento-blue) bg-[color-mix(in_srgb,var(--mento-blue-soft)_45%,var(--card))] ring-1 ring-(--mento-blue)",
          className,
        )}
        {...rest}
      />
    );
  }
  const { interactive: _interactive, className, ...rest } = props;
  return <div className={cx(base, transition, className)} {...rest} />;
}
