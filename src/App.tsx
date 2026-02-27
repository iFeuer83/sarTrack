import { useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { io, Socket } from 'socket.io-client';
import { QRCodeSVG } from 'qrcode.react';
import { 
  Map as MapIcon, 
  Users, 
  Plus, 
  QrCode, 
  Navigation, 
  Wifi, 
  WifiOff, 
  AlertCircle,
  ChevronRight,
  User,
  Shield,
  Activity
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

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
  status: 'online' | 'offline';
}

interface Mission {
  id: string;
  name: string;
}

// --- Components ---

const Header = ({ title, subtitle, icon: Icon }: { title: string; subtitle?: string; icon?: any }) => (
  <header className="bg-white border-bottom border-zinc-200 p-4 sticky top-0 z-50">
    <div className="max-w-7xl mx-auto flex items-center gap-3">
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
  const [name, setName] = useState(localStorage.getItem('rt_name') || '');
  const [org, setOrg] = useState(localStorage.getItem('rt_org') || '');
  const [isJoined, setIsJoined] = useState(!!localStorage.getItem('rt_joined'));
  const [isTracking, setIsTracking] = useState(false);
  const [lastPos, setLastPos] = useState<GeolocationCoordinates | null>(null);
  const [queue, setQueue] = useState<Location[]>(JSON.parse(localStorage.getItem('rt_queue') || '[]'));
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  const volunteerId = useRef(localStorage.getItem('rt_vid') || Math.random().toString(36).substring(2, 15)).current;

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
  }, [queue]);

  const syncQueue = useCallback(async () => {
    if (queue.length === 0 || !navigator.onLine) return;

    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          volunteerId,
          missionId,
          name,
          organization: org,
          locations: queue
        })
      });
      if (res.ok) {
        setQueue([]);
      }
    } catch (e) {
      console.error("Sync failed", e);
    }
  }, [queue, volunteerId, missionId, name, org]);

  useEffect(() => {
    const interval = setInterval(syncQueue, 10000);
    return () => clearInterval(interval);
  }, [syncQueue]);

  const startTracking = () => {
    if (!name) return alert("Inserisci il tuo nome");
    localStorage.setItem('rt_name', name);
    localStorage.setItem('rt_org', org);
    localStorage.setItem('rt_joined', 'true');
    setIsJoined(true);
    setIsTracking(true);

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setLastPos(pos.coords);
        const newLoc = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          timestamp: new Date().toISOString()
        };
        setQueue(prev => [...prev, newLoc]);
      },
      (err) => console.error(err),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
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
            <p className="text-sm text-zinc-500">Non chiudere questa pagina durante l'intervento.</p>
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
              localStorage.removeItem('rt_joined');
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
const CoordinatorView = ({ missionId }: { missionId: string }) => {
  const [data, setData] = useState<{ mission: Mission; volunteers: Volunteer[]; locations: any[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);

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
    setSocket(s);
    return () => { s.disconnect(); };
  }, [missionId, fetchData]);

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

  return (
    <div className="h-screen flex flex-col bg-zinc-50">
      <Header title={data.mission.name} subtitle={`Codice: ${missionId}`} icon={Shield} />
      
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Sidebar */}
        <div className="w-full lg:w-80 border-r border-zinc-200 bg-white overflow-y-auto p-4 space-y-6">
          <section className="space-y-3">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
              <QrCode size={14} /> QR Code Accesso
            </h3>
            <Card className="p-4 flex flex-col items-center gap-3 bg-zinc-50 border-dashed">
              <QRCodeSVG value={joinUrl} size={150} />
              <p className="text-[10px] text-zinc-400 text-center break-all">{joinUrl}</p>
            </Card>
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
              <Users size={14} /> Partecipanti ({data.volunteers.length})
            </h3>
            <div className="space-y-2">
              {data.volunteers.map(v => {
                const loc = data.locations.find(l => l.volunteer_id === v.id);
                return (
                  <div key={v.id} className="p-3 bg-zinc-50 rounded-xl border border-zinc-100 flex items-center gap-3">
                    <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center border border-zinc-200 text-zinc-600">
                      <User size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-zinc-900 truncate">{v.name}</p>
                      <p className="text-[10px] text-zinc-500 uppercase font-medium">{v.organization}</p>
                    </div>
                    {loc && (
                      <div className="text-right">
                        <p className="text-[10px] text-emerald-600 font-bold">ATTIVO</p>
                        <p className="text-[9px] text-zinc-400">{new Date(loc.timestamp).toLocaleTimeString()}</p>
                      </div>
                    )}
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
            {data.locations.map(loc => {
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
            <MapUpdater locations={data.locations} />
          </MapContainer>
        </div>
      </div>
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
  const [view, setView] = useState<'home' | 'coordinator' | 'volunteer'>('home');
  const [missionId, setMissionId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const m = params.get('m');
    const c = params.get('c');
    if (m) {
      setMissionId(m);
      setView('volunteer');
    } else if (c) {
      setMissionId(c);
      setView('coordinator');
    }
  }, []);

  const createMission = async () => {
    const name = prompt("Nome dell'intervento (es: Ricerca Persona Scomparsa)");
    if (!name) return;
    const res = await fetch('/api/missions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    if (res.ok) {
      const data = await res.json();
      window.location.href = `?c=${data.id}`;
    }
  };

  if (view === 'volunteer' && missionId) return <VolunteerView missionId={missionId} />;
  if (view === 'coordinator' && missionId) return <CoordinatorView missionId={missionId} />;

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full space-y-8 text-center">
        <div className="space-y-4">
          <div className="w-24 h-24 bg-red-600 rounded-3xl flex items-center justify-center mx-auto shadow-2xl shadow-red-200 transform rotate-12">
            <Shield className="text-white" size={48} />
          </div>
          <h1 className="text-4xl font-black text-zinc-900 tracking-tight">RescueTrack</h1>
          <p className="text-zinc-500 font-medium">Sistema di coordinamento e tracciamento per squadre di ricerca.</p>
        </div>

        <div className="grid gap-4">
          <button 
            onClick={createMission}
            className="group bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm hover:border-red-500 transition-all text-left flex items-center gap-4"
          >
            <div className="p-3 bg-red-50 rounded-xl text-red-600 group-hover:bg-red-600 group-hover:text-white transition-colors">
              <Plus size={24} />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-zinc-900">Nuovo Intervento</h3>
              <p className="text-xs text-zinc-400">Crea una sessione e genera il QR Code</p>
            </div>
            <ChevronRight className="text-zinc-300" size={20} />
          </button>

          <button 
            onClick={() => {
              const id = prompt("Inserisci il codice missione");
              if(id) window.location.href = `?c=${id}`;
            }}
            className="group bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm hover:border-zinc-400 transition-all text-left flex items-center gap-4"
          >
            <div className="p-3 bg-zinc-50 rounded-xl text-zinc-600 group-hover:bg-zinc-900 group-hover:text-white transition-colors">
              <MapIcon size={24} />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-zinc-900">Accedi a Dashboard</h3>
              <p className="text-xs text-zinc-400">Visualizza la mappa di un intervento esistente</p>
            </div>
            <ChevronRight className="text-zinc-300" size={20} />
          </button>
        </div>

        <div className="pt-8 text-[10px] text-zinc-400 uppercase font-bold tracking-widest">
          Sviluppato per Vigili del Fuoco & Volontari
        </div>
      </div>
    </div>
  );
}
