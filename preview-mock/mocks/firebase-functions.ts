/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars -- mock signatures mirror the real SDK */
/**
 * Preview-mock stand-in for "firebase/functions". Callables resolve locally
 * with a success payload echoing the input; nothing leaves the browser.
 */
export function getFunctions(..._args: unknown[]) {
  return { region: "preview-mock" };
}

export function connectFunctionsEmulator() {}

export function httpsCallable(_functions: unknown, name: string) {
  return async (data: any) => {
    console.info(`[preview-mock] callable "${name}" handled locally`, data);
    return { data: { success: true, ...(data ?? {}) } };
  };
}

export class Functions {}
export class FunctionsError extends Error {}
