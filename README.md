# RescueTrack - Coordinamento Ricerche Persona

Applicazione web per il tracciamento GPS in tempo reale dei volontari durante operazioni di ricerca e soccorso.

## Caratteristiche
- 📍 Tracciamento GPS in tempo reale.
- 📶 Supporto Offline: le posizioni vengono salvate localmente se non c'è campo e sincronizzate appena torna la connessione.
- 📱 Accesso rapido tramite QR Code per i volontari.
- 🗺️ Dashboard coordinatore con mappa interattiva (Leaflet).
- 🔐 Accesso dashboard admin con password (default: `test2026`).
- 🛠️ Dashboard admin: creazione ricerche, archivio/ripristino, apertura dashboard missione.
- 🧾 Stampa QR in PDF con nome ricerca per affissione.
- 🛠️ Controlli missione: apertura/chiusura intervento e dismissione volontari.
- 🚦 Stato volontari in dashboard: verde (trasmette), arancione (fermo), rosso (dismesso).
- 🔄 Invio posizione: prima posizione immediata, poi sincronizzazione periodica ogni 60 secondi.
- 📤 Export tracce: esportazione KML delle tracce per singolo volontario dalla dashboard.
- 🗃️ Export archivio ricerca in JSON (missione + volontari + posizioni) dalla dashboard admin.
- 📲 Supporto PWA installabile (manifest + service worker) per uso da smartphone.
- 📦 Database locale SQLite.

## Requisiti
- Node.js (v18 o superiore)
- npm

## Installazione Locale
1. Clona il repository.
2. Installa le dipendenze:
   ```bash
   npm install
   ```
3. Avvia l'applicazione in modalità sviluppo:
   ```bash
   npm run dev
   ```
4. Apri `http://localhost:3000` nel browser.

## Installazione PWA
- Apri l'app da browser mobile in HTTPS (es. Render).
- Usa "Aggiungi a schermata Home" / "Installa app" dal browser.
- La PWA migliora l'esperienza mobile e caching, ma non sostituisce i limiti background del sistema operativo.

## Pubblicazione su GitHub
1. Crea un nuovo repository su GitHub.
2. Inizializza git e carica il codice:
   ```bash
   git init
    sentiments
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/TUO_UTENTE/NOME_REPO.git
   git push -u origin main
   ```

## Pubblicazione su Render.com (Consigliato)
1. Crea un account su [Render.com](https://render.com).
2. Clicca su **"New"** -> **"Web Service"**.
3. Collega il tuo account GitHub e seleziona il repository di RescueTrack.
4. Configura il servizio:
   - **Runtime**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
5. Per non perdere i dati al riavvio, aggiungi un **Disk** (Volume) nelle impostazioni di Render.
6. Configura variabile ambiente:
   - **Key**: `DATABASE_PATH`
   - **Value**: `/var/data/rescue.db`
   - (il Disk va montato su `/var/data`)

## Note sulla Privacy e Sicurezza
- Password admin predefinita: `test2026`.
- Per ambienti reali, impostare una password diversa tramite variabile ambiente `ADMIN_PASSWORD`.
- Utilizzare HTTPS (fornito automaticamente da Render/Vercel).
