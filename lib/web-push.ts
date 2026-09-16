'use client';

export const WEB_PUSH_PREFERENCE_KEY = 'meliusai-browser-notification-preference';

type WebPushPreference = 'enabled' | 'later' | 'disabled';

function backendBaseUrl() {
  return process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/$/, '') ?? '';
}

function supportsWebPush() {
  return typeof window !== 'undefined' && window.isSecureContext && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
}

function base64UrlToUint8Array(value: string) {
  const padded = value.padEnd(Math.ceil(value.length / 4) * 4, '=');
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  const binary = window.atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function getRegistration() {
  const existing = await navigator.serviceWorker.getRegistration('/');
  return existing ?? navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
}

async function getVapidPublicKey() {
  const baseUrl = backendBaseUrl();
  if (!baseUrl) throw new Error('Web Push is not configured for this environment.');
  const response = await fetch(`${baseUrl}/api/web-push/vapid-public-key`, { cache: 'no-store' });
  const payload = (await response.json().catch(() => null)) as { publicKey?: unknown; detail?: unknown } | null;
  if (!response.ok || typeof payload?.publicKey !== 'string' || !payload.publicKey.trim()) {
    throw new Error(typeof payload?.detail === 'string' ? payload.detail : 'Web Push is unavailable right now.');
  }
  return payload.publicKey.trim();
}

async function persistSubscription(subscription: PushSubscription) {
  const json = subscription.toJSON();
  const response = await fetch('/api/web-push/subscriptions', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(json),
  });
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) throw new Error(payload?.error ?? 'Unable to save this browser for Web Push.');
}

async function subscribeGrantedBrowser() {
  const registration = await getRegistration();
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    const publicKey = await getVapidPublicKey();
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(publicKey),
    });
  }
  await persistSubscription(subscription);
  window.localStorage.setItem(WEB_PUSH_PREFERENCE_KEY, 'enabled');
  return subscription;
}

export function getWebPushPreference(): WebPushPreference | null {
  if (typeof window === 'undefined') return null;
  const preference = window.localStorage.getItem(WEB_PUSH_PREFERENCE_KEY);
  return preference === 'enabled' || preference === 'later' || preference === 'disabled' ? preference : null;
}

export async function enableWebPush() {
  if (!supportsWebPush()) throw new Error('Web Push is not supported by this browser or connection.');
  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission();
  if (permission !== 'granted') {
    window.localStorage.setItem(WEB_PUSH_PREFERENCE_KEY, 'later');
    throw new Error('Browser notification permission was not granted.');
  }
  return subscribeGrantedBrowser();
}

export async function syncPreviouslyEnabledWebPush() {
  if (!supportsWebPush() || getWebPushPreference() !== 'enabled' || Notification.permission !== 'granted') return null;
  return subscribeGrantedBrowser();
}

export async function getWebPushStatus() {
  if (!supportsWebPush()) return { supported: false, enabled: false, permission: 'unsupported' as const };
  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = registration ? await registration.pushManager.getSubscription() : null;
  return { supported: true, enabled: Boolean(subscription), permission: Notification.permission, subscription };
}

export async function disableWebPush() {
  if (!supportsWebPush()) return;
  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = registration ? await registration.pushManager.getSubscription() : null;
  if (subscription) {
    await fetch('/api/web-push/subscriptions', {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
    await subscription.unsubscribe();
  }
  window.localStorage.setItem(WEB_PUSH_PREFERENCE_KEY, 'disabled');
}
