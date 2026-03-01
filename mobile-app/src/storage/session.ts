import AsyncStorage from '@react-native-async-storage/async-storage';
import { TrackPoint, TrackingSession } from '../types';

const SESSION_KEY = 'rt_mobile_session';
const QUEUE_KEY = 'rt_mobile_queue';
const LAST_SYNC_KEY = 'rt_mobile_last_sync';

export async function saveSession(session: TrackingSession): Promise<void> {
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export async function loadSession(): Promise<TrackingSession | null> {
  const raw = await AsyncStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TrackingSession;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await AsyncStorage.multiRemove([SESSION_KEY, QUEUE_KEY, LAST_SYNC_KEY]);
}

export async function loadQueue(): Promise<TrackPoint[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as TrackPoint[];
  } catch {
    return [];
  }
}

export async function saveQueue(points: TrackPoint[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(points));
}

export async function appendQueue(points: TrackPoint[]): Promise<void> {
  const current = await loadQueue();
  await saveQueue([...current, ...points]);
}

export async function setLastSyncAt(iso: string): Promise<void> {
  await AsyncStorage.setItem(LAST_SYNC_KEY, iso);
}

export async function getLastSyncAt(): Promise<string | null> {
  return AsyncStorage.getItem(LAST_SYNC_KEY);
}
