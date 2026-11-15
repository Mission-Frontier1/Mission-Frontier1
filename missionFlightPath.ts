import * as THREE from 'three'
import type { MissionSimulationRun } from './missionSimulationRules'

export type FlightPlanetCenters = Record<'earth' | 'moon' | 'mars' | 'deep', THREE.Vector3>

export type FlightPlanetRadii = Record<'earth' | 'moon' | 'mars' | 'deep', number>

export type FlightPathSample = {
  position: THREE.Vector3
  tangent: THREE.Vector3
}

export type MissionFlightPath = {
  points: THREE.Vector3[]
  sample: (progress: number) => FlightPathSample
}

type Waypoint = {
  progress: number
  position: THREE.Vector3
  hold?: boolean
}

type MissionRoute = Pick<MissionSimulationRun, 'objectiveId' | 'orbitId'>

export function getVisibleCelestialBodyIds(run: Pick<MissionRoute, 'objectiveId'>) {
  return run.objectiveId === 'earth' ? ['earth'] as const : ['earth', run.objectiveId] as const
}

export function getOrbitInsertionProgress(run: MissionRoute) {
  if (run.objectiveId === 'earth') return 0.64
  if (run.objectiveId === 'moon' && run.orbitId === 'lunar') return 0.9
  if (run.objectiveId === 'mars' && run.orbitId === 'mars') return 0.9
  return null
}

function orbitPoint(center: THREE.Vector3, radius: number, angle: number) {
  return center.clone().add(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius))
}

export function getSelectedOrbitRadius(run: MissionRoute, radii: FlightPlanetRadii) {
  if (run.objectiveId === 'earth') return radii.earth + (run.orbitId === 'geo' ? 5.4 : 2.6)
  if (run.objectiveId === 'moon') return radii.moon + 1.7
  if (run.objectiveId === 'mars') return radii.mars + 2.2
  return radii.deep + 1.8
}

function createWaypoints(
  run: MissionRoute,
  planets: FlightPlanetCenters,
  radii: FlightPlanetRadii,
): Waypoint[] {
  const earth = planets.earth
  const launchPosition = earth.clone().add(new THREE.Vector3(0, radii.earth + 2.28, 0))
  const waypoints: Waypoint[] = [
    { progress: 0, position: launchPosition, hold: true },
    { progress: 0.08, position: launchPosition.clone(), hold: true },
    { progress: 0.12, position: launchPosition.clone(), hold: true },
    { progress: 0.14, position: earth.clone().add(new THREE.Vector3(0.02, radii.earth + 2.53, 0)) },
    { progress: 0.17, position: earth.clone().add(new THREE.Vector3(0.08, radii.earth + 3.4, 0.02)) },
    { progress: 0.2, position: earth.clone().add(new THREE.Vector3(0.2, radii.earth + 5.05, 0.08)) },
    { progress: 0.24, position: earth.clone().add(new THREE.Vector3(0.42, radii.earth + 7.98, 0.2)) },
    { progress: 0.28, position: earth.clone().add(new THREE.Vector3(0.72, radii.earth + 11.1, 0.32)) },
    { progress: 0.32, position: earth.clone().add(new THREE.Vector3(1, radii.earth + 14, 0.45)) },
    { progress: 0.36, position: earth.clone().add(new THREE.Vector3(1.32, radii.earth + 16.8, 0.62)) },
    { progress: 0.42, position: earth.clone().add(new THREE.Vector3(1.8, radii.earth + 20.6, 0.9)) },
  ]

  if (run.objectiveId === 'earth') {
    const radius = getSelectedOrbitRadius(run, radii)
    waypoints.push(
      { progress: 0.64, position: orbitPoint(earth, radius, Math.PI + 0.95) },
      { progress: 0.76, position: orbitPoint(earth, radius, Math.PI + 0.4) },
      { progress: 0.84, position: orbitPoint(earth, radius, Math.PI + 0.1) },
      { progress: 0.9, position: orbitPoint(earth, radius, Math.PI - 0.2) },
      { progress: 1, position: orbitPoint(earth, radius, Math.PI - 1.05) },
    )
    return waypoints
  }

  const destination = planets[run.objectiveId]
  const destinationRadius = radii[run.objectiveId]
  const transferMidpoint = launchPosition.clone().lerp(destination, 0.5)
  transferMidpoint.y += 5.2
  transferMidpoint.z += 2.1
  waypoints.push({ progress: 0.64, position: transferMidpoint })

  if (run.orbitId === 'lunar-surface') {
    waypoints.push(
      { progress: 0.76, position: destination.clone().add(new THREE.Vector3(-destinationRadius - 4.8, destinationRadius + 4.2, 0)) },
      { progress: 0.8, position: destination.clone().add(new THREE.Vector3(-destinationRadius - 2.8, destinationRadius + 3.1, 0)) },
      { progress: 0.84, position: destination.clone().add(new THREE.Vector3(-1.4, destinationRadius + 2, 0)) },
      { progress: 0.88, position: destination.clone().add(new THREE.Vector3(-0.35, destinationRadius + 1.35, 0)) },
      { progress: 0.9, position: destination.clone().add(new THREE.Vector3(0, destinationRadius + 1.28, 0)), hold: true },
      { progress: 1, position: destination.clone().add(new THREE.Vector3(0, destinationRadius + 1.28, 0)), hold: true },
    )
    return waypoints
  }

  if (run.orbitId === 'lunar-flyby') {
    const approachRadius = destinationRadius + 4
    waypoints.push(
      { progress: 0.76, position: destination.clone().add(new THREE.Vector3(-approachRadius, 1.4, 0)) },
      { progress: 0.84, position: destination.clone().add(new THREE.Vector3(-destinationRadius - 1, 0.6, 0)) },
      { progress: 0.9, position: destination.clone().add(new THREE.Vector3(0, 0.15, destinationRadius + 0.35)) },
      { progress: 1, position: destination.clone().add(new THREE.Vector3(destinationRadius + 4, 1, 0.5)) },
    )
    return waypoints
  }

  if (run.objectiveId === 'moon' || run.objectiveId === 'mars') {
    const radius = getSelectedOrbitRadius(run, radii)
    waypoints.push(
      { progress: 0.76, position: destination.clone().add(new THREE.Vector3(-radius - 4, 2, 0)) },
      { progress: 0.84, position: destination.clone().add(new THREE.Vector3(-radius - 1, 0.8, 0)) },
      { progress: 0.9, position: orbitPoint(destination, radius, Math.PI) },
      { progress: 1, position: orbitPoint(destination, radius, Math.PI - 0.95) },
    )
    return waypoints
  }

  waypoints.push(
    { progress: 0.76, position: destination.clone().add(new THREE.Vector3(-4, 1.2, 0)) },
    { progress: 0.84, position: destination.clone().add(new THREE.Vector3(-1.8, 0.5, 0)) },
    { progress: 0.9, position: destination.clone().add(new THREE.Vector3(-0.5, 0.2, 0)) },
    { progress: 1, position: destination.clone().add(new THREE.Vector3(4, 0.8, 0.5)) },
  )
  return waypoints
}

export function createMissionFlightPath(
  run: MissionRoute,
  planets: FlightPlanetCenters,
  radii: FlightPlanetRadii,
): MissionFlightPath {
  const waypoints = createWaypoints(run, planets, radii)
  const slopes = waypoints.map((waypoint, index) => {
    if (waypoint.hold) return new THREE.Vector3()
    const previous = waypoints[Math.max(0, index - 1)]
    const next = waypoints[Math.min(waypoints.length - 1, index + 1)]
    const progressRange = next.progress - previous.progress
    return progressRange > 0
      ? next.position.clone().sub(previous.position).multiplyScalar(1 / progressRange)
      : new THREE.Vector3()
  })

  const sample = (progress: number): FlightPathSample => {
    const boundedProgress = Math.max(0, Math.min(1, progress))
    let segmentIndex = waypoints.length - 2
    for (let index = 0; index < waypoints.length - 1; index += 1) {
      if (boundedProgress <= waypoints[index + 1].progress) {
        segmentIndex = index
        break
      }
    }

    const start = waypoints[segmentIndex]
    const end = waypoints[segmentIndex + 1]
    const segmentDuration = end.progress - start.progress
    const t = Math.max(0, Math.min(1, (boundedProgress - start.progress) / segmentDuration))
    const t2 = t * t
    const t3 = t2 * t
    const startTangent = slopes[segmentIndex].clone().multiplyScalar(segmentDuration)
    const endTangent = slopes[segmentIndex + 1].clone().multiplyScalar(segmentDuration)
    const position = start.position.clone().multiplyScalar(2 * t3 - 3 * t2 + 1)
      .addScaledVector(startTangent, t3 - 2 * t2 + t)
      .addScaledVector(end.position, -2 * t3 + 3 * t2)
      .addScaledVector(endTangent, t3 - t2)
    const derivative = start.position.clone().multiplyScalar(6 * t2 - 6 * t)
      .addScaledVector(startTangent, 3 * t2 - 4 * t + 1)
      .addScaledVector(end.position, -6 * t2 + 6 * t)
      .addScaledVector(endTangent, 3 * t2 - 2 * t)
      .multiplyScalar(1 / segmentDuration)

    if (derivative.lengthSq() < 1e-8) derivative.copy(end.position).sub(start.position)
    if (derivative.lengthSq() < 1e-8) derivative.set(0, 1, 0)

    return { position, tangent: derivative.normalize() }
  }

  const points = Array.from({ length: 401 }, (_, index) => sample(index / 400).position)
  return { points, sample }
}
