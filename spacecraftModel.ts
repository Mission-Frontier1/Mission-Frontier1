import * as THREE from 'three'

export type SpacecraftComponent = {
  id: string
  name: string
  massKg: number
  powerW: number
  powerSupplyW?: number
  batteryWh?: number
  communicationGbDay?: number
  costM: number
  role: string
}

function addMesh(
  group: THREE.Group,
  geometry: THREE.BufferGeometry,
  color: string,
  position: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0],
  metalness = 0.45,
) {
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color, metalness, roughness: 0.36 }),
  )
  mesh.position.set(...position)
  mesh.rotation.set(...rotation)
  group.add(mesh)
}

function addBox(
  group: THREE.Group,
  position: [number, number, number],
  size: [number, number, number],
  color: string,
  rotation: [number, number, number] = [0, 0, 0],
) {
  addMesh(group, new THREE.BoxGeometry(...size), color, position, rotation)
}

function createComponentModel(component: SpacecraftComponent) {
  const group = new THREE.Group()

  switch (component.id) {
    case 'structure':
      addMesh(group, new THREE.CylinderGeometry(0.28, 0.38, 1.25, 16), '#b9c9d6', [0, 0, 0])
      addMesh(group, new THREE.ConeGeometry(0.28, 0.46, 16), '#e0b66f', [0, 0.84, 0])
      addBox(group, [0, -0.57, 0], [0.68, 0.16, 0.68], '#74899e')
      addBox(group, [0, 0.1, 0.31], [0.1, 0.5, 0.08], '#6dcce1')
      break
    case 'power':
      for (const side of [-1, 1]) {
        addBox(group, [side * 1.03, 0.04, 0], [0.92, 0.055, 0.58], '#1d5d9b')
        addBox(group, [side * 0.53, 0.04, 0], [0.16, 0.09, 0.13], '#d7e5ed')
        for (let index = 0; index < 4; index += 1) {
          addBox(group, [side * (0.72 + index * 0.2), 0.072, 0], [0.018, 0.008, 0.55], '#62c9e6')
        }
        addBox(group, [side * 1.03, 0.073, 0], [0.9, 0.008, 0.018], '#62c9e6')
      }
      break
    case 'battery':
      addBox(group, [0, -0.78, 0], [0.5, 0.3, 0.48], '#c2854c')
      addBox(group, [0, -0.78, 0.25], [0.3, 0.1, 0.025], '#f0d091')
      break
    case 'communication':
      addMesh(group, new THREE.CylinderGeometry(0.035, 0.035, 0.46, 10), '#d5e0e8', [0.67, 0.42, 0])
      addMesh(
        group,
        new THREE.SphereGeometry(0.36, 20, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
        '#a9becd',
        [0.67, 0.69, 0],
        [0, 0, -0.28],
      )
      addMesh(group, new THREE.SphereGeometry(0.055, 12, 8), '#69d6ea', [0.67, 0.98, 0], [0, 0, 0], 0.1)
      break
    case 'computer':
      addBox(group, [-0.56, 0.12, 0], [0.3, 0.42, 0.42], '#647c91')
      addBox(group, [-0.56, 0.12, 0.22], [0.18, 0.22, 0.025], '#53c7a6')
      addBox(group, [-0.56, 0.12, 0.24], [0.07, 0.035, 0.015], '#e1c278')
      break
    case 'attitude':
      for (const x of [-1, 1]) {
        for (const z of [-1, 1]) {
          addBox(group, [x * 0.4, -0.48, z * 0.4], [0.3, 0.12, 0.3], '#8597a8')
          addMesh(
            group,
            new THREE.CylinderGeometry(0.055, 0.095, 0.2, 10),
            '#d88762',
            [x * 0.49, -0.5, z * 0.49],
            [Math.PI / 2, 0, Math.PI / 4],
          )
        }
      }
      break
  }

  return group
}

export function createSpacecraftAssembly(components: SpacecraftComponent[], selectedIds: string[]) {
  const assembly = new THREE.Group()
  components
    .filter((component) => selectedIds.includes(component.id))
    .forEach((component) => assembly.add(createComponentModel(component)))
  return assembly
}

export function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.Points) {
      child.geometry.dispose()
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      materials.forEach((material) => material.dispose())
    }
  })
}

export function clearGroup(group: THREE.Group) {
  while (group.children.length > 0) {
    const child = group.children[0]
    group.remove(child)
    disposeObject(child)
  }
}
