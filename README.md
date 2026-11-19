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

### The top bar

**Save** is on the right, with a status next to it: amber means not saved yet, green means the TV is up to date. **This week** gathers every welcome line, announcement, and events list on this TV into one list, so the weekly update is a single form. **Ready layouts** offers evenly spaced starting points (Weekly board, Shabbos, Photo showcase, Events and news, Flyer, Minimal). Use one on the current screen or add it as a new screen. Words, events, and photos carry over where the layout has the same kind of piece, and everything stays movable. **More** holds Open the TV, Saved layouts, History, Import, Export, and Load published layout. Ctrl+S saves, and Ctrl+Z / Ctrl+Shift+Z undo and redo.

### Placing pieces

While you drag, pink guide lines show when a piece lines up with the screen edges, the middle, the even margins the ready layouts use, or another piece. Hold Alt to place freely. Arrow keys nudge by half a percent, and Shift+arrow by 5%. Each piece has **Lock in place**, **Duplicate** (Ctrl+D), **Select several**, and layer buttons. Shift-click several pieces (or tap **Select several** on a phone) to line up their edges or middles, space them evenly, or match their sizes.

**When it shows on the TV** sets a first and last day for any piece, for example an announcement for one week. Outside those days the TV leaves it out, and the editor shows it faded with "Not on the TV today".

Events can repeat **every week** or **every other week**, with an optional last date. The TV shows the next date.

### Shabbos mode

Shabbos mode is optional and off until you turn it on in **Screen settings**. Make a screen for Shabbos (Ready layouts, Shabbos, As a new screen), then choose it under Shabbos mode. The TV switches to that screen a set number of minutes before candle lighting and back a set number of minutes after havdalah, using the same times as the Shabbos piece. **Also on Yom Tov** covers Yom Tov the same way. That screen is left out of the regular cycle. The editor shows when it will next switch.

### Movement

**Movement between screens** (Screen settings) fades the next screen in over the last one, with no blank flash. You can also choose Fade and rise, Slide across, or a plain cut. The Photos piece has its own **Movement between photos**: Soft fade, Fade with a slow zoom, Slide across, or Cut. Each picture finishes loading before it appears. PDF pages fade from one to the next.

**Theme** is at the left, under the pieces (on a phone it is in that same row). Each television has its own theme. Warm Classic is the original look. The modern looks are Midnight Glass, Sapphire, Graphite, and Gallery White. **Cards** switches any theme between Solid, Frosted glass, and Minimal line. Tap another card to preview it, then pick letters, a background, and an accent if you want. Text on a custom color switches to light or dark so it can still be read from across the room. Save to send that look to the television. A full-screen message uses the same theme.

Each piece has **Text style**. To keep a board clean, a TV can use at most two fonts beyond its theme; once two are in use, the other fonts are greyed out until a piece goes back to Theme default. You can change the font, size, weight, italics, color, alignment, and the space between lines, paragraphs, and letters. Big numbers, labels, and the main words can be styled apart. **Reset all text to the theme** puts that piece back. On pieces whose words are fitted to a box (welcome line, announcement, events, zmanim, full-screen message), **Fill the box** grows or shrinks the words to fill it, and Text size sets how big each part is next to the others. **Exact size** makes 100% the size that fills the box and then uses each Text size as set, so 150% is half again as big even if it runs past the box. Line spacing, letter spacing, and (on an announcement) space between paragraphs are sliders with a Reset.

**Save** updates the TVs; it does not add anything to Saved layouts. **Saved layouts** and **History** are in the More menu. To keep a named copy such as Regular week or Shabbos, choose **Save as a named layout...**, type the name in the panel, and press Save as layout. Lock it if it should not be changed. To use a saved layout, press **Use this layout...** on it and choose which screen to take from it (it starts on the screen that was open when you saved). Then **Replace this screen** or **Add as a new screen** on whichever TV and screen is open in the editor, or **Replace this whole TV** (every screen and the theme of the chosen TV; this TV keeps its own name, address, and rotation). Those change the editor first; press Save to send them to the TV. **Put on every TV now** replaces every TV and saves at once. Putting a layout back, restoring, and deleting ask for a second tap on the same button rather than a pop-up, because some phone and in-app browsers block pop-ups. History starts with what is on the TVs now. Every online save keeps the previous board, up to the last 30. Restore puts one back, and that step is kept in History too. Undo and Redo are for changes you have not saved yet.

**Export** downloads one JSON file with the layout and any pictures or PDFs you uploaded. **Import** puts that file back, including on another computer. **Load published layout** brings back the copy stored in this website's `config.json`.

Under "Where the TV looks":

- **The online board, then this computer if the network is down** is the usual choice.
- **Only this computer** ignores the online board.
- **Only the published file** always uses `config.json` from the website.

You can add more than one screen and turn on **Cycle through screens**. Each screen has its own pieces. The words are not copied when you add a screen. Cycling only happens when that box is on, and only if you have more than one screen.

**Rotate design to fit screen** is separate. Use it when the television is a landscape screen mounted on its side and the computer itself cannot be set to portrait. Off leaves the design as designed. 90° right, 180°, and 90° left turn the design. The link for that TV includes the turn, for example `?rotate=90`.

**Full screen** covers only the TV you are editing, for example a simcha in the social hall. Choose **Message** (words on the theme, an accent color, or a photograph) or **Full-screen picture** (one uploaded or linked image; Show the whole picture puts a soft blurred copy behind it, Fill the screen crops to fit). While the panel is open, the editor's screen shows it as you type; Show the layout instead switches back. Turn it on, then Save. You can also limit it to a start and end in Akron time. The wording already filled in is only a sample. Change it before you turn it on. Preview stays in the editor until you save with the message turned on.

Past events stay in the editor list and disappear from the TV once their date and time have passed. A date with no time stays up through that day.

## Shabbos times and the Hebrew date

Times are calculated on the TV itself with [Hebcal](https://github.com/hebcal/hebcal-es6) (`@hebcal/core`), for Akron (geonameid 5145476, 41.08144, -81.51901, America/New_York). Candle lighting is 18 minutes before sunset. Havdalah defaults to nightfall at 8.5 degrees, which is what [hebcal.com](https://www.hebcal.com/shabbat?geonameid=5145476&b=18&M=on) publishes. The editor can switch havdalah to 42, 50, or 72 minutes after sunset.

The Hebrew date uses Hebrew letters. Vowels can be turned off. An English-letter reading (for example "8th of Kislev, 5787") can be shown as well. The date moves to the next Hebrew day at sunset. The parsha moves on after havdalah.

Checked against Hebcal for the week of 18 November 2026: Wednesday daytime is 8 Kislev 5787, Parashat Vayetzei, candle lighting Friday 4:45 PM, havdalah Saturday 5:47 PM.

## Photos

Upload pictures, or paste direct image addresses, one per line. A single Google Drive file shared as "anyone with the link" can be pasted as the Drive link. The editor turns it into an image address.

**Google Photos** works through Google's Photos Picker. Press **Choose photos from Google Photos** in the Photos piece, pick pictures (to use an album, open it in the Google window and select its pictures), and press Done. The editor copies them into this board's media storage, so the TV never needs Google. To add new ones later, pick again. This needs a one-time Google client ID, and the steps are in the Photos piece: turn on the Google Photos Picker API, create an OAuth client ID of type Web application with `https://akronrabbi.github.io` as an authorized JavaScript origin, and add each editor as a test user. A pasted album link still cannot be read; Google ended that on 31 March 2025.

A whole Drive folder works too. Share the folder as Anyone with the link, paste the folder link, and paste a Google API key locked to `https://akronrabbi.github.io/*` and to the Drive API only. The steps are in the photo piece. The TV asks Google for the picture list about every 10 minutes, so new pictures show up on their own. The key is stored with the layout. Restrict it, because anyone who can view the page can see it.

A Google Photos album cannot be linked so that it updates on its own. Google removed shared-album access on 31 March 2025. Use the Google Photos button (it copies the pictures you pick), uploads, or a Drive folder, which the TV re-checks every 10 minutes.

## Logo

The default mark is the Anshe Sfard logo from [akronshul.com](https://akronshul.com), with the white background removed so it sits on the navy screen. You can upload a different picture.

## Publishing a layout

`config.json` in this repository holds every TV. A new screen uses it before anyone presses Save. Edit that file, or export from the editor and replace `config.json`, then push to `main`. The display re-reads the published file about once a minute when it is set to the published file.

GitHub Pages is deployed by `.github/workflows/pages.yml` on every push to `main`. In the repository settings, set Pages to **GitHub Actions** (the workflow cannot turn that setting on by itself). The site is then at:

https://akronrabbi.github.io/shul-display/

## Storage

**Is the TV on?** Each television checks in about once a minute. The TV bar in the editor then shows "Online, seen 1 min ago" or "Offline, last seen ...". This needs the table in `schema/status.sql`, run once in the Neon SQL editor. Until then the indicator stays hidden and nothing else changes. Each TV also reloads itself quietly once a night, around 3 AM Akron time, so a screen that runs for weeks stays quick. Add `?noreload=1` to the TV address to turn that off.

Named layouts and the last 30 online saves live in Neon tables `public.layouts` and `public.board_history`. Only a signed-in editor can read or change them. The television does not use those tables. The SQL is in `schema/archive.sql`.

Save writes every television into one online board. The television reads that board on its own, about every 30 seconds, and changes the picture without reloading. A copy stays in this browser, so the last layout keeps showing if the network drops.

Sign in before you save. Google is first. An email code is the fallback. Only rabbi@akronshul.com, askmoses93@gmail.com, and mosheakron@gmail.com can change the board. Any other address is told so plainly, and the board is left as it was.

Pictures, logos, and PDF flyers upload into the public media bucket. The layout stores that web address. Older pictures that were saved inside the file still show.

**Export** and **Import** still work. Import also tries to save online when you are signed in.

`config.json` is the fallback until the first online save, and when a television is set to the published file only.

The pages also register a small service worker so the board can keep running after it has loaded once, even if the network blips. Fonts (in `vendor/fonts`, from Fontsource under the SIL Open Font License) and PDF.js (in `vendor/pdfjs`) are stored with the site, so a TV does not depend on Google Fonts or a CDN. A browser only downloads the font files the board actually uses.

## Limits

- The first online save has to be made by a signed-in editor. Until then, the television keeps the published layout.
- A new picture or flyer needs that same sign-in. The upload does not stay only on the phone.
- Very large photo libraries make a large export file. Prefer a modest set for a lobby slideshow.
- PDF pages are drawn with PDF.js, stored with the site.
- Google Photos copies the pictures you pick. It does not follow an album as it changes.
- Zmanim follow Hebcal's sunrise and sunset. They are not a posek.
- Sample events in the published layout are the real candle-lighting times for 20 and 27 November 2026, plus Shabbat day. Replace them with the week's programs.
- The full-screen sample text is an example and is turned off.
