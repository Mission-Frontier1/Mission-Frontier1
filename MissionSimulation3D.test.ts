import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  getCinematicCameraDistance,
  getDetachedStageOpacity,
  getActiveSpacecraftVariant,
  getMissionSceneCounts,
  getPayloadRevealScale,
} from './MissionSimulation3D'
import { getActiveStage, getFailureScenario, getFlightTelemetry, getMissionProgressPercent, getStages, type MissionSimulationRun } from './missionSimulationRules'
import {
  createMissionFlightPath,
  getOrbitInsertionProgress,
  getSelectedOrbitRadius,
  getVisibleCelestialBodyIds,
} from './missionFlightPath'

const flightPlanets = {
  earth: new THREE.Vector3(-9, 0, 0),
  moon: new THREE.Vector3(1, 0, 0.8),
  mars: new THREE.Vector3(12, 0.7, -1.2),
  deep: new THREE.Vector3(21, 1.2, 1.5),
}
const flightRadii = { earth: 2.15, moon: 0.9, mars: 1.35, deep: 0.5 }

function createRun(overrides: Partial<MissionSimulationRun> = {}): MissionSimulationRun {
  const result: MissionSimulationRun['result'] = {
    configurationKey: 'test',
    missionName: 'Test mission',
    levelName: 'Lunar Orbit',
    nextLevelName: null,
    objectiveName: 'Moon Exploration',
    outcome: 'Successful',
    levelComplete: true,
    score: 100,
    explanation: 'All modeled requirements pass.',
    checks: [],
    levelChecks: [],
    problems: [],
    recommendations: [],
  }

  return {
    runId: 1,
    missionName: 'Test mission',
    levelId: 'lunar-orbit',
    levelName: 'Lunar Orbit',
    objectiveId: 'moon',
    objectiveName: 'Moon Exploration',
    orbitId: 'lunar',
    orbitName: 'Lunar Orbit',
    vehicleName: 'Light-lift',
    massKg: 281,
    massCapacityKg: 420,
    levelMassLimitKg: 1000,
    powerDrawW: 305,
    powerSupplyW: 800,
    batteryWh: 4800,
    costM: 518,
    budgetLimitM: 1000,
    dataGbDay: 8,
    communicationGbDay: 12,
    instrumentNames: ['Camera'],
    components: [],
    selectedComponentIds: [],
    ...overrides,
    result: overrides.result ?? result,
  }
}

describe('3D mission simulation rules', () => {
  it('does not add a landing stage to orbit-only or flyby missions', () => {
    const lunarOrbitStages = getStages(createRun())
    const flybyStages = getStages(createRun({ orbitId: 'lunar-flyby', orbitName: 'Lunar Flyby Trajectory' }))

    expect(lunarOrbitStages.some((stage) => stage.id === 'landing')).toBe(false)
    expect(flybyStages.some((stage) => stage.id === 'landing')).toBe(false)
    expect(flybyStages.some((stage) => stage.id === 'flyby')).toBe(true)
    expect(lunarOrbitStages.map((stage) => stage.id)).toEqual(expect.arrayContaining([
      'countdown',
      'launch',
      'ascent',
      'separation',
      'space-entry',
      'transfer',
      'approach',
      'orbit',
      'operations',
    ]))
  })

  it('adds a landing sequence only for a surface mission', () => {
    const stages = getStages(createRun({ orbitId: 'lunar-surface', orbitName: 'Lunar Surface' }))

    expect(stages.some((stage) => stage.id === 'landing' && stage.label === 'Landing approach')).toBe(true)
    expect(stages.some((stage) => stage.label === 'Surface science')).toBe(true)
  })

  it('holds through countdown and ignition before a gradual, continuous ground liftoff', () => {
    const path = createMissionFlightPath(createRun(), flightPlanets, flightRadii)
    const launch = path.sample(0)
    const countdownEnd = path.sample(0.08)
    const ignitionEnd = path.sample(0.12)
    const initialLiftoff = path.sample(0.14)
    const towerClearance = path.sample(0.24)

    expect(launch.position.distanceTo(countdownEnd.position)).toBeCloseTo(0, 6)
    expect(countdownEnd.position.distanceTo(ignitionEnd.position)).toBeCloseTo(0, 6)
    expect(countdownEnd.position.y - flightPlanets.earth.y).toBeCloseTo(flightRadii.earth + 2.28, 6)
    expect(initialLiftoff.position.y).toBeGreaterThan(ignitionEnd.position.y)
    expect(initialLiftoff.position.y).toBeLessThan(towerClearance.position.y)
    expect(towerClearance.position.y - launch.position.y).toBeGreaterThan(5)

    for (const boundary of [0.08, 0.12, 0.14, 0.2, 0.24, 0.32, 0.36, 0.42, 0.64, 0.76, 0.9]) {
      const before = path.sample(boundary - 0.00001).position
      const after = path.sample(boundary + 0.00001).position
      expect(before.distanceTo(after)).toBeLessThan(0.05)
    }
  })

  it('descends to a stable lunar touchdown only for the surface orbit', () => {
    const landingPath = createMissionFlightPath(
      createRun({ orbitId: 'lunar-surface' }),
      flightPlanets,
      flightRadii,
    )
    const touchdown = landingPath.sample(0.9).position
    const surfaceScience = landingPath.sample(1).position

    expect(touchdown.distanceTo(surfaceScience)).toBeCloseTo(0, 6)
    for (let index = 0; index <= 40; index += 1) {
      const progress = 0.76 + index * 0.0035
      const altitude = landingPath.sample(progress).position.distanceTo(flightPlanets.moon)
      expect(altitude).toBeGreaterThanOrEqual(flightRadii.moon + 1.2)
    }
    expect(touchdown.distanceTo(flightPlanets.moon)).toBeCloseTo(flightRadii.moon + 1.28, 5)

    const orbitPath = createMissionFlightPath(createRun(), flightPlanets, flightRadii)
    expect(orbitPath.sample(1).position.distanceTo(touchdown)).toBeGreaterThan(1)
  })

  it('uses the selected Earth orbit radius for orbital insertion', () => {
    const lowOrbit = getSelectedOrbitRadius({ objectiveId: 'earth', orbitId: 'leo' }, flightRadii)
    const geostationary = getSelectedOrbitRadius({ objectiveId: 'earth', orbitId: 'geo' }, flightRadii)

    expect(geostationary).toBeGreaterThan(lowOrbit)
  })

  it('displays Earth and only the selected destination', () => {
    expect(getVisibleCelestialBodyIds(createRun({ objectiveId: 'earth' }))).toEqual(['earth'])
    expect(getVisibleCelestialBodyIds(createRun({ objectiveId: 'moon' }))).toEqual(['earth', 'moon'])
    expect(getVisibleCelestialBodyIds(createRun({ objectiveId: 'mars' }))).toEqual(['earth', 'mars'])
    expect(getVisibleCelestialBodyIds(createRun({ objectiveId: 'deep' }))).toEqual(['earth', 'deep'])
  })

  it('counts one Earth, one spacecraft root, one trajectory, and one active vehicle in the initial scene', () => {
    const scene = new THREE.Scene()
    const earth = new THREE.Group()
    earth.userData.missionRole = 'earth'
    scene.add(earth)
    const spacecraft = new THREE.Group()
    spacecraft.userData.missionRole = 'spacecraft'
    scene.add(spacecraft)
    const carrier = new THREE.Group()
    carrier.userData.missionRole = 'launch-vehicle'
    spacecraft.add(carrier)
    const hiddenLander = new THREE.Group()
    hiddenLander.userData.missionRole = 'lander'
    hiddenLander.visible = false
    spacecraft.add(hiddenLander)
    const trajectory = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial())
    trajectory.userData.missionRole = 'trajectory'
    scene.add(trajectory)

    expect(getMissionSceneCounts(scene)).toMatchObject({
      earth: 1,
      spacecraft: 1,
      'launch-vehicle': 1,
      lander: 1,
      trajectory: 1,
      activeSpacecraft: 1,
    })
  })

  it('keeps exactly one vehicle active throughout lunar handoff and flags duplicate Earth nodes', () => {
    const scene = new THREE.Scene()
    const spacecraft = new THREE.Group()
    spacecraft.userData.missionRole = 'spacecraft'
    scene.add(spacecraft)
    const carrier = new THREE.Group()
    carrier.userData.missionRole = 'launch-vehicle'
    spacecraft.add(carrier)
    const lander = new THREE.Group()
    lander.userData.missionRole = 'lander'
    lander.visible = false
    spacecraft.add(lander)

    for (let step = 0; step <= 100; step += 1) {
      const progress = step / 100
      const active = getActiveSpacecraftVariant(progress, true)
      carrier.visible = active === 'launch-vehicle'
      lander.visible = active === 'lander'
      expect(getMissionSceneCounts(scene).activeSpacecraft).toBe(1)
    }
    expect(getActiveSpacecraftVariant(0.839, true)).toBe('launch-vehicle')
    expect(getActiveSpacecraftVariant(0.84, true)).toBe('lander')
    expect(getActiveSpacecraftVariant(1, false)).toBe('launch-vehicle')

    const earth = new THREE.Group()
    earth.userData.missionRole = 'earth'
    scene.add(earth)
    const accidentalSecondEarth = new THREE.Group()
    accidentalSecondEarth.userData.missionRole = 'earth'
    scene.add(accidentalSecondEarth)
    expect(getMissionSceneCounts(scene).earth).toBe(2)
  })

  it('uses one selected orbit and keeps non-orbital profiles free of orbit rings', () => {
    expect(getOrbitInsertionProgress(createRun({ objectiveId: 'earth', orbitId: 'leo' }))).toBe(0.64)
    expect(getOrbitInsertionProgress(createRun({ objectiveId: 'moon', orbitId: 'lunar' }))).toBe(0.9)
    expect(getOrbitInsertionProgress(createRun({ objectiveId: 'mars', orbitId: 'mars' }))).toBe(0.9)
    expect(getOrbitInsertionProgress(createRun({ objectiveId: 'moon', orbitId: 'lunar-flyby' }))).toBeNull()
    expect(getOrbitInsertionProgress(createRun({ objectiveId: 'moon', orbitId: 'lunar-surface' }))).toBeNull()
    expect(getOrbitInsertionProgress(createRun({ objectiveId: 'deep', orbitId: 'deep' }))).toBeNull()
  })

  it('reveals the designed spacecraft smoothly and fades separated hardware out', () => {
    expect(getPayloadRevealScale(0.38)).toBe(0)
    expect(getPayloadRevealScale(0.4)).toBeGreaterThan(0)
    expect(getPayloadRevealScale(0.43)).toBe(1)
    expect(getDetachedStageOpacity(0)).toBe(1)
    expect(getDetachedStageOpacity(0.7)).toBeGreaterThan(0)
    expect(getDetachedStageOpacity(0.7)).toBeLessThan(1)
    expect(getDetachedStageOpacity(1.2)).toBe(0)
  })

  it('moves the camera in close for lunar touchdown while keeping orbital views wide', () => {
    expect(getCinematicCameraDistance(1, true)).toBeLessThan(10)
    expect(getCinematicCameraDistance(1, false)).toBeGreaterThan(20)
  })

  it('reports stage-aware educational altitude and velocity with the active reference body', () => {
    const run = createRun()
    const ignition = getFlightTelemetry(0.1, run)
    const ascent = getFlightTelemetry(0.28, run)
    const lunarApproach = getFlightTelemetry(0.7, run)
    const landing = getFlightTelemetry(1, createRun({ orbitId: 'lunar-surface', orbitName: 'Lunar Surface' }))

    expect(ignition).toMatchObject({ altitudeKm: 0, altitudeReference: 'Earth', velocityKmPerSecond: 0 })
    expect(ascent.altitudeReference).toBe('Earth')
    expect(ascent.altitudeKm).toBeGreaterThan(0)
    expect(ascent.velocityKmPerSecond).toBeGreaterThan(0)
    expect(lunarApproach.altitudeReference).toBe('Moon')
    expect(landing).toMatchObject({ altitudeKm: 0, altitudeReference: 'Moon', velocityKmPerSecond: 0 })
  })

  it('stops the educational run at the stage affected by a modeled power failure', () => {
    const run = createRun({
      result: {
        ...createRun().result,
        outcome: 'Requires Redesign',
        levelComplete: false,
        checks: [{
          label: 'Power requirements',
          detail: '305 W demand vs 0 W generation.',
          score: 0,
          status: 'problem',
        }],
      },
    })

    const failure = getFailureScenario(run)
    const stages = getStages(run)

    expect(failure).not.toBeNull()
    if (!failure) return

    expect(failure).toMatchObject({
      progress: 0.46,
      title: 'Transfer interrupted',
    })
    expect(stages[getActiveStage(stages, failure.progress)].id).toBe('transfer')
    expect(getMissionProgressPercent(run)).toBe(46)
    expect(getMissionProgressPercent(createRun())).toBe(100)
  })
})
