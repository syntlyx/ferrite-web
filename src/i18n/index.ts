import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import uk from "./uk.json";
import es from "./es.json";
import de from "./de.json";
import fr from "./fr.json";

const saved = localStorage.getItem("lang");
const supported = ["en", "uk", "es", "de", "fr"] as const;
const detected = navigator.language.split("-")[0];
type SupportedLang = (typeof supported)[number];
const savedLang =
  saved && supported.includes(saved as SupportedLang) ? (saved as SupportedLang) : null;
const detectedLang = supported.includes(detected as SupportedLang)
  ? (detected as SupportedLang)
  : null;
const lng = savedLang ?? detectedLang ?? "en";

i18n.use(initReactI18next).init({
  lng,
  fallbackLng: "en",
  resources: {
    en: { translation: en },
    uk: { translation: uk },
    es: { translation: es },
    de: { translation: de },
    fr: { translation: fr },
  },
  interpolation: { escapeValue: false },
});

export default i18n;
