import { lazy, Suspense, useMemo, useState } from 'react'
import NasaDataPanel from './NasaDataPanel'
import { createMissionHistoryEntry, loadMissionHistory, saveMissionHistory } from './missionHistory'
import type { MissionHistoryEntry } from './missionHistory'
import type { SpacecraftComponent } from './SpacecraftWorkshop'
import { getMissionProgressPercent } from './missionSimulationRules'
import type { MissionSimulationRun } from './missionSimulationRules'
import './MissionBuilder.css'

const SpacecraftWorkshop = lazy(() => import('./SpacecraftWorkshop'))
const MissionSimulation3D = lazy(() => import('./MissionSimulation3D'))

type ObjectiveId = 'earth' | 'moon' | 'mars' | 'deep'
type OrbitId = 'leo' | 'geo' | 'lunar-flyby' | 'lunar' | 'lunar-surface' | 'mars' | 'deep'
type VehicleId = 'light' | 'medium' | 'heavy'

type Objective = {
  id: ObjectiveId
  name: string
  description: string
  orbit: OrbitId
  lifetimeMonths: number
}

type CampaignLevel = {
  id: string
  name: string
  objectiveId: ObjectiveId
  orbitId: OrbitId
  missionGoal: string
  massLimitKg: number
  budgetLimitM: number
  minimumSuitableInstruments: number
  requiredInstrumentIds: string[]
  minimumBatteryWh?: number
  requiresPowerGeneration?: boolean
}

type InstrumentOption = {
  id: string
  name: string
  purpose: string
  massKg: number
  powerW: number
  costM: number
  dataGbDay: number
  scienceValue: number
}

const objectives: Objective[] = [
  {
    id: 'earth',
    name: 'Earth Observation',
    description: 'Study Earth systems and surface changes from an orbiting vantage point.',
    orbit: 'leo',
    lifetimeMonths: 24,
  },
  {
    id: 'moon',
    name: 'Moon Exploration',
    description: 'Explore the lunar environment and investigate its surface and resources.',
    orbit: 'lunar',
    lifetimeMonths: 18,
  },
  {
    id: 'mars',
    name: 'Mars Exploration',
    description: 'Investigate the Martian environment with a remote science mission concept.',
    orbit: 'mars',
    lifetimeMonths: 30,
  },
  {
    id: 'deep',
    name: 'Deep Space Exploration',
    description: 'Study distant objects and phenomena beyond the inner solar system.',
    orbit: 'deep',
    lifetimeMonths: 48,
  },
]

const spacecraftComponents: SpacecraftComponent[] = [
  { id: 'structure', name: 'Structure', massKg: 120, powerW: 30, costM: 90, role: 'Provides the frame and mounting points for spacecraft systems.' },
  { id: 'power', name: 'Power systems', massKg: 50, powerW: 0, powerSupplyW: 800, costM: 85, role: 'Generates electrical power for spacecraft operations.' },
  { id: 'battery', name: 'Batteries', massKg: 45, powerW: 0, batteryWh: 4800, costM: 42, role: 'Stores energy for use when primary generation is unavailable.' },
  { id: 'communication', name: 'Communication systems', massKg: 18, powerW: 70, communicationGbDay: 12, costM: 55, role: 'Sends mission data to ground stations; capacity is a simplified daily estimate.' },
  { id: 'computer', name: 'Onboard computer', massKg: 16, powerW: 95, costM: 48, role: 'Coordinates spacecraft commands, data handling, and subsystem operations.' },
  { id: 'attitude', name: 'Attitude control', massKg: 32, powerW: 110, costM: 68, role: 'Maintains spacecraft orientation for communication and science observations.' },
]

const instruments: InstrumentOption[] = [
  { id: 'camera', name: 'Camera', purpose: 'Captures visible-light images of a target or its surroundings.', massKg: 12, powerW: 35, costM: 24, dataGbDay: 8, scienceValue: 3 },
  { id: 'spectrometer', name: 'Spectrometer', purpose: 'Measures light across wavelengths to study material composition.', massKg: 18, powerW: 65, costM: 42, dataGbDay: 4, scienceValue: 4 },
  { id: 'radar', name: 'Radar', purpose: 'Uses reflected radio waves to examine surface structure and properties.', massKg: 28, powerW: 120, costM: 58, dataGbDay: 6, scienceValue: 4 },
  { id: 'magnetometer', name: 'Magnetometer', purpose: 'Measures magnetic fields around a spacecraft or planetary body.', massKg: 8, powerW: 22, costM: 18, dataGbDay: 1, scienceValue: 3 },
  { id: 'telescope', name: 'Telescope', purpose: 'Collects light from distant astronomical objects for observation.', massKg: 35, powerW: 90, costM: 76, dataGbDay: 5, scienceValue: 5 },
  { id: 'radio', name: 'Radio science instrument', purpose: 'Uses radio signals to study a target or the space between objects.', massKg: 14, powerW: 48, costM: 33, dataGbDay: 2, scienceValue: 4 },
]

const orbits: { id: OrbitId; name: string; description: string }[] = [
  { id: 'leo', name: 'Low Earth Orbit', description: 'A near-Earth orbit suited to observing our planet and its atmosphere.' },
  { id: 'geo', name: 'Geostationary Orbit', description: 'A high Earth orbit that keeps a spacecraft over a similar longitude.' },
  { id: 'lunar-flyby', name: 'Lunar Flyby Trajectory', description: 'A conceptual encounter path that passes the Moon without entering lunar orbit.' },
  { id: 'lunar', name: 'Lunar Orbit', description: 'An orbit around the Moon for remote observations and exploration.' },
  { id: 'lunar-surface', name: 'Lunar Surface', description: 'A conceptual landing target for a lunar surface mission.' },
  { id: 'mars', name: 'Mars Trajectory', description: 'A conceptual transfer route from Earth toward Mars.' },
  { id: 'deep', name: 'Deep Space', description: 'A conceptual trajectory toward destinations beyond the inner planets.' },
]

const vehicles: { id: VehicleId; name: string; costM: number; capacityKg: Record<OrbitId, number>; description: string }[] = [
  {
    id: 'light',
    name: 'Light-lift',
    costM: 130,
    capacityKg: { leo: 420, geo: 300, 'lunar-flyby': 240, lunar: 180, 'lunar-surface': 140, mars: 120, deep: 75 },
    description: 'A smaller launch class for compact spacecraft concepts.',
  },
  {
    id: 'medium',
    name: 'Medium-lift',
    costM: 290,
    capacityKg: { leo: 1900, geo: 1600, 'lunar-flyby': 1200, lunar: 1000, 'lunar-surface': 800, mars: 750, deep: 500 },
    description: 'A mid-range launch class for spacecraft with more capability.',
  },
  {
    id: 'heavy',
    name: 'Heavy-lift',
    costM: 480,
    capacityKg: { leo: 7500, geo: 7000, 'lunar-flyby': 5500, lunar: 5000, 'lunar-surface': 4000, mars: 3800, deep: 2500 },
    description: 'A larger launch class for higher-mass mission concepts.',
  },
]

const campaignLevels: CampaignLevel[] = [
  {
    id: 'earth-orbit',
    name: 'Earth Orbit',
    objectiveId: 'earth',
    orbitId: 'leo',
    missionGoal: 'Place an observation spacecraft in low Earth orbit and return science data.',
    massLimitKg: 420,
    budgetLimitM: 800,
    minimumSuitableInstruments: 1,
    requiredInstrumentIds: [],
  },
  {
    id: 'lunar-flyby',
    name: 'Lunar Flyby',
    objectiveId: 'moon',
    orbitId: 'lunar-flyby',
    missionGoal: 'Fly past the Moon and use a camera to collect a close-range observation.',
    massLimitKg: 600,
    budgetLimitM: 900,
    minimumSuitableInstruments: 1,
    requiredInstrumentIds: ['camera'],
  },
  {
    id: 'lunar-orbit',
    name: 'Lunar Orbit',
    objectiveId: 'moon',
    orbitId: 'lunar',
    missionGoal: 'Enter lunar orbit with at least two suitable science instruments.',
    massLimitKg: 1000,
    budgetLimitM: 1000,
    minimumSuitableInstruments: 2,
    requiredInstrumentIds: [],
  },
  {
    id: 'lunar-landing',
    name: 'Lunar Landing',
    objectiveId: 'moon',
    orbitId: 'lunar-surface',
    missionGoal: 'Prepare a surface mission with radar, magnetic-field sensing, and reserve battery storage.',
    massLimitKg: 1200,
    budgetLimitM: 1200,
    minimumSuitableInstruments: 2,
    requiredInstrumentIds: ['radar', 'magnetometer'],
    minimumBatteryWh: 3000,
  },
  {
    id: 'mars-exploration',
    name: 'Mars Exploration',
    objectiveId: 'mars',
    orbitId: 'mars',
    missionGoal: 'Plan a Mars science mission with imaging, radio science, and generated spacecraft power.',
    massLimitKg: 1800,
    budgetLimitM: 1300,
    minimumSuitableInstruments: 2,
    requiredInstrumentIds: ['camera', 'radio'],
    requiresPowerGeneration: true,
  },
]

const formatM = (value: number) => `$${value.toLocaleString()}M`
const campaignProgressKey = 'mission-frontier-campaign-v1'

function getUnlockedLevelIds(completedLevelIds: string[]) {
  const completed = new Set(completedLevelIds)
  const unlocked = [campaignLevels[0].id]

  for (let index = 0; index < campaignLevels.length - 1; index += 1) {
    if (!completed.has(campaignLevels[index].id)) break
    unlocked.push(campaignLevels[index + 1].id)
  }

  return unlocked
}

function loadCompletedLevelIds() {
  if (typeof window === 'undefined') return []

  try {
    const stored = JSON.parse(window.localStorage.getItem(campaignProgressKey) ?? '[]')
    if (!Array.isArray(stored)) return []

    const completed = new Set(
      stored.filter((id): id is string =>
        typeof id === 'string' && campaignLevels.some((level) => level.id === id),
      ),
    )
    const completedPrefix: string[] = []
    for (const level of campaignLevels) {
      if (!completed.has(level.id)) break
      completedPrefix.push(level.id)
    }
    return completedPrefix
  } catch (error) {
    console.error('Campaign progress could not be loaded.', error)
    return []
  }
}

type MissionTotals = {
  massKg: number
  powerDrawW: number
  powerSupplyW: number
  batteryWh: number
  costM: number
  dataGbDay: number
  communicationGbDay: number
  lifetimeMonths: number
  componentCount: number
  instrumentCount: number
}

type CheckStatus = 'pass' | 'warning' | 'problem'

type SimulationCheck = {
  label: string
  detail: string
  score: number
  status: CheckStatus
}

type MissionSimulationResult = {
  configurationKey: string
  missionName: string
  levelName: string
  levelComplete: boolean
  nextLevelName: string | null
  objectiveName: string
  outcome: 'Successful' | 'Partially Successful' | 'Requires Redesign'
  score: number
  explanation: string
  checks: SimulationCheck[]
  levelChecks: SimulationCheck[]
  problems: string[]
  recommendations: string[]
}

const objectiveInstrumentRules: Record<ObjectiveId, string[]> = {
  earth: ['camera', 'spectrometer', 'radar'],
  moon: ['camera', 'spectrometer', 'radar', 'magnetometer'],
  mars: ['camera', 'spectrometer', 'radar', 'radio'],
  deep: ['telescope', 'radio', 'magnetometer'],
}

function scoreAgainstLimit(value: number, limit: number) {
  if (value <= limit) return 20
  if (limit <= 0) return 0
  return Math.max(0, Math.round((limit / value) * 20))
}

function evaluateMission({
  configurationKey,
  missionName,
  objective,
  orbitName,
  vehicleName,
  massCapacityKg,
  level,
  orbitId,
  totals,
  selectedInstrumentIds,
}: {
  configurationKey: string
  missionName: string
  objective: Objective
  orbitName: string
  vehicleName: string
  massCapacityKg: number
  level: CampaignLevel
  orbitId: OrbitId
  totals: MissionTotals
  selectedInstrumentIds: string[]
}): MissionSimulationResult {
  const suitableInstrumentCount = selectedInstrumentIds.filter((id) =>
    objectiveInstrumentRules[objective.id].includes(id),
  ).length
  const objectiveScore = selectedInstrumentIds.length
    ? Math.round((suitableInstrumentCount / selectedInstrumentIds.length) * 20)
    : 0
  const checks: SimulationCheck[] = [
    {
      label: 'Objective and instrument suitability',
      detail: selectedInstrumentIds.length
        ? `${suitableInstrumentCount} of ${selectedInstrumentIds.length} selected instruments match the game's tags for ${objective.name}.`
        : `No instruments are selected for the ${objective.name} objective.`,
      score: objectiveScore,
      status: suitableInstrumentCount === selectedInstrumentIds.length && selectedInstrumentIds.length > 0
        ? 'pass'
        : 'problem',
    },
    {
      label: 'Spacecraft mass',
      detail: `${totals.massKg} kg of ${massCapacityKg.toLocaleString()} kg capacity on the ${vehicleName} for ${orbitName}.`,
      score: scoreAgainstLimit(totals.massKg, massCapacityKg),
      status: totals.massKg > massCapacityKg ? 'problem' : 'pass',
    },
    {
      label: 'Power requirements',
      detail: `${totals.powerDrawW} W demand vs ${totals.powerSupplyW} W generation; ${totals.batteryWh.toLocaleString()} Wh storage.`,
      score: scoreAgainstLimit(totals.powerDrawW, totals.powerSupplyW),
      status: totals.powerDrawW > totals.powerSupplyW
        ? 'problem'
        : totals.powerDrawW === 0
          ? 'warning'
          : 'pass',
    },
    {
      label: 'Available budget',
      detail: `${formatM(totals.costM)} estimated cost against the ${formatM(level.budgetLimitM)} level limit.`,
      score: scoreAgainstLimit(totals.costM, level.budgetLimitM),
      status: totals.costM > level.budgetLimitM ? 'problem' : 'pass',
    },
    {
      label: 'Communication requirements',
      detail: totals.dataGbDay
        ? `${totals.dataGbDay} GB/day estimated data vs ${totals.communicationGbDay} GB/day communication capacity.`
        : 'No instrument data demand is selected; communication capacity is not yet exercised.',
      score: scoreAgainstLimit(totals.dataGbDay, totals.communicationGbDay),
      status: totals.dataGbDay > totals.communicationGbDay
        ? 'problem'
        : totals.dataGbDay === 0
          ? 'warning'
          : 'pass',
    },
  ]

  const levelChecks: SimulationCheck[] = [
    {
      label: 'Required mission orbit',
      detail: `${level.name} requires ${orbits.find((item) => item.id === level.orbitId)?.name}; selected orbit: ${orbitName}.`,
      score: orbitId === level.orbitId ? 20 : 0,
      status: orbitId === level.orbitId ? 'pass' : 'problem',
    },
    {
      label: 'Level mass limit',
      detail: `${totals.massKg} kg of the ${level.massLimitKg.toLocaleString()} kg ${level.name} limit.`,
      score: scoreAgainstLimit(totals.massKg, level.massLimitKg),
      status: totals.massKg <= level.massLimitKg ? 'pass' : 'problem',
    },
    {
      label: 'Mission-suitable instruments',
      detail: `${suitableInstrumentCount} suitable instrument${suitableInstrumentCount === 1 ? '' : 's'} selected; ${level.name} requires at least ${level.minimumSuitableInstruments}.`,
      score: suitableInstrumentCount >= level.minimumSuitableInstruments ? 20 : 0,
      status: suitableInstrumentCount >= level.minimumSuitableInstruments ? 'pass' : 'problem',
    },
    ...level.requiredInstrumentIds.map((instrumentId) => {
      const instrument = instruments.find((item) => item.id === instrumentId)
      const selected = selectedInstrumentIds.includes(instrumentId)
      return {
        label: `Required instrument: ${instrument?.name ?? instrumentId}`,
        detail: selected
          ? `${instrument?.name ?? instrumentId} is included in the mission payload.`
          : `Add ${instrument?.name ?? instrumentId} to the mission payload to meet this level condition.`,
        score: selected ? 20 : 0,
        status: selected ? 'pass' as const : 'problem' as const,
      }
    }),
    ...(level.minimumBatteryWh !== undefined
      ? [{
          label: 'Battery reserve',
          detail: `${totals.batteryWh.toLocaleString()} Wh storage; ${level.name} requires at least ${level.minimumBatteryWh.toLocaleString()} Wh.`,
          score: totals.batteryWh >= level.minimumBatteryWh ? 20 : 0,
          status: totals.batteryWh >= level.minimumBatteryWh ? 'pass' as const : 'problem' as const,
        }]
      : []),
    ...(level.requiresPowerGeneration
      ? [{
          label: 'Generated spacecraft power',
          detail: `${totals.powerSupplyW} W generated; ${level.name} requires a selected power system.`,
          score: totals.powerSupplyW > 0 ? 20 : 0,
          status: totals.powerSupplyW > 0 ? 'pass' as const : 'problem' as const,
        }]
      : []),
  ]

  const score = checks.reduce((sum, check) => sum + check.score, 0)
  const problemCount = checks.filter((check) => check.status === 'problem').length
  const baseOutcome = score < 50 || problemCount >= 2 || selectedInstrumentIds.length === 0
    ? 'Requires Redesign'
    : score >= 80 && problemCount === 0
      ? 'Successful'
      : 'Partially Successful'
  const levelComplete = baseOutcome === 'Successful'
    && levelChecks.every((check) => check.status === 'pass')
  const outcome = levelComplete ? 'Successful' : baseOutcome === 'Successful' ? 'Partially Successful' : baseOutcome
  const problems = [...checks, ...levelChecks]
    .filter((check) => check.status === 'problem')
    .map((check) => `${check.label}: ${check.detail}`)
  const recommendations = [...checks, ...levelChecks].flatMap((check) => {
    if (check.status !== 'problem') return []
    switch (check.label) {
      case 'Objective and instrument suitability':
        return [selectedInstrumentIds.length
          ? 'Add or replace instruments with options tagged for the selected objective by the game rules.'
          : 'Select at least one scientific instrument, then review its game-defined match to the objective.']
      case 'Spacecraft mass':
        return ['Choose a launch class with more capacity for this orbit, or remove spacecraft/payload mass.']
      case 'Power requirements':
        return ['Select the power systems component or reduce power-consuming components and instruments.']
      case 'Available budget':
        return ['Choose a lower-cost launch class or remove costly components and instruments.']
      case 'Communication requirements':
        return ['Select communication systems or reduce the instruments’ estimated daily data demand.']
      case 'Required mission orbit':
        return [`Select ${orbits.find((item) => item.id === level.orbitId)?.name} in Orbit Planner.`]
      case 'Level mass limit':
        return [`Reduce spacecraft/payload mass to ${level.massLimitKg.toLocaleString()} kg or less for this level.`]
      case 'Mission-suitable instruments':
        return [`Select at least ${level.minimumSuitableInstruments} instruments suitable for ${objective.name}.`]
      case 'Battery reserve':
        return [`Install batteries with at least ${level.minimumBatteryWh?.toLocaleString()} Wh of storage.`]
      case 'Generated spacecraft power':
        return ['Add the Power systems component to your spacecraft.']
      default:
        return check.label.startsWith('Required instrument:')
          ? [check.detail]
          : []
    }
  })

  return {
    configurationKey,
    missionName,
    levelName: level.name,
    levelComplete,
    nextLevelName: null,
    objectiveName: objective.name,
    outcome,
    score,
    explanation: levelComplete
      ? `All resource checks and ${level.name} completion conditions are satisfied.`
      : baseOutcome === 'Successful'
        ? 'The resource checks pass, but one or more level-specific completion conditions still need attention.'
      : outcome === 'Partially Successful'
        ? `${problemCount} modeled requirement${problemCount === 1 ? '' : 's'} need attention. Improve the flagged areas and run the simulation again.`
        : 'This configuration does not yet meet enough modeled requirements. Address the flagged areas and run the simulation again.',
    checks,
    levelChecks,
    problems,
    recommendations: recommendations.length
      ? recommendations
      : ['The modeled checks pass. Try alternate design choices and rerun to compare game-generated outcomes.'],
  }
}

function SimulationReport({
  result,
  progressPercent,
}: {
  result: MissionSimulationResult
  progressPercent: number
}) {
  return (
    <section className="simulation-report" aria-label="Mission simulation results">
      <div className={`simulation-outcome simulation-outcome-${result.outcome === 'Successful' ? 'success' : result.outcome === 'Partially Successful' ? 'partial' : 'redesign'}`}>
        <div>
          <span className="builder-kicker">GAME-GENERATED MISSION OUTCOME</span>
          <h2>{result.outcome}</h2>
          <p><strong>{result.missionName}</strong> · {result.objectiveName}</p>
          <p>{result.explanation}</p>
          <p>Campaign level: {result.levelName}</p>
          <div className="simulation-progress-summary">
            <label htmlFor="simulation-result-progress">Mission progress</label>
            <strong>{progressPercent}%</strong>
            <progress id="simulation-result-progress" max={100} value={progressPercent} />
          </div>
        </div>
        <div className="simulation-score" aria-label={`Mission score: ${result.score} out of 100`}>
          <strong>{result.score}</strong><span>/ 100</span>
          <small>MISSION SCORE</small>
        </div>
      </div>

      <section className="campaign-checks" aria-label={`${result.levelName} completion conditions`}>
        <div className="campaign-checks-heading">
          <div>
            <span className="builder-kicker">LEVEL COMPLETION</span>
            <h3>{result.levelComplete ? `${result.levelName} complete` : `${result.levelName} conditions`}</h3>
          </div>
          <span className={`campaign-completion-badge${result.levelComplete ? ' campaign-completion-badge-complete' : ''}`}>
            {result.levelComplete ? 'COMPLETE' : 'IN PROGRESS'}
          </span>
        </div>
        <ul>
          {result.levelChecks.map((check) => (
            <li className={check.status === 'pass' ? 'campaign-condition-pass' : 'campaign-condition-pending'} key={check.label}>
              <span aria-hidden="true">{check.status === 'pass' ? '✓' : '○'}</span>
              <span><strong>{check.label}</strong><small>{check.detail}</small></span>
            </li>
          ))}
        </ul>
        {result.levelComplete && (
          <p className="campaign-unlock-message" role="status">
            {result.nextLevelName
              ? `${result.nextLevelName} is now unlocked. Select it from Mission Design to continue.`
              : 'All campaign levels are complete.'}
          </p>
        )}
      </section>

      <section className="simulation-section" aria-labelledby="resource-performance-heading">
        <h3 id="resource-performance-heading">Resource performance</h3>
        <div className="simulation-check-grid">
          {result.checks.map((check) => (
            <article className={`simulation-check simulation-check-${check.status}`} key={check.label}>
              <div>
                <h4>{check.label}</h4>
                <span className="simulation-check-status">
                  {check.status === 'pass' ? 'WITHIN MODEL' : check.status === 'warning' ? 'NOT FULLY TESTED' : 'NEEDS ATTENTION'}
                </span>
              </div>
              <strong className="simulation-check-score">{check.score}/20</strong>
              <p>{check.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="simulation-guidance-grid">
        <section className="simulation-guidance" aria-labelledby="simulation-problems-heading">
          <h3 id="simulation-problems-heading">Problems identified</h3>
          {result.problems.length
            ? <ul>{result.problems.map((problem) => <li key={problem}>{problem}</li>)}</ul>
            : <p>No modeled resource or suitability problems were identified.</p>}
        </section>
        <section className="simulation-guidance" aria-labelledby="simulation-recommendations-heading">
          <h3 id="simulation-recommendations-heading">Recommendations for improvement</h3>
          <ul>{result.recommendations.map((recommendation) => <li key={recommendation}>{recommendation}</li>)}</ul>
        </section>
      </div>

      <section className="simulation-sources" aria-label="Data and simulation labels">
        <p><strong>Verified NASA information:</strong> None used. This simulation does not fetch NASA/JPL data or report real-world mission specifications.</p>
        <p><strong>Educational estimates:</strong> Mass, power, cost, data, capacity, and budget values come from the project’s existing illustrative game options.</p>
        <p><strong>Game-generated results:</strong> Score, outcome, and instrument-suitability tags use simple game rules; they are not flight predictions or NASA recommendations.</p>
      </section>
    </section>
  )
}

function MissionHistoryList({ entries }: { entries: MissionHistoryEntry[] }) {
  if (!entries.length) return null

  return (
    <section className="mission-history" aria-labelledby="mission-history-heading">
      <div className="mission-history-heading">
        <div>
          <span className="builder-kicker">BROWSER-SAVED RECORDS</span>
          <h2 id="mission-history-heading">Completed mission runs</h2>
        </div>
        <span>{entries.length} SAVED</span>
      </div>
      <div className="mission-history-list">
        {entries.map((entry) => (
          <details className="mission-history-entry" key={entry.id}>
            <summary>
              <span>
                <strong>{entry.missionName} · {entry.levelName}</strong>
                <small>{new Date(entry.completedAt).toLocaleString()}</small>
              </span>
              <span className={`mission-history-outcome mission-history-outcome-${entry.result.outcome === 'Successful' ? 'success' : entry.result.outcome === 'Partially Successful' ? 'partial' : 'redesign'}`}>
                {entry.result.outcome} · {entry.result.score}/100 · {entry.progressPercent}% progress
              </span>
            </summary>
            <div className="mission-history-profile">
              <p><strong>{entry.objectiveName}</strong> · {entry.orbitName} · {entry.vehicleName}</p>
              <p>Systems: {entry.spacecraftSystems.length ? entry.spacecraftSystems.join(', ') : 'None selected'}</p>
              <p>Science instruments: {entry.scienceInstruments.length ? entry.scienceInstruments.join(', ') : 'None selected'}</p>
              <p>Mass {entry.resources.massKg} / {entry.resources.massCapacityKg} kg launch capacity · {entry.resources.massKg} / {entry.resources.levelMassLimitKg} kg level limit</p>
              <p>Power {entry.resources.powerDrawW} / {entry.resources.powerSupplyW} W · Battery {entry.resources.batteryWh.toLocaleString()} Wh</p>
              <p>Estimated cost ${entry.resources.costM}M / ${entry.resources.budgetLimitM}M · Data {entry.resources.dataGbDay} / {entry.resources.communicationGbDay} GB/day</p>
            </div>
            <SimulationReport result={entry.result} progressPercent={entry.progressPercent} />
          </details>
        ))}
      </div>
    </section>
  )
}

function ChoiceCard({
  checked,
  onChange,
  title,
  description,
  meta,
}: {
  checked: boolean
  onChange: () => void
  title: string
  description: string
  meta?: string
}) {
  return (
    <label className={`choice-card${checked ? ' choice-card-selected' : ''}`}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span className="choice-indicator" aria-hidden="true" />
      <span className="choice-content">
        <strong>{title}</strong>
        <span>{description}</span>
        {meta && <small>{meta}</small>}
      </span>
    </label>
  )
}

function MissionResources({
  massKg,
  massCapacityKg,
  levelMassLimitKg,
  levelBudgetLimitM,
  levelName,
  powerDrawW,
  powerSupplyW,
  batteryWh,
  costM,
  dataGbDay,
  communicationGbDay,
  lifetimeMonths,
  compact = false,
}: {
  massKg: number
  massCapacityKg: number
  levelMassLimitKg: number
  levelBudgetLimitM: number
  levelName: string
  powerDrawW: number
  powerSupplyW: number
  batteryWh: number
  costM: number
  dataGbDay: number
  communicationGbDay: number
  lifetimeMonths: number
  compact?: boolean
}) {
  const effectiveMassLimitKg = Math.min(massCapacityKg, levelMassLimitKg)
  const issues = [
    ...(massKg > massCapacityKg ? ['Spacecraft mass exceeds this launch class capacity for the selected orbit.'] : []),
    ...(massKg > levelMassLimitKg ? [`Spacecraft mass exceeds the ${levelName} campaign limit.`] : []),
    ...(powerDrawW > powerSupplyW ? ['Power demand is higher than the selected power-system output.'] : []),
    ...(costM > levelBudgetLimitM ? [`Estimated mission cost exceeds the ${levelName} budget limit.`] : []),
    ...(dataGbDay > communicationGbDay ? ['Estimated data generation exceeds communication capacity.'] : []),
  ]

  const values = [
    { label: 'Spacecraft mass', value: `${massKg} kg`, sub: `Launch ${massCapacityKg.toLocaleString()} kg · ${levelName} max ${levelMassLimitKg.toLocaleString()} kg`, percent: effectiveMassLimitKg ? (massKg / effectiveMassLimitKg) * 100 : 100, over: massKg > effectiveMassLimitKg },
    { label: 'Power budget', value: `${powerDrawW} / ${powerSupplyW} W`, sub: `${batteryWh.toLocaleString()} Wh battery storage`, percent: powerSupplyW ? (powerDrawW / powerSupplyW) * 100 : powerDrawW ? 100 : 0, over: powerDrawW > powerSupplyW },
    { label: 'Estimated budget', value: formatM(costM), sub: `${levelName} limit ${formatM(levelBudgetLimitM)}`, percent: (costM / levelBudgetLimitM) * 100, over: costM > levelBudgetLimitM },
    { label: 'Data generation', value: `${dataGbDay} GB/day`, sub: 'Selected instrument estimates', percent: communicationGbDay ? (dataGbDay / communicationGbDay) * 100 : dataGbDay ? 100 : 0, over: dataGbDay > communicationGbDay },
    { label: 'Communication capacity', value: `${communicationGbDay} GB/day`, sub: 'Simplified link capacity', percent: communicationGbDay ? Math.min(100, (dataGbDay / communicationGbDay) * 100) : dataGbDay ? 100 : 0, over: dataGbDay > communicationGbDay },
    { label: 'Mission lifetime', value: `${(lifetimeMonths / 12).toFixed(1)} years`, sub: 'Simplified power-aware estimate', percent: Math.min(100, (lifetimeMonths / 60) * 100), over: false },
  ]

  return (
    <section className={`resource-panel${compact ? ' resource-panel-dashboard' : ''}`} aria-label="Mission resources">
      <div className="resource-heading">
        <div>
          <span className="builder-kicker">LIVE DESIGN CHECK</span>
          <h2>Mission resources</h2>
        </div>
        <span className="estimate-tag">EDUCATIONAL ESTIMATES</span>
      </div>
      <div className={`resource-grid${compact ? ' resource-grid-dashboard' : ''}`}>
        {values.map((resource) => (
          <article className={`resource-card${resource.over ? ' resource-card-warning' : ''}`} key={resource.label}>
            <div className="resource-card-top">
              <span>{resource.label}</span>
              <span className={`resource-status${resource.over ? ' resource-status-warning' : ''}`}>
                {resource.over ? 'CHECK' : 'OK'}
              </span>
            </div>
            <strong className="resource-value">{resource.value}</strong>
            <span className="resource-sub">{resource.sub}</span>
            <div
              className="resource-track"
              role="meter"
              aria-label={resource.label}
              aria-valuenow={Math.min(100, Math.round(resource.percent))}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span className={resource.over ? 'resource-fill resource-fill-warning' : 'resource-fill'} style={{ width: `${Math.min(100, Math.max(0, resource.percent))}%` }} />
            </div>
          </article>
        ))}
      </div>
      {issues.length > 0 ? (
        <div className="resource-warnings" role="status">
          <strong>Design checks</strong>
          <ul>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
        </div>
      ) : (
        <p className="resource-ok" role="status">No resource limits are exceeded in this simplified planning view.</p>
      )}
      <p className="estimate-note">All mass, power, cost, data-rate, and lifetime values are illustrative educational estimates—not verified vehicle specifications or flight-design data.</p>
    </section>
  )
}

function MissionBuilder({
  activePage,
  missionName,
}: {
  activePage: string
  missionName: string | null
}) {
  const [completedLevelIds, setCompletedLevelIds] = useState<string[]>(loadCompletedLevelIds)
  const [selectedLevelId, setSelectedLevelId] = useState(() => {
    const completed = loadCompletedLevelIds()
    const unlocked = getUnlockedLevelIds(completed)
    return campaignLevels.find((level) => unlocked.includes(level.id) && !completed.includes(level.id))?.id
      ?? campaignLevels[0].id
  })
  const initialLevel = campaignLevels.find((level) => level.id === selectedLevelId) ?? campaignLevels[0]
  const [objectiveId, setObjectiveId] = useState<ObjectiveId>(initialLevel.objectiveId)
  const [orbitId, setOrbitId] = useState<OrbitId>(initialLevel.orbitId)
  const [vehicleId, setVehicleId] = useState<VehicleId>('light')
  const [selectedComponents, setSelectedComponents] = useState<string[]>(['structure', 'power', 'battery', 'communication', 'computer', 'attitude'])
  const [selectedInstruments, setSelectedInstruments] = useState<string[]>([])
  const [simulationResult, setSimulationResult] = useState<MissionSimulationResult | null>(null)
  const [simulationRun, setSimulationRun] = useState<MissionSimulationRun | null>(null)
  const [simulationOpen, setSimulationOpen] = useState(false)
  const [simulationAnimationComplete, setSimulationAnimationComplete] = useState(false)
  const [missionHistory, setMissionHistory] = useState<MissionHistoryEntry[]>(loadMissionHistory)
  const [persistenceError, setPersistenceError] = useState('')

  const unlockedLevelIds = getUnlockedLevelIds(completedLevelIds)
  const activeLevel = campaignLevels.find((level) => level.id === selectedLevelId) ?? campaignLevels[0]
  const objective = objectives.find((item) => item.id === objectiveId) ?? objectives[0]
  const selectedOrbit = orbits.find((item) => item.id === orbitId) ?? orbits[0]
  const vehicle = vehicles.find((item) => item.id === vehicleId) ?? vehicles[0]
  const selectedVehicleCapacity = vehicle.capacityKg[orbitId]
  const configurationKey = JSON.stringify({
    missionName,
    selectedLevelId,
    objectiveId,
    orbitId,
    vehicleId,
    selectedComponents: [...selectedComponents].sort(),
    selectedInstruments: [...selectedInstruments].sort(),
  })

  const totals = useMemo(() => {
    const components = spacecraftComponents.filter((item) => selectedComponents.includes(item.id))
    const payload = instruments.filter((item) => selectedInstruments.includes(item.id))
    const massKg = Math.round([...components, ...payload].reduce((sum, item) => sum + item.massKg, 0))
    const powerDrawW = Math.round([...components, ...payload].reduce((sum, item) => sum + item.powerW, 0))
    const powerSupplyW = components.reduce((sum, item) => sum + (item.powerSupplyW ?? 0), 0)
    const batteryWh = components.reduce((sum, item) => sum + (item.batteryWh ?? 0), 0)
    const componentAndPayloadCost = [...components, ...payload].reduce((sum, item) => sum + item.costM, 0)
    const costM = Math.round(componentAndPayloadCost + vehicle.costM)
    const dataGbDay = Math.round(payload.reduce((sum, item) => sum + item.dataGbDay, 0) * 10) / 10
    const communicationGbDay = components.reduce((sum, item) => sum + (item.communicationGbDay ?? 0), 0)
    const powerRatio = powerDrawW ? Math.min(1, powerSupplyW / powerDrawW) : 1
    const lifetimeMonths = Math.max(1, Math.round(objective.lifetimeMonths * powerRatio))
    return {
      massKg,
      powerDrawW,
      powerSupplyW,
      batteryWh,
      costM,
      dataGbDay,
      communicationGbDay,
      lifetimeMonths,
      componentCount: components.length,
      instrumentCount: payload.length,
    }
  }, [objective.lifetimeMonths, selectedComponents, selectedInstruments, vehicle.costM])

  const simulationIsCurrent = simulationResult?.configurationKey === configurationKey

  function runMissionSimulation() {
    const result = evaluateMission({
      configurationKey,
      missionName: missionName || objective.name,
      level: activeLevel,
      objective,
      orbitName: selectedOrbit.name,
      orbitId,
      vehicleName: vehicle.name,
      massCapacityKg: selectedVehicleCapacity,
      totals,
      selectedInstrumentIds: selectedInstruments,
    })
    const currentLevelIndex = campaignLevels.findIndex((level) => level.id === activeLevel.id)
    const nextLevel = campaignLevels[currentLevelIndex + 1]

    const completedResult = {
      ...result,
      nextLevelName: result.levelComplete ? nextLevel?.name ?? null : null,
    }

    setSimulationResult(completedResult)
    setSimulationAnimationComplete(false)
    setPersistenceError('')
    setSimulationRun({
      runId: Date.now(),
      missionName: missionName || objective.name,
      levelId: activeLevel.id,
      levelName: activeLevel.name,
      objectiveId: objective.id,
      objectiveName: objective.name,
      orbitId,
      orbitName: selectedOrbit.name,
      vehicleName: vehicle.name,
      massKg: totals.massKg,
      powerDrawW: totals.powerDrawW,
      powerSupplyW: totals.powerSupplyW,
      batteryWh: totals.batteryWh,
      costM: totals.costM,
      budgetLimitM: activeLevel.budgetLimitM,
      massCapacityKg: selectedVehicleCapacity,
      levelMassLimitKg: activeLevel.massLimitKg,
      dataGbDay: totals.dataGbDay,
      communicationGbDay: totals.communicationGbDay,
      instrumentNames: instruments
        .filter((instrument) => selectedInstruments.includes(instrument.id))
        .map((instrument) => instrument.name),
      components: spacecraftComponents,
      selectedComponentIds: selectedComponents,
      result: completedResult,
    })
    setSimulationOpen(true)
  }

  function completeMissionSimulation() {
    setSimulationAnimationComplete(true)
    if (!simulationRun) return

    const historyEntry = createMissionHistoryEntry(simulationRun)
    try {
      const savedHistory = saveMissionHistory(historyEntry)
      setMissionHistory(savedHistory)
    } catch (error) {
      console.error('Completed mission run could not be saved.', error)
      setPersistenceError('This browser could not save the completed mission run. The result remains available until this page is closed.')
    }

    if (!simulationRun.result.levelComplete) return

    const nextCompletedLevelIds = campaignLevels
      .filter((level) => completedLevelIds.includes(level.id) || level.id === simulationRun.levelId)
      .map((level) => level.id)
    setCompletedLevelIds(nextCompletedLevelIds)
    try {
      window.localStorage.setItem(campaignProgressKey, JSON.stringify(nextCompletedLevelIds))
    } catch (error) {
      console.error('Campaign progress could not be saved.', error)
      setPersistenceError((current) => [
        current,
        'The next level is unlocked for this session, but campaign progress could not be saved in this browser.',
      ].filter(Boolean).join(' '))
    }
  }

  function closeMissionSimulation(completed: boolean) {
    setSimulationOpen(false)
    if (!completed) {
      setSimulationRun(null)
      setSimulationResult(null)
      setSimulationAnimationComplete(false)
    }
  }

  function toggleSelection(current: string[], id: string, setValue: (next: string[]) => void) {
    setValue(current.includes(id) ? current.filter((value) => value !== id) : [...current, id])
  }

  function renderObjectiveSelector() {
    return (
      <>
        <div className="builder-section-title">
          <div>
            <span className="builder-kicker">MISSION FRONTIER / EXPLORATION CAMPAIGN</span>
            <h2>Choose a mission level</h2>
            <p>Complete each objective to unlock the next destination. Mission limits and requirements are educational game rules.</p>
          </div>
          <span className="selected-count">{completedLevelIds.length} / {campaignLevels.length} COMPLETE</span>
        </div>
        <div className="campaign-level-grid">
          {campaignLevels.map((level, index) => {
            const objectiveForLevel = objectives.find((item) => item.id === level.objectiveId) ?? objectives[0]
            const levelOrbit = orbits.find((item) => item.id === level.orbitId) ?? orbits[0]
            const completed = completedLevelIds.includes(level.id)
            const unlocked = unlockedLevelIds.includes(level.id)
            const levelStatus = completed ? 'COMPLETED' : unlocked ? 'UNLOCKED' : 'LOCKED'

            return (
            <button
              className={`campaign-level-card${selectedLevelId === level.id ? ' campaign-level-card-selected' : ''}${!unlocked ? ' campaign-level-card-locked' : ''}`}
              key={level.id}
              type="button"
              aria-pressed={selectedLevelId === level.id}
              aria-label={`Level ${index + 1}: ${level.name}, ${levelStatus}${unlocked ? '' : ', locked'}`}
              disabled={!unlocked}
              onClick={() => {
                setSelectedLevelId(level.id)
                setObjectiveId(level.objectiveId)
                setOrbitId(level.orbitId)
                setSimulationResult(null)
              }}
            >
              <span className="campaign-level-card-top">
                <span className="objective-option-index">LEVEL {String(index + 1).padStart(2, '0')}</span>
                <span className={`campaign-level-status campaign-level-status-${levelStatus.toLowerCase()}`}>{levelStatus}</span>
              </span>
              <strong>{level.name}</strong>
              <span>{level.missionGoal}</span>
              <small>{objectiveForLevel.name} · {levelOrbit.name}</small>
              <span className="campaign-level-limits">
                Max {level.massLimitKg.toLocaleString()} kg · Budget {formatM(level.budgetLimitM)}
              </span>
              <span className="campaign-level-requirements">
                At least {level.minimumSuitableInstruments} suitable instrument{level.minimumSuitableInstruments === 1 ? '' : 's'}
                {level.requiredInstrumentIds.length > 0
                  ? ` · Requires ${level.requiredInstrumentIds.map((id) => instruments.find((item) => item.id === id)?.name ?? id).join(' + ')}`
                  : ''}
                {level.minimumBatteryWh ? ` · ${level.minimumBatteryWh.toLocaleString()} Wh battery` : ''}
                {level.requiresPowerGeneration ? ' · Power systems required' : ''}
              </span>
            </button>
            )
          })}
        </div>
        <div className="learning-callout">
          <span className="learning-mark">i</span>
          <p><strong>Current level: {activeLevel.name}.</strong> Build with the existing spacecraft, payload, and orbit tools. Run the simulation to check every completion condition and unlock the next level.</p>
        </div>
      </>
    )
  }

  function renderSpacecraftSelector() {
    return (
      <>
        <Suspense fallback={<p className="spacecraft-loading" role="status">Loading spacecraft workshop…</p>}>
          <SpacecraftWorkshop
            components={spacecraftComponents}
            selectedIds={selectedComponents}
            onAddComponent={(componentId) => {
              setSelectedComponents((current) => current.includes(componentId) ? current : [...current, componentId])
            }}
            onRemoveComponent={(componentId) => {
              setSelectedComponents((current) => current.filter((id) => id !== componentId))
            }}
            formatCost={formatM}
          />
        </Suspense>
        <div className="learning-callout">
          <span className="learning-mark">i</span>
          <p><strong>Spacecraft systems</strong> support the mission and affect total mass, power demand, and cost. Power systems add generation; batteries provide stored energy.</p>
        </div>
      </>
    )
  }

  function renderInstruments() {
    return (
      <>
        <div className="builder-section-title">
          <div>
            <span className="builder-kicker">STEP 03 / PAYLOAD</span>
            <h2>Select scientific instruments</h2>
            <p>Choose instruments to define what your mission can observe.</p>
          </div>
          <span className="selected-count">{totals.instrumentCount} SELECTED</span>
        </div>
        <div className="selectable-list">
          {instruments.map((item) => (
            <ChoiceCard
              key={item.id}
              checked={selectedInstruments.includes(item.id)}
              onChange={() => toggleSelection(selectedInstruments, item.id, setSelectedInstruments)}
              title={item.name}
              description={`${item.purpose} Science value: ${item.scienceValue}/5 (educational rating).`}
              meta={`${item.massKg} kg · ${item.powerW} W · ${formatM(item.costM)} · ${item.dataGbDay} GB/day`}
            />
          ))}
        </div>
        <div className="learning-callout">
          <span className="learning-mark">i</span>
          <p><strong>Payload</strong> is the equipment that performs a mission’s science or observation tasks. Instruments add mass, power demand, cost, and data generation.</p>
        </div>
      </>
    )
  }

  function renderOrbitPlanner() {
    return (
      <>
        <div className="builder-section-title">
          <div>
            <span className="builder-kicker">STEP 04 / ORBIT PLANNER</span>
            <h2>Choose launch and orbit</h2>
            <p>Compare simplified launch classes against the spacecraft mass in your current design.</p>
          </div>
        </div>
        <div className="orbit-builder-block">
          <h3>Launch vehicle class</h3>
          <div className="vehicle-grid">
            {vehicles.map((item) => (
              <button
                type="button"
                key={item.id}
                className={`vehicle-option${vehicleId === item.id ? ' vehicle-option-selected' : ''}`}
                aria-pressed={vehicleId === item.id}
                onClick={() => setVehicleId(item.id)}
              >
                <strong>{item.name}</strong>
                <span>{item.description}</span>
                <small>{item.capacityKg[orbitId].toLocaleString()} kg capacity · {formatM(item.costM)}</small>
              </button>
            ))}
          </div>
        </div>
        <div className="orbit-builder-block">
          <h3>Target orbit / trajectory</h3>
          <div className="orbit-list">
            {orbits.map((item) => (
              <button
                type="button"
                key={item.id}
                className={`orbit-option${orbitId === item.id ? ' orbit-option-selected' : ''}`}
                aria-pressed={orbitId === item.id}
                onClick={() => setOrbitId(item.id)}
              >
                <span className="orbit-option-indicator" />
                <span><strong>{item.name}</strong><small>{item.description}</small></span>
              </button>
            ))}
          </div>
        </div>
        <div className={`capacity-check${totals.massKg > selectedVehicleCapacity ? ' capacity-check-warning' : ''}`} role="status">
          <strong>{totals.massKg > selectedVehicleCapacity ? 'Capacity exceeded' : 'Within simplified capacity'}</strong>
          <span>{vehicle.name} carries up to {selectedVehicleCapacity.toLocaleString()} kg for {selectedOrbit.name} in this educational model. Current design mass: {totals.massKg} kg.</span>
        </div>
        <div className="learning-callout">
          <span className="learning-mark">i</span>
          <p><strong>Orbit</strong> describes a spacecraft’s path around a body or through space. Vehicle capacities and costs shown here are simplified game values, not real launch-service specifications.</p>
        </div>
      </>
    )
  }

  function renderSimulation() {
    return (
      <div className="simulation-workspace">
        <span className="builder-kicker">GAME-GENERATED EVALUATION</span>
        <h2>Run mission simulation</h2>
        <p>Evaluate the current objective, spacecraft, payload, launch class, orbit, and resource estimates against the game’s planning rules.</p>
        <button className="button-primary simulation-run-button" type="button" onClick={runMissionSimulation}>
          Run Mission Simulation
        </button>
        {persistenceError && <p className="mission-persistence-warning" role="alert">{persistenceError}</p>}
        {simulationResult && !simulationIsCurrent
          ? <p className="simulation-stale" role="status">The design has changed since the last run. Run the simulation again to update its results.</p>
          : simulationResult && !simulationAnimationComplete
            ? <p className="simulation-prompt" role="status">The mission run was interrupted before completion. Start it again to receive a final outcome.</p>
          : simulationResult
            ? <SimulationReport
                result={simulationResult}
                progressPercent={simulationRun ? getMissionProgressPercent(simulationRun) : 0}
              />
            : <p className="simulation-prompt">Results will appear here after you run the simulation.</p>}
      </div>
    )
  }

  function renderResults() {
    return (
      <>
        {persistenceError && <p className="mission-persistence-warning" role="alert">{persistenceError}</p>}
        {simulationResult && simulationIsCurrent && simulationAnimationComplete
          ? <SimulationReport
              result={simulationResult}
              progressPercent={simulationRun ? getMissionProgressPercent(simulationRun) : 0}
            />
          : <div className="simulation-results-empty">
              <span className="builder-kicker">LATEST MISSION RUN</span>
              <h2>{simulationResult ? 'Design changed since the last run' : 'No simulation results yet'}</h2>
              <p>{simulationResult
                ? 'The current design differs from the configuration used for the previous result. Open Simulation and run it again to get an up-to-date evaluation.'
                : 'Configure your mission, then open Simulation and select “Run Mission Simulation” to generate an outcome and score.'}</p>
            </div>}
        <MissionHistoryList entries={missionHistory} />
      </>
    )
  }

  const currentView = (() => {
    switch (activePage) {
      case 'Mission Design': return renderObjectiveSelector()
      case 'Spacecraft': return renderSpacecraftSelector()
      case 'Payload': return renderInstruments()
      case 'Orbit Planner': return renderOrbitPlanner()
      case 'Simulation': return renderSimulation()
      case 'Results': return renderResults()
      default:
        return null
    }
  })()

  if (activePage === 'Dashboard') {
    return (
      <div className="dashboard-resources">
        <div className="dashboard-resource-intro">
          <div>
            <span className="builder-kicker">LIVE DESIGN CHECK</span>
            <h2>Mission resources</h2>
            <p>{missionName ? `Current concept: ${missionName}` : `Objective: ${objective.name} · Select an objective or component to shape this concept.`}</p>
          </div>
          <span className="estimate-tag">EDUCATIONAL ESTIMATES</span>
        </div>
        <MissionResources
          {...totals}
          massCapacityKg={selectedVehicleCapacity}
          levelMassLimitKg={activeLevel.massLimitKg}
          levelBudgetLimitM={activeLevel.budgetLimitM}
          levelName={activeLevel.name}
          compact
        />
        <NasaDataPanel destinationId={objectiveId} destinationName={objective.name} />
      </div>
    )
  }

  return (
    <div className="mission-builder">
      <div className="builder-page-heading">
        <div>
          <span className="builder-kicker">MISSION FRONTIER / DESIGN WORKSPACE</span>
          <h1>{activePage}</h1>
          <p>{missionName ? `Mission concept: ${missionName}` : `Level objective: ${activeLevel.missionGoal}`}</p>
        </div>
        <span className="builder-step-count">DESIGN CONCEPT <span>01 — 04</span></span>
      </div>
      <div className="builder-layout">
        <section className="builder-main">{currentView}</section>
        <MissionResources
          {...totals}
          massCapacityKg={selectedVehicleCapacity}
          levelMassLimitKg={activeLevel.massLimitKg}
          levelBudgetLimitM={activeLevel.budgetLimitM}
          levelName={activeLevel.name}
        />
      </div>
      {simulationOpen && simulationRun && (
        <Suspense fallback={<div className="mission-simulation-loading" role="status">Preparing mission simulation…</div>}>
          <MissionSimulation3D
            run={simulationRun}
            onClose={closeMissionSimulation}
            onComplete={completeMissionSimulation}
          />
        </Suspense>
      )}
    </div>
  )
}

export default MissionBuilder
