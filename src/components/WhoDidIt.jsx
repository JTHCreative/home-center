import Modal, { Button } from './Modal.jsx'
import { MemberBadge } from './Member.jsx'

// Picker shown when a shared habit is checked from the Goals page or the
// dashboard Goals module: the check itself has already landed for everyone's
// display — this chooses which member earns the point. Dismissing (or the
// "No one" button) leaves the check with no point awarded.
export default function WhoDidItModal({ open, title, members, onPick, onClose }) {
  if (!open) return null
  return (
    <Modal
      open
      onClose={onClose}
      title="Who did it?"
      size="narrow"
      footer={
        <Button variant="ghost" onClick={onClose}>
          No one
        </Button>
      }
    >
      <p className="mb-4 text-sm text-gray-400">
        <span className="font-semibold text-gray-200">{title}</span> is a shared habit — who earns
        the point?
      </p>
      <div className="space-y-2">
        {members.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onPick(m.id)}
            className="flex w-full items-center gap-3 rounded-xl bg-white/5 px-4 py-3 text-left active:scale-[0.98]"
          >
            <MemberBadge member={m} size={28} />
            <span className="flex-1 font-semibold" style={{ color: m.color }}>
              {m.name}
            </span>
          </button>
        ))}
      </div>
    </Modal>
  )
}
