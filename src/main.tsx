import { createRoot } from "react-dom/client";
import App from "./app/CloudApp";
import "./styles.css";
import {
  AppearanceProvider,
  applyAppearance,
  readAppearance,
} from "./app/appearance";
applyAppearance(readAppearance());
createRoot(document.getElementById("root")!).render(
  <AppearanceProvider>
    <App />
  </AppearanceProvider>,
);
