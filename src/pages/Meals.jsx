import { useMemo, useState } from 'react'
import Card, { PageHeader } from '../components/Card.jsx'
import Modal, { Button, fieldClass } from '../components/Modal.jsx'
import { useLocalState } from '../lib/storage.js'
import { CheckIcon, PlusIcon, TrashIcon } from '../components/Icons.jsx'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const SLOTS = ['Breakfast', 'Lunch', 'Dinner']

// A meal is either a custom 'recipe' (with ingredients) or 'takeout' (purchased).
const SEED_MEALS = [
  {
    id: 'r-oats',
    type: 'recipe',
    name: 'Overnight Oats',
    ingredients: ['Rolled oats', 'Milk', 'Chia seeds', 'Honey', 'Blueberries'],
    instructions: 'Combine oats, milk, and chia. Refrigerate overnight. Top with honey and blueberries.',
  },
  {
    id: 'r-tacos',
    type: 'recipe',
    name: 'Chicken Tacos',
    ingredients: ['Chicken breast', 'Tortillas', 'Lime', 'Onion', 'Cilantro', 'Avocado'],
    instructions: 'Season and grill chicken. Warm tortillas. Assemble with onion, cilantro, lime, and avocado.',
  },
]

const mealType = (m) => m.type || 'recipe' // older saved data has no type

// Draft ingredients are {id, text} rows so each gets its own touch-friendly field.
const emptyMeal = () => ({
  id: crypto.randomUUID(),
  type: 'recipe',
  name: '',
  ingredients: [{ id: crypto.randomUUID(), text: '' }],
  instructions: '',
  place: '',
  details: '',
  cost: '',
})

export default function Meals() {
  const [meals, setMeals] = useLocalState('meals-recipes', SEED_MEALS)
  const [plan, setPlan] = useLocalState('meals-plan', {})
  const [checked, setChecked] = useLocalState('meals-grocery-checked', {})

  const [mealDraft, setMealDraft] = useState(null)
  const [picker, setPicker] = useState(null) // { day, slot }

  const mealById = useMemo(() => Object.fromEntries(meals.map((m) => [m.id, m])), [meals])

  // Auto-generated grocery list: unique ingredients across all planned recipes
  // (takeout has nothing to buy).
  const grocery = useMemo(() => {
    const set = new Map() // lower → display
    for (const day of DAYS) {
      for (const slot of SLOTS) {
        const m = mealById[plan[day]?.[slot]]
        if (!m || mealType(m) !== 'recipe') continue
        for (const ing of m.ingredients || []) {
          const k = ing.trim().toLowerCase()
          if (k) set.set(k, ing.trim())
        }
      }
    }
    return [...set.values()].sort((a, b) => a.localeCompare(b))
  }, [plan, mealById])

  const assign = (day, slot, mealId) => {
    setPlan((p) => ({ ...p, [day]: { ...p[day], [slot]: mealId } }))
    setPicker(null)
  }

  const saveMeal = () => {
    if (!mealDraft.name.trim()) return
    const base = { id: mealDraft.id, type: mealDraft.type, name: mealDraft.name.trim() }
    const meal =
      mealDraft.type === 'takeout'
        ? {
            ...base,
            place: mealDraft.place.trim(),
            details: mealDraft.details.trim(),
            cost: mealDraft.cost === '' ? null : Number(mealDraft.cost),
          }
        : {
            ...base,
            ingredients: mealDraft.ingredients.map((i) => i.text.trim()).filter(Boolean),
            instructions: mealDraft.instructions.trim(),
          }
    setMeals((list) => {
      const exists = list.some((m) => m.id === meal.id)
      return exists ? list.map((m) => (m.id === meal.id ? meal : m)) : [...list, meal]
    })
    setMealDraft(null)
  }

  const editMeal = (m) =>
    setMealDraft({
      id: m.id,
      type: mealType(m),
      name: m.name,
      ingredients: ((m.ingredients?.length ? m.ingredients : ['']) || ['']).map((t) => ({
        id: crypto.randomUUID(),
        text: t,
      })),
      instructions: m.instructions || '',
      place: m.place || '',
      details: m.details || '',
      cost: m.cost ?? '',
    })

  // Ingredient-row editing within the recipe draft.
  const addIngredient = () =>
    setMealDraft((d) => ({ ...d, ingredients: [...d.ingredients, { id: crypto.randomUUID(), text: '' }] }))
  const setIngredient = (id, text) =>
    setMealDraft((d) => ({ ...d, ingredients: d.ingredients.map((i) => (i.id === id ? { ...i, text } : i)) }))
  const removeIngredient = (id) =>
    setMealDraft((d) => ({ ...d, ingredients: d.ingredients.filter((i) => i.id !== id) }))

  const deleteMeal = (id) => {
    setMeals((list) => list.filter((m) => m.id !== id))
    setPlan((p) => {
      const next = {}
      for (const [day, slots] of Object.entries(p)) {
        next[day] = {}
        for (const [slot, mid] of Object.entries(slots)) next[day][slot] = mid === id ? undefined : mid
      }
      return next
    })
  }

  const isEditing = mealDraft && meals.some((m) => m.id === mealDraft.id)

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Meals" subtitle="Plan the week with recipes & takeout, build the grocery list" />

      {/* Weekly planner grid */}
      <Card className="mb-8 overflow-x-auto p-0">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="w-24 border-b border-r border-border p-3 text-left text-xs font-semibold text-gray-500" />
              {DAYS.map((d) => (
                <th key={d} className="border-b border-r border-border p-3 text-xs font-semibold text-gray-400">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SLOTS.map((slot) => (
              <tr key={slot}>
                <td className="border-b border-r border-border p-3 text-sm font-semibold text-gray-300">
                  {slot}
                </td>
                {DAYS.map((day) => {
                  const m = mealById[plan[day]?.[slot]]
                  const takeout = m && mealType(m) === 'takeout'
                  return (
                    <td key={day} className="border-b border-r border-border p-1.5 align-top">
                      <button
                        type="button"
                        onClick={() => setPicker({ day, slot })}
                        className={[
                          'flex min-h-[56px] w-full flex-col items-center justify-center rounded-lg px-2 py-2 text-center text-xs active:scale-[0.98]',
                          m ? 'font-medium shadow-glow' : 'bg-white/5 text-gray-600',
                          m && (takeout ? 'bg-[#F0883E]/15 text-[#F0883E]' : 'bg-accent/10 text-accent'),
                        ].join(' ')}
                      >
                        {m ? (
                          <>
                            <span className="line-clamp-2">{m.name}</span>
                            {takeout && <span className="mt-0.5 text-[9px] uppercase opacity-70">Takeout</span>}
                          </>
                        ) : (
                          <PlusIcon className="h-5 w-5" />
                        )}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Meals (recipes + takeout) */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-300">Meals</h2>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                className="px-4 py-2"
                onClick={() => setMealDraft({ ...emptyMeal(), type: 'takeout' })}
              >
                <span className="flex items-center gap-2"><PlusIcon className="h-4 w-4" /> Takeout</span>
              </Button>
              <Button className="px-4 py-2" onClick={() => setMealDraft(emptyMeal())}>
                <span className="flex items-center gap-2"><PlusIcon className="h-4 w-4" /> Recipe</span>
              </Button>
            </div>
          </div>
          <div className="space-y-3">
            {meals.length === 0 && <Card className="text-sm text-gray-500">No meals yet.</Card>}
            {meals.map((m) => {
              const takeout = mealType(m) === 'takeout'
              return (
                <Card key={m.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-white">{m.name}</h3>
                        <span
                          className="rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase"
                          style={
                            takeout
                              ? { backgroundColor: '#F0883E22', color: '#F0883E' }
                              : { backgroundColor: 'rgb(var(--c-accent) / 0.15)', color: 'rgb(var(--c-accent))' }
                          }
                        >
                          {takeout ? 'Takeout' : 'Recipe'}
                        </span>
                      </div>
                      {takeout ? (
                        <p className="mt-1 text-xs text-gray-400">
                          {m.place ? `from ${m.place}` : 'Takeout'}
                          {m.cost != null && m.cost !== '' ? ` · $${Number(m.cost).toFixed(2)}` : ''}
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-gray-400">{(m.ingredients || []).length} ingredients</p>
                      )}
                      {(takeout ? m.details : m.instructions) && (
                        <p className="mt-2 line-clamp-2 text-sm text-gray-400">
                          {takeout ? m.details : m.instructions}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => editMeal(m)}
                        className="rounded-lg bg-white/5 px-3 py-2 text-xs font-semibold text-gray-300 active:scale-95"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteMeal(m.id)}
                        aria-label={`Delete ${m.name}`}
                        className="rounded-lg bg-loss/15 px-3 py-2 text-loss active:scale-95"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        </div>

        {/* Grocery list */}
        <div>
          <h2 className="mb-3 text-lg font-semibold text-gray-300">
            Grocery List <span className="font-mono text-sm text-gray-500">({grocery.length})</span>
          </h2>
          <Card>
            {grocery.length === 0 ? (
              <p className="text-sm text-gray-500">Plan some recipe meals to build your list automatically.</p>
            ) : (
              <ul className="space-y-1">
                {grocery.map((item) => {
                  const isChecked = !!checked[item.toLowerCase()]
                  return (
                    <li key={item}>
                      <button
                        type="button"
                        onClick={() => setChecked((c) => ({ ...c, [item.toLowerCase()]: !isChecked }))}
                        className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left active:bg-white/5"
                      >
                        <span
                          className={[
                            'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border-2',
                            isChecked ? 'border-gain bg-gain text-bg' : 'border-border',
                          ].join(' ')}
                        >
                          {isChecked && <CheckIcon className="h-4 w-4" />}
                        </span>
                        <span className={isChecked ? 'text-gray-500 line-through' : 'text-gray-200'}>{item}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {/* Meal picker for a planner slot */}
      <Modal
        open={!!picker}
        onClose={() => setPicker(null)}
        title={picker ? `${picker.day} · ${picker.slot}` : ''}
      >
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => assign(picker.day, picker.slot, undefined)}
            className="w-full rounded-xl bg-white/5 px-4 py-3 text-left text-gray-400 active:scale-[0.98]"
          >
            Clear slot
          </button>
          <div className="grid gap-2 sm:grid-cols-2">
            {meals.map((m) => {
              const takeout = mealType(m) === 'takeout'
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => assign(picker.day, picker.slot, m.id)}
                  className="rounded-xl bg-white/5 px-4 py-3 text-left active:scale-[0.98]"
                >
                  <div className="font-medium text-white">{m.name}</div>
                  <div
                    className="font-mono text-[10px] uppercase"
                    style={{ color: takeout ? '#F0883E' : 'rgb(var(--c-accent))' }}
                  >
                    {takeout ? 'Takeout' : 'Recipe'}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </Modal>

      {/* Add / edit meal */}
      <Modal
        open={!!mealDraft}
        onClose={() => setMealDraft(null)}
        title={isEditing ? 'Edit Meal' : 'New Meal'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setMealDraft(null)}>Cancel</Button>
            <Button onClick={saveMeal}>Save</Button>
          </>
        }
      >
        {mealDraft && (
          <div className="space-y-4">
            {/* Type toggle */}
            <div className="flex gap-2">
              {[
                { id: 'recipe', label: 'Recipe' },
                { id: 'takeout', label: 'Takeout' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setMealDraft({ ...mealDraft, type: t.id })}
                  className={[
                    'flex-1 rounded-xl px-4 py-3 text-sm font-semibold active:scale-95',
                    mealDraft.type === t.id ? 'bg-accent/15 text-accent shadow-glow' : 'bg-white/5 text-gray-400',
                  ].join(' ')}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <input
              autoFocus
              className={fieldClass}
              placeholder={mealDraft.type === 'takeout' ? 'Meal name (e.g. Burrito Bowl)' : 'Recipe name'}
              value={mealDraft.name}
              onChange={(e) => setMealDraft({ ...mealDraft, name: e.target.value })}
            />

            {mealDraft.type === 'takeout' ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-4">
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">Place</label>
                    <input
                      className={fieldClass}
                      placeholder="e.g. Chipotle"
                      value={mealDraft.place}
                      onChange={(e) => setMealDraft({ ...mealDraft, place: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">Cost (optional)</label>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      className={fieldClass}
                      placeholder="0.00"
                      value={mealDraft.cost}
                      onChange={(e) => setMealDraft({ ...mealDraft, cost: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-500">Details</label>
                  <textarea
                    rows={7}
                    className={fieldClass}
                    placeholder="What you ordered…"
                    value={mealDraft.details}
                    onChange={(e) => setMealDraft({ ...mealDraft, details: e.target.value })}
                  />
                </div>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-gray-500">Ingredients</label>
                  <div className="space-y-2">
                    {mealDraft.ingredients.map((ing) => (
                      <div key={ing.id} className="flex items-center gap-2">
                        <input
                          className={fieldClass}
                          placeholder="e.g. 2 eggs"
                          value={ing.text}
                          onChange={(e) => setIngredient(ing.id, e.target.value)}
                        />
                        <button
                          type="button"
                          onClick={() => removeIngredient(ing.id)}
                          aria-label="Remove ingredient"
                          className="rounded-lg bg-loss/15 p-3 text-loss active:scale-95"
                        >
                          <TrashIcon className="h-5 w-5" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addIngredient}
                      className="flex items-center gap-2 rounded-xl bg-white/5 px-4 py-2.5 text-sm font-semibold text-gray-300 active:scale-95"
                    >
                      <PlusIcon className="h-4 w-4" /> Add ingredient
                    </button>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-500">Instructions</label>
                  <textarea
                    rows={7}
                    className={fieldClass}
                    placeholder="Steps…"
                    value={mealDraft.instructions}
                    onChange={(e) => setMealDraft({ ...mealDraft, instructions: e.target.value })}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
