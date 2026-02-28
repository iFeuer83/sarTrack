import { useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { io, Socket } from 'socket.io-client';
import { QRCodeSVG } from 'qrcode.react';
import { 
  Map as MapIcon, 
  Users, 
  Plus,
  Printer,
  ArrowLeft,
  LayoutDashboard,
  FolderArchive,
  FolderOpen,
  LogOut,
  QrCode, 
  Navigation, 
  Wifi, 
  WifiOff, 
  AlertCircle,
  ChevronRight,
  User,
  Shield,
  Activity,
  Lock,
  PauseCircle,
  PlayCircle,
  UserX,
  Download
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import logo from '../logo.png';

// --- Utilities ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
interface Location {
  lat: number;
  lng: number;
  timestamp: string;
}

interface Volunteer {
  id: string;
  name: string;
  organization: string;
  lastLocation?: Location;
  status?: 'online' | 'offline';
  last_seen?: string;
  dismissed?: number;
}

interface Mission {
  id: string;
  name: string;
  active: number;
  archived?: number;
  created_at?: string;
  volunteer_count?: number;
  last_location_at?: string | null;
}

// --- Components ---

const Header = ({ title, subtitle, icon: Icon }: { title: string; subtitle?: string; icon?: any }) => (
  <header className="bg-white border-bottom border-zinc-200 p-4 sticky top-0 z-50">
    <div className="max-w-7xl mx-auto flex items-center gap-3">
      <div className="w-10 h-10 bg-white rounded-lg border border-zinc-200 flex items-center justify-center p-1 overflow-hidden">
        <img src={logo} alt="RescueTrack logo" className="w-full h-full object-contain" />
      </div>
      {Icon && <div className="p-2 bg-red-50 rounded-lg text-red-600"><Icon size={24} /></div>}
      <div>
        <h1 className="text-xl font-bold text-zinc-900 tracking-tight">{title}</h1>
        {subtitle && <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">{subtitle}</p>}
      </div>
    </div>
  </header>
);

const Card = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn("bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden", className)}>
    {children}
  </div>
);

// --- Volunteer View ---
const VolunteerView = ({ missionId }: { missionId: string }) => {
  const SYNC_INTERVAL_MS = 60_000;
  const [name, setName] = useState(localStorage.getItem('rt_name') || '');
  const [org, setOrg] = useState(localStorage.getItem('rt_org') || '');
  const [isJoined, setIsJoined] = useState(!!localStorage.getItem('rt_joined'));
  const [isTracking, setIsTracking] = useState(false);
  const [lastPos, setLastPos] = useState<GeolocationCoordinates | null>(null);
  const [queue, setQueue] = useState<Location[]>(JSON.parse(localStorage.getItem('rt_queue') || '[]'));
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const watchIdRef = useRef<number | null>(null);
  const sessionBlockedRef = useRef(false);
  const firstTransmissionDoneRef = useRef(false);
  const queueRef = useRef<Location[]>(JSON.parse(localStorage.getItem('rt_queue') || '[]'));
  const lastPosRef = useRef<GeolocationCoordinates | null>(null);
  
  const volunteerId = useRef(localStorage.getItem('rt_vid') || Math.random().toString(36).substring(2, 15)).current;

  const stopTracking = useCallback((removeJoined = false) => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTracking(false);
    if (removeJoined) {
      localStorage.removeItem('rt_joined');
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('rt_vid', volunteerId);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('rt_queue', JSON.stringify(queue));
    queueRef.current = queue;
  }, [queue]);

  const sendLocations = useCallback(async (locationsToSend: Location[]) => {
    if (locationsToSend.length === 0 || !navigator.onLine) return false;
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          volunteerId,
          missionId,
          name,
          organization: org,
          locations: locationsToSend
        })
      });
      if (res.ok) {
        return true;
      } else if (res.status === 403 && !sessionBlockedRef.current) {
        sessionBlockedRef.current = true;
        const err = await res.json().catch(() => ({ error: "Trasmissione non consentita" }));
        alert(err.error || "Trasmissione non consentita");
        stopTracking(true);
        window.location.reload();
      }
    } catch (e) {
      console.error("Sync failed", e);
    }
    return false;
  }, [volunteerId, missionId, name, org, stopTracking]);

  const syncQueue = useCallback(async () => {
    if (!navigator.onLine) return;

    const pendingQueue = queueRef.current;
    if (pendingQueue.length > 0) {
      const sent = await sendLocations(pendingQueue);
      if (sent) {
        queueRef.current = [];
        setQueue([]);
      }
      return;
    }

    if (lastPosRef.current) {
      const heartbeatLoc: Location = {
        lat: lastPosRef.current.latitude,
        lng: lastPosRef.current.longitude,
        timestamp: new Date().toISOString()
      };
      await sendLocations([heartbeatLoc]);
    }
  }, [sendLocations]);

  useEffect(() => {
    const interval = setInterval(() => {
      void syncQueue();
    }, SYNC_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [syncQueue, SYNC_INTERVAL_MS]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  const startTracking = () => {
    if (!name) return alert("Inserisci il tuo nome");
    localStorage.setItem('rt_name', name);
    localStorage.setItem('rt_org', org);
    localStorage.setItem('rt_joined', 'true');
    setIsJoined(true);
    setIsTracking(true);
    firstTransmissionDoneRef.current = false;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setLastPos(pos.coords);
        lastPosRef.current = pos.coords;
        const newLoc = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          timestamp: new Date().toISOString()
        };

        if (!firstTransmissionDoneRef.current) {
          firstTransmissionDoneRef.current = true;
          void (async () => {
            const sent = await sendLocations([newLoc]);
            if (!sent) {
              setQueue(prev => [...prev, newLoc]);
            }
          })();
          return;
        }

        setQueue(prev => [...prev, newLoc]);
      },
      (err) => console.error(err),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 15000 }
    );
  };

  if (!isJoined) {
    return (
      <div className="min-h-screen bg-zinc-50 flex flex-col">
        <Header title="Unisciti alla Ricerca" subtitle="Modulo Volontario" icon={User} />
        <main className="p-6 flex-1 flex flex-col justify-center max-w-md mx-auto w-full gap-6">
          <Card className="p-6 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-zinc-700">Nome e Cognome</label>
              <input 
                type="text" 
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Es: Mario Rossi"
                className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-red-500 outline-none transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-zinc-700">Ente / Organizzazione</label>
              <input 
                type="text" 
                value={org}
                onChange={e => setOrg(e.target.value)}
                placeholder="Es: Protezione Civile, VVF..."
                className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-red-500 outline-none transition-all"
              />
            </div>
            <button 
              onClick={startTracking}
              className="w-full bg-red-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-red-200 hover:bg-red-700 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <Navigation size={20} />
              Inizia Tracciamento
            </button>
          </Card>
          <div className="text-center text-zinc-400 text-sm">
            ID Missione: <span className="font-mono font-bold text-zinc-600">{missionId}</span>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col">
      <Header title="Tracciamento Attivo" subtitle={name} icon={Activity} />
      <main className="p-6 space-y-6">
        <div className={cn(
          "p-4 rounded-2xl flex items-center gap-3 transition-colors",
          isOnline ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-amber-50 text-amber-700 border border-amber-100"
        )}>
          {isOnline ? <Wifi size={20} /> : <WifiOff size={20} />}
          <div className="flex-1">
            <p className="font-bold text-sm">{isOnline ? "Connesso" : "Offline"}</p>
            <p className="text-xs opacity-80">{isOnline ? "Posizioni sincronizzate in tempo reale" : "Posizioni salvate localmente, verranno inviate appena possibile"}</p>
          </div>
        </div>

        <Card className="p-6 text-center space-y-4">
          <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto animate-pulse">
            <Navigation className="text-red-600" size={32} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-zinc-900">Stai trasmettendo</h3>
            <p className="text-sm text-zinc-500">Prima posizione inviata subito, poi sincronizzazione ogni 60 secondi.</p>
          </div>
          {lastPos && (
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-zinc-100">
              <div className="text-left">
                <p className="text-[10px] uppercase font-bold text-zinc-400">Latitudine</p>
                <p className="font-mono text-sm">{lastPos.latitude.toFixed(6)}</p>
              </div>
              <div className="text-left">
                <p className="text-[10px] uppercase font-bold text-zinc-400">Longitudine</p>
                <p className="font-mono text-sm">{lastPos.longitude.toFixed(6)}</p>
              </div>
            </div>
          )}
          {queue.length > 0 && (
            <div className="bg-zinc-100 rounded-lg p-2 text-xs font-medium text-zinc-600">
              {queue.length} posizioni in attesa di invio
            </div>
          )}
        </Card>

        <button 
          onClick={() => {
            if(confirm("Sei sicuro di voler interrompere il tracciamento?")) {
              stopTracking(true);
              window.location.reload();
            }
          }}
          className="w-full py-3 text-zinc-400 text-sm font-medium hover:text-red-600 transition-colors"
        >
          Interrompi Sessione
        </button>
      </main>
    </div>
  );
};

// --- Coordinator View ---
const CoordinatorView = ({ missionId, onBack }: { missionId: string; onBack: () => void }) => {
  const [data, setData] = useState<{ mission: Mission; volunteers: Volunteer[]; locations: any[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<'mission' | string | null>(null);
  const STALE_THRESHOLD_MS = 5 * 60 * 1000;

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/missions/${missionId}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setError(null);
      } else {
        const errData = await res.json();
        setError(errData.error || "Errore nel caricamento della missione");
      }
    } catch (e) {
      setError("Impossibile connettersi al server");
    }
  }, [missionId]);

  useEffect(() => {
    fetchData();
    const s = io();
    s.emit('join-mission', missionId);
    s.on('update', () => fetchData());
    return () => { s.disconnect(); };
  }, [missionId, fetchData]);

  const toggleMissionStatus = async () => {
    if (!data) return;
    setActionLoading('mission');
    try {
      const res = await fetch(`/api/missions/${missionId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: data.mission.active !== 1 })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Errore aggiornando stato missione');
      }
      await fetchData();
    } catch (e: any) {
      alert(e.message || 'Errore aggiornando stato missione');
    } finally {
      setActionLoading(null);
    }
  };

  const dismissVolunteer = async (volunteerId: string) => {
    setActionLoading(volunteerId);
    try {
      const res = await fetch(`/api/missions/${missionId}/volunteers/${volunteerId}/dismiss`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dismissed: true })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Errore durante dismissione volontario');
      }
      await fetchData();
    } catch (e: any) {
      alert(e.message || 'Errore durante dismissione volontario');
    } finally {
      setActionLoading(null);
    }
  };

  const exportVolunteerTrack = (volunteerId: string) => {
    const exportUrl = `/api/missions/${missionId}/volunteers/${volunteerId}/tracks/export?format=kml`;
    window.open(exportUrl, '_blank');
  };

  const openPrintMissionQr = () => {
    window.open(`?print=${missionId}`, '_blank');
  };

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="text-red-500 mb-4" size={48} />
        <h2 className="text-2xl font-bold text-zinc-900 mb-2">Attenzione</h2>
        <p className="text-zinc-500 mb-6">{error}</p>
        <button 
          onClick={() => window.location.href = '/'}
          className="bg-zinc-900 text-white px-6 py-2 rounded-xl font-bold"
        >
          Torna alla Home
        </button>
      </div>
    );
  }

  if (!data) return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-zinc-500 font-medium">Caricamento missione...</p>
      </div>
    </div>
  );

  const appUrl = window.location.origin;
  const joinUrl = `${appUrl}?m=${missionId}`;
  const visibleLocations = data.locations.filter(loc => {
    const volunteer = data.volunteers.find(v => v.id === loc.volunteer_id);
    return volunteer?.dismissed !== 1;
  });

  return (
    <div className="h-screen flex flex-col bg-zinc-50">
      <Header title={data.mission.name} subtitle={`Codice: ${missionId}`} icon={Shield} />
      
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Sidebar */}
        <div className="w-full lg:w-80 border-r border-zinc-200 bg-white overflow-y-auto p-4 space-y-6">
          <button
            onClick={onBack}
            className="w-full py-2.5 rounded-xl border border-zinc-200 text-zinc-700 text-sm font-semibold hover:bg-zinc-50 flex items-center justify-center gap-2"
          >
            <ArrowLeft size={16} />
            Torna a Dashboard
          </button>

          <section className="space-y-3">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
              <Shield size={14} /> Stato Intervento
            </h3>
            <Card className="p-4 bg-zinc-50 border-zinc-200 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-zinc-700">Missione</p>
                <span className={cn(
                  "text-[10px] px-2 py-1 rounded-full font-bold",
                  data.mission.active === 1 ? "bg-emerald-100 text-emerald-700" : "bg-zinc-200 text-zinc-700"
                )}>
                  {data.mission.active === 1 ? 'APERTA' : 'CHIUSA'}
                </span>
              </div>
              <button
                onClick={toggleMissionStatus}
                disabled={actionLoading === 'mission'}
                className={cn(
                  "w-full py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors",
                  data.mission.active === 1 ? "bg-zinc-900 text-white hover:bg-zinc-700" : "bg-emerald-600 text-white hover:bg-emerald-700",
                  actionLoading === 'mission' && "opacity-60 cursor-not-allowed"
                )}
              >
                {data.mission.active === 1 ? <PauseCircle size={16} /> : <PlayCircle size={16} />}
                {actionLoading === 'mission'
                  ? 'Aggiornamento...'
                  : data.mission.active === 1
                    ? 'Chiudi Intervento'
                    : 'Riapri Intervento'}
              </button>
            </Card>
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
              <QrCode size={14} /> QR Code Accesso
            </h3>
            <Card className="p-4 flex flex-col items-center gap-3 bg-zinc-50 border-dashed">
              <QRCodeSVG value={joinUrl} size={150} />
              <p className="text-[10px] text-zinc-400 text-center break-all">{joinUrl}</p>
              <button
                onClick={openPrintMissionQr}
                className="w-full py-2 rounded-lg text-xs font-bold bg-zinc-900 text-white hover:bg-zinc-700 flex items-center justify-center gap-2"
              >
                <Printer size={14} />
                Stampa QR in PDF
              </button>
            </Card>
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
              <Users size={14} /> Partecipanti ({data.volunteers.length})
            </h3>
            <div className="space-y-2">
              {data.volunteers.map(v => {
                const loc = data.locations.find(l => l.volunteer_id === v.id);
                const lastUpdate = loc?.timestamp || v.last_seen;
                const isDismissed = v.dismissed === 1;
                const isStale = !isDismissed && (!lastUpdate || (Date.now() - new Date(lastUpdate).getTime() > STALE_THRESHOLD_MS));
                const statusLabel = isDismissed ? 'DISMESSO' : (isStale ? 'FERMO' : 'TRASMETTE');
                const statusColor = isDismissed
                  ? 'text-red-600'
                  : isStale
                    ? 'text-amber-600'
                    : 'text-emerald-600';
                return (
                  <div key={v.id} className="p-3 bg-zinc-50 rounded-xl border border-zinc-100 flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center border border-zinc-200 text-zinc-600">
                        <User size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-zinc-900 truncate">{v.name}</p>
                        <p className="text-[10px] text-zinc-500 uppercase font-medium">{v.organization}</p>
                      </div>
                      <div className="text-right">
                        <p className={cn("text-[10px] font-bold", statusColor)}>{statusLabel}</p>
                        {lastUpdate && (
                          <p className="text-[9px] text-zinc-400">{new Date(lastUpdate).toLocaleTimeString()}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pl-11">
                      <button
                        onClick={() => exportVolunteerTrack(v.id)}
                        className="px-2 py-1 rounded-lg text-[10px] font-bold border border-zinc-200 text-zinc-600 hover:bg-zinc-100 flex items-center gap-1"
                      >
                        <Download size={12} />
                        EXPORT
                      </button>
                      {!isDismissed && (
                        <button
                          onClick={() => {
                            if (confirm(`Dismettere ${v.name} dalla trasmissione posizione?`)) {
                              dismissVolunteer(v.id);
                            }
                          }}
                          disabled={actionLoading === v.id}
                          className={cn(
                            "px-2 py-1 rounded-lg text-[10px] font-bold border flex items-center gap-1",
                            "border-red-200 text-red-600 hover:bg-red-50",
                            actionLoading === v.id && "opacity-60 cursor-not-allowed"
                          )}
                        >
                          <UserX size={12} />
                          {actionLoading === v.id ? '...' : 'DISMETTI'}
                        </button>
                      )}
                      {isDismissed && (
                        <div className="px-2 py-1 rounded-lg text-[10px] font-bold border border-red-200 text-red-600 bg-red-50 text-center">
                          DISMESSO
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {data.volunteers.length === 0 && (
                <p className="text-sm text-zinc-400 italic text-center py-4">Nessun partecipante ancora connesso</p>
              )}
            </div>
          </section>
        </div>

        {/* Map */}
        <div className="flex-1 relative z-0">
          <MapContainer center={[45.0, 9.0]} zoom={13} className="h-full w-full">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {visibleLocations.map(loc => {
              const v = data.volunteers.find(vol => vol.id === loc.volunteer_id);
              return (
                <Marker key={loc.id} position={[loc.lat, loc.lng]}>
                  <Popup>
                    <div className="p-1">
                      <p className="font-bold text-sm">{v?.name}</p>
                      <p className="text-xs text-zinc-500">{v?.organization}</p>
                      <p className="text-[10px] mt-1 text-zinc-400">Ultimo agg: {new Date(loc.timestamp).toLocaleTimeString()}</p>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
            <MapUpdater locations={visibleLocations} />
          </MapContainer>
        </div>
      </div>
    </div>
  );
};

const AdminLoginView = ({ onSuccess }: { onSuccess: () => void }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!password) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Autenticazione fallita');
      }
      sessionStorage.setItem('rt_admin_auth', 'true');
      onSuccess();
    } catch (e: any) {
      setError(e.message || 'Password non valida');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full">
        <Card className="p-6 space-y-5">
          <div className="text-center space-y-2">
            <div className="w-20 h-20 mx-auto rounded-2xl bg-white border border-zinc-200 p-2 flex items-center justify-center">
              <img src={logo} alt="RescueTrack logo" className="w-full h-full object-contain" />
            </div>
            <div className="w-14 h-14 mx-auto rounded-2xl bg-red-50 text-red-600 flex items-center justify-center">
              <Lock size={26} />
            </div>
            <h2 className="text-2xl font-black text-zinc-900">Accesso Dashboard</h2>
            <p className="text-sm text-zinc-500">Accedi alla gestione ricerche</p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-zinc-700">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleLogin();
                }
              }}
              placeholder="Inserisci password admin"
              className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-red-500 outline-none transition-all"
            />
          </div>
          {error && <p className="text-sm text-red-600 font-medium">{error}</p>}
          <button
            onClick={handleLogin}
            disabled={loading}
            className={cn(
              "w-full bg-red-600 text-white font-bold py-3 rounded-xl hover:bg-red-700 transition-colors",
              loading && "opacity-60 cursor-not-allowed"
            )}
          >
            {loading ? 'Verifica in corso...' : 'Entra in Dashboard'}
          </button>
        </Card>
      </div>
    </div>
  );
};

const AdminDashboardView = ({
  onOpenMission,
  onLogout,
}: {
  onOpenMission: (missionId: string) => void;
  onLogout: () => void;
}) => {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchMissions = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/missions?includeArchived=${includeArchived ? '1' : '0'}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Errore caricando missioni');
      }
      const json = await res.json();
      setMissions(json.missions || []);
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Errore caricando missioni');
    } finally {
      setLoading(false);
    }
  }, [includeArchived]);

  useEffect(() => {
    fetchMissions();
  }, [fetchMissions]);

  const createMission = async () => {
    const name = prompt("Nome della ricerca/intervento");
    if (!name) return;
    setActionLoading('create');
    try {
      const res = await fetch('/api/missions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Errore creando ricerca');
      }
      await fetchMissions();
    } catch (e: any) {
      alert(e.message || 'Errore creando ricerca');
    } finally {
      setActionLoading(null);
    }
  };

  const archiveMission = async (mission: Mission, archived: boolean) => {
    setActionLoading(`archive:${mission.id}`);
    try {
      const res = await fetch(`/api/missions/${mission.id}/archive`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Errore aggiornando archivio');
      }
      await fetchMissions();
    } catch (e: any) {
      alert(e.message || 'Errore aggiornando archivio');
    } finally {
      setActionLoading(null);
    }
  };

  const openPrintMissionQr = (missionId: string) => {
    window.open(`?print=${missionId}`, '_blank');
  };

  return (
    <div className="min-h-screen bg-zinc-50">
      <Header title="Dashboard Ricerche" subtitle="Gestione Admin" icon={LayoutDashboard} />
      <main className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="flex flex-wrap gap-3">
          <button
            onClick={createMission}
            disabled={actionLoading === 'create'}
            className="px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 flex items-center gap-2"
          >
            <Plus size={16} />
            {actionLoading === 'create' ? 'Creazione...' : 'Nuova Ricerca'}
          </button>
          <button
            onClick={() => setIncludeArchived(v => !v)}
            className="px-4 py-2.5 rounded-xl border border-zinc-200 bg-white text-zinc-700 text-sm font-semibold hover:bg-zinc-50"
          >
            {includeArchived ? 'Nascondi Archiviate' : 'Mostra Archiviate'}
          </button>
          <button
            onClick={onLogout}
            className="ml-auto px-4 py-2.5 rounded-xl border border-zinc-200 bg-white text-zinc-700 text-sm font-semibold hover:bg-zinc-50 flex items-center gap-2"
          >
            <LogOut size={16} />
            Esci
          </button>
        </div>

        {error && (
          <Card className="p-4 border-red-200 bg-red-50 text-red-700 text-sm font-semibold">
            {error}
          </Card>
        )}

        {loading ? (
          <Card className="p-6 text-zinc-500 text-sm">Caricamento ricerche...</Card>
        ) : (
          <div className="space-y-3">
            {missions.map((mission) => {
              const isArchived = mission.archived === 1;
              const isActive = mission.active === 1 && !isArchived;
              return (
                <Card key={mission.id} className="p-4">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h3 className="text-lg font-bold text-zinc-900 truncate">{mission.name}</h3>
                        <p className="text-xs text-zinc-500">Codice: <span className="font-mono font-semibold">{mission.id}</span></p>
                        {mission.created_at && (
                          <p className="text-[11px] text-zinc-400">Creata: {new Date(mission.created_at).toLocaleString()}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className={cn(
                          "text-[11px] font-bold",
                          isArchived ? 'text-zinc-500' : isActive ? 'text-emerald-600' : 'text-amber-600'
                        )}>
                          {isArchived ? 'ARCHIVIATA' : isActive ? 'APERTA' : 'CHIUSA'}
                        </p>
                        <p className="text-[11px] text-zinc-400">Volontari: {mission.volunteer_count ?? 0}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => onOpenMission(mission.id)}
                        className="px-3 py-2 rounded-lg text-xs font-bold bg-zinc-900 text-white hover:bg-zinc-700"
                      >
                        Apri Dashboard
                      </button>
                      <button
                        onClick={() => openPrintMissionQr(mission.id)}
                        className="px-3 py-2 rounded-lg text-xs font-bold border border-zinc-200 text-zinc-700 hover:bg-zinc-50 flex items-center gap-1"
                      >
                        <Printer size={13} />
                        Stampa QR PDF
                      </button>
                      <button
                        onClick={() => archiveMission(mission, !isArchived)}
                        disabled={actionLoading === `archive:${mission.id}`}
                        className={cn(
                          "px-3 py-2 rounded-lg text-xs font-bold border flex items-center gap-1",
                          isArchived
                            ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                            : "border-amber-200 text-amber-700 hover:bg-amber-50",
                          actionLoading === `archive:${mission.id}` && "opacity-60 cursor-not-allowed"
                        )}
                      >
                        {isArchived ? <FolderOpen size={13} /> : <FolderArchive size={13} />}
                        {isArchived ? 'Ripristina' : 'Archivia'}
                      </button>
                    </div>
                  </div>
                </Card>
              );
            })}

            {missions.length === 0 && (
              <Card className="p-6 text-sm text-zinc-500 text-center">
                Nessuna ricerca disponibile.
              </Card>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

const PrintQrView = ({ missionId }: { missionId: string }) => {
  const [missionName, setMissionName] = useState<string>(missionId);
  const joinUrl = `${window.location.origin}?m=${missionId}`;

  useEffect(() => {
    const loadMission = async () => {
      try {
        const res = await fetch(`/api/missions/${missionId}`);
        if (res.ok) {
          const data = await res.json();
          if (data?.mission?.name) {
            setMissionName(data.mission.name);
          }
        }
      } catch (e) {
        console.error(e);
      }
    };
    loadMission();
  }, [missionId]);

  return (
    <div className="min-h-screen bg-white p-6 flex flex-col items-center justify-center gap-6">
      <div className="text-center space-y-2">
        <div className="w-24 h-24 mx-auto rounded-2xl bg-white border border-zinc-200 p-3 flex items-center justify-center">
          <img src={logo} alt="RescueTrack logo" className="w-full h-full object-contain" />
        </div>
        <h1 className="text-3xl font-black text-zinc-900">{missionName}</h1>
        <p className="text-sm text-zinc-500">Scansiona per partecipare alla ricerca</p>
      </div>
      <div className="p-6 border-2 border-zinc-300 rounded-2xl bg-white">
        <QRCodeSVG value={joinUrl} size={320} />
      </div>
      <p className="text-xs text-zinc-400 break-all text-center max-w-md">{joinUrl}</p>
      <button
        onClick={() => window.print()}
        className="print:hidden px-5 py-3 rounded-xl bg-zinc-900 text-white text-sm font-bold flex items-center gap-2"
      >
        <Printer size={16} />
        Stampa / Salva PDF
      </button>
    </div>
  );
};

function MapUpdater({ locations }: { locations: any[] }) {
  const map = useMap();
  useEffect(() => {
    if (locations.length > 0) {
      const bounds = locations.map(l => [l.lat, l.lng] as [number, number]);
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [locations, map]);
  return null;
}

// --- Main App ---
export default function App() {
  const [view, setView] = useState<'landing' | 'admin' | 'coordinator' | 'volunteer' | 'print-qr'>('landing');
  const [missionId, setMissionId] = useState<string | null>(null);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(sessionStorage.getItem('rt_admin_auth') === 'true');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const m = params.get('m');
    const c = params.get('c');
    const printId = params.get('print');
    if (m) {
      setMissionId(m);
      setView('volunteer');
    } else if (printId) {
      setMissionId(printId);
      setView('print-qr');
    } else if (c) {
      setMissionId(c);
      setView('coordinator');
    } else if (sessionStorage.getItem('rt_admin_auth') === 'true') {
      setView('admin');
    }
  }, []);

  const handleAdminSuccess = () => {
    setIsAdminAuthenticated(true);
    if (view === 'coordinator' && missionId) {
      window.history.replaceState({}, '', `?c=${missionId}`);
      return;
    }
    setView('admin');
    window.history.replaceState({}, '', '/');
  };

  if (view === 'volunteer' && missionId) return <VolunteerView missionId={missionId} />;
  if (view === 'print-qr' && missionId) return <PrintQrView missionId={missionId} />;

  if (!isAdminAuthenticated) {
    return <AdminLoginView onSuccess={handleAdminSuccess} />;
  }

  if (view === 'admin') {
    return (
      <AdminDashboardView
        onOpenMission={(id) => {
          setMissionId(id);
          setView('coordinator');
          window.history.replaceState({}, '', `?c=${id}`);
        }}
        onLogout={() => {
          sessionStorage.removeItem('rt_admin_auth');
          setIsAdminAuthenticated(false);
          setMissionId(null);
          setView('landing');
          window.history.replaceState({}, '', '/');
        }}
      />
    );
  }

  if (view === 'coordinator' && missionId) {
    return (
      <CoordinatorView
        missionId={missionId}
        onBack={() => {
          setMissionId(null);
          setView('admin');
          window.history.replaceState({}, '', '/');
        }}
      />
    );
  }

  return <AdminLoginView onSuccess={handleAdminSuccess} />;
}
