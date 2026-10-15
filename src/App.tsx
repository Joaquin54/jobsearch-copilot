import { useState } from "react";
import type { ReactElement } from "react";

import "./App.css";

export default function App(): ReactElement {
  const [count, setCount] = useState<number>(0);

  return (
    <main className="app">
      <h1>Jobsearch Copilot</h1>
      <p>Navigate the doomer job market.</p>
      <button type="button" onClick={() => setCount((c: number) => c + 1)}>
        count is {count}
      </button>
    </main>
  );
}
