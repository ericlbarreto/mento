// Owner: Person 2. Start screen: choose student + material (+ optional topic), then open /session/[id].
import { StartScreen } from "./_components/start/StartScreen";
import { ApiStatus } from "./ApiStatus";

export default function StartPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto w-full max-w-5xl px-4 pt-6 sm:px-8">
        <img src="/brand/logo.png" alt="Mento" width={144} height={72} className="h-auto w-36" />
      </header>
      <main className="flex flex-1 flex-col">
        <StartScreen />
      </main>
      <footer className="mx-auto w-full max-w-5xl px-4 pb-6 sm:px-8">
        <ApiStatus />
      </footer>
    </div>
  );
}
