import { render } from "solid-js/web";
import App from "./App";
import "./design-system/theme.css";
import "./styles.css";
import { applyThemeTokens } from "./design-system/tokens";

applyThemeTokens();

render(() => <App />, document.getElementById("root")!);
