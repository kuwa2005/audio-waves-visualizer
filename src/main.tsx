import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import "./styles.css";
import { installSliderReset } from "./ui/sliderReset";

// StrictMode は使わない: 開発時の二重マウントで transferControlToOffscreen が二度呼ばれ失敗するため
createRoot(document.getElementById("root")!).render(<App />);
installSliderReset();
