import "@fontsource-variable/schibsted-grotesk";
import "@fontsource-variable/newsreader/opsz.css";
import "@fontsource-variable/newsreader/opsz-italic.css";
import "./styles.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { StatesPreview } from "./ui/StatesPreview";

const showStates = new URLSearchParams(location.search).has("states");

createRoot(document.getElementById("root")!).render(
  <StrictMode>{showStates ? <StatesPreview /> : <App />}</StrictMode>,
);
