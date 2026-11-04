/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkOnly } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { StaleWhileRevalidate } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

registerRoute(
  ({ url }) => url.pathname.startsWith('/api/v1/'),
  new NetworkOnly(),
);

registerRoute(
  ({ request, url }) =>
    request.destination === 'image' ||
    request.destination === 'video' ||
    url.pathname.includes('/uploads/'),
  new StaleWhileRevalidate({
    cacheName: 'media-cache',
    plugins: [
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 }),
    ],
  }),
);

self.addEventListener('sync', ((event: any) => {
  if (event.tag === 'outbox-drain') {
    event.waitUntil(drainFromServiceWorker({ jsonOnly: true }));
  }
}) as EventListener);

self.addEventListener('periodicsync', ((event: any) => {
  if (event.tag === 'field-periodic-sync') {
    event.waitUntil(drainFromServiceWorker({ jsonOnly: true }));
  }
}) as EventListener);

async function drainFromServiceWorker(opts: { jsonOnly: boolean }): Promise<void> {
  const clients = await self.clients.matchAll({ type: 'window' });
  for (const client of clients) {
    client.postMessage({ type: 'SW_DRAIN_REQUESTED', jsonOnly: opts.jsonOnly });
  }
}

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('install', () => {});

self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(self.clients.claim());
});