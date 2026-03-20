import { StrictMode, createElement } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app.js";
import "./index.css";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(createElement(StrictMode, null, createElement(App)));
}
