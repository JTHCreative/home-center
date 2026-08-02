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

The import is additive and safe to repeat — re-photographing a corrected board
only adds what's genuinely new:

- A goal already showing in that week is **left untouched**, keeping its checks,
  its habit flag, and its position.
- Goals that repeat weekly (and habits) show in every week, so they're matched
  and skipped rather than duplicated — that's what keeps the recurring list
  stable week to week.
- Only the box count changed? The existing goal is adjusted **in place**, so its
  progress survives.
- Anything unmatched is appended, stamped to that week (`repeats: false`).

Title matching is loose — case, punctuation, and a trailing `3x` are ignored —
so a slightly different transcription won't create a duplicate.

## Watch for

- **`~` lines in the report** mean an existing goal's box count is being
  changed. If that wasn't a real change on the board, you misread the boxes —
  fix the JSON rather than writing it. A goal you transcribe without boxes will
  downgrade an existing tally to a checkbox.
- **A goal from an earlier week** that isn't visible in the target week is added
  fresh (new id, new progress) rather than moved — expected, since goals are
  bound to the week they were added.
- The script needs `node_modules` (`npm install` on a fresh container) and
  writes to the live household board. There is no undo — that's what the dry run
  is for.
