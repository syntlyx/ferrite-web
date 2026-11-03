/// <reference types="vite/client" />

declare module "*.css";

/** True only in the demo build (FERRITE_DEMO=1), where the API runs in the page. */
declare const __FERRITE_DEMO__: boolean;
