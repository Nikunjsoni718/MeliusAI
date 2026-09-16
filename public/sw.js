self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : '' };
  }

  const title = typeof payload.title === 'string' && payload.title ? payload.title : 'MeliusAI update';
  const options = {
    body: typeof payload.body === 'string' ? payload.body : 'You have a workspace update.',
    icon: '/favicon.png',
    badge: '/favicon.png',
    tag: typeof payload.tag === 'string' ? payload.tag : 'meliusai-notification',
    data: {
      actionUrl: typeof payload.action_url === 'string' && payload.action_url.startsWith('/') && !payload.action_url.startsWith('//')
        ? payload.action_url
        : '/vault',
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const actionUrl = event.notification.data?.actionUrl || '/vault';
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) {
      if ('focus' in client) {
        await client.focus();
        if ('navigate' in client) await client.navigate(actionUrl);
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(actionUrl);
  })());
});
