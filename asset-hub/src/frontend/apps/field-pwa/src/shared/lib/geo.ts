// geo.ts — Geolocation wrapper for field app
import type { GeoStamp } from '@asset-hub/core-offline';

export async function getCurrentPosition(): Promise<GeoStamp> {
  const capturedAtMs = Date.now();
  const capturedAtIso = new Date().toISOString();

  if (!navigator.geolocation) {
    return {
      latitude: 0,
      longitude: 0,
      accuracyM: 0,
      capturedAtIso,
      capturedAtMs,
      status: 'unavailable',
    };
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracyM: pos.coords.accuracy,
          capturedAtIso,
          capturedAtMs,
          status: 'ok',
        });
      },
      (err) => {
        const status = err.code === 1 ? 'denied' : err.code === 3 ? 'timeout' : 'unavailable';
        resolve({
          latitude: 0,
          longitude: 0,
          accuracyM: 0,
          capturedAtIso,
          capturedAtMs,
          status,
        });
      },
      { timeout: 8000, maximumAge: 0, enableHighAccuracy: true },
    );
  });
}
