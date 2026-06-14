import { useMemo, useState } from 'react'
import Card, { PageHeader } from '../components/Card.jsx'
import Modal, { Button, fieldClass } from '../components/Modal.jsx'
import { useLocalState } from '../lib/storage.js'
import { CheckIcon, PlusIcon, TrashIcon } from '../components/Icons.jsx'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MEALS = ['Breakfast', 'Lunch', 'Dinner']

const SEED_RECIPES = [
  {
    id: 'r-oats',
    name: 'Overnight Oats',
    ingredients: ['Rolled oats', 'Milk', 'Chia seeds', 'Honey', 'Blueberries'],
    instructions: 'Combine oats, milk, and chia. Refrigerate overnight. Top with honey and blueberries.',
  },
  {
    id: 'r-tacos',
    name: 'Chicken Tacos',
    ingredients: ['Chicken breast', 'Tortillas', 'Lime', 'Onion', 'Cilantro', 'Avocado'],
    instructions: 'Season and grill chicken. Warm tortillas. Assemble with onion, cilantro, lime, and avocado.',
  },
]

const emptyRecipe = () => ({
  id: crypto.randomUUID(),
  name: '',
  ingredientsText: '',
  instructions: '',
})

export default function Meals() {
  const [recipes, setRecipes] = useLocalState('meals-recipes', SEED_RECIPES)
  const [plan, setPlan] = useLocalState('meals-plan', {})
  const [checked, setChecked] = useLocalState('meals-grocery-checked', {})

  const [recipeDraft, setRecipeDraft] = useState(null)
  const [picker, setPicker] = useState(null) // { day, meal }

  const recipeById = useMemo(
    () => Object.fromEntries(recipes.map((r) => [r.id, r])),
    [recipes],
  )

  // Auto-generated grocery list: unique ingredients across all planned meals.
  const grocery = useMemo(() => {
    const set = new Map() // lower → display
    for (const day of DAYS) {
      for (const meal of MEALS) {
        const id = plan[day]?.[meal]
        const r = id && recipeById[id]
        if (!r) continue
        for (const ing of r.ingredients) {
          const k = ing.trim().toLowerCase()
          if (k) set.set(k, ing.trim())
        }
      }
    }
    return [...set.values()].sort((a, b) => a.localeCompare(b))
  }, [plan, recipeById])

  const assign = (day, meal, recipeId) => {
    setPlan((p) => ({ ...p, [day]: { ...p[day], [meal]: recipeId } }))
    setPicker(null)
  }

  const saveRecipe = () => {
    if (!recipeDraft.name.trim()) return
    const recipe = {
      id: recipeDraft.id,
      name: recipeDraft.name.trim(),
      ingredients: recipeDraft.ingredientsText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      instructions: recipeDraft.instructions.trim(),
    }
    setRecipes((list) => {
      const exists = list.some((r) => r.id === recipe.id)
      return exists ? list.map((r) => (r.id === recipe.id ? recipe : r)) : [...list, recipe]
    })
    setRecipeDraft(null)
  }

  const editRecipe = (r) =>
    setRecipeDraft({
      id: r.id,
      name: r.name,
      ingredientsText: r.ingredients.join('\n'),
      instructions: r.instructions,
    })

  const deleteRecipe = (id) => {
    setRecipes((list) => list.filter((r) => r.id !== id))
    // Remove from any plan slots.
    setPlan((p) => {
      const next = {}
      for (const [day, meals] of Object.entries(p)) {
        next[day] = {}
        for (const [meal, rid] of Object.entries(meals)) {
          next[day][meal] = rid === id ? undefined : rid
        }
      }
      return next
    })
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Meals" subtitle="Plan the week, store recipes, build the list" />

      {/* Weekly planner grid */}
      <Card className="mb-8 overflow-x-auto p-0">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="w-24 border-b border-r border-border p-3 text-left text-xs font-semibold text-gray-500" />
              {DAYS.map((d) => (
                <th
                  key={d}
                  className="border-b border-r border-border p-3 text-xs font-semibold text-gray-400"
                >
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MEALS.map((meal) => (
              <tr key={meal}>
                <td className="border-b border-r border-border p-3 text-sm font-semibold text-gray-300">
                  {meal}
                </td>
                {DAYS.map((day) => {
                  const id = plan[day]?.[meal]
                  const r = id && recipeById[id]
                  return (
                    <td key={day} className="border-b border-r border-border p-1.5 align-top">
                      <button
                        type="button"
                        onClick={() => setPicker({ day, meal })}
                        className={[
                          'flex min-h-[56px] w-full items-center justify-center rounded-lg px-2 py-2 text-center text-xs active:scale-[0.98]',
                          r
                            ? 'bg-accent/10 font-medium text-accent shadow-glow'
                            : 'bg-white/5 text-gray-600',
                        ].join(' ')}
                      >
                        {r ? r.name : <PlusIcon className="h-5 w-5" />}
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
        {/* Recipes */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-300">Recipes</h2>
            <Button onClick={() => setRecipeDraft(emptyRecipe())} className="px-4 py-2">
              <span className="flex items-center gap-2">
                <PlusIcon className="h-5 w-5" /> New
              </span>
            </Button>
          </div>
          <div className="space-y-3">
            {recipes.length === 0 && (
              <Card className="text-sm text-gray-500">No recipes yet.</Card>
            )}
            {recipes.map((r) => (
              <Card key={r.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <h3 className="font-bold text-white">{r.name}</h3>
                    <p className="mt-1 text-xs text-gray-400">
                      {r.ingredients.length} ingredients
                    </p>
                    {r.instructions && (
                      <p className="mt-2 line-clamp-2 text-sm text-gray-400">
                        {r.instructions}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => editRecipe(r)}
                      className="rounded-lg bg-white/5 px-3 py-2 text-xs font-semibold text-gray-300 active:scale-95"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteRecipe(r.id)}
                      aria-label={`Delete ${r.name}`}
                      className="rounded-lg bg-loss/15 px-3 py-2 text-loss active:scale-95"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Grocery list */}
        <div>
          <h2 className="mb-3 text-lg font-semibold text-gray-300">
            Grocery List{' '}
            <span className="font-mono text-sm text-gray-500">({grocery.length})</span>
          </h2>
          <Card>
            {grocery.length === 0 ? (
              <p className="text-sm text-gray-500">
                Plan some meals to build your list automatically.
              </p>
            ) : (
              <ul className="space-y-1">
                {grocery.map((item) => {
                  const isChecked = !!checked[item.toLowerCase()]
                  return (
                    <li key={item}>
                      <button
                        type="button"
                        onClick={() =>
                          setChecked((c) => ({
                            ...c,
                            [item.toLowerCase()]: !isChecked,
                          }))
                        }
                        className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left active:bg-white/5"
                      >
                        <span
                          className={[
                            'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border-2',
                            isChecked
                              ? 'border-gain bg-gain text-bg'
                              : 'border-border',
                          ].join(' ')}
                        >
                          {isChecked && <CheckIcon className="h-4 w-4" />}
                        </span>
                        <span
                          className={
                            isChecked ? 'text-gray-500 line-through' : 'text-gray-200'
                          }
                        >
                          {item}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {/* Recipe picker for a planner slot */}
      <Modal
        open={!!picker}
        onClose={() => setPicker(null)}
        title={picker ? `${picker.day} · ${picker.meal}` : ''}
      >
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => assign(picker.day, picker.meal, undefined)}
            className="w-full rounded-xl bg-white/5 px-4 py-3 text-left text-gray-400 active:scale-[0.98]"
          >
            Clear slot
          </button>
          {recipes.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => assign(picker.day, picker.meal, r.id)}
              className="w-full rounded-xl bg-white/5 px-4 py-3 text-left font-medium text-white active:scale-[0.98]"
            >
              {r.name}
            </button>
          ))}
        </div>
      </Modal>

      {/* Add / edit recipe */}
      <Modal
        open={!!recipeDraft}
        onClose={() => setRecipeDraft(null)}
        title={recipeDraft && recipes.some((r) => r.id === recipeDraft.id) ? 'Edit Recipe' : 'New Recipe'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRecipeDraft(null)}>
              Cancel
            </Button>
            <Button onClick={saveRecipe}>Save</Button>
          </>
        }
      >
        {recipeDraft && (
          <div className="space-y-4">
            <input
              autoFocus
              className={fieldClass}
              placeholder="Recipe name"
              value={recipeDraft.name}
              onChange={(e) => setRecipeDraft({ ...recipeDraft, name: e.target.value })}
            />
            <div>
              <label className="mb-1 block text-xs text-gray-500">
                Ingredients (one per line)
              </label>
              <textarea
                rows={5}
                className={fieldClass}
                placeholder={'Eggs\nFlour\nMilk'}
                value={recipeDraft.ingredientsText}
                onChange={(e) =>
                  setRecipeDraft({ ...recipeDraft, ingredientsText: e.target.value })
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">Instructions</label>
              <textarea
                rows={4}
                className={fieldClass}
                placeholder="Steps…"
                value={recipeDraft.instructions}
                onChange={(e) =>
                  setRecipeDraft({ ...recipeDraft, instructions: e.target.value })
                }
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
