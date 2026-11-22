/**
 * Web Push Notification Utilities
 * 
 * Handles browser push subscription lifecycle:
 * - Check support & permission
 * - Subscribe / unsubscribe via the Push API
 * - Sync subscription with backend (AWS API Gateway)
 */

// VAPID Public Key — loaded from environment variable or standard placeholder
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || 'BM_REPLACE_WITH_YOUR_VAPID_PUBLIC_KEY_IN_PRODUCTION';

/**
 * Convert a base64 VAPID key string to a Uint8Array for the Push API.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Check if the browser supports push notifications.
 */
export function isPushSupported(): boolean {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * Get the current notification permission state.
 */
export function getPermissionState(): NotificationPermission {
  if (!('Notification' in window)) return 'denied';
  return Notification.permission;
}

/**
 * Request notification permission from the user.
 * Returns the resulting permission state.
 */
export async function requestPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied';
  const result = await Notification.requestPermission();
  return result;
}

/**
 * Get the active service worker registration.
 */
async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.ready;
    return registration;
  } catch (error) {
    console.error('[Push] Failed to get service worker registration:', error);
    return null;
  }
}

/**
 * Get the current push subscription (if any).
 */
export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  const registration = await getServiceWorkerRegistration();
  if (!registration) return null;
  try {
    return await registration.pushManager.getSubscription();
  } catch (error) {
    console.error('[Push] Failed to get subscription:', error);
    return null;
  }
}

/**
 * Subscribe to push notifications.
 * 1. Requests permission (if not already granted)
 * 2. Creates a push subscription via the Push API
 * 3. Sends the subscription to our backend
 * 
 * @param userId - The Cognito user ID (sub or username)
 * @param userRole - The user's role for targeting notifications
 */
export async function subscribeToPush(userId: string, userRole: string): Promise<PushSubscription | null> {
  if (!isPushSupported()) {
    console.warn('[Push] Push notifications not supported in this browser');
    return null;
  }

  // Step 1: Request permission
  const permission = await requestPermission();
  if (permission !== 'granted') {
    console.warn('[Push] Notification permission denied');
    return null;
  }

  // Step 2: Get service worker and subscribe
  const registration = await getServiceWorkerRegistration();
  if (!registration) {
    console.error('[Push] No service worker registration found');
    return null;
  }

  try {
    // Check for existing subscription first
    let subscription = await registration.pushManager.getSubscription();
    
    if (!subscription) {
      // Create new subscription
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true, // Required: browser mandates showing a visible notification
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      console.log('[Push] New push subscription created');
    } else {
      console.log('[Push] Reusing existing push subscription');
    }

    // Step 3: Send subscription to backend
    await syncSubscriptionWithServer(userId, userRole, subscription);

    return subscription;
  } catch (error) {
    console.error('[Push] Failed to subscribe:', error);
    return null;
  }
}

/**
 * Unsubscribe from push notifications.
 * 1. Unsubscribes from the Push API
 * 2. Removes the subscription from our backend
 */
export async function unsubscribeFromPush(userId: string): Promise<boolean> {
  try {
    const subscription = await getCurrentSubscription();
    if (subscription) {
      await subscription.unsubscribe();
      console.log('[Push] Unsubscribed from push');
    }

    // Remove from backend
    await removeSubscriptionFromServer(userId);
    return true;
  } catch (error) {
    console.error('[Push] Failed to unsubscribe:', error);
    return false;
  }
}

/**
 * Save the push subscription locally.
 */
async function syncSubscriptionWithServer(
  userId: string, 
  userRole: string, 
  subscription: PushSubscription
): Promise<void> {
  try {
    localStorage.setItem(`vakil_push_sub_${userId}`, JSON.stringify({
      user_id: userId,
      user_role: userRole,
      subscription: subscription.toJSON(),
      updated_at: new Date().toISOString(),
    }));
    console.log('[Push] Subscription saved locally in browser');
  } catch (error) {
    console.error('[Push] Failed to save subscription locally:', error);
  }
}

/**
 * Trigger a local browser notification.
 *
 * @param target  - Target role or user ID
 * @param title   - Notification title
 * @param body    - Notification body text
 * @param url     - Deep-link URL inside the CRM
 * @param tag     - Unique tag
 *
 * Fire-and-forget: never throws, never blocks the caller.
 */
export function sendPushNotification({
  target,
  title,
  body,
  url = '/',
  tag = 'crm',
}: {
  target: string;
  title: string;
  body: string;
  url?: string;
  tag?: string;
}): void {
  try {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body,
        tag,
        icon: '/favicon.ico',
      });
    }
  } catch (err) {
    console.error('[Push] Local notification dispatch failed:', err);
  }
}

/**
 * Remove the push subscription from local storage.
 */
async function removeSubscriptionFromServer(userId: string): Promise<void> {
  try {
    localStorage.removeItem(`vakil_push_sub_${userId}`);
    console.log('[Push] Subscription removed from local storage');
  } catch (error) {
    console.error('[Push] Failed to remove subscription locally:', error);
  }
}
