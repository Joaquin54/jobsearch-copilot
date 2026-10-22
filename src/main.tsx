import React from "react";
import { createRoot } from "react-dom/client";

import Popup from "./popup/Popup.tsx";
import "./index.css";
import "./popup/popup.css";

const container: HTMLElement | null = document.getElementById("root");
if (!container) throw new Error("#root not found");

createRoot(container).render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>,
);
