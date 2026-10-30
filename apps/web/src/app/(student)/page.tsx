// Owner: Person 2. Start screen: choose student + material, then open /session/[id].
import { ApiStatus } from "./ApiStatus";

export default function StartPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <img src="/brand/logo.png" alt="Mento" className="h-16" />
      <img src="/brand/mascot/float.gif" alt="" className="h-40 w-40" />
      <p>Tela inicial (placeholder)</p>
      <ApiStatus />
    </main>
  );
}
