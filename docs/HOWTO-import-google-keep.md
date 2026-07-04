# How to import your Google Keep notes into Keepou

Keepou can import the notes you already have in Google Keep. The import uses a
**Google Takeout** export (the official way to get your data out of Keep), and
you stay in control: before anything is created, Keepou shows you every parsed
note and **you check/uncheck the ones to keep** — only the checked notes are
imported.

## 1. Export your notes with Google Takeout

1. Open [Google Takeout](https://takeout.google.com) with the Google account
   that owns your Keep notes.
2. Click **« Tout désélectionner »**, then check only **Keep**.
3. Click **« Étape suivante »** and create the export (the default `.zip`
   format is what Keepou expects).
4. Google prepares the archive and emails you a download link (usually within
   minutes for Keep alone). Download the `takeout-….zip` file — **do not unzip
   it**.

## 2. Import into Keepou

1. In Keepou, open the avatar menu and choose **« Importer depuis Google
   Keep »**.
2. Pick the downloaded `takeout-….zip` and continue: Keepou parses the archive
   server-side and shows you the review screen.
3. **Do your cleanup**: every parsed note appears with a checkbox — notes that
   were in Keep's trash are pre-unchecked and marked « Corbeille ». Use « Tout
   cocher / Tout décocher » or pick notes one by one.
4. Confirm with **« Importer les N notes »** and you land on a summary
   (imported / duplicates skipped / unreadable files).

## What gets imported (and what doesn't)

- **Imported faithfully**: the title, the text, and the checklist items
  (checked state preserved), plus the **original Keep dates** — your board's
  chronology stays truthful, and each note's history starts with « Créée par
  vous » at the real Keep date.
- **Colors** are mapped from Keep's ~12 colors onto Keepou's 5 shades
  (yellow/white → gold, green → avocat, red/pink/purple → salsa,
  orange/brown → clay, teal/blue/gray → teal).
- **Everything imported is private** and belongs to you; you can flip any note
  public afterwards from its editor.
- **Not imported** (for now): images and audio attachments, labels, pinned and
  archived flags, and collaborators. Notes in Keep's trash are never imported,
  even if checked — the server enforces it.
- **Re-importing is safe**: a note whose title and content already exist in
  your account is skipped as a duplicate, so a double-click or a second run
  won't create copies.

## Limits & troubleshooting

- The archive must be a `.zip` of at most **20 MB** — a Keep-only Takeout is
  far smaller (attachments in the archive are ignored, they don't need to fit).
- « Le fichier n'est pas une archive ZIP valide. » — you probably picked an
  unzipped folder or the wrong file; upload the `takeout-….zip` as downloaded.
- « Aucune note Google Keep trouvée dans l'archive. » — the export doesn't
  contain Keep data; re-run Takeout and make sure **Keep** is checked.
- A handful of « notes illisibles » in the summary is harmless: those files in
  the export were not valid Keep notes; everything else is imported normally.
