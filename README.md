# Almas Tid – tidrapportering med rösten

En webbapp (PWA) där du rapporterar arbetstid och dokumenterar vad du gjort genom att **prata**.
Tryck på mikrofonen, säg vad du gjort – appen tolkar datum, klockslag, rast, projekt och
dokumentation och fyller i rapporten åt dig.

> ”Igår från 7 till 16 på Villa Ek, lunch 30 minuter, monterade köksluckor och bytte två gångjärn”

blir

| Datum | Start | Slut | Rast | Tid | Projekt | Dokumentation |
|---|---|---|---|---|---|---|
| igår | 07:00 | 16:00 | 30 min | 8,5 h | Villa Ek | Monterade köksluckor och bytte två gångjärn |

## Funktioner

- 🎙️ **Röstrapportering** på svenska (Web Speech API, `sv-SE`) med live-transkribering
- 🧠 **Tolkning av talat språk**: ”8 timmar”, ”en och en halv timme”, ”tre kvart”,
  ”mellan 8 och halv fem”, ”kvart över sju till fyra”, ”i måndags”, ”i förrgår”, ”den 3 november”
- 📝 **Diktera dokumentation** direkt i beskrivningsfältet
- ⏱️ **Röststyrd timer**: ”starta timer på Alfa” … ”stoppa, slipade golv”
- 💾 Röstkommandot **”spara”** sparar det som står i formuläret
- 🔊 Uppläst bekräftelse (kan stängas av)
- 📅 **Veckoöversikt** med stapeldiagram, summering per projekt och sök
- 📤 **Export till CSV** (öppnas direkt i svenska Excel) och säkerhetskopia/återställning i JSON
- 📱 Installerbar och fungerar offline; all data sparas lokalt i webbläsaren

## Kom igång

Ingen byggprocess behövs – det är ren HTML/CSS/JavaScript.

```bash
npm start          # startar en lokal server på http://localhost:8080
npm test           # kör testerna för taltolkningen
```

Taligenkänning kräver **https** eller `localhost` och fungerar bäst i Chrome, Edge och Safari
(iOS 14.5+). I Firefox saknas inbyggd taligenkänning – där kan du skriva texten eller använda
tangentbordets dikteringsknapp, och tolkningen fungerar likadant.

Publicera genom att lägga filerna på valfri statisk webbhotell (GitHub Pages, Netlify m.fl.).

## Filer

| Fil | Innehåll |
|---|---|
| `index.html` | Gränssnittet: Rapportera, Översikt, Inställningar |
| `app.js` | Inspelning, formulär, timer, lagring, översikt, export |
| `parser.js` | Tolkning av svensk text till tidrapport (ren JS, testbar) |
| `tests/parser.test.mjs` | Tester för tolkningen (`node --test`) |
| `sw.js`, `manifest.webmanifest` | Offline-stöd och installation som app |
