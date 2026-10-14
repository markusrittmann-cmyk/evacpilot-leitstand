# EvacPilot Leitstand v5

GitHub-Pages-Web-App für den bestehenden EvacPilot-Supabase-Backendbestand.

## Leitstand-Rollen
- Leitstand 1: Manager / Beobachter
- Leitstand 2: Manager / Beobachter
- Leitstand 3: Manager / Beobachter
- Leitstand Administrator: Administrator

## Leitstand-Funktionen
- fester Login mit Benutzername und Passwort
- Live-Synchronisierung über Supabase Realtime
- aktive Einsätze, Rückmeldungen, Hallenstatus und Verlauf
- Schnellmeldungen und Einsatzort entsprechend der jeweiligen Berechtigungen
- Alarm auslösen und Entwarnung nur bei entsprechender Berechtigung
- installierbare PWA

## Administratorfunktionen
Der Leitstand Administrator erhält zusätzlich:
- Mitarbeiter und Rollen bearbeiten
- Mitarbeiter aktivieren/deaktivieren/löschen
- Qualifikationen verwalten
- alle Einzelberechtigungen verwalten
- Standorte und Hallenzuordnungen verwalten
- Einladungscodes erstellen und widerrufen
- Werke / Standorte verwalten
- Hallen / Bereiche verwalten
- Sammelpunkte verwalten
- Firmenalarmton auswählen und vorhören
- Vertragsstatus und belegte Mitarbeiterplätze anzeigen

Gerätegebundene Funktionen wie iOS-Benachrichtigungsfreigaben, Critical-Alert-Freigaben und StoreKit-Käufe verbleiben auf dem iPhone.

## Sicherheit
`config.js` enthält ausschließlich den Supabase Publishable Key. Niemals `service_role`, Datenbankpasswörter oder APNs-Schlüssel in GitHub Pages eintragen.
Datenzugriff und Änderungen werden weiterhin über Supabase Auth und RLS abgesichert.

## GitHub Pages Update
Alle Dateien aus diesem Ordner in die Wurzel des Repository `evacpilot-leitstand` hochladen und vorhandene Dateien ersetzen. GitHub Pages deployt anschließend automatisch aus `main` / root.
