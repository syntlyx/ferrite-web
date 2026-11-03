import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { initialLanguage } from "./i18n";
import App from "./App";

// The demo signs itself in: its API lives in the page and has no password.
if (__FERRITE_DEMO__) localStorage.setItem("ferrite_token", "demo");

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
