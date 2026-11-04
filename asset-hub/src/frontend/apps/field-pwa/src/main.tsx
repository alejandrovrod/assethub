import ReactDOM from "react-dom/client";
import { App } from "./App";
import { Providers } from "./app/providers";
import "./index.css";

const rootElement = document.getElementById("root");
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <Providers>
      <App />
    </Providers>,
  );
}
