import type { SpacecraftComponent } from './spacecraftModel'

export type SimulationCheck = {
  label: string
  detail: string
  score: number
  status: 'pass' | 'warning' | 'problem'
}

export type MissionSimulationRun = {
  runId: number
  missionName: string
  levelId: string
  levelName: string
  objectiveId: 'earth' | 'moon' | 'mars' | 'deep'
  objectiveName: string
  orbitId: string
  orbitName: string
  vehicleName: string
  massKg: number
  powerDrawW: number
  powerSupplyW: number
  batteryWh: number
  costM: number
  budgetLimitM: number
  massCapacityKg: number
  levelMassLimitKg: number
  dataGbDay: number
  communicationGbDay: number
  instrumentNames: string[]
  components: SpacecraftComponent[]
  selectedComponentIds: string[]
  result: {
    configurationKey: string
    missionName: string
    levelName: string
    nextLevelName: string | null
    objectiveName: string
    outcome: 'Successful' | 'Partially Successful' | 'Requires Redesign'
    levelComplete: boolean
    score: number
    explanation: string
    checks: SimulationCheck[]
    levelChecks: SimulationCheck[]
    problems: string[]
    recommendations: string[]
  }
}

export type MissionStage = {
  id: string
  label: string
  start: number
  end: number
  detail: string
}

export type FlightTelemetry = {
  altitudeKm: number
  altitudeReference: string
  velocityKmPerSecond: number
}

export type FailureScenario = {
  progress: number
  title: string
  detail: string
}

export const simulationDurationMs = 24000

function interpolate(value: number, start: number, end: number, from: number, to: number) {
  const progress = Math.max(0, Math.min(1, (value - start) / (end - start)))
  return from + (to - from) * progress
}

export function getFlightTelemetry(progress: number, run: MissionSimulationRun): FlightTelemetry {
  const boundedProgress = Math.max(0, Math.min(1, progress))
  const landingRequired = run.orbitId === 'lunar-surface'
  const targetName = run.objectiveId === 'earth'
    ? 'Earth'
    : run.objectiveId === 'moon'
      ? 'Moon'
      : run.objectiveId === 'mars'
        ? 'Mars'
        : 'deep-space waypoint'
  const cruiseAltitudeKm = run.objectiveId === 'moon'
    ? 100000
    : run.objectiveId === 'mars'
      ? 1000000
      : run.objectiveId === 'deep'
        ? 250000
        : 400
  const approachAltitudeKm = run.objectiveId === 'earth'
    ? 400
    : run.objectiveId === 'moon'
      ? landingRequired ? 25 : 100
      : 250
  const cruiseVelocityKmPerSecond = run.objectiveId === 'moon'
    ? 10.8
    : run.objectiveId === 'mars'
      ? 11.2
      : run.objectiveId === 'deep'
        ? 9.5
        : 7.8
  const arrivalVelocityKmPerSecond = run.objectiveId === 'moon'
    ? 1.6
    : run.objectiveId === 'mars'
      ? 2.2
      : run.objectiveId === 'deep'
        ? 5.2
        : 7.8

  if (boundedProgress < 0.12) {
    return { altitudeKm: 0, altitudeReference: 'Earth', velocityKmPerSecond: 0 }
  }
  if (boundedProgress < 0.24) {
    return {
      altitudeKm: Math.round(interpolate(boundedProgress, 0.12, 0.24, 0, 50)),
      altitudeReference: 'Earth',
      velocityKmPerSecond: Number(interpolate(boundedProgress, 0.12, 0.24, 0, 1.7).toFixed(1)),
    }
  }
  if (boundedProgress < 0.32) {
    return {
      altitudeKm: Math.round(interpolate(boundedProgress, 0.24, 0.32, 50, 120)),
      altitudeReference: 'Earth',
      velocityKmPerSecond: Number(interpolate(boundedProgress, 0.24, 0.32, 1.7, 3.2).toFixed(1)),
    }
  }
  if (boundedProgress < 0.42) {
    return {
      altitudeKm: Math.round(interpolate(boundedProgress, 0.32, 0.42, 120, 400)),
      altitudeReference: 'Earth',
      velocityKmPerSecond: Number(interpolate(boundedProgress, 0.32, 0.42, 3.2, 7.8).toFixed(1)),
    }
  }
  if (boundedProgress < 0.64) {
    return {
      altitudeKm: Math.round(interpolate(boundedProgress, 0.42, 0.64, 400, cruiseAltitudeKm)),
      altitudeReference: 'Earth',
      velocityKmPerSecond: Number(interpolate(boundedProgress, 0.42, 0.64, 7.8, cruiseVelocityKmPerSecond).toFixed(1)),
    }
  }
  if (boundedProgress < 0.76) {
    return {
      altitudeKm: Math.round(interpolate(boundedProgress, 0.64, 0.76, cruiseAltitudeKm, approachAltitudeKm)),
      altitudeReference: targetName,
      velocityKmPerSecond: Number(interpolate(boundedProgress, 0.64, 0.76, cruiseVelocityKmPerSecond, arrivalVelocityKmPerSecond).toFixed(1)),
    }
  }
  if (landingRequired && boundedProgress < 0.9) {
    return {
      altitudeKm: Math.max(0, Math.round(interpolate(boundedProgress, 0.76, 0.9, approachAltitudeKm, 0))),
      altitudeReference: targetName,
      velocityKmPerSecond: Number(interpolate(boundedProgress, 0.76, 0.9, arrivalVelocityKmPerSecond, 0).toFixed(1)),
    }
  }
  return {
    altitudeKm: landingRequired ? 0 : approachAltitudeKm,
    altitudeReference: targetName,
    velocityKmPerSecond: landingRequired ? 0 : arrivalVelocityKmPerSecond,
  }
}

export function getFailureScenario(run: MissionSimulationRun): FailureScenario | null {
  if (run.result.levelComplete) return null

  const failedChecks = [...run.result.checks, ...run.result.levelChecks]
    .filter((check) => check.status === 'problem')
  const matchingFailure = (labels: string[]) =>
    failedChecks.find((check) => labels.includes(check.label))

  const budgetFailure = matchingFailure(['Available budget'])
  if (budgetFailure) {
    return {
      progress: 0.035,
      title: 'Pre-launch review hold',
      detail: `${budgetFailure.detail} This concept exceeds the game's educational budget limit, so launch approval is withheld.`,
    }
  }

  const massFailure = matchingFailure(['Spacecraft mass', 'Level mass limit'])
  if (massFailure) {
    return {
      progress: 0.17,
      title: 'Launch vehicle overload',
      detail: `${massFailure.detail} The modeled payload cannot safely reach the planned trajectory with this launch class.`,
    }
  }

  const powerFailure = matchingFailure(['Power requirements'])
  if (powerFailure) {
    return {
      progress: 0.46,
      title: 'Transfer interrupted',
      detail: `${powerFailure.detail} The simplified power model cannot support the planned spacecraft operations.`,
    }
  }

  const orbitFailure = matchingFailure(['Required mission orbit'])
  if (orbitFailure) {
    return {
      progress: 0.69,
      title: 'Target approach missed',
      detail: `${orbitFailure.detail} The spacecraft reaches the destination region but does not meet the selected level's required trajectory.`,
    }
  }

  const batteryFailure = matchingFailure(['Battery reserve'])
  if (batteryFailure) {
    return {
      progress: 0.78,
      title: 'Landing sequence held',
      detail: `${batteryFailure.detail} The mission does not attempt surface operations without the required modeled reserve.`,
    }
  }

  const communicationFailure = matchingFailure(['Communication requirements'])
  if (communicationFailure) {
    return {
      progress: 0.96,
      title: 'Science data not returned',
      detail: `${communicationFailure.detail} The spacecraft reaches mission operations, but the modeled link cannot return all generated data.`,
    }
  }

  const instrumentFailure = failedChecks.find((check) =>
    check.label.startsWith('Required instrument:')
    || check.label === 'Mission-suitable instruments'
    || check.label === 'Objective and instrument suitability',
  )
  if (instrumentFailure) {
    return {
      progress: 0.94,
      title: 'Science objective incomplete',
      detail: `${instrumentFailure.detail} The spacecraft reaches the destination, but its selected payload does not satisfy this game's science requirements.`,
    }
  }

  return {
    progress: 0.94,
    title: 'Mission requirements incomplete',
    detail: run.result.explanation,
  }
}

export function getMissionProgressPercent(run: MissionSimulationRun) {
  if (run.result.levelComplete) return 100
  return Math.round((getFailureScenario(run)?.progress ?? 1) * 100)
}

export function getStages(run: MissionSimulationRun): MissionStage[] {
  const landingRequired = run.orbitId === 'lunar-surface'
  const flybyMission = run.orbitId === 'lunar-flyby'
  const arrivalLabel = landingRequired
    ? 'Landing approach'
    : flybyMission
      ? 'Lunar flyby'
      : 'Orbital insertion'
  const operationsLabel = landingRequired ? 'Surface science' : 'Science operations'

  return [
    { id: 'countdown', label: 'Launch countdown', start: 0, end: 0.08, detail: 'Final simulated go/no-go checks. The countdown and telemetry are educational, not live launch data.' },
    { id: 'launch', label: 'Engine ignition & liftoff', start: 0.08, end: 0.24, detail: `The ${run.vehicleName} ignites while held on the ground, then lifts gradually from the launchpad.` },
    { id: 'ascent', label: 'Atmospheric ascent', start: 0.24, end: 0.32, detail: 'The vehicle accelerates through a stylized atmosphere as the camera follows its climb.' },
    { id: 'separation', label: 'Stage separation', start: 0.32, end: 0.36, detail: 'The spent first stage separates; the upper stage continues carrying the spacecraft.' },
    { id: 'space-entry', label: 'Space entry & fairing release', start: 0.36, end: 0.42, detail: 'The payload fairing opens after atmospheric ascent to reveal the selected spacecraft design.' },
    { id: 'transfer', label: 'Space travel', start: 0.42, end: 0.64, detail: `The spacecraft follows a conceptual transfer toward ${run.objectiveName}.` },
    { id: 'approach', label: 'Destination approach', start: 0.64, end: 0.76, detail: `The spacecraft approaches ${run.objectiveName} and prepares for the selected mission profile.` },
    { id: landingRequired ? 'landing' : flybyMission ? 'flyby' : 'orbit', label: arrivalLabel, start: 0.76, end: 0.9, detail: landingRequired ? 'A surface landing is attempted only because this mission selects the Lunar Surface target.' : flybyMission ? 'The spacecraft passes the Moon without entering orbit or landing.' : `The spacecraft enters the selected ${run.orbitName} profile; no landing is attempted.` },
    { id: 'operations', label: operationsLabel, start: 0.9, end: 1, detail: landingRequired ? 'Surface operations collect science data and check the modeled return link.' : 'The spacecraft conducts its mission and checks whether modeled science data can be returned.' },
  ]
}

export function getActiveStage(stages: MissionStage[], progress: number) {
  const activeStage = stages.findIndex((stage) => progress < stage.end)
  return activeStage < 0 ? stages.length - 1 : activeStage
}
