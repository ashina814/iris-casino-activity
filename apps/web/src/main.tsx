import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.js";
import "./styles/app.css";
import "./styles/lux-casino.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
