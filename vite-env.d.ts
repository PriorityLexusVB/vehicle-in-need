/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_COMMIT_SHA: string;
  readonly VITE_APP_BUILD_TIME: string;
  readonly VITE_GEMINI_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
