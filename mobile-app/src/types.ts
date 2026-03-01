export interface MissionContext {
  missionId: string;
  apiBaseUrl: string;
}

export interface VolunteerProfile {
  volunteerId: string;
  name: string;
  organization: string;
  consentAccepted: boolean;
}

export interface TrackPoint {
  lat: number;
  lng: number;
  timestamp: string;
}

export interface TrackingSession {
  mission: MissionContext;
  volunteer: VolunteerProfile;
  isTracking: boolean;
}
