import React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { LorekeeperShell } from "./App.jsx";

flushSync(() => {
  createRoot(document.querySelector("#root")).render(
    <React.StrictMode>
      <LorekeeperShell />
    </React.StrictMode>,
  );
});

await import("./app.js");
