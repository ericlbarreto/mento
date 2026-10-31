"use client";

// Owner: Person 2. Controls around the orb (Stitch S3): bottom-left pause/resume, mute and captions; bottom-right
// the keyboard (opens and focuses the chat) and the second mascot button (inert, no defined purpose, plan §6).
import { IconButton, IconCaptions, IconKeyboard, IconPause, IconPlay, IconVolume, cx } from "@mento/ui";

const group = "pointer-events-auto flex items-center gap-1 rounded-(--radius-pill) bg-(--card) p-1.5 shadow-(--shadow-float)";

/** Pressed toggles get the soft blue fill of the Stitch CC button. */
const pressedClass = (on: boolean) => (on ? "bg-(--mento-blue-soft) text-(--mento-blue-strong) border-transparent" : "border-transparent");

export function PlaybackControls({
  paused,
  onTogglePause,
  muted,
  onToggleMute,
  captionsOn,
  onToggleCaptions,
}: {
  paused: boolean;
  onTogglePause: () => void;
  muted: boolean;
  onToggleMute: () => void;
  captionsOn: boolean;
  onToggleCaptions: () => void;
}) {
  return (
    <div className={group} role="group" aria-label="Controles da aula">
      <IconButton aria-label={paused ? "Continuar a aula" : "Pausar a aula"} variant="ghost" onClick={onTogglePause}>
        {paused ? <IconPlay /> : <IconPause />}
      </IconButton>
      <IconButton
        aria-label="Silenciar o tutor"
        aria-pressed={muted}
        variant="ghost"
        onClick={onToggleMute}
        className={cx("relative", pressedClass(muted))}
      >
        <IconVolume />
        {muted && <span aria-hidden="true" className="absolute h-0.5 w-6 rotate-45 rounded-full bg-current" />}
      </IconButton>
      <IconButton aria-label="Legendas" aria-pressed={captionsOn} variant="ghost" onClick={onToggleCaptions} className={pressedClass(captionsOn)}>
        <IconCaptions />
      </IconButton>
    </div>
  );
}

export function InputControls({ onKeyboard }: { onKeyboard: () => void }) {
  return (
    <div className={group} role="group" aria-label="Escrever para o tutor">
      <IconButton aria-label="Escrever uma mensagem" variant="ghost" onClick={onKeyboard}>
        <IconKeyboard />
      </IconButton>
      <IconButton inert aria-label="Mento" variant="primary" className="p-1.5">
        <img src="/brand/mascot.png" alt="" className="size-full object-contain" />
      </IconButton>
    </div>
  );
}
