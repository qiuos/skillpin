import { ok } from "@skillpin/core";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./styles.css";

const application = ok({ name: "SkillPin" });

function App() {
  return (
    <main className="app-shell">
      <section aria-labelledby="app-title">
        <p className="eyebrow">P0 baseline</p>
        <h1 id="app-title">{application.value.name}</h1>
        <p>Local skill management starts here.</p>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
