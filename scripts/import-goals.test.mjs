/**
 * Regression tests for the import-goals merge. Pure functions only — no network,
 * no Firestore, no dependencies:
 *
 *   node scripts/import-goals.test.mjs
 *
 * The merge writes to the live household board with no undo, so the tricky
 * cases (habits and repeating goals matched rather than duplicated, legacy
 * checkboxes carrying the app's default target of 7, week binding) are pinned
 * here against shapes taken from the real data.
 */
import { mergeGoals, formatReport, findSection } from './import-goals.mjs'

const WEEK = '2026-08-02'
const PREV = '2026-07-26'
let fails = 0
const check = (name, cond, extra) => {
  if (!cond) { fails++; console.log(`FAIL ${name}`, extra ?? '') } else console.log(`ok   ${name}`)
}

const base = () => ([
  { id: 's1', title: "Justin's Goals", color: '#52C167', items: [] },
  { id: 's2', title: "Kitty's Goals", color: '#E28F54', items: [] },
  { id: 's3', title: 'Weekly Goals', color: '#61A2E0', items: [] },
])

// --- 1. fresh import ---------------------------------------------------------
let r = mergeGoals(base(), {
  "Justin's Goals": ['Take out trash', { title: 'Gym', target: 3 }, { title: 'Water', daily: true }],
  'Kitty': [{ title: 'Yoga', target: 2 }],
  'Weekly Goals': [{ title: 'Deep clean', children: ['Kitchen', 'Bath'] }],
}, WEEK)

const j = r.sections[0].items
check('3 goals into Justin', j.length === 3, j.length)
check('plain goal is checkbox', j[0].type === 'checkbox' && j[0].target === 1)
check('3 boxes -> tally target 3', j[1].type === 'tally' && j[1].target === 3)
check('daily -> tally target 7', j[2].type === 'tally' && j[2].target === 7 && j[2].daily === true)
check('stamped to week', j.every((it) => it.week === WEEK && it.repeats === false))
check('has uuid ids', new Set(j.map((it) => it.id)).size === 3 && j[0].id.length === 36)
check('loose section key "Kitty" matched', r.sections[1].items.length === 1)
const wk = r.sections[2].items[0]
check('children built with ids', wk.children.length === 2 && wk.children[0].id.length === 36)
check('checklist stays checkbox', wk.type === 'checkbox')
check('added report', r.report.sections[0].added.length === 3)

// --- 2. re-import same photo is a no-op -------------------------------------
const withProgress = r.sections
const r2 = mergeGoals(withProgress, {
  "Justin's Goals": ['take out trash!', { title: 'Gym 3x', target: 3 }, { title: 'Water', daily: true }],
}, WEEK)
check('re-import adds nothing', r2.sections[0].items.length === 3, r2.sections[0].items.length)
check('re-import skips all 3', r2.report.sections[0].skipped.length === 3)
check('ids preserved (progress survives)', r2.sections[0].items[1].id === j[1].id)

// --- 3. corrected photo adds only the new goal -------------------------------
const r3 = mergeGoals(withProgress, {
  "Justin's Goals": ['Take out trash', { title: 'Gym', target: 3 }, { title: 'Water', daily: true }, 'Read 20 min'],
}, WEEK)
check('only new goal added', r3.sections[0].items.length === 4)
check('report lists 1 added', r3.report.sections[0].added.length === 1 && r3.report.sections[0].added[0] === 'Read 20 min')

// --- 4. box count changed -> retarget in place -------------------------------
const beforeRetarget = JSON.stringify(withProgress)
const r4 = mergeGoals(withProgress, { "Justin's Goals": [{ title: 'Gym', target: 4 }] }, WEEK)
check('retarget does not mutate input', JSON.stringify(withProgress) === beforeRetarget)
const gym = r4.sections[0].items[1]
check('target raised in place', gym.target === 4 && gym.id === j[1].id)
check('no duplicate added', r4.sections[0].items.length === 3)
check('retarget reported', r4.report.sections[0].retargeted[0].from === 3 && r4.report.sections[0].retargeted[0].to === 4)

// --- 5. next week: a goal from a past week is carried forward, not re-added --
const r5 = mergeGoals(withProgress, { "Justin's Goals": [{ title: 'Gym', target: 3 }] }, '2026-08-09')
check('next week adds no copy', r5.sections[0].items.length === 3, r5.sections[0].items.length)
check('same item kept (checks survive)', r5.sections[0].items[1].id === j[1].id)
check('flipped to repeat weekly', r5.sections[0].items[1].repeats === true)
check('original week stamp untouched', r5.sections[0].items[1].week === WEEK)
check('carried-forward reported', r5.report.sections[0].recurring[0].title === 'Gym' &&
  r5.report.sections[0].recurring[0].since === WEEK)
check('carry-forward does not mutate input', withProgress[0].items[1].repeats === false)

// --- 5b. carried forward AND retargeted in one pass --------------------------
const r5b = mergeGoals(withProgress, { "Justin's Goals": [{ title: 'Gym', target: 5 }] }, '2026-08-09')
check('carry forward + retarget together', r5b.sections[0].items[1].repeats === true &&
  r5b.sections[0].items[1].target === 5 && r5b.sections[0].items[1].id === j[1].id)
check('both reported', r5b.report.sections[0].recurring.length === 1 &&
  r5b.report.sections[0].retargeted.length === 1)
check('not double counted as added', r5b.report.sections[0].added.length === 0)

// --- 5c. already recurring: second import is a plain no-op -------------------
const r5c = mergeGoals(r5.sections, { "Justin's Goals": [{ title: 'Gym', target: 3 }] }, '2026-08-16')
check('idempotent once recurring', r5c.sections[0].items.length === 3 &&
  r5c.report.sections[0].skipped.length === 1 && r5c.report.sections[0].recurring.length === 0)

// --- 6. repeating / habit goals are visible every week -> never duplicated ---
const withRepeat = base()
withRepeat[0].items.push({ id: 'keep', title: 'Gym', type: 'tally', target: 3, repeats: true, week: PREV, children: [], habit: false })
withRepeat[0].items.push({ id: 'hab', title: 'Floss', type: 'checkbox', target: 1, repeats: false, week: PREV, children: [], habit: true })
const r6 = mergeGoals(withRepeat, { "Justin's Goals": [{ title: 'Gym', target: 3 }, 'Floss'] }, WEEK)
check('repeating goal not duplicated', r6.sections[0].items.length === 2, r6.sections[0].items.length)
check('habit goal not duplicated', r6.report.sections[0].skipped.length === 2)
check('habit flag preserved', r6.sections[0].items[1].habit === true)

// --- 7. immutability + unmatched sections ------------------------------------
const orig = base()
orig[0].items.push({ id: 'x', title: 'Old', type: 'checkbox', target: 1, repeats: false, week: WEEK, children: [] })
const snapshot = JSON.stringify(orig)
const r7 = mergeGoals(orig, { "Justin's Goals": ['New'], 'Dog Goals': ['Walk'] }, WEEK)
check('input not mutated', JSON.stringify(orig) === snapshot)
check('unmatched section reported', r7.report.unmatchedSections[0] === 'Dog Goals')
check('empty/blank titles dropped', mergeGoals(base(), { Weekly: ['', '  ', { title: '' }] }, WEEK).sections[2].items.length === 0)

check('findSection exact beats loose', findSection(base(), 'Weekly Goals').id === 's3')

// --- 6b. sub-items written under a goal that already exists ------------------
const withKids = base()
withKids[2].items.push(
  { id: 'k1', title: 'Costco Run', type: 'checkbox', target: 1, repeats: false, week: WEEK,
    children: [{ id: 'c1', title: 'body wash' }] },
  { id: 'k2', title: 'Luna Teeth', type: 'tally', target: 7, repeats: true, week: PREV, children: [] },
)
const r6b = mergeGoals(withKids, {
  Weekly: [
    { title: 'Costco Run', children: ['body wash', 'chicken stock', 'Avocado'] },
    { title: 'Luna Teeth', daily: true, children: ['nope'] },
  ],
}, WEEK)
const cr = r6b.sections[2].items[0]
check('no duplicate goal for sub-item change', r6b.sections[2].items.length === 2)
check('only new sub-items appended', cr.children.length === 3 &&
  cr.children[0].id === 'c1' && cr.children.map((c) => c.title).join() === 'body wash,chicken stock,Avocado')
check('sub-items reported', r6b.report.sections[0].subitems[0].added.join() === 'chicken stock,Avocado')
check('tally keeps its boxes, sub-items refused', r6b.sections[2].items[1].children.length === 0 &&
  r6b.report.sections[0].subitems[1].skipped.join() === 'nope')
check('refused sub-items do not downgrade the tally', r6b.sections[2].items[1].type === 'tally' &&
  r6b.sections[2].items[1].target === 7 && r6b.report.sections[0].retargeted.length === 0)
check('sub-item merge does not mutate input', withKids[2].items[0].children.length === 1)
check('goal gaining only sub-items is not "already there"', r6b.report.sections[0].skipped.length === 1)

// --- 7b. section routing, incl. the board's own headings ---------------------
// Live section titles: the catch-all list is "Weekly", not "Weekly Goals".
const liveSecs = [
  { id: 'j', title: "Justin's Goals", items: [] },
  { id: 'w', title: 'Weekly', items: [] },
  { id: 'k', title: "Kitty's Goals", items: [] },
]
const routes = {
  // The board heads its lists "<name>'s Weekly Goals" — "Weekly" in the middle
  // must not drag them into the Weekly section.
  "Justin's Weekly Goals": 'j',
  "Kitty's Weekly Goals": 'k',
  'Weekly Goals': 'w',
  Weekly: 'w',
  "Justin's Goals": 'j',
  Justin: 'j',
  Kitty: 'k',
  'justin s weekly goals!': 'j',
}
for (const [key, want] of Object.entries(routes)) {
  const got = findSection(liveSecs, key)
  check(`route "${key}" -> ${want}`, got?.id === want, got?.title)
}
check('unknown heading routes nowhere', findSection(liveSecs, 'Dog Goals') === null)
check('goals-only heading is not a wildcard', findSection(liveSecs, 'Goals')?.id === 'w')

// --- 8. real-world board shapes ---------------------------------------------
// The live board's third section is titled "Weekly", not "Weekly Goals".
const live = [
  { id: 'a', title: "Justin's Goals", items: [
    { id: 'p1', title: 'Read Bible', type: 'tally', target: 7, daily: true, repeats: true, habit: true, week: '2026-07-12', children: [] },
    { id: 'p2', title: 'Run 1 Mile', type: 'tally', target: 3, repeats: true, habit: true, week: '2026-07-12', children: [] },
    // legacy checkbox carrying the app's default target of 7
    { id: 'p3', title: 'Book Denver Car', type: 'checkbox', target: 7, repeats: false, habit: false, week: WEEK, children: [] },
  ] },
  { id: 'b', title: 'Weekly', items: [] },
  { id: 'c', title: "Kitty's Goals", items: [
    // pre-per-week item: repeats undefined -> visible every week
    { id: 'p4', title: 'Drink 60 Oz', type: 'tally', target: 7, habit: true, children: [] },
  ] },
]
const r8 = mergeGoals(live, {
  "Justin's Goals": [{ title: 'Read Bible', target: 7, daily: true }, { title: 'Run 1 Mile', target: 3 }, 'Book Denver Car'],
  'Weekly Goals': ['Plan birthday'],
  'Kitty': [{ title: 'Drink 60 Oz', target: 7, daily: true }],
}, WEEK)
check('"Weekly Goals" key matches "Weekly" section', r8.sections[1].items.length === 1)
check('habits/repeats skipped, nothing added to Justin', r8.sections[0].items.length === 3)
check('legacy checkbox target=7 is NOT churned', r8.report.sections[0].retargeted.length === 0 &&
  r8.sections[0].items[2].target === 7)

// A goal last seen in an earlier week comes back as recurring, not as a copy.
const r8b = mergeGoals(live, { "Justin's Goals": ['Book Denver Car'] }, '2026-08-09')
check('past-week goal not duplicated', r8b.sections[0].items.length === 3)
check('past-week goal now recurring', r8b.sections[0].items[2].repeats === true &&
  r8b.sections[0].items[2].id === 'p3')
check('legacy target=7 survives the carry forward', r8b.sections[0].items[2].target === 7 &&
  r8b.sections[0].items[2].type === 'checkbox' && r8b.report.sections[0].retargeted.length === 0)
check('undefined-repeats item skipped', r8.sections[2].items.length === 1)
check('checkbox -> tally still detected', (() => {
  const r = mergeGoals(live, { "Justin's Goals": [{ title: 'Book Denver Car', target: 3 }] }, WEEK)
  const it = r.sections[0].items[2]
  return it.type === 'tally' && it.target === 3 && it.id === 'p3' &&
    r.report.sections[0].retargeted[0].from === 1 && r.report.sections[0].retargeted[0].to === 3
})())
check('tally -> checkbox detected', (() => {
  const r = mergeGoals(live, { "Justin's Goals": [{ title: 'Run 1 Mile' }] }, WEEK)
  return r.sections[0].items[1].type === 'checkbox' && r.report.sections[0].retargeted[0].to === 1
})())

console.log('\n--- sample report ---')
console.log(formatReport(r3.report, { dryRun: true }))
console.log(fails ? `\n${fails} FAILURES` : '\nall passed')
process.exit(fails ? 1 : 0)
