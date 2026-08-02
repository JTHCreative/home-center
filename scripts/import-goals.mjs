#!/usr/bin/env node
/**
 * import-goals — merge a list of goals (typically read off a photo of the
 * whiteboard by Claude) into the Goals page's shared state.
 *
 * Writes the `goals-sections` document in Firestore, the same doc the app's
 * useLocalState hook reads (src/lib/storage.js). Every screen pointed at the
 * project picks the change up live via onSnapshot — no rebuild, no deploy.
 *
 *   node scripts/import-goals.mjs goals.json [--week YYYY-MM-DD] [--dry-run]
 *
 * The merge is additive and idempotent: goals already showing in the target
 * week are left untouched (keeping their progress), so re-importing a corrected
 * photo only adds what's new. See mergeGoals below for the exact rules.
 *
 * Input JSON — a map of section title -> goals, optionally wrapped in
 * `{ "week": "...", "sections": { ... } }`:
 *
 *   {
 *     "Justin's Goals": [
 *       "Take out the trash",                          // checkbox
 *       { "title": "Gym", "target": 3 },               // tally, 3 boxes
 *       { "title": "Water", "daily": true },           // tally, 7 boxes (Su-Sa)
 *       { "title": "Garage", "children": ["Shelves", "Sweep"] },
 *       { "title": "Call mom", "note": "Sunday evening" }
 *     ],
 *     "Kitty's Goals": [...],
 *     "Weekly Goals": [...]
 *   }
 */
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// --- Date helpers (mirror src/pages/Goals.jsx) -------------------------------
const iso = (d) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** ISO date of the Sunday starting `d`'s week — the app's week key. */
export const sundayOf = (d) => {
  const c = new Date(d)
  c.setHours(0, 0, 0, 0)
  c.setDate(c.getDate() - c.getDay())
  return c
}

// A goal shows in a week if it repeats, is a habit, or was stamped to that
// week (mirrors itemInWeek in src/lib/habits.js).
const itemInWeek = (it, weekKey) => it.habit || it.repeats !== false || it.week === weekKey

// --- Matching ----------------------------------------------------------------
// Titles are compared loosely so "Gym 3x", "gym", and "Gym!" collapse to one
// goal — the photo won't be transcribed identically twice.
const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/\[\s*\]/g, ' ') // stray checkboxes read off the photo
    .replace(/\b\d+\s*x\b/g, ' ') // "3x" — the count lives in `target`
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/**
 * Resolve an incoming section key to an existing section: exact first, then
 * loose in both directions — the board is headed "Weekly" but the photo (or
 * Claude) may well call it "Weekly Goals", and vice versa.
 */
export function findSection(sections, key) {
  const want = norm(key)
  if (!want) return null
  return (
    sections.find((s) => norm(s.title) === want) ||
    sections.find((s) => norm(s.title).startsWith(want) || want.startsWith(norm(s.title))) ||
    sections.find((s) => norm(s.title).includes(want) || want.includes(norm(s.title))) ||
    null
  )
}

// Boxes actually drawn for a goal: a tally shows `target` of them, anything
// else is a single checkbox. Stored `target` is meaningless for non-tallies
// (the app defaults it to 7), so never compare it directly.
const boxes = (it) => (it.type === 'tally' ? Math.max(1, it.target || 1) : 1)

/** Normalize one incoming goal (string shorthand or object) to the app's shape. */
function toItem(raw, weekKey) {
  const src = typeof raw === 'string' ? { title: raw } : raw || {}
  const title = String(src.title || '').trim()
  if (!title) return null

  const children = (src.children || [])
    .map((c) => (typeof c === 'string' ? c : c?.title))
    .map((t) => String(t || '').trim())
    .filter(Boolean)
    .map((t) => ({ id: randomUUID(), title: t }))

  // A daily goal is one box per day of the week. Checklists can't be daily.
  const daily = children.length === 0 && !!src.daily
  const target = daily ? 7 : Math.max(1, Number(src.target) || 1)
  // 2+ boxes on the whiteboard means a tally; a lone checkbox stays a checkbox.
  const type = children.length === 0 && target > 1 ? 'tally' : 'checkbox'

  return {
    id: randomUUID(),
    title,
    type,
    target,
    daily,
    // Imported goals belong to the week they were photographed for. Re-import
    // next week to carry one forward — that's what keeps the merge honest.
    repeats: false,
    week: weekKey,
    note: String(src.note || '').trim(),
    children,
    habit: false,
    habitMembers: [],
  }
}

/**
 * mergeGoals — fold incoming goals into `sections` for `weekKey`.
 *
 * Rules, in order, per incoming goal:
 *  - matches a goal already visible in the target week -> skipped, untouched,
 *    so its checks and any habit/repeat flags survive;
 *  - matches but the box count changed (Gym [][] -> Gym [][][]) -> the existing
 *    goal's target is raised/lowered in place, keeping its progress;
 *  - no match -> appended, stamped to the target week.
 *
 * A goal that exists only in an *earlier* week isn't visible in the target
 * week, so it's added fresh (new id, new progress) rather than moved.
 *
 * Returns the new sections array plus a per-section report. Never mutates.
 */
export function mergeGoals(sections, incoming, weekKey) {
  const report = { week: weekKey, sections: [], unmatchedSections: [] }
  let next = sections.map((s) => ({ ...s, items: [...s.items] }))

  for (const [key, goals] of Object.entries(incoming)) {
    const section = findSection(next, key)
    if (!section) {
      report.unmatchedSections.push(key)
      continue
    }
    const line = { title: section.title, added: [], skipped: [], retargeted: [] }

    for (const raw of Array.isArray(goals) ? goals : []) {
      const item = toItem(raw, weekKey)
      if (!item) continue

      const at = section.items.findIndex(
        (it) => itemInWeek(it, weekKey) && norm(it.title) === norm(item.title),
      )
      const existing = at === -1 ? null : section.items[at]
      if (!existing) {
        section.items.push(item)
        line.added.push(item.title)
        continue
      }

      // Same goal, different box count — adjust in place and keep the checks.
      if (boxes(item) !== boxes(existing)) {
        line.retargeted.push({ title: existing.title, from: boxes(existing), to: boxes(item) })
        // Replaced, not mutated in place — the caller's objects stay untouched.
        section.items[at] = {
          ...existing,
          type: item.type,
          target: item.target,
          daily: item.daily,
        }
      } else {
        line.skipped.push(existing.title)
      }
    }
    report.sections.push(line)
  }
  return { sections: next, report }
}

/** Human-readable summary of a merge, for the terminal. */
export function formatReport(report, { dryRun } = {}) {
  const out = [`${dryRun ? 'Would import' : 'Imported'} into week of ${report.week}:`]
  for (const s of report.sections) {
    out.push(`\n  ${s.title}`)
    for (const t of s.added) out.push(`    + ${t}`)
    for (const r of s.retargeted) out.push(`    ~ ${r.title} (${r.from} -> ${r.to} boxes)`)
    for (const t of s.skipped) out.push(`    = ${t} (already there)`)
    if (!s.added.length && !s.retargeted.length && !s.skipped.length) out.push('    (nothing)')
  }
  for (const k of report.unmatchedSections) {
    out.push(`\n  !! no section matches "${k}" — skipped`)
  }
  const added = report.sections.reduce((n, s) => n + s.added.length, 0)
  const changed = report.sections.reduce((n, s) => n + s.retargeted.length, 0)
  out.push(`\n${added} added, ${changed} adjusted.`)
  return out.join('\n')
}

// --- CLI ---------------------------------------------------------------------
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const weekIdx = args.indexOf('--week')
  const weekArg = weekIdx === -1 ? null : args[weekIdx + 1]
  const file = args.find((a, i) => !a.startsWith('--') && !(weekIdx !== -1 && i === weekIdx + 1))

  if (!file) {
    console.error('usage: node scripts/import-goals.mjs <goals.json> [--week YYYY-MM-DD] [--dry-run]')
    process.exit(1)
  }

  const payload = JSON.parse(readFileSync(file, 'utf8'))
  const incoming = payload.sections || payload
  const weekKey = iso(sundayOf(weekArg ? new Date(`${weekArg}T00:00:00`) : new Date()))

  // Imported lazily so --help/parse errors don't spin up a Firestore connection.
  const { doc, getDoc, setDoc, terminate } = await import('firebase/firestore')
  const { db } = await import('../src/lib/firebase.js')
  const ref = doc(db, 'appState', 'goals-sections')

  const snap = await getDoc(ref)
  if (!snap.exists()) {
    console.error('No goals-sections document yet — open the Goals page once to seed it.')
    await terminate(db)
    process.exit(1)
  }
  const current = JSON.parse(snap.data().json)

  const { sections, report } = mergeGoals(current, incoming, weekKey)
  console.log(formatReport(report, { dryRun }))

  if (!dryRun) await setDoc(ref, { json: JSON.stringify(sections) })
  else console.log('\n(dry run — nothing written)')

  await terminate(db)
}
