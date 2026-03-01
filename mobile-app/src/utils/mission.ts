import { MissionContext } from '../types';

export function parseMissionFromQr(raw: string): MissionContext | null {
  const value = raw.trim();
  if (!value) return null;

  try {
    const url = new URL(value);
    const missionId = url.searchParams.get('m')?.trim();
    if (!missionId) return null;
    return {
      missionId,
      apiBaseUrl: url.origin,
    };
  } catch {
    if (/^[A-Z0-9]{5,10}$/i.test(value)) {
      return {
        missionId: value.toUpperCase(),
        apiBaseUrl: '',
      };
    }
    return null;
  }
}
