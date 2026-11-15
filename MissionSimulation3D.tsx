import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { createSpacecraftAssembly, disposeObject } from './spacecraftModel'
import {
  createMissionFlightPath,
  getOrbitInsertionProgress,
  getSelectedOrbitRadius,
  getVisibleCelestialBodyIds,
} from './missionFlightPath'
import {
  getActiveStage,
  getFailureScenario,
  getFlightTelemetry,
  getStages,
  simulationDurationMs,
  type MissionSimulationRun,
} from './missionSimulationRules'
import './MissionSimulation3D.css'

type CameraView = 'follow' | 'wide' | 'launchpad' | 'destination'

type LaunchVehicleParts = {
  carrier: THREE.Group
  firstStageFlames: Array<{
    mesh: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>
    length: number
  }>
  firstStageLight: THREE.PointLight
}

type LaunchSiteParts = {
  serviceArms: THREE.Group
  materials: THREE.Material[]
  padLight: THREE.PointLight
}

type CameraTransition = {
  view: CameraView
  startPosition: THREE.Vector3
  startTarget: THREE.Vector3
  elapsed: number
}

type CameraRig = {
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  spacecraft: THREE.Group
  targets: Record<'wide' | 'launchpad' | 'destination', THREE.Vector3>
  offsets: Record<CameraView, THREE.Vector3>
}

type MissionSimulation3DProps = {
  run: MissionSimulationRun
  onClose: (completed: boolean) => void
  onComplete: () => void
}

type MissionSceneRole = 'earth' | 'moon' | 'mars' | 'destination' | 'spacecraft' | 'launch-vehicle' | 'lander' | 'trajectory'
type MissionSceneCounts = Record<MissionSceneRole, number> & { activeSpacecraft: number }

function markMissionRole<T extends THREE.Object3D>(object: T, role: MissionSceneRole) {
  object.userData.missionRole = role
  return object
}

function isEffectivelyVisible(object: THREE.Object3D) {
  for (let current: THREE.Object3D | null = object; current; current = current.parent) {
    if (!current.visible) return false
  }
  return true
}

export function getMissionSceneCounts(scene: THREE.Scene): MissionSceneCounts {
  const counts: MissionSceneCounts = {
    earth: 0, moon: 0, mars: 0, destination: 0,
    spacecraft: 0, 'launch-vehicle': 0, lander: 0, trajectory: 0,
    activeSpacecraft: 0,
  }
  scene.traverse((object) => {
    const role = object.userData.missionRole as MissionSceneRole | undefined
    if (!role) return
    counts[role] += 1
    if ((role === 'launch-vehicle' || role === 'lander') && isEffectivelyVisible(object)) {
      counts.activeSpacecraft += 1
    }
  })
  return counts
}

export function getActiveSpacecraftVariant(progress: number, landingRequired: boolean): 'launch-vehicle' | 'lander' {
  return landingRequired && progress >= 0.84 ? 'lander' : 'launch-vehicle'
}

function assertMissionSceneInvariant(scene: THREE.Scene, run: MissionSimulationRun) {
  const counts = getMissionSceneCounts(scene)
  const expectedWaypoint = run.objectiveId === 'deep' ? 1 : 0
  const expectedLander = run.orbitId === 'lunar-surface' ? 1 : 0
  const valid = counts.earth === 1
    && counts.moon === (run.objectiveId === 'moon' ? 1 : 0)
    && counts.mars === (run.objectiveId === 'mars' ? 1 : 0)
    && counts.destination === expectedWaypoint
    && counts.spacecraft === 1
    && counts['launch-vehicle'] === 1
    && counts.lander === expectedLander
    && counts.trajectory === 1
    && counts.activeSpacecraft === 1
  if (!valid) {
    throw new Error(`Mission scene object invariant failed: ${JSON.stringify(counts)}`)
  }
}

// Keep the scene lease on window instead of in this module. Vite can re-evaluate
// this module during HMR while an older animation closure is still alive; a
// module-local variable is reset on re-evaluation and cannot stop that renderer.
declare global {
  interface Window {
    __missionFrontierSimulationCleanup?: () => void
  }
}

function createPlanet(
  scene: THREE.Scene,
  center: THREE.Vector3,
  radius: number,
  color: string,
  kind: 'earth' | 'moon' | 'mars',
) {
  const group = markMissionRole(new THREE.Group(), kind)
  group.position.copy(center)
  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 48, 36),
    new THREE.MeshStandardMaterial({ color, roughness: 0.86, metalness: 0.02 }),
  )
  group.add(planet)

  if (kind === 'earth') {
    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 1.055, 40, 30),
      new THREE.MeshBasicMaterial({ color: '#52b9ff', transparent: true, opacity: 0.14, side: THREE.BackSide }),
    )
    group.add(atmosphere)
    const upperAtmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 1.09, 40, 30),
      new THREE.MeshBasicMaterial({
        color: '#60baff',
        transparent: true,
        opacity: 0.07,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
      }),
    )
    group.add(upperAtmosphere)
    const continents = [
      { position: [-0.38, 0.42, 0.82], scale: [0.42, 0.18, 0.08] },
      { position: [0.48, 0.08, 0.86], scale: [0.26, 0.34, 0.07] },
      { position: [-0.12, -0.46, 0.88], scale: [0.24, 0.3, 0.07] },
    ]
    continents.forEach(({ position, scale }) => {
      const land = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 24, 18),
        new THREE.MeshStandardMaterial({ color: '#3a9a70', roughness: 1 }),
      )
      const direction = new THREE.Vector3(...position).normalize()
      land.scale.set(scale[0], scale[1], 0.012)
      land.position.copy(direction.clone().multiplyScalar(radius * 1.002))
      land.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction)
      group.add(land)
    })
    const cloudGeometry = new THREE.SphereGeometry(1, 10, 7)
    const cloudMaterial = new THREE.MeshStandardMaterial({
      color: '#e9f4ff',
      transparent: true,
      opacity: 0.27,
      roughness: 1,
      depthWrite: false,
    })
    for (let index = 0; index < 38; index += 1) {
      const longitude = index * 2.399963
      const latitude = Math.asin(Math.sin(index * 78.233) * 0.72)
      const direction = new THREE.Vector3(
        Math.cos(latitude) * Math.cos(longitude),
        Math.sin(latitude),
        Math.cos(latitude) * Math.sin(longitude),
      ).normalize()
      const cloud = new THREE.Mesh(cloudGeometry, cloudMaterial)
      cloud.position.copy(direction.clone().multiplyScalar(radius * 1.022))
      cloud.scale.set(radius * 0.16, radius * 0.035, radius * 0.075)
      cloud.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction)
      group.add(cloud)
    }
  } else {
    const craterColor = kind === 'moon' ? '#a8adb2' : '#c46b50'
    const craterPositions: [number, number, number][] = kind === 'moon'
      ? [[-0.42, 0.36, 0.84], [0.39, 0.14, 0.88], [0.02, -0.48, 0.87], [-0.1, 0.04, 0.98]]
      : [[-0.4, 0.42, 0.83], [0.45, 0.08, 0.88], [0.12, -0.4, 0.9]]
    craterPositions.forEach((position, index) => {
      const crater = new THREE.Mesh(
        new THREE.SphereGeometry(radius * (index === 0 ? 0.21 : 0.14), 16, 12),
        new THREE.MeshStandardMaterial({ color: craterColor, roughness: 1 }),
      )
      const direction = new THREE.Vector3(...position).normalize()
      crater.position.copy(direction.clone().multiplyScalar(radius * 1.004))
      crater.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction)
      crater.scale.z = 0.12
      group.add(crater)
    })
  }

  scene.add(group)
  return group
}

function addDeepSpaceWaypoint(scene: THREE.Scene, center: THREE.Vector3) {
  const waypoint = markMissionRole(new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.42, 1),
    new THREE.MeshStandardMaterial({
      color: '#78d6ed',
      emissive: '#1f7893',
      emissiveIntensity: 0.55,
      roughness: 0.48,
    }),
  ), 'destination')
  waypoint.position.copy(center)
  scene.add(waypoint)
}

function addLaunchPad(earth: THREE.Group, radius: number): LaunchSiteParts {
  const site = new THREE.Group()
  const materials = new Set<THREE.Material>()
  const registerMaterial = <T extends THREE.Material>(material: T) => {
    materials.add(material)
    return material
  }
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(300, 300),
    registerMaterial(new THREE.MeshStandardMaterial({ color: '#495947', roughness: 1 })),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.y = radius + 0.02
  ground.receiveShadow = true
  site.add(ground)

  const apron = new THREE.Mesh(
    new THREE.BoxGeometry(15, 0.05, 15),
    registerMaterial(new THREE.MeshStandardMaterial({ color: '#59636a', roughness: 0.96 })),
  )
  apron.position.set(0, radius + 0.035, 0)
  apron.receiveShadow = true
  site.add(apron)

  const accessRoad = new THREE.Mesh(
    new THREE.BoxGeometry(4.6, 0.055, 18),
    registerMaterial(new THREE.MeshStandardMaterial({ color: '#3e474d', roughness: 0.94 })),
  )
  accessRoad.position.set(0, radius + 0.04, 12.2)
  accessRoad.receiveShadow = true
  site.add(accessRoad)

  const pad = new THREE.Group()
  pad.position.y = radius
  site.add(pad)
  const concrete = new THREE.Mesh(
    new THREE.BoxGeometry(5.2, 0.14, 5.2),
    registerMaterial(new THREE.MeshStandardMaterial({ color: '#7a858b', roughness: 0.9 })),
  )
  concrete.position.y = 0
  concrete.receiveShadow = true
  pad.add(concrete)

  const padMarkingMaterial = registerMaterial(new THREE.MeshStandardMaterial({ color: '#e2e4d6', roughness: 0.76 }))
  const centerLine = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 3.65), padMarkingMaterial)
  centerLine.position.set(0, 0.077, 0)
  pad.add(centerLine)
  for (const x of [-2.12, 2.12]) {
    const edgeLine = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.012, 4.1), padMarkingMaterial)
    edgeLine.position.set(x, 0.077, 0)
    pad.add(edgeLine)
  }
  const blastTrench = new THREE.Mesh(
    new THREE.BoxGeometry(1.15, 0.025, 3.9),
    registerMaterial(new THREE.MeshStandardMaterial({ color: '#202a30', roughness: 1 })),
  )
  blastTrench.position.set(0, 0.083, -3.45)
  pad.add(blastTrench)
  const trenchLip = new THREE.Mesh(
    new THREE.BoxGeometry(1.48, 0.09, 0.14),
    registerMaterial(new THREE.MeshStandardMaterial({ color: '#6f7a80', metalness: 0.3, roughness: 0.72 })),
  )
  trenchLip.position.set(0, 0.105, -1.55)
  pad.add(trenchLip)

  const perimeterLightMaterial = registerMaterial(new THREE.MeshStandardMaterial({
    color: '#ffd9a1',
    emissive: '#ffb15e',
    emissiveIntensity: 1.2,
  }))
  for (const x of [-2.45, 2.45]) {
    for (const z of [-2.45, 2.45]) {
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), perimeterLightMaterial)
      light.position.set(x, 0.12, z)
      pad.add(light)
    }
  }

  const towerMaterial = registerMaterial(new THREE.MeshStandardMaterial({
    color: '#8797a8',
    metalness: 0.62,
    roughness: 0.4,
  }))
  const tower = new THREE.Group()
  const towerX = 1.55
  const towerWidth = 0.92
  const towerDepth = 1.3
  const towerHeight = 5.15
  tower.position.set(0, radius + 0.07, 0)
  site.add(tower)
  const towerCorners = [
    [towerX - towerWidth / 2, -towerDepth / 2],
    [towerX - towerWidth / 2, towerDepth / 2],
    [towerX + towerWidth / 2, -towerDepth / 2],
    [towerX + towerWidth / 2, towerDepth / 2],
  ] as const
  towerCorners.forEach(([x, z]) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, towerHeight, 0.14), towerMaterial)
    leg.position.set(x, towerHeight / 2, z)
    leg.castShadow = true
    tower.add(leg)
  })
  const addBrace = (start: THREE.Vector3, end: THREE.Vector3) => {
    const direction = end.clone().sub(start)
    const brace = new THREE.Mesh(
      new THREE.BoxGeometry(0.065, direction.length(), 0.065),
      towerMaterial,
    )
    brace.position.copy(start).add(end).multiplyScalar(0.5)
    brace.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize())
    brace.castShadow = true
    tower.add(brace)
  }
  const levels = [0.25, 1.15, 2.05, 2.95, 3.85, 4.75]
  levels.forEach((y) => {
    for (const z of [-towerDepth / 2, towerDepth / 2]) {
      const xCrossbar = new THREE.Mesh(
        new THREE.BoxGeometry(towerWidth, 0.08, 0.09),
        towerMaterial,
      )
      xCrossbar.position.set(towerX, y, z)
      xCrossbar.castShadow = true
      tower.add(xCrossbar)
    }
    for (const x of [towerX - towerWidth / 2, towerX + towerWidth / 2]) {
      const zCrossbar = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 0.08, towerDepth),
        towerMaterial,
      )
      zCrossbar.position.set(x, y, 0)
      zCrossbar.castShadow = true
      tower.add(zCrossbar)
    }
  })
  for (let index = 0; index < levels.length - 1; index += 1) {
    const lower = levels[index]
    const upper = levels[index + 1]
    for (const z of [-towerDepth / 2, towerDepth / 2]) {
      addBrace(
        new THREE.Vector3(towerX - towerWidth / 2, lower, z),
        new THREE.Vector3(towerX + towerWidth / 2, upper, z),
      )
      addBrace(
        new THREE.Vector3(towerX + towerWidth / 2, lower, z),
        new THREE.Vector3(towerX - towerWidth / 2, upper, z),
      )
    }
  }
  for (const y of [1.35, 2.65, 4.05]) {
    const platform = new THREE.Mesh(
      new THREE.BoxGeometry(1.18, 0.08, 1.56),
      registerMaterial(new THREE.MeshStandardMaterial({ color: '#596b78', metalness: 0.5, roughness: 0.58 })),
    )
    platform.position.set(towerX, y, 0)
    platform.castShadow = true
    tower.add(platform)
  }
  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.05, 0.7, 8),
    towerMaterial,
  )
  antenna.position.set(towerX, towerHeight + 0.34, 0)
  tower.add(antenna)
  const towerLightMaterial = registerMaterial(new THREE.MeshStandardMaterial({
    color: '#ffd37f',
    emissive: '#ff9d42',
    emissiveIntensity: 1.8,
  }))
  const towerLight = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), towerLightMaterial)
  towerLight.position.set(towerX, towerHeight + 0.08, 0)
  tower.add(towerLight)

  const serviceArms = new THREE.Group()
  serviceArms.position.set(towerX - 0.18, radius + 2.78, 0)
  site.add(serviceArms)
  const serviceArmMaterial = registerMaterial(new THREE.MeshStandardMaterial({
    color: '#b0bbc3',
    metalness: 0.55,
    roughness: 0.48,
  }))
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.17, 0.42), serviceArmMaterial)
  arm.position.x = -0.59
  arm.castShadow = true
  serviceArms.add(arm)
  const armRail = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.38, 0.07), serviceArmMaterial)
  armRail.position.set(-0.74, 0.22, 0)
  serviceArms.add(armRail)

  const utilityMaterial = registerMaterial(new THREE.MeshStandardMaterial({
    color: '#59666d',
    metalness: 0.38,
    roughness: 0.66,
  }))
  for (const [x, z] of [[-3.25, -2.8], [3.15, -2.7], [-3.4, 2.9], [3.35, 2.7]]) {
    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 0.38, 1.8, 16),
      utilityMaterial,
    )
    tank.position.set(x, radius + 0.98, z)
    tank.castShadow = true
    site.add(tank)
    const tankCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.38, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      utilityMaterial,
    )
    tankCap.position.set(x, radius + 1.88, z)
    site.add(tankCap)
  }
  const utilityBuilding = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 1.25, 1.8),
    registerMaterial(new THREE.MeshStandardMaterial({ color: '#737d7d', roughness: 0.88 })),
  )
  utilityBuilding.position.set(-5.1, radius + 0.65, 1.5)
  utilityBuilding.castShadow = true
  site.add(utilityBuilding)
  const buildingRoof = new THREE.Mesh(
    new THREE.BoxGeometry(2.8, 0.12, 2),
    utilityMaterial,
  )
  buildingRoof.position.set(-5.1, radius + 1.32, 1.5)
  site.add(buildingRoof)

  const cloudMaterial = registerMaterial(new THREE.MeshBasicMaterial({
    color: '#e7f2f8',
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  }))
  const cloudGeometry = new THREE.SphereGeometry(1, 14, 10)
  const cloudGroups = [
    { x: -13, z: 12, scale: 4.4 },
    { x: 13, z: 15, scale: 5.2 },
    { x: -17, z: -5, scale: 3.8 },
    { x: 18, z: -7, scale: 4.6 },
  ]
  cloudGroups.forEach(({ x, z, scale }, cloudIndex) => {
    const cloud = new THREE.Group()
    cloud.position.set(x, radius + 4.2 + (cloudIndex % 2) * 1.1, z)
    for (let index = 0; index < 5; index += 1) {
      const puff = new THREE.Mesh(cloudGeometry, cloudMaterial)
      puff.position.set((index - 2) * scale * 0.25, Math.sin(index * 2.4) * scale * 0.04, Math.cos(index * 1.7) * scale * 0.09)
      puff.scale.set(scale * (0.25 + (index % 3) * 0.06), scale * 0.13, scale * (0.16 + (index % 2) * 0.04))
      cloud.add(puff)
    }
    site.add(cloud)
  })

  const padLight = new THREE.PointLight('#ff9b4b', 0, 16, 2)
  padLight.position.set(0, radius + 0.7, 0)
  site.add(padLight)

  site.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = object.castShadow || object.parent === tower || object.parent === serviceArms
      object.receiveShadow = true
      const objectMaterials = Array.isArray(object.material) ? object.material : [object.material]
      objectMaterials.forEach((material) => materials.add(material))
    }
  })
  earth.add(site)
  return { serviceArms, materials: [...materials], padLight }
}

function addLunarLandingZone(moon: THREE.Group, radius: number) {
  const landingZone = new THREE.Group()
  const surface = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.38, 0.035, 32),
    new THREE.MeshStandardMaterial({ color: '#747b80', roughness: 0.96 }),
  )
  surface.position.y = radius + 0.012
  landingZone.add(surface)
  const boundary = new THREE.Mesh(
    new THREE.TorusGeometry(0.42, 0.018, 8, 40),
    new THREE.MeshStandardMaterial({ color: '#c4c9cc', roughness: 0.9 }),
  )
  boundary.position.y = radius + 0.038
  boundary.rotation.x = Math.PI / 2
  landingZone.add(boundary)
  moon.add(landingZone)
  return landingZone
}

function createLanderGear() {
  const gear = new THREE.Group()
  const strutMaterial = new THREE.MeshStandardMaterial({ color: '#d8e0e5', metalness: 0.62, roughness: 0.38 })
  const footMaterial = new THREE.MeshStandardMaterial({ color: '#aeb8bf', metalness: 0.45, roughness: 0.52 })

  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      const anchor = new THREE.Vector3(x * 0.24, -0.5, z * 0.24)
      const foot = new THREE.Vector3(x * 0.68, -1.2, z * 0.68)
      const direction = foot.clone().sub(anchor)
      const strut = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.05, direction.length(), 8),
        strutMaterial,
      )
      strut.position.copy(anchor).add(foot).multiplyScalar(0.5)
      strut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize())
      gear.add(strut)
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.07, 0.28), footMaterial)
      pad.position.copy(foot)
      gear.add(pad)
    }
  }

  return gear
}

function createStars(scene: THREE.Scene) {
  const positions = new Float32Array(1200 * 3)
  const seededValue = (seed: number) => {
    const value = Math.sin(seed * 12.9898) * 43758.5453
    return value - Math.floor(value)
  }
  for (let index = 0; index < 1200; index += 1) {
    positions[index * 3] = (seededValue(index * 3 + 1) - 0.5) * 64
    positions[index * 3 + 1] = (seededValue(index * 3 + 2) - 0.5) * 44
    positions[index * 3 + 2] = (seededValue(index * 3 + 3) - 0.5) * 44
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const stars = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({ color: '#cdeeff', size: 0.055, sizeAttenuation: true, transparent: true, opacity: 0.82 }),
  )
  scene.add(stars)
  return stars
}

function createSoftParticleTexture() {
  const size = 32
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x / (size - 1)) * 2 - 1
      const dy = (y / (size - 1)) * 2 - 1
      const distance = Math.sqrt(dx * dx + dy * dy)
      const falloff = Math.max(0, 1 - distance)
      const offset = (y * size + x) * 4
      data[offset] = 255
      data[offset + 1] = 255
      data[offset + 2] = 255
      data[offset + 3] = Math.round(falloff * falloff * 255)
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearFilter
  texture.needsUpdate = true
  return texture
}

function createSkyDome(scene: THREE.Scene) {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uSpaceBlend: { value: 0 },
      uZenithColor: { value: new THREE.Color('#377ec2') },
      uHorizonColor: { value: new THREE.Color('#b7d9e8') },
      uSpaceColor: { value: new THREE.Color('#030913') },
    },
    vertexShader: `
      varying vec3 vWorldDirection;

      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldDirection = normalize(worldPosition.xyz - cameraPosition);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform float uSpaceBlend;
      uniform vec3 uZenithColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uSpaceColor;
      varying vec3 vWorldDirection;

      void main() {
        float horizon = 1.0 - abs(normalize(vWorldDirection).y);
        float horizonBlend = smoothstep(0.0, 0.92, horizon);
        vec3 daytimeSky = mix(uZenithColor, uHorizonColor, horizonBlend);
        gl_FragColor = vec4(mix(daytimeSky, uSpaceColor, uSpaceBlend), 1.0);
      }
    `,
  })
  const dome = new THREE.Mesh(new THREE.SphereGeometry(80, 48, 32), material)
  dome.frustumCulled = false
  dome.renderOrder = -1000
  scene.add(dome)
  return material
}

function getDestination(
  objectiveId: MissionSimulationRun['objectiveId'],
  planets: { earth: THREE.Vector3; moon: THREE.Vector3; mars: THREE.Vector3; deep: THREE.Vector3 },
) {
  if (objectiveId === 'moon') return { center: planets.moon, radius: 0.9, name: 'Moon' }
  if (objectiveId === 'mars') return { center: planets.mars, radius: 1.35, name: 'Mars' }
  if (objectiveId === 'deep') return { center: planets.deep, radius: 0.5, name: 'Deep-space waypoint' }
  return { center: planets.earth, radius: 2.15, name: 'Earth' }
}

function smoothStep(start: number, end: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)))
  return t * t * (3 - 2 * t)
}

export function getPayloadRevealScale(progress: number) {
  return smoothStep(0.385, 0.43, progress)
}

export function getDetachedStageOpacity(elapsed: number) {
  return 1 - smoothStep(0.25, 1.2, elapsed)
}

export function getCinematicCameraDistance(progress: number, landingRequired: boolean) {
  const pullback = smoothStep(0.1, 0.42, progress)
  const destinationApproach = smoothStep(0.64, 0.9, progress)
  const landingCloseup = landingRequired ? smoothStep(0.82, 0.98, progress) : 0
  return 12.5 + pullback * 18 - destinationApproach * 10 - landingCloseup * 12
}

function createLaunchVehicle(): LaunchVehicleParts {
  const carrier = new THREE.Group()
  carrier.scale.set(1.2, 1.35, 1.2)
  carrier.position.y = 0.95
  const body = new THREE.Group()
  const firstStageBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.27, 0.34, 1.42, 20),
    new THREE.MeshStandardMaterial({ color: '#dce4ec', metalness: 0.48, roughness: 0.42 }),
  )
  firstStageBody.position.y = -1.5
  firstStageBody.castShadow = true
  body.add(firstStageBody)
  for (const x of [-1, 1]) {
    const fin = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.56, 0.08),
      new THREE.MeshStandardMaterial({ color: '#76889a', metalness: 0.6, roughness: 0.45 }),
    )
    fin.position.set(x * 0.29, -1.96, 0)
    fin.castShadow = true
    body.add(fin)
  }
  const nozzleMaterial = new THREE.MeshStandardMaterial({ color: '#35404a', metalness: 0.82, roughness: 0.34 })
  for (const x of [-0.13, 0.13]) {
    const nozzle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.18, 0.28, 12, 1, true),
      nozzleMaterial,
    )
    nozzle.position.set(x, -2.2, 0)
    nozzle.castShadow = true
    body.add(nozzle)
  }
  const firstStageFlames = [
    { radius: 0.72, length: 4.2, color: '#ff4b1f' },
    { radius: 0.48, length: 3.2, color: '#ff912b' },
    { radius: 0.25, length: 2.15, color: '#fff2b0' },
  ].map(({ radius, length, color }) => {
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(radius, length, 22, 1, true),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthTest: true,
        depthWrite: false,
      }),
    )
    flame.position.y = -2.21 - length / 2
    flame.rotation.x = Math.PI
    flame.renderOrder = 5
    flame.visible = false
    body.add(flame)
    return { mesh: flame, length }
  })
  const firstStageLight = new THREE.PointLight('#ff8c43', 0, 16, 2)
  firstStageLight.position.y = -2.35
  body.add(firstStageLight)
  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(0.34, 0.82, 20),
    new THREE.MeshStandardMaterial({ color: '#e5a56d', metalness: 0.3, roughness: 0.4 }),
  )
  nose.position.y = -0.62
  nose.castShadow = true
  body.add(nose)
  carrier.add(body)
  return {
    carrier,
    firstStageFlames,
    firstStageLight,
  }
}

export default function MissionSimulation3D({ run, onClose, onComplete }: MissionSimulation3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const cameraRigRef = useRef<CameraRig | null>(null)
  const cameraTransitionRef = useRef<CameraTransition | null>(null)
  const cameraViewRef = useRef<CameraView>('launchpad')
  const initialLaunchCameraRef = useRef(true)
  const progressRef = useRef(0)
  const pausedRef = useRef(false)
  const onCompleteRef = useRef(onComplete)
  const [progress, setProgress] = useState(0)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [activeStageIndex, setActiveStageIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [complete, setComplete] = useState(false)
  const [cameraView, setCameraView] = useState<CameraView>('launchpad')
  const [webGlReady, setWebGlReady] = useState(false)
  const [webGlError, setWebGlError] = useState('')
  const [playbackId, setPlaybackId] = useState(0)
  const stages = useMemo(() => getStages(run), [run])
  const failure = useMemo(() => getFailureScenario(run), [run])
  const landingRequired = run.orbitId === 'lunar-surface'
  const stage = stages[Math.min(activeStageIndex, stages.length - 1)]
  const installedComponents = run.components.filter((component) => run.selectedComponentIds.includes(component.id))
  const telemetry = getFlightTelemetry(progress, run)

  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose(complete)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [complete, onClose])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    window.__missionFrontierSimulationCleanup?.()

    let renderer: THREE.WebGLRenderer | null = null
    let controls: OrbitControls | null = null
    let resizeObserver: ResizeObserver | null = null
    let statusFrame = 0
    let running = true
    let cleanedUp = false
    let handleResize: (() => void) | null = null
    let previousRenderTime = performance.now()
    let simulatedSceneTime = 0
    let launchSiteFading = false
    const scene = new THREE.Scene()
    const spaceColor = new THREE.Color('#030913')
    scene.background = spaceColor

    const particleTexture = createSoftParticleTexture()
    const cleanupScene = () => {
      if (cleanedUp) return
      cleanedUp = true
      running = false
      window.cancelAnimationFrame(statusFrame)
      if (handleResize) window.removeEventListener('resize', handleResize)
      resizeObserver?.disconnect()
      controls?.dispose()
      disposeObject(scene)
      particleTexture.dispose()
      if (renderer) {
        renderer.setAnimationLoop(null)
        renderer.setClearColor('#030913', 1)
        renderer.clear(true, true, true)
        renderer.dispose()
      }
      if (controlsRef.current === controls) controlsRef.current = null
      if (cameraRigRef.current?.camera === camera) cameraRigRef.current = null
      cameraTransitionRef.current = null
      if (window.__missionFrontierSimulationCleanup === cleanupScene) {
        window.__missionFrontierSimulationCleanup = undefined
      }
    }
    window.__missionFrontierSimulationCleanup = cleanupScene

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 180)
    const planets = {
      earth: new THREE.Vector3(-9, 0, 0),
      moon: new THREE.Vector3(1, 0, 0.8),
      mars: new THREE.Vector3(12, 0.7, -1.2),
      deep: new THREE.Vector3(21, 1.2, 1.5),
    }
    const radii = { earth: 2.15, moon: 0.9, mars: 1.35, deep: 0.5 }
    const earthRadius = radii.earth
    const moonRadius = radii.moon
    const marsRadius = radii.mars
    const earth = createPlanet(scene, planets.earth, earthRadius, '#1d68b0', 'earth')
    const launchSite = addLaunchPad(earth, earthRadius)
    const moon = run.objectiveId === 'moon'
      ? createPlanet(scene, planets.moon, moonRadius, '#c4cbd0', 'moon')
      : null
    const mars = run.objectiveId === 'mars'
      ? createPlanet(scene, planets.mars, marsRadius, '#a84736', 'mars')
      : null
    if (landingRequired && moon) addLunarLandingZone(moon, moonRadius)
    if (run.objectiveId === 'deep') addDeepSpaceWaypoint(scene, planets.deep)
    const destination = getDestination(run.objectiveId, planets)
    const orbitInsertionProgress = getOrbitInsertionProgress(run)
    const selectedOrbitRadius = getSelectedOrbitRadius(run, radii)
    const stars = createStars(scene)
    const starMaterial = stars.material as THREE.PointsMaterial
    const skyMaterial = createSkyDome(scene)
    scene.add(new THREE.HemisphereLight('#a9d8ff', '#111725', 1.45))
    const sunlight = new THREE.DirectionalLight('#fff1d2', 3.2)
    sunlight.position.set(-5, 11, 12)
    sunlight.castShadow = true
    sunlight.shadow.mapSize.set(1024, 1024)
    sunlight.shadow.camera.left = -28
    sunlight.shadow.camera.right = 28
    sunlight.shadow.camera.top = 28
    sunlight.shadow.camera.bottom = -28
    sunlight.shadow.camera.near = 0.1
    sunlight.shadow.camera.far = 70
    sunlight.shadow.bias = -0.00015
    sunlight.target.position.copy(planets.earth).add(new THREE.Vector3(0, earthRadius, 0))
    scene.add(sunlight)
    scene.add(sunlight.target)
    const fillLight = new THREE.DirectionalLight('#52a5ed', 1.1)
    fillLight.position.set(8, 2, -8)
    scene.add(fillLight)

    const flightPath = createMissionFlightPath(run, planets, radii)
    const initialPosition = flightPath.sample(0).position
    const trajectoryEndProgress = orbitInsertionProgress ?? 1
    const trajectoryEndIndex = Math.floor((flightPath.points.length - 1) * trajectoryEndProgress)
    const trajectoryPoints = flightPath.points.slice(0, trajectoryEndIndex + 1)
    if (orbitInsertionProgress !== null) {
      // Append the selected orbit to the transfer route so one geometry renders
      // both as a single continuous path instead of two parallel THREE.Line objects.
      const startAngle = run.objectiveId === 'earth' ? Math.PI + 0.95 : Math.PI
      for (let index = 1; index <= 120; index += 1) {
        const angle = startAngle + (index / 120) * Math.PI * 2
        trajectoryPoints.push(new THREE.Vector3(
          destination.center.x + Math.cos(angle) * selectedOrbitRadius,
          destination.center.y,
          destination.center.z + Math.sin(angle) * selectedOrbitRadius * 0.7,
        ))
      }
    }
    const trajectoryGeometry = new THREE.BufferGeometry().setFromPoints(trajectoryPoints)
    trajectoryGeometry.setDrawRange(0, 0)
    const trajectory = markMissionRole(new THREE.Line(
      trajectoryGeometry,
      new THREE.LineBasicMaterial({ color: '#65e6ff', transparent: true, opacity: 0.82 }),
    ), 'trajectory')
    scene.add(trajectory)
    const spacecraft = markMissionRole(new THREE.Group(), 'spacecraft')
    const lander = landingRequired ? markMissionRole(new THREE.Group(), 'lander') : null
    if (lander) {
      lander.add(createSpacecraftAssembly(run.components, run.selectedComponentIds))
      lander.add(createLanderGear())
      lander.visible = false
      spacecraft.add(lander)
    }
    const launchVehicle = createLaunchVehicle()
    markMissionRole(launchVehicle.carrier, 'launch-vehicle')
    spacecraft.add(launchVehicle.carrier)
    spacecraft.traverse((object) => {
      if (object instanceof THREE.Mesh) object.castShadow = true
    })
    spacecraft.position.copy(initialPosition)
    scene.add(spacecraft)

    try {
      assertMissionSceneInvariant(scene, run)
    } catch (error) {
      cleanupScene()
      throw error
    }

    const smokeCount = 420
    const smokePositions = new Float32Array(smokeCount * 3)
    const smokeGeometry = new THREE.BufferGeometry()
    smokeGeometry.setAttribute('position', new THREE.BufferAttribute(smokePositions, 3).setUsage(THREE.DynamicDrawUsage))
    const launchSmoke = new THREE.Points(
      smokeGeometry,
      new THREE.PointsMaterial({
        color: '#cbd2d6',
        map: particleTexture,
        size: 1.65,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0,
        alphaTest: 0.01,
        depthTest: true,
        depthWrite: false,
      }),
    )
    launchSmoke.renderOrder = 4
    launchSmoke.visible = false
    launchSmoke.frustumCulled = false
    earth.add(launchSmoke)

    const dustCount = 180
    const dustPositions = new Float32Array(dustCount * 3)
    const dustGeometry = new THREE.BufferGeometry()
    dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3).setUsage(THREE.DynamicDrawUsage))
    const launchDust = new THREE.Points(
      dustGeometry,
      new THREE.PointsMaterial({
        color: '#b59a79',
        map: particleTexture,
        size: 0.82,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0,
        alphaTest: 0.01,
        depthWrite: false,
      }),
    )
    launchDust.visible = false
    launchDust.frustumCulled = false
    earth.add(launchDust)

    const exhaustCount = 120
    const exhaustPositions = new Float32Array(exhaustCount * 3)
    const exhaustGeometry = new THREE.BufferGeometry()
    exhaustGeometry.setAttribute('position', new THREE.BufferAttribute(exhaustPositions, 3).setUsage(THREE.DynamicDrawUsage))
    const exhaustTrail = new THREE.Points(
      exhaustGeometry,
      new THREE.PointsMaterial({
        color: '#ffd7a0',
        map: particleTexture,
        size: 0.26,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0,
        alphaTest: 0.01,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
    exhaustTrail.visible = false
    exhaustTrail.frustumCulled = false
    scene.add(exhaustTrail)

    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8))
      renderer.outputColorSpace = THREE.SRGBColorSpace
      // Explicitly clear color, depth, and stencil every frame. The follow camera
      // moves substantially during ascent; retaining any prior buffer contents
      // creates ghost copies of Earth, the rocket, and the trajectory.
      // Draw one complete frame from the active scene. The render loop below
      // owns clearing explicitly so no prior camera frame can remain visible.
      renderer.autoClear = false
      renderer.autoClearColor = false
      renderer.autoClearDepth = false
      renderer.autoClearStencil = false
      renderer.setClearColor(spaceColor, 1)
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.05
      renderer.shadowMap.enabled = true
      renderer.shadowMap.type = THREE.PCFShadowMap
      controls = new OrbitControls(camera, renderer.domElement)
      controls.enableDamping = true
      controls.enablePan = false
      controls.minDistance = 3
      controls.maxDistance = 48
      const cameraOffsets: CameraRig['offsets'] = {
        follow: new THREE.Vector3(4, 3.8, 11.2),
        wide: new THREE.Vector3(0, 11, 29),
        launchpad: new THREE.Vector3(4, 3.8, 11.2),
        destination: new THREE.Vector3(4.5, 2.8, 7.5),
      }
      const cameraTargets: CameraRig['targets'] = {
        wide: new THREE.Vector3(0, 0.6, 0),
        launchpad: initialPosition.clone().add(new THREE.Vector3(0, -0.5, 0)),
        destination: landingRequired ? flightPath.sample(1).position.clone() : destination.center.clone(),
      }
      const initialCameraTarget = cameraTargets.launchpad.clone()
      camera.position.copy(initialCameraTarget.clone().add(cameraOffsets.launchpad))
      controls.target.copy(initialCameraTarget)
      let previousCinematicDistance = getCinematicCameraDistance(0, landingRequired)
      controlsRef.current = controls
      cameraRigRef.current = { camera, controls, spacecraft, targets: cameraTargets, offsets: cameraOffsets }

      const resize = () => {
        const width = canvas.clientWidth
        const height = canvas.clientHeight
        if (!width || !height || !renderer) return
        renderer.setSize(width, height, false)
        camera.aspect = width / height
        camera.updateProjectionMatrix()
      }
      handleResize = resize
      resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize)
      resizeObserver?.observe(canvas)
      window.addEventListener('resize', resize)
      resize()
      statusFrame = window.requestAnimationFrame(() => {
        if (running) setWebGlReady(true)
      })

      const render = (time: number) => {
        if (!running || !renderer || !controls) return
        const deltaSeconds = Math.min(0.08, Math.max(0, time - previousRenderTime) / 1000)
        previousRenderTime = time
        const sceneDelta = pausedRef.current ? 0 : deltaSeconds
        simulatedSceneTime += sceneDelta
        const sceneTime = simulatedSceneTime * 1000
        const currentProgress = progressRef.current
        const sample = flightPath.sample(currentProgress)
        const position = sample.position
        spacecraft.position.copy(position)
        const direction = sample.tangent
        let facingDirection = direction
        if (landingRequired && currentProgress >= 0.73) {
          const moonUp = position.clone().sub(planets.moon).normalize()
          facingDirection = direction.clone().lerp(moonUp, smoothStep(0.73, 0.9, currentProgress)).normalize()
        }
        const targetRotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), facingDirection)
        targetRotation.multiply(new THREE.Quaternion().setFromAxisAngle(facingDirection, Math.sin(sceneTime * 0.0008) * 0.018))
        spacecraft.quaternion.slerp(targetRotation, 1 - Math.exp(-deltaSeconds * 7))
        const lunarLandingTransition = landingRequired ? smoothStep(0.84, 0.9, currentProgress) : 0
        const activeVariant = getActiveSpacecraftVariant(currentProgress, landingRequired)
        launchVehicle.carrier.visible = activeVariant === 'launch-vehicle'
        if (lander) {
          lander.visible = activeVariant === 'lander'
          lander.scale.setScalar(Math.max(0.001, lunarLandingTransition))
        }

        const spaceVisibility = smoothStep(0.24, 0.52, currentProgress)
        skyMaterial.uniforms.uSpaceBlend.value = spaceVisibility
        starMaterial.opacity = 0.82 * spaceVisibility
        const launchSiteVisibility = 1 - smoothStep(0.22, 0.4, currentProgress)
        if (launchSiteVisibility < 0.999 && !launchSiteFading) {
          launchSite.materials.forEach((material) => {
            material.transparent = true
            material.depthWrite = false
            material.needsUpdate = true
          })
          launchSiteFading = true
        }
        if (launchSiteFading) {
          launchSite.materials.forEach((material) => {
            material.opacity = launchSiteVisibility
          })
        }
        launchSite.serviceArms.rotation.y = -smoothStep(0.095, 0.12, currentProgress) * Math.PI * 0.5
        launchSite.padLight.intensity = smoothStep(0.08, 0.1, currentProgress) * (1 - smoothStep(0.3, 0.42, currentProgress)) * 3.5
        earth.rotation.y += 0.0007 * sceneDelta * 60
        if (moon) moon.rotation.y += 0.00045 * sceneDelta * 60
        if (mars) mars.rotation.y += 0.00055 * sceneDelta * 60
        stars.rotation.y += 0.000015 * sceneDelta * 60

        const throttlePulse = 0.86 + Math.sin(sceneTime * 0.022) * 0.14
        const firstStageThrottle = smoothStep(0.08, 0.1, currentProgress)
          * (1 - smoothStep(0.32, 0.36, currentProgress)) * throttlePulse
        const liftHeight = Math.max(0, position.y - initialPosition.y)
        const exhaustLength = 3.8 + Math.min(liftHeight * 0.45, 4.6)
        launchVehicle.firstStageFlames.forEach(({ mesh, length }, index) => {
          const layerLength = exhaustLength * [1, 0.77, 0.55][index]
          mesh.position.y = -2.21 - layerLength / 2
          const visibleThrottle = firstStageThrottle
          mesh.visible = visibleThrottle > 0
          mesh.material.opacity = visibleThrottle * [0.58, 0.76, 0.96][index]
          mesh.scale.set(
            0.84 + visibleThrottle * 0.28,
            layerLength / length,
            0.84 + visibleThrottle * 0.28,
          )
        })
        launchVehicle.firstStageLight.intensity = firstStageThrottle * 8
        const ignitionElapsed = Math.max(0, (currentProgress - 0.08) * simulationDurationMs / 1000)
        const smokeFade = (1 - smoothStep(0.32, 0.52, currentProgress)) * smoothStep(0.075, 0.1, currentProgress)
        launchSmoke.visible = currentProgress >= 0.08 && currentProgress < 0.52
        ;(launchSmoke.material as THREE.PointsMaterial).opacity = smokeFade * (0.56 + firstStageThrottle * 0.16)
        if (launchSmoke.visible) {
          const positions = launchSmoke.geometry.getAttribute('position') as THREE.BufferAttribute
          for (let index = 0; index < smokeCount; index += 1) {
            const delay = (index / smokeCount) * 0.5
            const emittedFor = ignitionElapsed - delay
            if (emittedFor < 0) {
              positions.setXYZ(index, 0, -1000, 0)
              continue
            }
            const age = emittedFor % 7.5
            if (age > 6.8) {
              positions.setXYZ(index, 0, -1000, 0)
              continue
            }
            const angle = index * 2.399963 + Math.sin(sceneTime * 0.0007 + index) * 0.16
            const spread = (0.65 + age * 1.0) * (0.45 + ((index * 37) % 19) / 16)
            const turbulence = Math.sin(sceneTime * 0.0012 + index * 1.7) * 0.12
            const verticalDrift = ((index * 29) % 17) * 0.035
            positions.setXYZ(
              index,
              Math.cos(angle) * spread + turbulence,
              earthRadius + 0.2 + Math.min(age * 0.22, 1.2) + verticalDrift + Math.cos(index * 4.1 + sceneTime * 0.001) * 0.08,
              Math.sin(angle) * spread + Math.cos(sceneTime * 0.0009 + index * 1.3) * 0.12,
            )
          }
          positions.needsUpdate = true
        }

        launchDust.visible = launchSmoke.visible
        ;(launchDust.material as THREE.PointsMaterial).opacity = smokeFade * (0.15 + firstStageThrottle * 0.22)
        if (launchDust.visible) {
          const positions = launchDust.geometry.getAttribute('position') as THREE.BufferAttribute
          for (let index = 0; index < dustCount; index += 1) {
            const delay = (index / dustCount) * 0.55
            const emittedFor = ignitionElapsed - delay
            if (emittedFor < 0) {
              positions.setXYZ(index, 0, -1000, 0)
              continue
            }
            const age = emittedFor % 4.8
            if (age > 4.3) {
              positions.setXYZ(index, 0, -1000, 0)
              continue
            }
            const angle = index * 2.399963 + Math.sin(sceneTime * 0.001 + index) * 0.3
            const spread = 0.32 + age * 0.82
            positions.setXYZ(
              index,
              Math.cos(angle) * spread,
              earthRadius + 0.09 + Math.min(age * 0.11, 0.46),
              Math.sin(angle) * spread,
            )
          }
          positions.needsUpdate = true
        }

        exhaustTrail.visible = currentProgress >= 0.12 && currentProgress < 0.38
        ;(exhaustTrail.material as THREE.PointsMaterial).opacity = firstStageThrottle * (1 - smoothStep(0.3, 0.38, currentProgress)) * 0.86
        if (exhaustTrail.visible) {
          const positions = exhaustTrail.geometry.getAttribute('position') as THREE.BufferAttribute
          const referenceAxis = Math.abs(direction.y) > 0.88
            ? new THREE.Vector3(1, 0, 0)
            : new THREE.Vector3(0, 1, 0)
          const side = new THREE.Vector3().crossVectors(direction, referenceAxis).normalize()
          const cross = new THREE.Vector3().crossVectors(direction, side).normalize()
          const nozzlePosition = position.clone().addScaledVector(direction, -2.14)
          for (let index = 0; index < exhaustCount; index += 1) {
            const age = index / (exhaustCount - 1)
            const angle = index * 2.399963
            const spread = 0.025 + age * 0.24
            const trailPosition = nozzlePosition.clone()
              .addScaledVector(direction, -(0.2 + age * 6.2))
              .addScaledVector(side, Math.cos(angle) * spread)
              .addScaledVector(cross, Math.sin(angle) * spread)
            positions.setXYZ(index, trailPosition.x, trailPosition.y, trailPosition.z)
          }
          positions.needsUpdate = true
        }

        // Avoid rendering discarded stages as nearby extra spacecraft. The single
        // vehicle stays visually coherent through ascent and arrival.
        if (initialLaunchCameraRef.current && currentProgress >= 0.12) {
          selectCameraView('follow')
        }
        const cinematicDistance = getCinematicCameraDistance(currentProgress, landingRequired)
        const cameraTransition = cameraTransitionRef.current
        if (cameraTransition) {
          cameraTransition.elapsed += deltaSeconds
          const transitionProgress = Math.min(1, cameraTransition.elapsed / 0.9)
          const easedProgress = smoothStep(0, 1, transitionProgress)
          const rig = cameraRigRef.current
          const target = cameraTransition.view === 'follow'
            ? position.clone().add(new THREE.Vector3(0, -0.5 * (1 - smoothStep(0.16, 0.42, currentProgress)), 0))
            : rig?.targets[cameraTransition.view]
          if (rig && target) {
            const destinationPosition = target.clone().add(rig.offsets[cameraTransition.view])
            camera.position.lerpVectors(cameraTransition.startPosition, destinationPosition, easedProgress)
            controls.target.lerpVectors(cameraTransition.startTarget, target, easedProgress)
            if (transitionProgress >= 1) {
              camera.position.copy(destinationPosition)
              controls.target.copy(target)
              cameraTransitionRef.current = null
            }
          }
        } else if (cameraViewRef.current === 'follow' || currentProgress > 0.12) {
          const cameraTarget = position.clone().add(new THREE.Vector3(0, -0.5 * (1 - smoothStep(0.16, 0.42, currentProgress)), 0))
          const cameraShift = cameraTarget.sub(controls.target)
          camera.position.add(cameraShift)
          controls.target.copy(cameraTarget)
          const cameraDirection = camera.position.clone().sub(cameraTarget).normalize()
          camera.position.addScaledVector(cameraDirection, cinematicDistance - previousCinematicDistance)
        }
        previousCinematicDistance = cinematicDistance
        const pathProgress = Math.min(1, currentProgress / trajectoryEndProgress)
        const visiblePointCount = Math.max(2, Math.floor(trajectoryPoints.length * pathProgress))
        trajectory.geometry.setDrawRange(0, visiblePointCount)
        controls.update()
        renderer.setRenderTarget(null)
        renderer.setScissorTest(false)
        renderer.clear(true, true, true)
        renderer.render(scene, camera)
      }
      // Three.js owns exactly one animation callback per renderer. This avoids
      // overlapping recursive RAF chains if React replays or restarts the scene.
      renderer.setAnimationLoop(render)

      return cleanupScene
    } catch (error) {
      console.error('The 3D mission simulation could not be initialized.', error)
      statusFrame = window.requestAnimationFrame(() => {
        if (running) setWebGlError('3D rendering is unavailable in this browser. The mission stages and educational outcome will still run.')
      })
      return cleanupScene
    }
  }, [run, playbackId, landingRequired])

  useEffect(() => {
    let elapsed = 0
    let previousTime = performance.now()
    let lastUiUpdate = 0
    let animationFrame = 0
    let completionNotified = false
    const endProgress = failure?.progress ?? 1
    const endTime = simulationDurationMs * endProgress
    progressRef.current = 0
    pausedRef.current = false

    const tick = (time: number) => {
      const delta = Math.min(80, time - previousTime)
      previousTime = time
      if (!pausedRef.current) elapsed += delta
      const nextProgress = Math.min(endProgress, elapsed / simulationDurationMs)
      progressRef.current = nextProgress

      if (time - lastUiUpdate >= 100 || nextProgress >= endProgress) {
        const nextStageIndex = Math.min(stages.length - 1, Math.max(0, getActiveStage(stages, nextProgress)))
        setProgress(nextProgress)
        setActiveStageIndex(nextStageIndex)
        setElapsedMs(elapsed)
        lastUiUpdate = time
      }

      if (elapsed >= endTime) {
        progressRef.current = endProgress
        setProgress(endProgress)
        setElapsedMs(endTime)
        setActiveStageIndex(Math.min(stages.length - 1, Math.max(0, getActiveStage(stages, endProgress))))
        setComplete(true)
        if (!completionNotified) {
          completionNotified = true
          onCompleteRef.current()
        }
        return
      }
      animationFrame = window.requestAnimationFrame(tick)
    }

    animationFrame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(animationFrame)
  }, [run.runId, playbackId, failure?.progress, stages])

  function togglePause() {
    pausedRef.current = !pausedRef.current
    setPaused(pausedRef.current)
  }

  function zoomIn() {
    controlsRef.current?.dollyIn(1.2)
    controlsRef.current?.update()
  }

  function zoomOut() {
    controlsRef.current?.dollyOut(1.2)
    controlsRef.current?.update()
  }

  function resetCamera() {
    selectCameraView('follow')
  }

  function selectCameraView(view: CameraView) {
    const rig = cameraRigRef.current
    initialLaunchCameraRef.current = false
    cameraViewRef.current = view
    setCameraView(view)
    if (!rig) {
      cameraTransitionRef.current = null
      return
    }

    cameraTransitionRef.current = {
      view,
      startPosition: rig.camera.position.clone(),
      startTarget: rig.controls.target.clone(),
      elapsed: 0,
    }
  }

  function replay() {
    progressRef.current = 0
    pausedRef.current = false
    initialLaunchCameraRef.current = true
    cameraTransitionRef.current = null
    cameraViewRef.current = 'launchpad'
    setProgress(0)
    setElapsedMs(0)
    setActiveStageIndex(0)
    setPaused(false)
    setComplete(false)
    setCameraView('launchpad')
    setWebGlReady(false)
    setWebGlError('')
    setPlaybackId((value) => value + 1)
  }

  const displayedStage = stage ?? stages[stages.length - 1]
  const outcomeLabel = run.result.levelComplete
    ? 'MISSION COMPLETE'
    : run.result.outcome === 'Requires Redesign'
      ? 'MISSION ABORTED'
      : 'PARTIAL SUCCESS'
  const progressLabel = `${Math.round(progress * 100)}%`
  const countdownNumber = !complete && progress < 0.08
    ? Math.max(1, 3 - Math.floor(progress / 0.08 * 3))
    : null
  const elapsedSeconds = Math.floor(elapsedMs / 1000)
  const elapsedLabel = `${String(Math.floor(elapsedSeconds / 60)).padStart(2, '0')}:${String(elapsedSeconds % 60).padStart(2, '0')}`

  return (
    <div className="mission-simulation-overlay" role="dialog" aria-modal="true" aria-labelledby="mission-simulation-title">
      <header className="mission-simulation-header">
        <div className="mission-simulation-brand">
          <span className="mission-simulation-mark" aria-hidden="true">MF</span>
          <div>
            <span className="mission-simulation-kicker">MISSION FRONTIER / FLIGHT CONTROL</span>
            <h1 id="mission-simulation-title">{run.missionName}</h1>
          </div>
        </div>
        <div className="mission-simulation-header-meta">
          <span>{run.levelName}</span>
          <span className="mission-simulation-mode-badge">SIMULATED FLIGHT</span>
          <button type="button" className="mission-simulation-close" onClick={() => onClose(complete)} aria-label={complete ? 'Return to mission results' : 'Abort mission simulation'}>
            {complete ? 'Return to results' : 'Exit simulation'}
          </button>
        </div>
      </header>

      <main className="mission-simulation-main">
        <section className="mission-simulation-viewport" aria-label="Interactive 3D mission view">
          <canvas
            ref={canvasRef}
            className="mission-simulation-canvas"
            role="img"
            aria-label={`3D ${run.objectiveName} mission. Drag to rotate and use controls to zoom.`}
          />
          <div className="mission-simulation-corner mission-simulation-corner-left">
            <span>MISSION TARGET</span>
            <strong>{run.objectiveName}</strong>
            <small>{run.orbitName}</small>
          </div>
          <div className="mission-simulation-planet-labels" aria-label="Displayed celestial bodies">
            {getVisibleCelestialBodyIds(run).map((bodyId) => (
              <span key={bodyId}>
                <i className={`planet-dot planet-dot-${bodyId}`} />
                {bodyId === 'deep' ? 'Deep-space waypoint' : bodyId[0].toUpperCase() + bodyId.slice(1)}
              </span>
            ))}
          </div>
          <div className="mission-simulation-stage-banner" aria-live="polite">
            <span className={`mission-simulation-live-dot${complete ? ' mission-simulation-live-dot-complete' : ''}`} />
            <div>
              <span>{complete ? outcomeLabel : `STAGE ${String(activeStageIndex + 1).padStart(2, '0')} / ${String(stages.length).padStart(2, '0')}`}</span>
              <strong>{complete && failure ? failure.title : complete ? 'Mission sequence complete' : displayedStage.label}</strong>
            </div>
          </div>
          <div className="mission-simulation-telemetry" aria-label="Educational flight telemetry">
            <div>
              <span>ALTITUDE · {telemetry.altitudeReference.toUpperCase()}</span>
              <strong>{telemetry.altitudeKm.toLocaleString()} <small>km</small></strong>
            </div>
            <div>
              <span>VELOCITY</span>
              <strong>{telemetry.velocityKmPerSecond.toFixed(1)} <small>km/s</small></strong>
            </div>
            <div>
              <span>MISSION ELAPSED</span>
              <strong>{elapsedLabel}</strong>
            </div>
            <p>Educational estimates · not flight telemetry</p>
          </div>
          {countdownNumber !== null && (
            <div className="mission-simulation-countdown" aria-live="polite">
              <span>SIMULATED LAUNCH COUNTDOWN</span>
              <strong>{countdownNumber}</strong>
              <small>FLIGHT COMPUTER · GO / NO-GO</small>
            </div>
          )}
          {webGlError && <p className="mission-simulation-webgl-note" role="status">{webGlError}</p>}
          {!webGlReady && !webGlError && <p className="mission-simulation-loading-note" role="status">Preparing the 3D mission view…</p>}
          <div className="mission-simulation-view-angles" aria-label="Camera viewing angles">
            {([
              ['follow', 'Follow'],
              ['wide', 'Wide'],
              ['launchpad', 'Pad'],
              ['destination', 'Target'],
            ] as const).map(([view, label]) => (
              <button
                type="button"
                key={view}
                aria-pressed={cameraView === view}
                onClick={() => selectCameraView(view)}
                disabled={!webGlReady}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mission-simulation-camera-controls" aria-label="3D camera controls">
            <span>Drag to rotate · Scroll or buttons to zoom</span>
            <button type="button" onClick={zoomOut} disabled={!webGlReady} aria-label="Zoom out">−</button>
            <button type="button" onClick={zoomIn} disabled={!webGlReady} aria-label="Zoom in">+</button>
            <button type="button" onClick={resetCamera} disabled={!webGlReady}>Follow craft</button>
          </div>
        </section>

        <aside className="mission-simulation-sidebar">
          <div className="mission-simulation-progress-block">
            <div className="mission-simulation-progress-heading">
              <div>
                <span className="mission-simulation-kicker">FLIGHT SEQUENCE</span>
                <h2>{complete ? outcomeLabel : displayedStage.label}</h2>
              </div>
              <strong>{progressLabel}</strong>
            </div>
            <div className="mission-simulation-progress-track" role="progressbar" aria-label="Mission simulation progress" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <span style={{ width: progressLabel }} />
            </div>
            <ol className="mission-simulation-stage-list">
              {stages.map((item, index) => {
                const stageComplete = index < activeStageIndex || (complete && !failure)
                const stageFailed = complete && failure !== null && index === activeStageIndex
                return (
                  <li
                    className={stageComplete ? 'mission-stage-complete' : stageFailed ? 'mission-stage-failed' : index === activeStageIndex ? 'mission-stage-active' : ''}
                    key={item.id}
                  >
                    <span className="mission-stage-marker">{stageComplete ? '✓' : stageFailed ? '!' : String(index + 1).padStart(2, '0')}</span>
                    <div><strong>{item.label}</strong><small>{item.detail}</small></div>
                  </li>
                )
              })}
            </ol>
          </div>

          <div className="mission-simulation-status-card">
            <span className="mission-simulation-kicker">{complete ? 'GAME-GENERATED OUTCOME' : 'CURRENT MISSION STAGE'}</span>
            <h2>{complete && failure ? failure.title : complete ? 'Mission sequence complete' : displayedStage.label}</h2>
            <p>{complete && failure ? failure.detail : complete ? run.result.explanation : displayedStage.detail}</p>
            <p className="mission-simulation-configuration">
              {run.vehicleName} launch vehicle · {installedComponents.map((component) => component.name).join(' · ') || 'No spacecraft systems selected'}
            </p>
            {!complete && (
              <div className="mission-simulation-resource-strip">
                <span><small>POWER</small><strong>{run.powerDrawW} / {run.powerSupplyW} W</strong></span>
                <span><small>DATA LINK</small><strong>{run.dataGbDay} / {run.communicationGbDay} GB/day</strong></span>
              </div>
            )}
            {complete && (
              <div className={`mission-simulation-final-score mission-simulation-final-score-${run.result.outcome === 'Successful' ? 'success' : 'warning'}`}>
                <div><span>MISSION SCORE</span><strong>{run.result.score}<small>/100</small></strong></div>
                <span>{run.result.outcome}</span>
              </div>
            )}
          </div>

          <details className="mission-simulation-checks">
            <summary>{complete ? 'Review resource and level checks' : 'Review modeled resource checks'}</summary>
            <ul>
              {[...run.result.checks, ...run.result.levelChecks].map((check) => (
                <li className={`mission-check-${check.status}`} key={check.label}>
                  <strong>{check.label}</strong>
                  <span>{check.detail}</span>
                </li>
              ))}
            </ul>
            <p>These are game-generated educational estimates, not real flight predictions or NASA recommendations.</p>
          </details>

          <div className="mission-simulation-actions">
            <button type="button" className="mission-simulation-playback" onClick={togglePause} disabled={complete}>
              {paused ? 'Resume mission' : 'Pause mission'}
            </button>
            {complete
              ? <button type="button" className="mission-simulation-replay" onClick={replay}>Replay mission</button>
              : <span className="mission-simulation-educational-note">Accelerated educational visualization · illustrative scale</span>}
          </div>
        </aside>
      </main>
      <footer className="mission-simulation-footer">
        <span><i className={complete && failure ? 'mission-footer-dot mission-footer-dot-warning' : 'mission-footer-dot'} />{complete ? outcomeLabel : 'SIMULATION RUNNING'}</span>
        <span>{landingRequired ? 'Lunar landing sequence enabled for this surface mission' : 'Orbit / flyby profile · no landing sequence'}</span>
        <span className="mission-simulation-footer-note">Conceptual 3D route · simulated values · not to scale</span>
        {complete && <button type="button" onClick={() => onClose(true)}>View mission results</button>}
      </footer>
    </div>
  )
}
