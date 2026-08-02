---
name: goals-from-photo
description: Read a photo of the goals whiteboard and import the goals into the Goals page. Use when the user attaches or points to a photo/screenshot of their weekly goals list and wants it added to Home Center.
---

# Importing goals from a photo

The user photographs their weekly goals board; you transcribe it into JSON and
`scripts/import-goals.mjs` merges it into the shared Firestore state. Every
screen pointed at the project updates live — no rebuild, no deploy.

## Steps

1. **Read the photo** with the Read tool.
2. **Transcribe** it to JSON in the scratchpad (shape below). Do not paraphrase,
   re-word, or "improve" the goals — transcribe what's written. Keep the board's
   capitalization.
3. **Dry run**, always, before writing:
   ```bash
   node scripts/import-goals.mjs <goals.json> --dry-run
   ```
4. **Show the user the report** and what you read off the photo. Ask before
   writing if anything was ambiguous (bad handwriting, a cut-off line, an
   unfamiliar section heading, a `~` retarget line — see *Watch for* below).
5. **Write** by re-running without `--dry-run`.

Add `--week YYYY-MM-DD` for a week other than the current one (any date in the
week works — it snaps back to that week's Sunday).

## Reading the board

- **Tally boxes.** Empty boxes after a goal are its tally count:
  `Run 1 Mile - [] [] []` is `{ "title": "Run 1 Mile", "target": 3 }`. Count the
  boxes; don't infer a number from the text. `3x` in the title is not a substitute
  for boxes — the boxes are what's drawn on the board.
- **No boxes** = a plain checkbox. Omit `target`.
- **Seven boxes** = a daily goal (one per day, Su–Sa): set `"daily": true`
  instead of `"target": 7`.
- **Ticked boxes** are progress, not structure. Count *all* the boxes, ticked or
  not, and never carry check state into the import — progress belongs to the app.
- **Indented sub-items** under a goal become `children` (a checklist). A goal
  with children can't be a tally.
- **Sections.** The board's three lists map to the sections `Justin's Goals`,
  `Kitty's Goals`, and `Weekly` (matching is loose — "Weekly Goals" and "Kitty"
  both resolve). A heading matching no section is reported and skipped, never
  auto-created; tell the user rather than forcing it into another list.

## Input shape

```json
{
  "Justin's Goals": [
    "Book Denver Car",
    { "title": "Run 1 Mile", "target": 3 },
    { "title": "Read Bible", "daily": true },
    { "title": "Finish EVS Panels", "children": ["Order parts", "Wire rack"] },
    { "title": "Use Audible credit", "note": "expires the 14th" }
  ],
  "Kitty's Goals": [],
  "Weekly": []
}
```

A bare string is shorthand for a checkbox. Section keys may be omitted entirely
if that list isn't in the photo.

## What the merge guarantees

Only genuinely new goals are ever added. A goal is matched by title anywhere in
its section, whatever week it was stamped to — if it's on the board again, it's
the same goal coming round again:

- Already showing in that week? **Left untouched**, keeping its checks, its
  habit flag, and its position.
- Last seen in an **earlier week**? It's a weekly recurring goal — flipped to
  repeat so it shows up again, with no second copy. Its id and every week of
  checks behind it are kept.
- Only the box count changed? Adjusted **in place**, so progress survives.
- No match at all? Appended, stamped to that week.

Title matching is loose — case, punctuation, and a trailing `3x` are ignored —
so a slightly different transcription won't create a duplicate.

## Watch for

- **`~` lines in the report** mean an existing goal's box count is being
  changed. If that wasn't a real change on the board, you misread the boxes —
  fix the JSON rather than writing it. A goal you transcribe without boxes will
  downgrade an existing tally to a checkbox.
- **`^` lines** mean a goal from an earlier week is being made recurring. That's
  the intended behavior, but a repeating goal shows in *every* week — past ones
  included, unchecked — since that's what "Repeats weekly" means in the app. Say
  so if the goal is a one-off the user only meant for this week.
- **Leaving a goal out of the photo doesn't remove it.** The import never
  deletes. A recurring goal that's done for good has to be removed in the app.
- The script needs `node_modules` (`npm install` on a fresh container) and
  writes to the live household board. There is no undo — that's what the dry run
  is for.
