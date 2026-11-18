# Anshe Sfard lobby display

A full-screen board for the lobby television at Anshe Sfard - Revere Road Synagogue, 646 N Revere Road, Akron, Ohio, and a simple editor for building that board.

The TV page is the site root. The editor is [editor.html](editor.html).

## Use the editor

1. Open the editor on a phone or a computer. Sign in with Google, or with an email code. The first time, use rabbi@akronshul.com.
2. Pick the television at the top: TV 1 - Lobby, TV 2, and so on. **+ Add TV** makes another one. Type a name, and **Copy link** for the address that television should open. **Remove this TV** asks before it deletes one.
3. Drag a piece from the left onto the screen, or click a piece to drop it in. Date, Shabbos times, logo, welcome line, photos, PDF flyer, events, announcement, and zmanim are all available.
4. Drag a piece to move it. Drag the corners to resize it. Click it to change its words on the right.
5. Use Landscape or Portrait so the shape matches that television. Each TV keeps its own shape, its own screens, and its own full-screen message.
6. Press **Save**. The line should say **Saved online.** Then the television, on its own computer, picks that up within about half a minute. Open the TV address on that computer and press **Full screen**.
7. A TV with no name in the address shows TV 1. `index.html?tv=2` shows the second TV, and `index.html?tv=lobby` shows the one whose address says lobby.

The screen in the editor is a live preview. The television changes when you save.

**Export** downloads one JSON file with the layout and any pictures or PDFs you uploaded. **Import** puts that file back, including on another computer. **Load published layout** brings back the copy stored in this website's `config.json`.

Under "Where the TV looks":

- **The online board, then this computer if the network is down** is the usual choice.
- **Only this computer** ignores the online board.
- **Only the published file** always uses `config.json` from the website.

You can add more than one screen and turn on **Rotate the screens**. Each screen has its own pieces. The words are not copied when you add a screen.

**Full-screen message** covers only the TV you are editing, for example a simcha in the social hall. Turn it on, then Save. You can also limit it to a start and end in Akron time. The wording already filled in is only a sample. Change it before you turn it on. Preview stays in the editor until you save with the message turned on.

Past events stay in the editor list and disappear from the TV once their date and time have passed. A date with no time stays up through that day.

## Shabbos times and the Hebrew date

Times are calculated on the TV itself with [Hebcal](https://github.com/hebcal/hebcal-es6) (`@hebcal/core`), for Akron (geonameid 5145476, 41.08144, -81.51901, America/New_York). Candle lighting is 18 minutes before sunset. Havdalah defaults to nightfall at 8.5 degrees, which is what [hebcal.com](https://www.hebcal.com/shabbat?geonameid=5145476&b=18&M=on) publishes. The editor can switch havdalah to 42, 50, or 72 minutes after sunset.

The Hebrew date uses Hebrew letters. Vowels can be turned off. An English-letter reading (for example "8th of Kislev, 5787") can be shown as well. The date moves to the next Hebrew day at sunset. The parsha moves on after havdalah.

Checked against Hebcal for the week of 18 November 2026: Wednesday daytime is 8 Kislev 5787, Parashat Vayetzei, candle lighting Friday 4:45 PM, havdalah Saturday 5:47 PM.

## Photos

Upload pictures, or paste direct image addresses, one per line. A single Google Drive file shared as "anyone with the link" can be pasted as the Drive link. The editor turns it into an image address.

A whole Drive folder works too. Share the folder as Anyone with the link, paste the folder link, and paste a Google API key locked to `https://akronrabbi.github.io/*` and to the Drive API only. The steps are in the photo piece. The TV asks Google for the picture list about every 10 minutes, so new pictures show up on their own. The key is stored with the layout. Restrict it, because anyone who can view the page can see it.

A Google Photos album link is not supported. Google removed shared-album access on 31 March 2025. The album page cannot be framed or read by this browser, and the other Photos APIs need a person to sign in each time, or approval as a device partner. Uploads and a Drive folder are the ways that keep working.

## Logo

The default mark is the Anshe Sfard logo from [akronshul.com](https://akronshul.com), with the white background removed so it sits on the navy screen. You can upload a different picture.

## Publishing a layout

`config.json` in this repository holds every TV. A new screen uses it before anyone presses Save. Edit that file, or export from the editor and replace `config.json`, then push to `main`. The display re-reads the published file about once a minute when it is set to the published file.

GitHub Pages is deployed by `.github/workflows/pages.yml` on every push to `main`. In the repository settings, set Pages to **GitHub Actions** (the workflow cannot turn that setting on by itself). The site is then at:

https://akronrabbi.github.io/shul-display/

## Storage

Save writes every television into one online board. The television reads that board on its own, about every 30 seconds, and changes the picture without reloading. A copy stays in this browser, so the last layout keeps showing if the network drops.

Sign in before you save. Google is first. An email code is the fallback. Only rabbi@akronshul.com, askmoses93@gmail.com, and mosheakron@gmail.com can change the board. Any other address is told so plainly, and the board is left as it was.

Pictures, logos, and PDF flyers upload into the public media bucket. The layout stores that web address. Older pictures that were saved inside the file still show.

**Export** and **Import** still work. Import also tries to save online when you are signed in.

`config.json` is the fallback until the first online save, and when a television is set to the published file only.

The pages also register a small service worker so the board can keep running after it has loaded once, even if the network blips. The first visit still needs a connection, for the fonts and, if you use a PDF, for PDF.js.

## Limits

- The first online save has to be made by a signed-in editor. Until then, the television keeps the published layout.
- A new picture or flyer needs that same sign-in. The upload does not stay only on the phone.
- Very large photo libraries make a large export file. Prefer a modest set for a lobby slideshow.
- Google Photos albums cannot be linked. Use uploads or Drive file links.
- PDF pages are drawn with PDF.js from a CDN, so the first open of a flyer needs a network. After that the service worker can reuse it.
- Zmanim follow Hebcal's sunrise and sunset. They are not a posek.
- Sample events in the published layout are the real candle-lighting times for 20 and 27 November 2026, plus Shabbat day. Replace them with the week's programs.
- The full-screen sample text is an example and is turned off.
