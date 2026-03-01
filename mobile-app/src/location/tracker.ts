import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { appendQueue, clearSession, loadQueue, loadSession, saveQueue, setLastSyncAt } from '../storage/session';
import { syncPoints } from '../services/api';
import { TrackPoint } from '../types';

export const BACKGROUND_TASK_NAME = 'rt-background-location-task';

TaskManager.defineTask(BACKGROUND_TASK_NAME, async ({ data, error }) => {
  if (error) return;

  const session = await loadSession();
  if (!session?.isTracking) return;

  const locations = (data as any)?.locations as Location.LocationObject[] | undefined;
  if (!locations?.length) return;

  const points: TrackPoint[] = locations.map((entry) => ({
    lat: entry.coords.latitude,
    lng: entry.coords.longitude,
    timestamp: new Date(entry.timestamp).toISOString(),
  }));

  await appendQueue(points);
  await flushQueue();
});

export async function requestPermissions(): Promise<boolean> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return false;

  const bg = await Location.requestBackgroundPermissionsAsync();
  return bg.status === 'granted' || bg.canAskAgain;
}

export async function startBackgroundTracking(): Promise<void> {
  const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK_NAME);
  if (alreadyStarted) return;

  await Location.startLocationUpdatesAsync(BACKGROUND_TASK_NAME, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 60_000,
    distanceInterval: 0,
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.Other,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'RescueTrack attivo',
      notificationBody: 'Tracciamento posizione in corso per attività di soccorso',
    },
  });
}

export async function stopBackgroundTracking(): Promise<void> {
  const started = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK_NAME);
  if (started) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_TASK_NAME);
  }
}

export async function getInstantPoint(): Promise<TrackPoint | null> {
  try {
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      timestamp: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function flushQueue(): Promise<boolean> {
  const session = await loadSession();
  if (!session?.isTracking) return false;

  const queue = await loadQueue();
  if (queue.length === 0) return true;

  const ok = await syncPoints(session, queue);
  if (ok) {
    await saveQueue([]);
    await setLastSyncAt(new Date().toISOString());
  }
  return ok;
}

export async function resetMobileSession(): Promise<void> {
  await stopBackgroundTracking();
  await clearSession();
}
