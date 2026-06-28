import { useState } from 'react'
import { PageHeader } from '../components/Card.jsx'
import Modal, { Button } from '../components/Modal.jsx'
import { GearIcon } from '../components/Icons.jsx'
import { useLocalState } from '../lib/storage.js'
import { TrafficModule, TrafficConfig } from './Dashboard.jsx'

// Full-page version of the dashboard Traffic module: same live drive time and
// route, but the map fills the whole page. Its route is stored separately from
// any dashboard traffic modules so this page has its own configuration.
const DEFAULT_SETTINGS = { label: '', origin: '', destination: '', via: [] }

export default function Traffic() {
  const [settings, setSettings] = useLocalState('traffic-page', DEFAULT_SETTINGS)
  const [configOpen, setConfigOpen] = useState(false)
  const patch = (partial) => setSettings((s) => ({ ...s, ...partial }))

  return (
    <div className="flex h-full flex-col">
      <PageHeader title={settings.label?.trim() || 'Traffic'} subtitle="Live drive time & route">
        <Button variant="ghost" onClick={() => setConfigOpen(true)}>
          <span className="flex items-center gap-2">
            <GearIcon className="h-5 w-5" /> Configure
          </span>
        </Button>
      </PageHeader>

      <div className="min-h-0 flex-1">
        <TrafficModule settings={settings} fullHeight />
      </div>

      <Modal
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        title="Traffic settings"
        footer={<Button onClick={() => setConfigOpen(false)}>Done</Button>}
      >
        <TrafficConfig settings={settings} onChange={patch} />
      </Modal>
    </div>
  )
}
