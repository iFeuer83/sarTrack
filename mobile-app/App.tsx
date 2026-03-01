import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { appendQueue, getLastSyncAt, loadQueue, loadSession, saveSession } from './src/storage/session';
import { MissionContext, TrackingSession, VolunteerProfile } from './src/types';
import { parseMissionFromQr } from './src/utils/mission';
import { flushQueue, getInstantPoint, requestPermissions, resetMobileSession, startBackgroundTracking } from './src/location/tracker';
import * as Location from 'expo-location';
import { validateMission } from './src/services/api';

type ScreenState = 'scan' | 'setup' | 'tracking';

function makeVolunteerId(): string {
  return Math.random().toString(36).slice(2, 12);
}

export default function App() {
  const [screen, setScreen] = useState<ScreenState>('scan');
  const [mission, setMission] = useState<MissionContext | null>(null);
  const [name, setName] = useState('');
  const [organization, setOrganization] = useState('');
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [isScannerVisible, setIsScannerVisible] = useState(false);
  const [queueCount, setQueueCount] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [permissionsReady, setPermissionsReady] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [lastLocationAt, setLastLocationAt] = useState<string | null>(null);
  const [locationWatcher, setLocationWatcher] = useState<Location.LocationSubscription | null>(null);
  const syncTimerRef = useRef<NodeJS.Timeout | null>(null);

  const statusLabel = useMemo(() => {
    if (!isTracking) return 'Non attivo';
    if (queueCount > 0) return `Attivo (in coda: ${queueCount})`;
    return 'Attivo e sincronizzato';
  }, [isTracking, queueCount]);

  useEffect(() => {
    const bootstrap = async () => {
      const existing = await loadSession();
      if (existing?.isTracking) {
        setMission(existing.mission);
        setName(existing.volunteer.name);
        setOrganization(existing.volunteer.organization);
        setConsentAccepted(existing.volunteer.consentAccepted);
        setIsTracking(true);
        setScreen('tracking');
      }
      setQueueCount((await loadQueue()).length);
      setLastSyncAt(await getLastSyncAt());
    };
    void bootstrap();
  }, []);

  useEffect(() => {
    if (!isTracking) return;

    syncTimerRef.current = setInterval(async () => {
      await flushQueue();
      setQueueCount((await loadQueue()).length);
      setLastSyncAt(await getLastSyncAt());
    }, 20_000);

    return () => {
      if (syncTimerRef.current) clearInterval(syncTimerRef.current);
      syncTimerRef.current = null;
    };
  }, [isTracking]);

  useEffect(() => {
    return () => {
      if (locationWatcher) {
        locationWatcher.remove();
      }
      if (syncTimerRef.current) clearInterval(syncTimerRef.current);
    };
  }, [locationWatcher]);

  const onScanPress = async () => {
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        Alert.alert('Permesso fotocamera', 'Serve il permesso camera per inquadrare il QR.');
        return;
      }
    }
    setIsScannerVisible(true);
  };

  const onQrScanned = async (raw: string) => {
    setIsScannerVisible(false);
    const parsed = parseMissionFromQr(raw);
    if (!parsed || !parsed.apiBaseUrl) {
      Alert.alert('QR non valido', 'Il QR deve contenere il link missione generato dalla dashboard.');
      return;
    }

    setIsBusy(true);
    try {
      const ok = await validateMission(parsed.apiBaseUrl, parsed.missionId);
      if (!ok) {
        Alert.alert('Missione non trovata', 'Controlla il QR e riprova.');
        return;
      }
      setMission(parsed);
      setScreen('setup');
    } catch {
      Alert.alert('Errore rete', 'Impossibile validare missione.');
    } finally {
      setIsBusy(false);
    }
  };

  const startTracking = async () => {
    if (!mission) return;
    if (!name.trim()) {
      Alert.alert('Dati mancanti', 'Inserisci nome e cognome.');
      return;
    }
    if (!consentAccepted) {
      Alert.alert('Consenso richiesto', 'Devi accettare il trattamento dati per il soccorso.');
      return;
    }

    setIsBusy(true);
    try {
      const granted = await requestPermissions();
      if (!granted) {
        Alert.alert('Permessi posizione', 'Serve autorizzare la posizione per continuare.');
        return;
      }

      const volunteer: VolunteerProfile = {
        volunteerId: makeVolunteerId(),
        name: name.trim(),
        organization: organization.trim(),
        consentAccepted: true,
      };

      const session: TrackingSession = {
        mission,
        volunteer,
        isTracking: true,
      };

      await saveSession(session);
      await startBackgroundTracking();

      const watcher = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 45_000,
          distanceInterval: 0,
        },
        async (pos) => {
          const point = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            timestamp: new Date().toISOString(),
          };
          setLastLocationAt(point.timestamp);
          await appendQueue([point]);
          await flushQueue();
          setQueueCount((await loadQueue()).length);
          setLastSyncAt(await getLastSyncAt());
        }
      );
      setLocationWatcher(watcher);

      const firstPoint = await getInstantPoint();
      if (firstPoint) {
        setLastLocationAt(firstPoint.timestamp);
        await appendQueue([firstPoint]);
      }
      await flushQueue();

      setQueueCount((await loadQueue()).length);
      setLastSyncAt(await getLastSyncAt());
      setPermissionsReady(true);
      setIsTracking(true);
      setScreen('tracking');
    } catch {
      Alert.alert('Errore', 'Impossibile avviare tracciamento.');
    } finally {
      setIsBusy(false);
    }
  };

  const stopTracking = async () => {
    if (locationWatcher) {
      locationWatcher.remove();
      setLocationWatcher(null);
    }
    await resetMobileSession();
    setScreen('scan');
    setMission(null);
    setName('');
    setOrganization('');
    setConsentAccepted(false);
    setIsTracking(false);
    setQueueCount(0);
    setLastSyncAt(null);
    setLastLocationAt(null);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      {isScannerVisible ? (
        <View style={styles.scannerWrap}>
          <CameraView
            style={styles.scanner}
            barcodeScannerSettings={{
              barcodeTypes: ['qr'],
            }}
            onBarcodeScanned={(event) => {
              void onQrScanned(event.data);
            }}
          />
          <Pressable style={styles.secondaryButton} onPress={() => setIsScannerVisible(false)}>
            <Text style={styles.secondaryButtonText}>Chiudi scanner</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.title}>RescueTrack Mobile</Text>
          {screen === 'scan' && (
            <>
              <Text style={styles.subtitle}>1) Inquadra il QR missione</Text>
              <Pressable style={styles.primaryButton} onPress={() => void onScanPress()}>
                <Text style={styles.primaryButtonText}>Scansiona QR</Text>
              </Pressable>
            </>
          )}

          {screen === 'setup' && mission && (
            <>
              <Text style={styles.subtitle}>2) Inserisci dati operatore</Text>
              <Text style={styles.info}>Missione: {mission.missionId}</Text>

              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Nome e Cognome"
                style={styles.input}
              />
              <TextInput
                value={organization}
                onChangeText={setOrganization}
                placeholder="Ente / Organizzazione"
                style={styles.input}
              />

              <View style={styles.consentRow}>
                <Switch value={consentAccepted} onValueChange={setConsentAccepted} />
                <Text style={styles.consentText}>
                  Acconsento al trattamento dei dati di posizione per il solo scopo della gestione attività di soccorso.
                </Text>
              </View>

              <Pressable style={styles.primaryButton} onPress={() => void startTracking()}>
                <Text style={styles.primaryButtonText}>Avvia tracciamento</Text>
              </Pressable>
            </>
          )}

          {screen === 'tracking' && mission && (
            <>
              <Text style={styles.subtitle}>Stato operativo</Text>
              <View style={styles.statusCard}>
                <Text style={styles.statusLine}>Missione: {mission.missionId}</Text>
                <Text style={styles.statusLine}>Operatore: {name}</Text>
                <Text style={styles.statusLine}>Stato: {statusLabel}</Text>
                <Text style={styles.statusLine}>Permessi posizione: {permissionsReady ? 'OK' : 'Da verificare'}</Text>
                <Text style={styles.statusLine}>Ultimo fix: {lastLocationAt ? new Date(lastLocationAt).toLocaleTimeString() : 'n.d.'}</Text>
                <Text style={styles.statusLine}>Ultima sincronizzazione: {lastSyncAt ? new Date(lastSyncAt).toLocaleTimeString() : 'n.d.'}</Text>
              </View>

              <Pressable style={styles.secondaryButton} onPress={() => void stopTracking()}>
                <Text style={styles.secondaryButtonText}>Termina sessione</Text>
              </Pressable>
            </>
          )}

          {isBusy && <ActivityIndicator size="large" color="#dc2626" style={{ marginTop: 16 }} />}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8fafc' },
  container: { padding: 20, gap: 14 },
  title: { fontSize: 28, fontWeight: '800', color: '#111827' },
  subtitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  info: { color: '#374151', fontSize: 14 },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  consentRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 4 },
  consentText: { flex: 1, color: '#374151', fontSize: 13 },
  primaryButton: {
    backgroundColor: '#dc2626',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 6,
  },
  primaryButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
    backgroundColor: '#ffffff',
  },
  secondaryButtonText: { color: '#111827', fontSize: 14, fontWeight: '600' },
  scannerWrap: { flex: 1, padding: 16, backgroundColor: '#0f172a' },
  scanner: { flex: 1, borderRadius: 16, overflow: 'hidden' },
  statusCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
    gap: 8,
  },
  statusLine: { color: '#111827', fontSize: 14 },
});
