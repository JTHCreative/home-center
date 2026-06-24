/* eslint-disable react-refresh/only-export-components */
import Modal, { Button, fieldClass } from './Modal.jsx'
import { TrashIcon } from './Icons.jsx'

// Household member accent palette (tap to pick when adding/editing a member).
// Nature-inspired Color Design System palette, shared across the app.
export const MEMBER_COLORS = [
  '#E28F54', // Ember
  '#52C167', // Sage
  '#61A2E0', // Water
  '#AC88E0', // Thistle
  '#CDA86C', // Sand
  '#8FC992', // Fern
  '#D8685E', // Dusk
  '#82B0C8', // Fog
  '#BD9541', // Lichen
  '#D078A9', // Heather
  '#8C948F', // Stone
  '#44B2A8', // Tide
]

// Initials for a member badge (first two word-initials, uppercased).
export const initials = (name) =>
  (name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('')

// Small circular badge showing a member's initials in their color. `size` is a
// number (px) or any CSS length string (e.g. a clamp()/container-query value),
// in which case the font size is derived with calc().
export function MemberBadge({ member, size = 18, ring = false }) {
  const fontSize = typeof size === 'number' ? size * 0.42 : `calc(${size} * 0.42)`
  return (
    <span
      className="flex flex-shrink-0 items-center justify-center rounded-full font-mono font-bold leading-none"
      style={{
        width: size,
        height: size,
        fontSize,
        backgroundColor: ring ? 'transparent' : member.color,
        color: ring ? member.color : '#0D1117',
        border: ring ? `1.5px solid ${member.color}` : 'none',
      }}
      title={member.name}
    >
      {initials(member.name)}
    </span>
  )
}

// Multi-select row of member chips for picking members.
export function MemberPicker({ members, selected, onToggle, emptyHint = 'No household members yet.' }) {
  if (members.length === 0) {
    return <p className="text-xs text-gray-600">{emptyHint}</p>
  }
  return (
    <div className="flex flex-wrap gap-2">
      {members.map((mem) => {
        const on = selected.includes(mem.id)
        return (
          <button
            key={mem.id}
            type="button"
            onClick={() => onToggle(mem.id)}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold active:scale-95"
            style={{
              backgroundColor: on ? `${mem.color}22` : 'rgba(255,255,255,0.05)',
              color: on ? mem.color : '#8C948F',
              outline: on ? `2px solid ${mem.color}` : 'none',
            }}
          >
            <MemberBadge member={mem} ring={!on} />
            {mem.name}
          </button>
        )
      })}
    </div>
  )
}

export function MemberModal({ draft, setDraft, onClose, onSave, onDelete, isExisting }) {
  if (!draft) return null
  return (
    <Modal
      open={!!draft}
      onClose={onClose}
      title={isExisting ? 'Edit Member' : 'Add Member'}
      footer={
        <>
          {isExisting && (
            <Button variant="danger" onClick={onDelete}>
              <TrashIcon className="h-5 w-5" />
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSave}>Save</Button>
        </>
      }
    >
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-xs text-gray-500">Name</label>
          <input
            autoFocus
            className={fieldClass}
            placeholder="Member name (e.g. Justin)"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </div>
        <div>
          <label className="mb-2 block text-xs text-gray-500">Color</label>
          <div className="flex flex-wrap gap-3">
            {MEMBER_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setDraft({ ...draft, color: c })}
                aria-label={`Color ${c}`}
                className="h-10 w-10 rounded-full active:scale-90"
                style={{
                  backgroundColor: c,
                  outline: draft.color === c ? '3px solid white' : 'none',
                  outlineOffset: 2,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}
