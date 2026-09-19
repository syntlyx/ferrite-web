import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";

const supported = ["en", "uk", "es", "de", "fr"] as const;
export type SupportedLang = (typeof supported)[number];

/**
 * Every language except the fallback is fetched when it is actually used.
 *
 * All five bundled together are ~156 KB of JSON in the entry chunk, of which a
 * reader needs exactly one — it was the largest single thing the panel loaded
 * before showing anything. English stays in the bundle so there is always
 * something to render (and so the fallback never needs a round trip); the rest
 * are separate chunks Vite emits from this map.
 */
const loaders: Record<Exclude<SupportedLang, "en">, () => Promise<{ default: object }>> = {
  uk: () => import("./uk.json"),
  es: () => import("./es.json"),
  de: () => import("./de.json"),
  fr: () => import("./fr.json"),
};

const isSupported = (value: string | null): value is SupportedLang =>
  value !== null && (supported as readonly string[]).includes(value);

const saved = localStorage.getItem("lang");
const detected = navigator.language.split("-")[0];
const lng: SupportedLang = isSupported(saved) ? saved : isSupported(detected) ? detected : "en";

i18n.use(initReactI18next).init({
  // Start on English so the first render has strings; `loadLanguage` below
  // switches to the chosen one as soon as its chunk is in.
  lng: "en",
  fallbackLng: "en",
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
});

/**
 * Make `code` the active language, fetching its strings first if this is the
 * first time it is used. Resolves once the switch has happened, so a caller can
 * await it instead of rendering a frame of the wrong language.
 */
export async function loadLanguage(code: SupportedLang): Promise<void> {
  if (code !== "en" && !i18n.hasResourceBundle(code, "translation")) {
    try {
      const strings = await loaders[code]();
      i18n.addResourceBundle(code, "translation", strings.default);
    } catch (e) {
      // A missing chunk is not worth a blank panel: English is already loaded.
      console.error(`Failed to load the ${code} translation:`, e);
      return;
    }
  }
  await i18n.changeLanguage(code);
}

/** The language this session starts in, once its strings are available. */
export const initialLanguage = loadLanguage(lng);

export default i18n;
