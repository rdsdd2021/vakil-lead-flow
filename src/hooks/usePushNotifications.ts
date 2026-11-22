import { useState, useEffect, useCallback } from 'react';
import {
  isPushSupported,
  getPermissionState,
  getCurrentSubscription,
  subscribeToPush,
  unsubscribeFromPush,
} from '@/lib/pushNotifications';

export type PushStatus = 'unsupported' | 'prompt' | 'subscribed' | 'denied' | 'loading';

interface UsePushNotificationsReturn {
  /** Current status of push notifications */
  status: PushStatus;
  /** Whether push is supported in this browser */
  isSupported: boolean;
  /** Subscribe to push notifications */
  subscribe: () => Promise<boolean>;
  /** Unsubscribe from push notifications */
  unsubscribe: () => Promise<boolean>;
  /** Force refresh the subscription status */
  refresh: () => Promise<void>;
}

/**
 * React hook for managing push notification subscription.
 *
 * @param userId - The current user's Cognito ID
 * @param userRole - The current user's role (for server-side targeting)
 * @param isAuthenticated - Whether the user is logged in
 */
export function usePushNotifications(
  userId: string,
  userRole: string,
  isAuthenticated: boolean
): UsePushNotificationsReturn {
  const [status, setStatus] = useState<PushStatus>('loading');
  const isSupported = isPushSupported();

  /**
   * Guard: userId is set to a temporary placeholder string while the Cognito
   * session is still resolving. We must NOT subscribe with this value because
   * the backend would store the wrong user ID, making targeted pushes miss.
   */
  const isUserIdReady = isAuthenticated && !userId.startsWith('usr_loading_');

  // Check current subscription state
  const refresh = useCallback(async () => {
    if (!isSupported) {
      setStatus('unsupported');
      return;
    }

    const permission = getPermissionState();

    if (permission === 'denied') {
      setStatus('denied');
      return;
    }

    if (permission === 'granted') {
      const subscription = await getCurrentSubscription();
      setStatus(subscription ? 'subscribed' : 'prompt');
    } else {
      setStatus('prompt');
    }
  }, [isSupported]);

  // Initial check on mount and when auth state changes.
  // Only run once userId is resolved to avoid storing the loading placeholder.
  useEffect(() => {
    if (isUserIdReady) {
      refresh();
    }
  }, [isUserIdReady, refresh]);

  // Auto-subscribe if permission was previously granted (returning user).
  // Guard against the loading placeholder for the same reason as above.
  useEffect(() => {
    if (isUserIdReady && status === 'prompt' && getPermissionState() === 'granted') {
      // Permission was granted before but no active subscription — re-subscribe silently
      subscribeToPush(userId, userRole).then((sub) => {
        if (sub) setStatus('subscribed');
      });
    }
  }, [isUserIdReady, status, userId, userRole]);

  const subscribe = useCallback(async (): Promise<boolean> => {
    // Block subscription if push isn't supported, user isn't authenticated,
    // or the userId hasn't resolved from the loading placeholder yet.
    if (!isSupported || !isAuthenticated || !isUserIdReady) return false;

    setStatus('loading');
    try {
      const subscription = await subscribeToPush(userId, userRole);
      if (subscription) {
        setStatus('subscribed');
        return true;
      } else {
        // Check if permission was denied
        const permission = getPermissionState();
        setStatus(permission === 'denied' ? 'denied' : 'prompt');
        return false;
      }
    } catch (error) {
      console.error('[usePushNotifications] Subscribe failed:', error);
      setStatus('prompt');
      return false;
    }
  }, [isSupported, isAuthenticated, isUserIdReady, userId, userRole]);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!isAuthenticated) return false;

    setStatus('loading');
    try {
      const success = await unsubscribeFromPush(userId);
      setStatus(success ? 'prompt' : 'subscribed');
      return success;
    } catch (error) {
      console.error('[usePushNotifications] Unsubscribe failed:', error);
      setStatus('subscribed');
      return false;
    }
  }, [isAuthenticated, userId]);

  return {
    status,
    isSupported,
    subscribe,
    unsubscribe,
    refresh,
  };
}
