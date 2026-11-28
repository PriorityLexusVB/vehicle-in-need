/**
 * Preview-mock stand-in for "firebase/app". No network, no real project.
 */
const apps: Array<{ name: string; options: Record<string, unknown>; automaticDataCollectionEnabled: boolean }> = [];

export function initializeApp(options: Record<string, unknown> = {}, name = "[DEFAULT]") {
  const app = { name, options, automaticDataCollectionEnabled: false };
  apps.push(app);
  return app;
}

export function getApps() {
  return apps;
}

export function getApp(name = "[DEFAULT]") {
  const app = apps.find((candidate) => candidate.name === name);
  if (!app) throw new Error(`Firebase app "${name}" has not been initialized (preview mock).`);
  return app;
}

export function deleteApp() {
  return Promise.resolve();
}

export const SDK_VERSION = "preview-mock";
