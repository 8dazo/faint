import { ControllerPanel } from "@/components/controller-panel";
import { FaintLab } from "@/components/faint-lab";

export default function HomePage() {
  return (
    <>
      <FaintLab />
      <main className="lab-shell controller-shell">
        <ControllerPanel />
      </main>
    </>
  );
}
