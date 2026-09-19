import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { initialLanguage } from "./i18n";
import App from "./App";

const root = createRoot(document.getElementById("root")!);
const render = () =>
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );

// Wait for the chosen language's strings before the first paint — on a local
// panel that is a few milliseconds, and it avoids showing English for a frame
// to someone who picked another language.
initialLanguage.then(render, render);
