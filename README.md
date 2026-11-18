# Anshe Sfard lobby display

A full-screen board for the lobby television at Anshe Sfard - Revere Road Synagogue, 646 N Revere Road, Akron, Ohio, and a simple editor for building that board.

The TV page is the site root. The editor is [editor.html](editor.html).

## Use the editor

1. Open the editor on the computer that is plugged into the TV.
2. Drag a piece from the left onto the screen, or click a piece to drop it in. Date, Shabbos times, logo, welcome line, photos, PDF flyer, events, announcement, and zmanim are all available.
3. Drag a piece to move it. Drag the corners to resize it. Click it to change its words on the right.
4. Use Landscape or Portrait so the shape matches the television.
5. Press **Save**. Then press **Open the TV**, move that window onto the television, and press **Full screen**.
6. After that, every Save updates the TV on its own.

The screen in the editor is a live preview. The television changes when you save.

**Export** downloads one JSON file with the layout and any pictures or PDFs you uploaded. **Import** puts that file back, including on another computer. **Load published layout** brings back the copy stored in this website's `config.json`.

Under "Where the TV looks":

- **Automatic** uses this computer after you have saved, and otherwise uses the published file.
- **This computer** always uses what you saved here.
- **The published file** always uses `config.json` from the website, which is how a layout can be published from the repository.

You can add more than one screen and turn on **Rotate the screens**. Each screen has its own pieces. The words are not copied when you add a screen.

**Full-screen message** covers the whole TV with one announcement, for example a simcha. Turn it on, then Save. You can also limit it to a start and end in Akron time. The wording already filled in is only a sample. Change it before you turn it on. Preview stays in the editor until you save with the message turned on.

Past events stay in the editor list and disappear from the TV once their date and time have passed. A date with no time stays up through that day.

## Shabbos times and the Hebrew date

Times are calculated on the TV itself with [Hebcal](https://github.com/hebcal/hebcal-es6) (`@hebcal/core`), for Akron (geonameid 5145476, 41.08144, -81.51901, America/New_York). Candle lighting is 18 minutes before sunset. Havdalah defaults to nightfall at 8.5 degrees, which is what [hebcal.com](https://www.hebcal.com/shabbat?geonameid=5145476&b=18&M=on) publishes. The editor can switch havdalah to 42, 50, or 72 minutes after sunset.

The Hebrew date uses Hebrew letters. Vowels can be turned off. An English-letter reading (for example "8th of Kislev, 5787") can be shown as well. The date moves to the next Hebrew day at sunset. The parsha moves on after havdalah.

Checked against Hebcal for the week of 18 November 2026: Wednesday daytime is 8 Kislev 5787, Parashat Vayetzei, candle lighting Friday 4:45 PM, havdalah Saturday 5:47 PM.

## Photos

Upload pictures, or paste direct image addresses, one per line. A Google Drive file that anyone with the link can open can be pasted as the Drive link. The editor turns it into an image address.

A Google Photos shared-album link is not supported. Google removed shared-album access from the Photos API on 31 March 2025, and a static page is not allowed to read the album page itself (the browser blocks that request). Sending the album through an unofficial proxy would be unreliable and would hand the photos to someone else's server. Uploads stay on this computer and keep working if the network drops.

## Logo

The default mark is the Anshe Sfard logo from [akronshul.com](https://akronshul.com), with the white background removed so it sits on the navy screen. You can upload a different picture.

## Publishing a layout

`config.json` in this repository is the layout a new TV uses before anyone presses Save. Edit that file, or export from the editor and replace `config.json`, then push to `main`. The display re-reads the published file about once a minute when it is set to the published file.

GitHub Pages is deployed by `.github/workflows/pages.yml` on every push to `main`. In the repository settings, set Pages to **GitHub Actions** (the workflow cannot turn that setting on by itself). The site is then at:

https://akronrabbi.github.io/shul-display/

## Storage

There is no server. The layout is saved in this browser (`localStorage`). Uploaded pictures and PDFs are saved in IndexedDB. The editor and the TV share that storage when they are on the same computer and the same site. Saving notifies the TV through a `BroadcastChannel`.

`js/storage.js` is the only place that talks to that storage. A cloud sync backend can replace `createStorage()` later without rewriting the screens.

The pages also register a small service worker so the board can keep running after it has loaded once, even if the network blips. The first visit still needs a connection, for the fonts and, if you use a PDF, for PDF.js.

## Limits

- The TV and the editor have to be the same browser on the same computer for Save to update the screen live. To move a setup, use Export and Import, or publish `config.json`.
- Very large photo libraries make a large export file. Prefer a modest set for a lobby slideshow.
- Google Photos albums cannot be linked. Use uploads or Drive file links.
- PDF pages are drawn with PDF.js from a CDN, so the first open of a flyer needs a network. After that the service worker can reuse it.
- Zmanim follow Hebcal's sunrise and sunset. They are not a posek.
- Sample events in the published layout are the real candle-lighting times for 20 and 27 November 2026, plus Shabbat day. Replace them with the week's programs.
- The full-screen sample text is an example and is turned off.
