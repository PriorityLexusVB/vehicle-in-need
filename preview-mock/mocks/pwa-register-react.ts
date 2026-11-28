/* eslint-disable @typescript-eslint/no-unused-vars -- mock signatures mirror the real SDK */
/**
 * Preview-mock stand-in for "virtual:pwa-register/react". The preview build
 * ships no service worker, so the update banner never shows and nothing is
 * cached on a reviewer's phone.
 */
import { useState } from "react";

export function useRegisterSW(_options?: unknown) {
  const needRefresh = useState(false);
  const offlineReady = useState(false);
  return {
    needRefresh,
    offlineReady,
    updateServiceWorker: async (_reload?: boolean) => undefined,
  };
}
