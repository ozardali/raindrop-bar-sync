# Raindrop Bar Sync

**Die Lesezeichenleiste deines Browsers, in jedem Browser gleich, über Raindrop.io.**

[English](README.md) · [Türkçe](README.tr.md) · **Deutsch** · [Русский](README.ru.md) · [日本語](README.ja.md) · [Español](README.es.md) · [简体中文](README.zh-CN.md) · [Português (BR)](README.pt-BR.md)

Eine Browser-Erweiterung, die die **eingebaute Lesezeichenleiste** von Chrome, Edge, Brave,
Vivaldi, Helium und Firefox in beide Richtungen mit einer Raindrop.io-Sammlung synchron hält.
Ein Lesezeichen, das du in Firefox anlegst, erscheint eine Minute später in Chromes Leiste,
im selben Ordner und an derselben Stelle. Raindrop ist der Server; sonst musst du nichts betreiben.

<p align="center">
  <img src="docs/images/popup.png" width="320" alt="Popup in der Symbolleiste">
  &nbsp;
  <img src="docs/images/popup-dark.png" width="320" alt="Popup in der Symbolleiste, dunkles Design">
</p>

## Warum

- Chrome Sync und Firefox Sync synchronisieren nur innerhalb ihrer eigenen Browserfamilie.
- Raindrops eigene Erweiterung speichert Lesezeichen in Raindrop, fasst aber die Leiste des
  Browsers nicht an.
- Browserübergreifende Lesezeichen-Synchronisierungen brauchen einen eigenen Speicher, den du
  einrichtest (Nextcloud, WebDAV, Google Drive…). Wenn du Raindrop schon nutzt, dient es hier
  als dieser Speicher.

## Funktionen

- **Synchronisierung in beide Richtungen** für die Lesezeichenleiste und ihre Unterordner:
  Hinzufügen, Umbenennen, Links ändern, Verschieben und Löschen auf beiden Seiten.
- **Exakte Reihenfolge**, auch wie Ordner und Lesezeichen gemischt sind. Raindrop kann das
  selbst nicht speichern, daher steht sie in kleinen versteckten Notizen in der Sammlung.
- **Die letzte Änderung gewinnt**, pro Lesezeichen und Feld. Entscheidend ist der Zeitpunkt, zu
  dem du die Änderung wirklich gemacht hast, auch wenn ein Browser tagelang offline war.
- **Nichts geht aus Versehen verloren**: Die erste Synchronisierung fügt nur hinzu, ein Ordner,
  der auf einer Seite gelöscht und auf der anderen ergänzt wurde, kommt zurück, und große
  Löschvorgänge halten an und fragen nach.
- **Sicherungen** der Leiste dieses Browsers vor jeder Änderung, mit einem Klick
  wiederherstellbar.
- **Aktivitätsprotokoll** mit jeder Änderung und ihrer Herkunft („von Firefox“).
- **Geräteliste** aller Browser, die mit der Sammlung synchronisieren.
- **Offline-tauglich**: Änderungen ohne Verbindung bleiben erhalten und werden gesendet, sobald
  die Verbindung zurück ist.
- Popup und Einstellungen in **16 Sprachen**, helles und dunkles Design.
- Keine Server, keine Analyse, keine Berechtigungen außer `bookmarks`, `storage`, `alarms` und
  `api.raindrop.io`.

![Einstellungsseite](docs/images/options.png)

## Installation

Die Erweiterung ist noch nicht im Chrome Web Store oder auf addons.mozilla.org; baue sie aus
dem Quellcode. Du brauchst [Node.js](https://nodejs.org) 20 oder neuer.

```sh
git clone https://github.com/ozardali/raindrop-bar-sync.git
cd raindrop-bar-sync
npm install
npm run build            # Chrome, Edge, Brave, Vivaldi, Helium…
npm run build:firefox    # Firefox
```

**Chromium-Browser**: Öffne `chrome://extensions`, schalte den **Entwicklermodus** ein, klicke
auf **Entpackte Erweiterung laden** und wähle `.output/chrome-mv3`.

**Firefox**: Öffne `about:debugging#/runtime/this-firefox`, klicke auf **Temporäres Add-on
laden…** und wähle `.output/firefox-mv3/manifest.json`. Temporäre Add-ons verschwinden beim
Beenden von Firefox; für eine dauerhafte Installation führe `npm run zip:firefox` aus und lass
die Zip-Datei auf [addons.mozilla.org](https://addons.mozilla.org/developers/) als nicht
gelistetes Add-on signieren.

## Einrichtung

1. **Sichere zuerst deine Lesezeichen** (Lesezeichen-Manager → Exportieren). Die
   Synchronisierung arbeitet mit echten Daten.
2. Schalte in den Browsern, in denen du die Erweiterung nutzt, die eingebaute
   Lesezeichen-Synchronisierung aus (Chrome Sync / Firefox Sync). Zwei Systeme an einer Leiste
   kommen sich in die Quere und erzeugen Duplikate.
3. Klicke auf das Symbol der Erweiterung → **Einstellungen**.
4. **Raindrop-Konto**: Füge ein Test-Token ein. Die Seite zeigt Schritt für Schritt, wie du eins
   bekommst: Raindrop → Einstellungen → Integrationen → *Neue App erstellen* → *Test-Token
   erstellen*. Das Token gewährt nur Zugriff auf dein eigenes Konto und läuft nicht ab.
5. **Sammlung**: Wähle die Sammlung, die deine Leiste spiegelt, oder lege eine neue an.
   Verwende **in jedem Browser dieselbe Sammlung**.
6. Fertig. Die erste Synchronisierung führt beide Seiten zusammen: Sie ergänzt, was in einer
   Richtung fehlt, und löscht nichts.

Danach gehen Änderungen im Browser innerhalb von Sekunden an Raindrop, und Änderungen aus
anderen Browsern kommen innerhalb einer Minute an (einstellbar).

## Wie es funktioniert

Jede Synchronisierung vergleicht drei Bäume: die Leiste jetzt, die Sammlung jetzt und den
Stand, auf den sich beide bei der letzten Synchronisierung geeinigt haben. Was sich nur auf
einer Seite geändert hat, wird auf die andere übertragen; haben beide Seiten dasselbe geändert,
gewinnt die neuere Änderung. Das Zusammenführen ist eine reine Funktion mit Unit-, Property-
und Fuzz-Tests: Hunderte zufällige Bearbeitungsverläufe, die jeweils damit enden müssen, dass
beide Seiten gleich sind und nichts Neues verloren geht.

Details: [docs/architecture.md](docs/architecture.md). Das Verhalten der Raindrop-API, auf dem
das Design beruht, geprüft gegen die echte API: [docs/raindrop-api.md](docs/raindrop-api.md)
(Englisch).

## Einschränkungen

- Nur die Lesezeichenleiste (und ihre Ordner) wird synchronisiert, nicht „Weitere Lesezeichen“
  oder „Mobil“.
- Trennlinien (Firefox) werden nicht synchronisiert; Raindrop hat nichts Entsprechendes.
- Links, die Raindrop nicht annimmt (`javascript:`-Bookmarklets, `file:`, `about:`), bleiben in
  ihrem Browser und werden nie gelöscht.
- Firefox für Android und Safari werden nicht unterstützt.
- Vivaldi und Brave sollten wie Chrome funktionieren, sind aber noch nicht getestet.
- Die Anmeldung läuft über ein Test-Token; „Mit Raindrop anmelden“ (OAuth) bräuchte ein
  serverseitiges Geheimnis und ist nicht umgesetzt.

## Hinweis

**Dies ist ein inoffizielles Projekt, nicht mit Raindrop.io verbunden und nicht von Raindrop.io
unterstützt.**

**Synchronisierung verändert echte Daten an zwei Orten.** Die Sicherheitsnetze (keine
Löschungen bei der ersten Synchronisierung, die Pause bei großen Löschungen, lokale Sicherungen,
Raindrops Papierkorb) machen Verluste unwahrscheinlich, nicht unmöglich. Bewahre einen Export
deiner Lesezeichen auf.

**Keine Gewährleistung.** Die Software wird ohne Mängelgewähr unter der
[MIT-Lizenz](LICENSE) bereitgestellt.

## Datenschutz

Die Erweiterung spricht mit genau einem Server: `api.raindrop.io`, mit deinem Token. Keine
Analyse, keine Dritten. Was genau wo gespeichert wird, steht in [PRIVACY.md](PRIVACY.md)
(Englisch).

## Übersetzungen

Die Oberfläche der Erweiterung gibt es in den 16 Sprachen, die die Raindrop-App unterstützt.
Diese README gibt es in den oben verlinkten Sprachen. Für beides ist **Englisch die Quelle**;
weicht eine Übersetzung ab, gilt der englische Text. Übersetzungen korrigieren oder hinzufügen:
[CONTRIBUTING.md](CONTRIBUTING.md#translations).

## Mitmachen

Fehlerberichte und Pull Requests sind willkommen. Entwicklungsumgebung, Tests und
Projektstruktur stehen in [CONTRIBUTING.md](CONTRIBUTING.md).

## Lizenz

[MIT](LICENSE) © Goksel Ozardali
