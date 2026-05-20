import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import uk from "./uk.json";

const saved = localStorage.getItem("lang");
const lng = saved === "en" || saved === "uk" ? saved : "en";

i18n.use(initReactI18next).init({
  lng,
  fallbackLng: "en",
  resources: {
    en: { translation: en },
    uk: { translation: uk },
  },
  interpolation: { escapeValue: false },
});

export default i18n;
