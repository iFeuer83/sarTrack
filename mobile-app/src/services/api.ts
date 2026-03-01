import { TrackPoint, TrackingSession } from '../types';

export async function validateMission(apiBaseUrl: string, missionId: string): Promise<boolean> {
  const res = await fetch(`${apiBaseUrl}/api/missions/${missionId}`);
  return res.ok;
}

export async function syncPoints(session: TrackingSession, points: TrackPoint[]): Promise<boolean> {
  if (!session.mission.apiBaseUrl) return false;
  if (points.length === 0) return true;

  const res = await fetch(`${session.mission.apiBaseUrl}/api/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      volunteerId: session.volunteer.volunteerId,
      missionId: session.mission.missionId,
      name: session.volunteer.name,
      organization: session.volunteer.organization,
      locations: points,
    }),
  });

  return res.ok;
}
