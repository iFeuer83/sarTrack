# RescueTrack - Coordinamento Ricerche Persona

Applicazione web per il tracciamento GPS in tempo reale dei volontari durante operazioni di ricerca e soccorso.

## Caratteristiche
- 📍 Tracciamento GPS in tempo reale.
- 📶 Supporto Offline: le posizioni vengono salvate localmente se non c'è campo e sincronizzate appena torna la connessione.
- 📱 Accesso rapido tramite QR Code per i volontari.
- 🗺️ Dashboard coordinatore con mappa interattiva (Leaflet).
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
   - **Start Command**: `node server.ts`
5. (Opzionale) Per non perdere i dati al riavvio, aggiungi un **Disk** (Volume) nelle impostazioni di Render e punta alla cartella dove risiede `rescue.db`.

## Note sulla Privacy e Sicurezza
Questa è una versione MVP. Per l'uso in contesti operativi reali, si consiglia di:
- Aggiungere una password per l'accesso alla Dashboard coordinatore.
- Utilizzare HTTPS (fornito automaticamente da Render/Vercel).
