import { render } from "preact";
import "../index.css";
import { createMediaCacheService } from "../services/MediaCacheService";
import { createSettingsService } from "../services/SettingsService";
import { createThemeService } from "../services/ThemeService";
import { App } from "./App";

const mount = document.getElementById("root");
if (!mount) {
  throw new Error("options/main: #root element not found");
}

const settingsService = createSettingsService();
const mediaCacheService = createMediaCacheService();
const themeService = createThemeService();

render(
  <App
    settingsService={settingsService}
    mediaCacheService={mediaCacheService}
    themeService={themeService}
  />,
  mount,
);
