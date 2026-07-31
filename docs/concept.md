# Konzeptdokument: Chat-Story-Plattform (Arbeitstitel: Riddlon)

## 1. Vision

Eine Open-Source-Plattform, die es ermöglicht, interaktive Geschichten zu erleben, die sich als reine Chat-App tarnen. Spieler kommunizieren mit verschiedenen Charakteren; die Handlung offenbart sich schrittweise durch den Gesprächsverlauf. Die Plattform ist generisch aufgebaut, sodass beliebige Geschichten (Krimis, historische Stoffe, eigene Kreationen) als austauschbare Content-Pakete erstellt und gespielt werden können. Ein zentrales Ziel ist ein vollständig lokaler Offline-Modus mit browserbasierter KI-Inferenz, ohne Abhängigkeit von einem Server-Backend.

Zielgenres für die erste Ausbaustufe: kleine Krimis und spannende historische Geschichten. Explizit **kein** Anschluss an NSFW-/Adult-Roleplay-Ökosysteme wie SillyTavern — das Produkt positioniert sich bewusst als seriöses, saubereres Erlebnis.

## 2. Produktprinzipien

- **Chat-first UX**: Die gesamte Interaktion — inklusive Systemfunktionen wie Story-Import — läuft, wo sinnvoll, über die Chat-Metapher, ergänzt durch klar sichtbare UI-Elemente für technische Schritte (Dateiauswahl, Fortschritt, Fehler).
- **Offline-first**: Die App muss nach einmaliger Installation vollständig ohne Internetverbindung funktionieren, inklusive KI-Inferenz.
- **Open Source & generisch**: Kein Story-Inhalt ist hartkodiert. Jede Geschichte, jeder Charakter ist ein austauschbares Content-Paket.
- **Kein Cloud-Zwang**: Lokale KI-Inferenz im Browser ist der Standardmodus; Cloud-Modelle sind höchstens optionale Erweiterung, kein Kernbestandteil.
- **Kontrollierte Dramaturgie**: Die KI erzeugt lebendigen Dialog, aber die Story-Engine (deterministischer Zustandsgraph) kontrolliert Fortschritt, Reveals und Verzweigungen — nicht das freie LLM.
- **Seriöses Zielgenre**: Krimi/Historie/Drama, keine Ausrichtung auf Erotik-/Adult-Content-Communities.
- **Wiederverwendbarkeit von Charakteren**: Charaktere sind eigenständige, story-unabhängige Entitäten, die in mehreren Geschichten auftreten können.

## 3. Systemarchitektur

Das System besteht aus **zwei sichtbaren Anwendungen**, die auf einem gemeinsamen, offen dokumentierten **Content-Paketformat** basieren.

### 3.1 App 1 — Authoring Studio

Web-basierte Autorenumgebung zum Erstellen von Geschichten, Charakteren, Welt-Wissen und zum Exportieren als installierbares Story-Paket.

Funktionsbereiche:

- **Story Graph Editor**: Szenen, Kapitel, Übergänge, Trigger, Reveal-Punkte, Zeit-Events.
- **Character Library**: Eigener, story-unabhängiger Bereich zur Verwaltung wiederverwendbarer Charaktere (Kernidentität, Aussehen, Stimme/Stil, Herkunft). Charaktere werden hier zentral angelegt und gepflegt, unabhängig davon, in welcher Story sie später verwendet werden.
- **Character Binding Editor**: Innerhalb einer Story werden Charaktere aus der Bibliothek referenziert und um storyspezifisches Rollen-Overlay ergänzt (Wissen, Geheimnisse, Verfügbarkeit, Beziehungen für genau diese Handlung).
- **World/Knowledge Editor**: Orte, Zeitleiste, Hinweise (Clues), Fakten (Canon Facts), Glossar, Beziehungen.
- **Playtest/Simulation**: Testchat gegen einzelne oder mehrere Charaktere, Zustands-/Trigger-Inspektor, Zeitsprung-Simulation zum Testen verzögerter Events, Export-/Import-Validierung.
- **Paket-Export**: Bündelung aller Inhalte zu einer ZIP-Datei nach dem definierten Paketformat (Abschnitt 5).

### 3.2 App 2 — Player (PWA)

Die eigentliche Spiel-App für Endnutzer — **dieses Repository**. Erscheint als Messenger-artige Chat-Oberfläche. Enthält die lokale KI-Runtime als eingebettetes Modul (keine separate Anwendung).

Interne Module (kein separates Produkt, sondern Codeorganisation innerhalb derselben Webapp):

| Modul         | Aufgabe                                                                         |
| ------------- | ------------------------------------------------------------------------------- |
| `ui/`         | Chat-Oberfläche, Kontaktliste, Menüs, Einstellungen                             |
| `engine/`     | Story-State-Maschine: Szenen, Flags, Clues, Trigger, Fortschritt                |
| `content/`    | Loader für installierte Story-Pakete                                            |
| `characters/` | Verwaltung der lokalen Charakterbibliothek (übergreifend über Storys hinweg)    |
| `llm/`        | Modellauswahl, Session-Management, Prompting, Streaming, austauschbare Backends |
| `storage/`    | Savegames, lokale Story-Bibliothek, Caches                                      |
| `pwa/`        | Service Worker, Offline-Verhalten, Asset-Vorhalten                              |

Die KI-Runtime ist bewusst **kein eigenständiges Produkt**, sondern ein Subsystem des Players. Das Modell selbst muss austauschbar sein (z. B. verschiedene lokale LLMs, ggf. später Fallback-Optionen), ohne dass Story-Engine oder UI angepasst werden müssen. Empfohlene technische Basis: browserbasierte In-Browser-Inferenz mit WebGPU-Beschleunigung, mit einem Adapter-Layer zwischen Story-Engine und konkretem Modell-Backend.

### 3.3 Nicht als eigenes Produkt, aber als eigene Konzepte

- **Content-Paketformat / SDK**: Offenes, dokumentiertes Datenformat für Story, Charaktere, Welt-Wissen, Assets. Kein eigenständiges Tool, sondern die gemeinsame Schnittstelle zwischen Studio und Player.

## 4. Story-Loading & Offline-Verhalten

### 4.1 Importwege

Zwei Importmechanismen für Story-Pakete:

1. **ZIP-Import (primär)**: Nutzer wählt lokal eine ZIP-Datei aus (Dateiauswahl-Dialog mit Fallback über Standard-`<input type="file">`). Robustester Weg, unabhängig von Netzwerk-/CORS-Problemen.
2. **URL-Import (komfortabel)**: Nutzer gibt eine URL an (z. B. GitHub-Release-Asset). Das Paket wird einmalig heruntergeladen und lokal installiert — **kein** dauerhaftes Live-Nachladen von der Quelle.

Nach dem Import ist eine Story **vollständig lokal installiert** und unabhängig vom ursprünglichen Bezugsweg offline spielbar.

### 4.2 Ablauf

1. App-Shell wird per Service Worker offline-fähig installiert.
2. Story-Import (ZIP oder URL).
3. Validierung: Manifest, Version, Pflichtdateien, Assets.
4. Entpacken und lokale Speicherung (Metadaten z. B. in IndexedDB, Binärdaten im Cache-/Blob-Speicher).
5. Abgleich referenzierter Charaktere mit der lokalen Charakterbibliothek (siehe Abschnitt 5.3).
6. Registrierung im lokalen Story-Katalog.
7. Spielbar vollständig offline.

### 4.3 Interne Aufteilung des Loaders

- **Importer**: nimmt ZIP oder URL entgegen.
- **Installer**: validiert, entpackt, speichert lokal, gleicht Charakterreferenzen ab.
- **Registry**: verwaltet installierte Storys (Version, Status, Cover, Größe) und die lokale Charakterbibliothek.

### 4.4 Conversational Import-UX

Importer/Installer/Registry werden dem Nutzer **primär über den Chat** zugänglich gemacht, ergänzt durch sichtbare UI-Karten für technische Teilschritte (Dateiauswahl, Fortschrittsanzeige, Konflikte, Fehler). Diese Systemfunktionen laufen über einen **neutralen Systemkontakt** (z. B. „Archiv", „Bibliothek", „Kurator") — **nicht** über Story-Charaktere, um Fiktion und App-Verwaltung nicht zu vermischen.

Modi innerhalb desselben Chat-Systems:

- **Play Chat**: eigentliche Story-Interaktion mit Charakteren.
- **System Chat**: Import, Installation, Update, Bibliotheksverwaltung.
- **Meta Panels**: eingeblendete Karten für Datei-Operationen, Fortschritt, Fehler.

## 5. Content-Paketformat

Ein Story-Paket ist eine ZIP-Datei mit folgender Grobstruktur:

```
story-package.zip
├── manifest.json
├── story/
│   ├── story.json
│   ├── graph.json
│   └── scenes/
│       ├── intro.json
│       ├── chapter-1.json
│       └── ending-a.json
├── characters/
│   ├── 3f2a1c9e-7b41-4e3a-9c2d-1a2b3c4d5e6f.character.json
│   ├── 8b6d2f10-4c3a-4a91-9e2b-2f4a6b8c1d3e.character.json
│   └── c1a4e7f2-9d3b-4f6a-8e1c-5b7d9f0a2c4e.character.json
├── world/
│   ├── timeline.json
│   ├── clues.json
│   ├── locations.json
│   └── glossary.json
├── rules/
│   ├── runtime.json
│   ├── prompts.json
│   └── safety.json
├── assets/
│   ├── covers/
│   ├── avatars/
│   ├── audio/
│   └── images/
└── signatures/
    └── checksums.json
```

### 5.1 ID-Konvention (grundlegende Festlegung)

Alle referenzierbaren Entitäten — Charaktere, Storys, Szenen, Clues, Achievements — erhalten als **primären Identifikator eine UUID (Version 4)**, keinen sprechenden Namen oder Slug. Begründung: Namen wie `lucy` oder `max` können bei wachsender Bibliothek und community-generierten Inhalten leicht kollidieren; eine UUID schließt Namenskonflikte zwischen unabhängig erstellten Paketen praktisch aus.

Konvention:

- **`id`**: UUIDv4, stabil, wird nie geändert, ist die technische Referenz.
- **`displayName`** bzw. **`slug`** (optional, nur für Lesbarkeit/Debugging/Dateibenennung): kein Ersatz für `id`, keine Garantie auf Eindeutigkeit.

Beispiel für eine Charakter-Referenz an anderer Stelle im Datenmodell:

```json
{
	"characterRef": "3f2a1c9e-7b41-4e3a-9c2d-1a2b3c4d5e6f"
}
```

Dateinamen im Paket können zur besseren Lesbarkeit die UUID enthalten, z. B. `3f2a1c9e-7b41-4e3a-9c2d-1a2b3c4d5e6f.character.json`. Optional kann ergänzend ein kurzer, nicht-eindeutiger `slug` (z. B. `lucy`) für UI-Debugging oder Studio-interne Sortierung mitgeführt werden, ist aber für die Referenzlogik irrelevant.

### 5.2 manifest.json (Beispiel)

```json
{
	"format": "chatstory-package",
	"formatVersion": "1.0.0",
	"id": "7e9c1a2b-3d4e-4f5a-8b6c-9d0e1f2a3b4c",
	"title": "Mitternacht in Rothenburg",
	"version": "0.1.0",
	"author": "Autorenname",
	"language": "de",
	"entryStory": "story/story.json",
	"entryGraph": "story/graph.json",
	"characters": [
		"characters/3f2a1c9e-7b41-4e3a-9c2d-1a2b3c4d5e6f.character.json",
		"characters/8b6d2f10-4c3a-4a91-9e2b-2f4a6b8c1d3e.character.json",
		"characters/c1a4e7f2-9d3b-4f6a-8e1c-5b7d9f0a2c4e.character.json"
	],
	"world": ["world/timeline.json", "world/clues.json", "world/locations.json"],
	"assetsBase": "assets/",
	"minPlayerVersion": "0.1.0",
	"capabilities": ["local-llm", "delayed-events", "multi-character-chat", "group-chat"]
}
```

### 5.3 Charaktermodell — eigenes Primärformat, story-unabhängig wiederverwendbar

Es wird **kein** verpflichtender Anschluss an bestehende Character-Card-Standards (z. B. SillyTavern-artige V2/V3-Formate) umgesetzt. Begründung: Diese Standards sind primär für freies Rollenspiel gedacht, nicht für strukturierte Story-Führung mit Clues, Reveal-Regeln und Zeitlogik; zudem ist das zugehörige Community-Ökosystem stark NSFW-geprägt, was nicht zur Zielpositionierung passt.

Charaktere werden als **zwei getrennte Ebenen** modelliert:

1. **Character Identity (global, wiederverwendbar)**: Kernidentität eines Charakters, unabhängig von einer bestimmten Story. Wird in der Character Library des Studios verwaltet und kann in mehrere Story-Pakete eingebettet werden.
2. **Story Binding (Rollen-Overlay, story-spezifisch)**: Ergänzt einen referenzierten Charakter um Wissen, Geheimnisse, Verfügbarkeit und Beziehungen, die nur innerhalb dieser einen Story gelten.

Da Story-Pakete unabhängig voneinander funktionieren müssen (Offline-Anforderung), wird ein referenzierter Charakter **immer als vollständige Kopie im Paket mitgeliefert**, jedoch mit seiner stabilen UUID. Beim Import erkennt die Registry über die UUID, ob der Charakter bereits lokal bekannt ist (z. B. aus einer anderen installierten Story), und kann ihn entsprechend verknüpfen, statt eine redundante zweite Identität zu erzeugen.

**Character Identity — Beispiel** (`characters/3f2a1c9e-7b41-4e3a-9c2d-1a2b3c4d5e6f.character.json`):

```json
{
	"id": "3f2a1c9e-7b41-4e3a-9c2d-1a2b3c4d5e6f",
	"slug": "lucy",
	"displayName": "Lucy",
	"avatar": "assets/avatars/lucy.png",
	"voiceStyle": "informell, jung, leicht gestresst",
	"corePersonality": "impulsiv, loyal, misstrauisch gegenüber Autoritäten",
	"originPackage": "7e9c1a2b-3d4e-4f5a-8b6c-9d0e1f2a3b4c",
	"shareable": true
}
```

**Story Binding — Beispiel** (Bestandteil von `story/story.json`):

```json
{
	"castBindings": [
		{
			"characterRef": "3f2a1c9e-7b41-4e3a-9c2d-1a2b3c4d5e6f",
			"roleInStory": "quest-giver",
			"knowledge": {
				"publicFacts": ["fact:club-theft"],
				"secrets": ["secret:hans-tip"]
			},
			"availability": { "initialState": "hidden", "unlockCondition": "story-start" },
			"relationships": {
				"8b6d2f10-4c3a-4a91-9e2b-2f4a6b8c1d3e": "friend",
				"c1a4e7f2-9d3b-4f6a-8e1c-5b7d9f0a2c4e": "friend"
			}
		}
	]
}
```

Beziehungen zwischen Charakteren werden ebenfalls über UUID-Referenzen ausgedrückt, nicht über Namen, um auch hier Kollisionen zu vermeiden.

Optional **später** möglich: ein Import-Adapter, der Basisfelder (Name, Beschreibung, Szenario, Begrüßung) aus fremden Character-Card-Formaten in das eigene Modell übersetzt und dabei automatisch eine neue UUID vergibt. Dies ist keine MVP-Anforderung.

### 5.4 Story-/Szenenmodell

Die Story ist ein **Zustandsgraph**, keine reine Prompt-Kette. Jeder Knoten definiert Teilnehmer (über Charakter-UUID referenziert), Ein-/Ausstiegsbedingungen, freischaltbare Inhalte und optionale Zeitregeln. Auch Szenen, Clues und Achievements erhalten eigene UUIDs; im Folgenden werden zur Lesbarkeit teilweise sprechende Platzhalter-IDs verwendet — in der Implementierung sind dies reale UUIDv4-Werte.

`autoOpen` (Default `true`) steuert, ob der Charakter beim Freischalten der Szene proaktiv eine
Eröffnungsnachricht schickt, oder stumm bleibt, bis der Spieler zuerst schreibt (`autoOpen: false`).
Die `goals` gelten in beiden Fällen — sie bestimmen nur, was der Charakter sagt, nicht wann.

`suggestedReplies` (Default `[]`) sind vorformulierte Antwortvorschläge für den Spieler — Chips
über dem Composer, die beim Antippen genau wie eine getippte Nachricht gesendet werden. Anders als
`goals`, die beschreiben, was der Charakter erreichen will, sind das mögliche Spieleräußerungen.
Die App zeigt sie nur bei der spielsichtbarsten der drei Tarnstufen an (App-2-Einstellung, kein
Feld dieses Formats).

```json
{
	"id": "b2e4f6a8-1c3d-4e5f-9a7b-0c1d2e3f4a5b",
	"type": "chat-scene",
	"participants": ["8b6d2f10-4c3a-4a91-9e2b-2f4a6b8c1d3e"],
	"goals": ["seed-timeline", "seed-suspect-description"],
	"suggestedReplies": ["Wo warst du gestern Abend?", "Kennst du Lucys Portmonnaie?"],
	"autoOpen": true,
	"entryConditions": ["flag:max-contact-unlocked"],
	"exitConditions": ["flag:max-questioned"],
	"revealables": ["clue:time-window", "clue:suspect-description-a"],
	"next": [{ "target": "scene-report-to-lucy", "when": ["flag:max-and-sabine-questioned"] }]
}
```

### 5.5 Clues, Secrets, Facts

```json
{
	"id": "clue:time-window",
	"type": "clue",
	"label": "Ungefähre Tatzeit",
	"confirmedBy": ["8b6d2f10-4c3a-4a91-9e2b-2f4a6b8c1d3e", "c1a4e7f2-9d3b-4f6a-8e1c-5b7d9f0a2c4e"],
	"conflicting": true
}
```

- **Clues**: einzelne Hinweise, ggf. mit widersprüchlichen Versionen je Quelle (referenziert über Charakter-UUID).
- **Secrets**: Wissen, das ein Charakter zurückhält, bis Bedingungen erfüllt sind.
- **Facts**: unveränderliche Kanon-Wahrheiten, die das LLM nicht verletzen darf.

### 5.6 Verzögerte Ereignisse (Delayed Events)

```json
{
	"id": "event:lucy-followup",
	"trigger": "time-based",
	"approxDelay": "PT2H",
	"condition": "flag:report-to-lucy-done",
	"action": "unlock-scene:scene-lucy-suspicion"
}
```

Wichtige technische Festlegung: Solche Events sind **nicht garantiert exakt zeitgesteuert**. Es handelt sich um persistente, beim nächsten App-Kontakt (Öffnen/Resume/aktive Nutzung) ausgewertete Fälligkeiten, keine verlässliche Hintergrund-Jobausführung. Begründung: Browser bieten keine zuverlässige, plattformübergreifende Möglichkeit für exakt terminierte Hintergrundausführung oder Benachrichtigungen in einer rein lokalen Offline-PWA. Optionale Systembenachrichtigungen können ergänzend genutzt werden, dürfen aber nicht Kernvoraussetzung der Dramaturgie sein.

### 5.7 Gruppenchat als eigener Szenentyp

```json
{
	"id": "scene-group-confrontation",
	"type": "group-chat-scene",
	"participants": [
		"3f2a1c9e-7b41-4e3a-9c2d-1a2b3c4d5e6f",
		"8b6d2f10-4c3a-4a91-9e2b-2f4a6b8c1d3e",
		"c1a4e7f2-9d3b-4f6a-8e1c-5b7d9f0a2c4e"
	],
	"autoOpen": true,
	"entryConditions": ["flag:hans-info-confirmed"],
	"playerRole": "confront-max-with-evidence",
	"outcomes": [{ "id": "max-confesses", "condition": "flag:evidence-presented" }]
}
```

## 6. Spielerprofil (Player Profile)

Der Spieler benötigt ein minimales, aber vorhandenes Profil, damit Charaktere ihn korrekt ansprechen und personalisieren können. Kein Geschlechtsfeld — stattdessen direkte Anrede/Pronomen-Abfrage, mit freier Eingabemöglichkeit statt starrer Auswahl.

Pflicht:

- **Anrede/Pronomen** (mindestens dieses Feld ist erforderlich)

Empfohlen, aber optional:

- Anzeigename/Nickname
- Avatarbild
- Kurzbeschreibung (z. B. Hobbys, Beruf)

Minimalmodell:

```json
{
	"playerProfile": {
		"displayName": "Alex",
		"addressAs": "they"
	}
}
```

Erweitertes Modell:

```json
{
	"playerProfile": {
		"displayName": "Alex",
		"pronouns": { "subject": "they", "object": "them", "possessive": "their" },
		"avatar": "player-avatar.png",
		"shortBio": "Interessiert an Geschichte, Rätseln und alten Archiven."
	}
}
```

Stories können über ein `playerProfileDefaults`/`playerProfileSchema`-Feld im Manifest angeben, welche Profilfelder sie minimal benötigen bzw. sinnvoll nutzen.

## 7. Referenz-Beispielstory (Validierungsfall für das Datenmodell)

Kurzfassung der Beispielstory „Lucys Portmonnaie", verwendet zur Validierung, dass das Datenmodell praxistauglich ist:

1. Unbekannter Kontakt schreibt den Spieler an („Warst du letzten Samstag im Club?").
2. Bei fehlender Reaktion: automatische Nachfrage mit Zusatzinfo („Ich bin Lucy").
3. Kontaktname wechselt automatisch von „Unbekannt" zu „Lucy".
4. Lucy bittet um Hilfe: gestohlenes Portmonnaie.
5. Lucy nennt Max und Sabine als mögliche Zeugen.
6. Max und Sabine erscheinen automatisch als neue Kontakte, jeweils mit vorbereitetem historischem Chatverlauf (Seed-Chat).
7. Spieler befragt beide; Aussagen widersprechen sich teilweise (Zeit, Ort, gestohlene Gegenstände, Täterbeschreibung) — beide Quellen nötig für vollständiges Bild.
8. Spieler berichtet Lucy; danach vorübergehende Funkstille bei Lucy (Max/Sabine antworten nur noch lapidar).
9. Nach ca. 2 Stunden (approximatives Delayed Event) meldet sich Lucy erneut mit einem neuen Verdacht (Hans belastet Max).
10. Spieler bespricht neuen Verdacht erneut mit Max (bestreitet) und Sabine (bestätigt Beobachtung).
11. Spieler berichtet Lucy; Verdacht wird bestätigt.
12. Gruppenchat mit allen Beteiligten wird eröffnet.
13. Lucy konfrontiert Max; Spieler muss Max mit den gesammelten Informationen konfrontieren.
14. Max gesteht, verspricht Rückgabe.
15. Fall gelöst, optional Achievements (z. B. „Fall gelöst", „Alle Hinweise gefunden", „Ohne Falschbeschuldigung gelöst").

Diese Story deckt folgende Kernmechaniken ab und dient als Testfall für das MVP-Datenmodell:

- Unbekannter Erstkontakt mit späterer Identitätsauflösung
- Dynamisches Freischalten neuer Kontakte inklusive vorgenerierter Seed-Chatverläufe
- Multi-Quellen-Hinweise mit Widersprüchen (Clue-Konflikte)
- Bedingter Fortschritt erst nach ausreichender Beweislage (Evidence-Gate)
- Verzögertes, approximatives Story-Event
- Gruppenchat als eigener Interaktionsmodus
- Auflösung mit optionalem Achievement-System
- Wiederverwendbarkeit der Charaktere Lucy, Max und Sabine in zukünftigen, unabhängigen Stories über deren stabile UUIDs

## 8. Nicht-Ziele des MVP

- Keine Cloud-Pflicht-Infrastruktur für Kernspielbetrieb.
- Keine harte Abhängigkeit von externen Character-Card-Standards.
- Keine Garantie exakter zeitgesteuerter Hintergrundbenachrichtigungen.
- Keine Erotik-/Adult-Content-Ausrichtung.
- Keine komplexe Multi-Autoren-Kollaboration im Studio (spätere Ausbaustufe).
- Kein zentraler Online-Abgleich von Charakter-UUIDs zwischen verschiedenen Nutzern im MVP (rein lokale Erkennung von Wiederverwendung).

## 9. Offene Punkte für die nächste Konzeptphase

- Feinschema für `rules/prompts.json` (Prompt-Templates je Charakter/Szene) und `rules/safety.json` (Ton-/Genre-Leitplanken, Kanon-Schutz).
- Detailschema für Achievements.
- Versionierungs- und Update-Strategie für bereits installierte Story-Pakete und für einzelne Charaktere in der Bibliothek (z. B. wenn ein Autor eine neuere Version eines Charakters veröffentlicht).
- Konfliktauflösung bei widersprüchlichen Clue-Zuständen im UI (Anzeige für den Spieler).
- Genaue Definition der Adapter-Schnittstelle zwischen `engine/` und `llm/` für Modellaustausch.
- Strategie für den Fall, dass zwei Pakete denselben Charakter (gleiche UUID) mit unterschiedlichem Identitätsstand mitliefern (Versionskonflikt in der lokalen Bibliothek).
