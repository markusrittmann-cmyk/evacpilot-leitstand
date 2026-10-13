# EvacPilot Leitstand

GitHub-Pages-Web-App für den bestehenden EvacPilot-Supabase-Backendbestand.

## Funktionen
- Beitritt per EvacPilot-Einladungscode
- Organisationsauswahl
- Live-Synchronisierung über Supabase Realtime
- aktiver Alarm mit Hallen-/Bereichsstatus
- Schnellmeldungen Feuerwehr / Polizei / Rettungsdienst
- Einsatzmeldungen und Timeline
- Einsatzort über Browser-Geolocation
- Fehlalarm-Markierung ohne Einsatzende
- Entwarnung mit 3-Sekunden-Halten
- Alarm auslösen für berechtigte Benutzer
- Push über die bestehende Edge Function `alertline-push`
- Mitarbeiterübersicht und Einsatzhistorie
- installierbare PWA

## Sicherheit
`config.js` enthält ausschließlich den Supabase Publishable Key. Dieser ist für Browser-Clients gedacht und kein Geheimnis.
Niemals `service_role`, Datenbankpasswörter, APNs-Schlüssel oder andere geheime Zugangsdaten in GitHub Pages eintragen.
Zugriff auf Daten und Aktionen bleibt über Supabase Auth, RLS und die bestehenden `alertline_*`-RPCs abgesichert.

## GitHub Pages
1. Repository anlegen, z. B. `evacpilot-leitstand`.
2. Alle Dateien aus diesem Ordner in die Repository-Wurzel hochladen.
3. GitHub: Settings → Pages.
4. Build and deployment:
   - Source: Deploy from a branch
   - Branch: main
   - Folder: / (root)
5. Speichern.
6. Die anschließend angezeigte Pages-Adresse öffnen.

Die App nutzt nur relative Pfade und funktioniert daher auch unter
`https://BENUTZERNAME.github.io/evacpilot-leitstand/`.

## Erster Start
Der Browser erzeugt eine eigene anonyme Supabase-Sitzung.
Ohne bestehende Organisation erscheint die Eingabe für einen einmaligen Einladungscode.
Für den dauerhaften Leitstand sollte ein eigener EvacPilot-Zugang verwendet werden.
