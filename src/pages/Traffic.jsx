import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/Card.jsx'
import Modal, { Button } from '../components/Modal.jsx'
import { ChevronLeft, GearIcon } from '../components/Icons.jsx'
import { useLocalState } from '../lib/storage.js'
import {
  TrafficModule,
  TrafficConfig,
  defaultDashboard,
  migrateDashboard,
} from './Dashboard.jsx'

// Full-page version of the dashboard Traffic module: same live drive time and
// route, but the map fills the whole page.
//
// Two entry points:
//  - From the menu (no `m` query param): uses this page's own saved route.
//  - From tapping a dashboard Traffic module (`?m=<moduleId>`): shows that
//    module's route and offers a Back button. Editing writes back to that
//    module so the dashboard and the full page stay in sync.
const DEFAULT_SETTINGS = { label: '', origin: '', destination: '', via: [] }

export default function Traffic() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const moduleId = params.get('m')

  const [pageSettings, setPageSettings] = useLocalState('traffic-page', DEFAULT_SETTINGS)
  const [dash, setDash] = useLocalState('dashboard', defaultDashboard(), migrateDashboard)
  const [configOpen, setConfigOpen] = useState(false)

  const dashModule =
    moduleId && dash.modules.find((m) => m.id === moduleId && m.type === 'traffic')
  const fromDashboard = !!dashModule
  const settings = dashModule ? dashModule.settings : pageSettings

  const patch = (partial) => {
    if (dashModule) {
      setDash((c) => ({
        ...c,
        modules: c.modules.map((m) =>
          m.id === moduleId ? { ...m, settings: { ...m.settings, ...partial } } : m,
        ),
      }))
    } else {
      setPageSettings((s) => ({ ...s, ...partial }))
    }
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader title={settings.label?.trim() || 'Traffic'} subtitle="Live drive time & route">
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => setConfigOpen(true)}>
            <span className="flex items-center gap-2">
              <GearIcon className="h-5 w-5" /> Configure
            </span>
          </Button>
          {fromDashboard && (
            <Button variant="ghost" onClick={() => navigate(-1)}>
              <span className="flex items-center gap-2">
                <ChevronLeft className="h-5 w-5" /> Back
              </span>
            </Button>
          )}
        </div>
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
