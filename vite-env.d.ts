/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_COMMIT_SHA: string;
  readonly VITE_APP_BUILD_TIME: string;
  readonly VITE_GEMINI_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
<<<<<<< HEAD

// Vite PWA virtual module type shim
declare module "virtual:pwa-register/react" {
  import type { Dispatch, SetStateAction } from "react";
  export interface UseRegisterSWOptions {
    immediate?: boolean;
    onRegistered?: (
      registration: ServiceWorkerRegistration | undefined
    ) => void;
    onRegisterError?: (error: unknown) => void;
  }
  export function useRegisterSW(options?: UseRegisterSWOptions): {
    needRefresh: [boolean, Dispatch<SetStateAction<boolean>>];
    offlineReady: [boolean, Dispatch<SetStateAction<boolean>>];
    updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
  };
}
=======
>>>>>>> feat/admin-hardening-docs
