import { useState, type FormEvent, type ReactNode } from 'react'
import MissionBuilder from './MissionBuilder'
import './App.css'

type IconName =
  | 'dashboard'
  | 'mission'
  | 'spacecraft'
  | 'payload'
  | 'orbit'
  | 'simulation'
  | 'results'
  | 'plus'
  | 'bell'
  | 'arrow'
  | 'close'
  | 'menu'

type NavItem = {
  label: string
  icon: IconName
}

const navigation: NavItem[] = [
  { label: 'Dashboard', icon: 'dashboard' },
  { label: 'Mission Design', icon: 'mission' },
  { label: 'Spacecraft', icon: 'spacecraft' },
  { label: 'Payload', icon: 'payload' },
  { label: 'Orbit Planner', icon: 'orbit' },
  { label: 'Simulation', icon: 'simulation' },
  { label: 'Results', icon: 'results' },
]

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    mission: <><path d="M12 3 4.5 7v5c0 4.6 3.2 7.7 7.5 9 4.3-1.3 7.5-4.4 7.5-9V7L12 3Z" /><path d="m9 12 2 2 4-4" /></>,
    spacecraft: <><path d="M12 2c3.5 2.4 5.3 6.1 5.3 10.1L12 21l-5.3-8.9C6.7 8.1 8.5 4.4 12 2Z" /><path d="m7 9-3 2v5l4-2M17 9l3 2v5l-4-2M12 11v.1" /></>,
    payload: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m4.5 7.7 7.5 4.2 7.5-4.2M12 12v8.5M8 5.2l8 4.6" /></>,
    orbit: <><circle cx="12" cy="12" r="2" /><ellipse cx="12" cy="12" rx="9" ry="4.5" transform="rotate(-35 12 12)" /><path d="m18.7 5.3.1.1" /></>,
    simulation: <><path d="M4 19V5M4 19h16" /><path d="m6 15 4-4 3 2 5-6" /><path d="M15 7h3v3" /></>,
    results: <><path d="M5 19V9M12 19V5M19 19v-7" /><path d="M3 19h18" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  }

  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  )
}

function Sidebar({
  activePage,
  onNavigate,
  mobileOpen,
  onClose,
}: {
  activePage: string
  onNavigate: (page: string) => void
  mobileOpen: boolean
  onClose: () => void
}) {
  return (
    <>
      {mobileOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={onClose} />}
      <aside className={`sidebar${mobileOpen ? ' sidebar-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><span /></div>
          <div className="brand-copy">
            <span className="brand-name">MISSION<span>FRONTIER</span></span>
            <span className="brand-caption">SPACE MISSION DESIGN</span>
          </div>
          <button className="icon-button sidebar-close" aria-label="Close navigation" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>

        <div className="workspace-label">WORKSPACE</div>
        <nav className="primary-nav" aria-label="Main navigation">
          {navigation.map((item) => (
            <button
              className={`nav-item${activePage === item.label ? ' nav-item-active' : ''}`}
              key={item.label}
              onClick={() => {
                onNavigate(item.label)
                onClose()
              }}
              aria-current={activePage === item.label ? 'page' : undefined}
            >
              <Icon name={item.icon} size={19} />
              <span>{item.label}</span>
              {item.label === 'Simulation' && <span className="nav-soon">3D RUN</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <div className="note-orbit"><Icon name="orbit" size={17} /></div>
            <div>
              <span className="note-title">Explore with purpose</span>
              <span className="note-copy">Design your next mission concept.</span>
            </div>
          </div>
          <div className="sidebar-footer">
            <span className="footer-dot" />
            <span>MISSION FRONTIER</span>
            <span className="footer-version">2026</span>
          </div>
        </div>
      </aside>
    </>
  )
}

function OrbitalIllustration() {
  return (
    <div className="orbital-illustration" aria-hidden="true">
      <div className="orbit-glow" />
      <svg viewBox="0 0 440 280" className="orbit-art">
        <defs>
          <radialGradient id="planet-gradient" cx="38%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#3c9df5" />
            <stop offset="58%" stopColor="#1455a3" />
            <stop offset="100%" stopColor="#082448" />
          </radialGradient>
          <linearGradient id="orbit-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#73e8ff" stopOpacity=".05" />
            <stop offset="48%" stopColor="#73e8ff" stopOpacity=".85" />
            <stop offset="100%" stopColor="#668bff" stopOpacity=".2" />
          </linearGradient>
          <filter id="planet-shadow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="17" />
          </filter>
        </defs>
        <ellipse cx="222" cy="146" rx="172" ry="72" transform="rotate(-18 222 146)" fill="none" stroke="url(#orbit-gradient)" strokeWidth="1.3" />
        <ellipse cx="222" cy="146" rx="140" ry="111" transform="rotate(39 222 146)" fill="none" stroke="#7096ff" strokeOpacity=".2" strokeDasharray="3 7" />
        <ellipse cx="222" cy="146" rx="202" ry="91" transform="rotate(13 222 146)" fill="none" stroke="#4aa5d6" strokeOpacity=".14" />
        <circle cx="221" cy="147" r="62" fill="#2388e9" opacity=".22" filter="url(#planet-shadow)" />
        <circle cx="221" cy="147" r="48" fill="url(#planet-gradient)" />
        <path d="M180 144c18-11 38-15 76-5M184 164c20-8 43-7 71 1M201 107c-9 13-13 25-13 41 0 18 7 32 19 44" fill="none" stroke="#62caff" strokeOpacity=".24" strokeWidth="3" />
        <circle cx="94" cy="107" r="4" fill="#a0f4ff" />
        <circle cx="94" cy="107" r="8" fill="#65dff4" opacity=".2" />
        <circle cx="340" cy="87" r="3" fill="#a0f4ff" />
        <circle cx="340" cy="87" r="7" fill="#65dff4" opacity=".2" />
        <path d="m88 50 1.5 4.5L94 56l-4.5 1.5L88 62l-1.5-4.5L82 56l4.5-1.5L88 50ZM355 179l1.2 3.8 3.8 1.2-3.8 1.2-1.2 3.8-1.2-3.8-3.8-1.2 3.8-1.2 1.2-3.8Z" fill="#9adfff" opacity=".8" />
      </svg>
      <div className="orbit-label orbit-label-top"><span className="label-line" />ORBITAL PATH</div>
      <div className="orbit-label orbit-label-bottom"><span className="label-dot" />MISSION CONCEPT</div>
    </div>
  )
}

function MissionModal({
  onClose,
  onCreate,
  initialName = '',
  initialObjective = '',
}: {
  onClose: () => void
  onCreate: (name: string, objective: string) => void
  initialName?: string
  initialObjective?: string
}) {
  const [name, setName] = useState(initialName)
  const [objective, setObjective] = useState(initialObjective)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onCreate(name.trim(), objective.trim())
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="mission-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-top">
          <span className="eyebrow"><span className="eyebrow-dot" />NEW CONCEPT</span>
          <button className="icon-button modal-close" type="button" aria-label="Close dialog" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <h2 id="modal-title">Start a new mission</h2>
        <p className="modal-description">Give your concept a name and a clear objective. You can refine the details as you go.</p>
        <form onSubmit={handleSubmit}>
          <label htmlFor="mission-name">Mission name</label>
          <input
            id="mission-name"
            autoFocus
            maxLength={60}
            placeholder="e.g. Lunar surface study"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
          <label htmlFor="mission-objective">Objective <span className="optional-label">OPTIONAL</span></label>
          <textarea
            id="mission-objective"
            rows={3}
            maxLength={280}
            placeholder="What would you like this mission to explore?"
            value={objective}
            onChange={(event) => setObjective(event.target.value)}
          />
          <div className="modal-actions">
            <button className="button-secondary" type="button" onClick={onClose}>Cancel</button>
            <button className="button-primary" type="submit">Create mission <Icon name="arrow" size={17} /></button>
          </div>
        </form>
      </section>
    </div>
  )
}

function Dashboard({
  missionName,
  missionObjective,
  onStart,
  onEdit,
}: {
  missionName: string | null
  missionObjective: string
  onStart: () => void
  onEdit: () => void
}) {
  return (
    <>
      <section className="welcome-panel">
        <div className="welcome-content">
          <div className="eyebrow"><span className="eyebrow-dot" />YOUR MISSION WORKSPACE</div>
          <h1>Big ideas.<br /><span>New frontiers.</span></h1>
          <p>Plan, shape, and explore mission concepts in one focused workspace. Your next great idea starts here.</p>
          <button className="button-primary start-button" onClick={onStart}>
            <Icon name="plus" size={18} />
            {missionName ? 'Start Another Mission' : 'Start New Mission'}
            <Icon name="arrow" size={17} />
          </button>
          <div className="welcome-footnote"><span className="footnote-line" />A space for your ideas to take shape.</div>
        </div>
        <OrbitalIllustration />
        <div className="panel-index">MF&nbsp; / &nbsp;01</div>
      </section>

      <section className="overview-section" aria-labelledby="overview-heading">
        <div className="section-heading">
          <div>
            <span className="section-kicker">MISSION CONTROL</span>
            <h2 id="overview-heading">Mission overview</h2>
          </div>
          <span className="workspace-state"><span className="state-dot" />{missionName ? 'CONCEPT STARTED' : 'WORKSPACE READY'}</span>
        </div>
        <div className="overview-grid">
          <article className={`mission-card${missionName ? ' mission-card-created' : ''}`}>
            <div className="card-header">
              <div className="card-icon"><Icon name="mission" size={19} /></div>
              <span className="card-overline">{missionName ? 'ACTIVE CONCEPT' : 'GETTING STARTED'}</span>
              <span className={`status-pill${missionName ? ' status-pill-active' : ''}`}>
                <span />{missionName ? 'IN PROGRESS' : 'NO ACTIVE MISSION'}
              </span>
            </div>
            <h3>{missionName ?? 'Your mission begins here'}</h3>
            <p>{missionName ? missionObjective || 'Your concept is ready to develop. Continue with mission design when you are ready.' : 'Create a mission concept to start shaping its objectives, spacecraft, and payload.'}</p>
            <button className="text-link" onClick={missionName ? onEdit : onStart}>
              {missionName ? 'Edit mission details' : 'Create your first mission'}
              <Icon name="arrow" size={16} />
            </button>
          </article>
          <article className="steps-card">
            <div className="steps-heading">
              <span className="card-overline">YOUR DESIGN FLOW</span>
              <span className="steps-count">01 — 04</span>
            </div>
            <div className="step-list">
              {[
                ['01', 'Mission design', 'Define the mission objective'],
                ['02', 'Spacecraft', 'Shape your vehicle concept'],
                ['03', 'Payload', 'Choose what to take along'],
                ['04', 'Orbit planner', 'Explore a mission trajectory'],
              ].map(([number, title, detail], index) => (
                <div className={`step-row${missionName && index === 0 ? ' step-row-ready' : ''}`} key={number}>
                  <span className="step-number">{number}</span>
                  <span className="step-copy"><strong>{title}</strong><small>{detail}</small></span>
                  {index === 0 && missionName ? <span className="step-current">READY</span> : <span className="step-indicator" />}
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>

      <footer className="dashboard-footer">
        <span>MISSION FRONTIER <span className="footer-separator">/</span> SPACE MISSION DESIGN GAME</span>
        <span>CONCEPTS ARE YOURS TO EXPLORE</span>
      </footer>
    </>
  )
}

function App() {
  const [activePage, setActivePage] = useState('Dashboard')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'new' | 'edit' | null>(null)
  const [missionName, setMissionName] = useState<string | null>(null)
  const [missionObjective, setMissionObjective] = useState('')

  function createMission(name: string, objective: string) {
    setMissionName(name)
    setMissionObjective(objective)
    setActivePage('Dashboard')
    setModalMode(null)
  }

  function startMission() {
    setModalMode('new')
  }

  function editMission() {
    setModalMode('edit')
  }

  return (
    <div className="app-shell">
      <Sidebar
        activePage={activePage}
        onNavigate={setActivePage}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />
      <main className="main-area">
        <header className="topbar">
          <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileOpen(true)}>
            <Icon name="menu" />
          </button>
          <div className="breadcrumb"><span>MISSION FRONTIER</span><span className="breadcrumb-slash">/</span><strong>{activePage.toUpperCase()}</strong></div>
          <div className="topbar-actions">
            <span className="edition-label">SPACE APPS CHALLENGE <span>2026</span></span>
            <span className="topbar-divider" />
            <button className="icon-button notification-button" aria-label="Notifications">
              <Icon name="bell" size={19} /><span className="notification-dot" />
            </button>
            <div className="avatar" aria-label="Mission Frontier workspace">MF</div>
          </div>
        </header>
        <div className={`page-content${activePage === 'Dashboard' ? '' : ' page-content-module'}`}>
          {activePage === 'Dashboard'
            ? <Dashboard
                missionName={missionName}
                missionObjective={missionObjective}
                onStart={startMission}
                onEdit={editMission}
              />
            : null}
          <MissionBuilder activePage={activePage} missionName={missionName} />
        </div>
      </main>
      {modalMode && (
        <MissionModal
          onClose={() => setModalMode(null)}
          onCreate={createMission}
          initialName={modalMode === 'edit' ? missionName ?? '' : ''}
          initialObjective={modalMode === 'edit' ? missionObjective : ''}
        />
      )}
    </div>
  )
}

export default App
