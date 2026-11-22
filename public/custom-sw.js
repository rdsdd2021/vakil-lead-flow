/**
 * Custom Service Worker for Web Push Notifications
 * 
 * This runs in the background, separate from the main app.
 * It handles incoming push messages and notification clicks.
 * 
 * vite-plugin-pwa injects its own caching SW — this file adds push handlers on top.
 */

// Listen for push events from the server
self.addEventListener('push', function(event) {
  console.log('[SW] Push event received');

  let data = {
    title: 'VT CRM',
    body: 'You have a new notification',
    icon: '/pwa-192x192.png',
    badge: '/favicon.png',
    url: '/',
    tag: 'crm-notification',
  };

  // Parse the push payload (sent from Lambda via web-push)
  if (event.data) {
    try {
      const payload = event.data.json();
      data = {
        title: payload.title || data.title,
        body: payload.body || data.body,
        icon: payload.icon || data.icon,
        badge: payload.badge || data.badge,
        url: payload.url || data.url,
        tag: payload.tag || data.tag,
      };
    } catch (e) {
      // If payload is plain text
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    tag: data.tag,
    // Store the URL in notification data so we can use it on click
    data: {
      url: data.url,
    },
    // Vibrate pattern for mobile (vibrate, pause, vibrate)
    vibrate: [200, 100, 200],
    // Keep notification until user interacts with it
    requireInteraction: true,
    // Actions (optional — shows action buttons on the notification)
    actions: [
      { action: 'open', title: 'View' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };

  // Show the notification — waitUntil keeps the SW alive until done
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Handle notification click — navigate to the relevant page
self.addEventListener('notificationclick', function(event) {
  console.log('[SW] Notification clicked:', event.action);
  
  // Close the notification
  event.notification.close();

  // If user clicked "dismiss", do nothing
  if (event.action === 'dismiss') return;

  // Get the target URL from notification data
  const targetUrl = event.notification.data?.url || '/';
  
  // Navigate to the target URL
  // First check if the app is already open in a tab
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // If the app is already open, focus it and navigate
      for (const client of clientList) {
        if (client.url.includes(self.location.origin)) {
          client.focus();
          client.navigate(targetUrl);
          return;
        }
      }
      // If no existing window, open a new one
      return self.clients.openWindow(targetUrl);
    })
  );
});

// Handle notification close (user swiped away)
self.addEventListener('notificationclose', function(event) {
  console.log('[SW] Notification dismissed');
});
