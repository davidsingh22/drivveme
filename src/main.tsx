import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initMedianOneSignalAuthLink } from "./lib/medianOneSignalAuthLink";

// Register Median OneSignal bridge (only activates inside Median wrapper)
initMedianOneSignalAuthLink();

createRoot(document.getElementById("root")!).render(<App />);
