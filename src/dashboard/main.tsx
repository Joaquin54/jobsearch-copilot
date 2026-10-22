import React from "react";
import { createRoot } from "react-dom/client";

import Dashboard from "./Dashboard.tsx";
import "./tokens.css";
import "./dashboard.css";

const container: HTMLElement | null = document.getElementById("root");
if (!container) throw new Error("#root not found");

// Dev-only: a seeder for the 5k-record performance pass. import.meta.env.DEV is
// statically false in a production build, so Rollup drops the whole branch and
// the module never reaches dist/.
// The seed request is read before React mounts, because the table's URL sync
// clears params it does not own as soon as it commits.
const seedRequest = import.meta.env.DEV
  ? Number(new URLSearchParams(window.location.search).get("seed"))
  : 0;

if (import.meta.env.DEV) {
  void import("./dev/seed.ts").then((module): void => {
    module.installSeeder(seedRequest);
  });
}

createRoot(container).render(
  <React.StrictMode>
    <Dashboard />
  </React.StrictMode>,
);
