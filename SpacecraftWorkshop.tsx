import { useEffect, useRef, useState, type DragEvent } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { clearGroup, createSpacecraftAssembly, disposeObject } from './spacecraftModel'
import type { SpacecraftComponent } from './spacecraftModel'
export type { SpacecraftComponent } from './spacecraftModel'
import './SpacecraftWorkshop.css'

export default function SpacecraftWorkshop({
  components,
  selectedIds,
  onAddComponent,
  onRemoveComponent,
  formatCost,
}: {
  components: SpacecraftComponent[]
  selectedIds: string[]
  onAddComponent: (componentId: string) => void
  onRemoveComponent: (componentId: string) => void
  formatCost: (value: number) => string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const modelGroupRef = useRef<THREE.Group | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const [previewState, setPreviewState] = useState<'loading' | 'ready' | 'unsupported'>('loading')
  const [rotationPaused, setRotationPaused] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const [isDropTarget, setIsDropTarget] = useState(false)
  const [announcement, setAnnouncement] = useState('')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
    } catch (error) {
      console.error('The spacecraft 3D preview could not be initialized.', error)
      const failureFrame = window.requestAnimationFrame(() => setPreviewState('unsupported'))
      return () => window.cancelAnimationFrame(failureFrame)
    }

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 50)
    camera.position.set(3.2, 2.25, 4.4)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.setClearColor(0x000000, 0)

    scene.add(new THREE.HemisphereLight(0xd9f4ff, 0x18263a, 2.2))
    const keyLight = new THREE.DirectionalLight(0xffffff, 3.2)
    keyLight.position.set(3, 5, 4)
    scene.add(keyLight)
    const rimLight = new THREE.DirectionalLight(0x55c7ea, 1.8)
    rimLight.position.set(-4, 1, -3)
    scene.add(rimLight)

    const orbit = new THREE.Mesh(
      new THREE.TorusGeometry(1.75, 0.008, 8, 120),
      new THREE.MeshBasicMaterial({ color: '#3e81aa', transparent: true, opacity: 0.48 }),
    )
    orbit.rotation.set(0.62, 0, -0.25)
    scene.add(orbit)

    const modelGroup = new THREE.Group()
    modelGroup.position.y = 0.12
    scene.add(modelGroup)
    modelGroupRef.current = modelGroup

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.enablePan = false
    controls.minDistance = 2.6
    controls.maxDistance = 8
    controls.autoRotateSpeed = 0.7
    controlsRef.current = controls
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    controls.autoRotate = !reducedMotion

    const resize = () => {
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      if (!width || !height) return
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize)
    resizeObserver?.observe(canvas)
    window.addEventListener('resize', resize)
    resize()

    let frameId = 0
    const animate = () => {
      controls.update()
      renderer.render(scene, camera)
      frameId = window.requestAnimationFrame(animate)
    }
    frameId = window.requestAnimationFrame(animate)
    const readyFrameId = window.requestAnimationFrame(() => setPreviewState('ready'))

    return () => {
      window.cancelAnimationFrame(frameId)
      window.cancelAnimationFrame(readyFrameId)
      window.removeEventListener('resize', resize)
      resizeObserver?.disconnect()
      controls.dispose()
      disposeObject(scene)
      renderer.dispose()
      controlsRef.current = null
      modelGroupRef.current = null
    }
  }, [])

  useEffect(() => {
    const modelGroup = modelGroupRef.current
    if (!modelGroup) return
    clearGroup(modelGroup)
    modelGroup.add(createSpacecraftAssembly(components, selectedIds))
  }, [components, selectedIds])

  function handleDragStart(event: DragEvent<HTMLElement>, component: SpacecraftComponent) {
    event.dataTransfer.setData('application/x-spacecraft-component', component.id)
    event.dataTransfer.setData('text/plain', component.id)
    event.dataTransfer.effectAllowed = 'copy'
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDropTarget(false)
    const componentId = event.dataTransfer.getData('application/x-spacecraft-component')
      || event.dataTransfer.getData('text/plain')
    const component = components.find((item) => item.id === componentId)
    if (!component) return

    if (selectedIds.includes(componentId)) {
      setAnnouncement(`${component.name} is already installed.`)
      return
    }

    onAddComponent(componentId)
    setAnnouncement(`${component.name} added to spacecraft.`)
  }

  function toggleComponent(component: SpacecraftComponent) {
    if (selectedIds.includes(component.id)) {
      onRemoveComponent(component.id)
      setAnnouncement(`${component.name} removed from spacecraft.`)
    } else {
      onAddComponent(component.id)
      setAnnouncement(`${component.name} added to spacecraft.`)
    }
  }

  function zoomIn() {
    controlsRef.current?.dollyIn(1.2)
    controlsRef.current?.update()
  }

  function zoomOut() {
    controlsRef.current?.dollyOut(1.2)
    controlsRef.current?.update()
  }

  function resetView() {
    controlsRef.current?.reset()
  }

  function toggleRotation() {
    const controls = controlsRef.current
    if (!controls) return
    controls.autoRotate = !controls.autoRotate
    setRotationPaused(!controls.autoRotate)
  }

  const selectedComponents = components.filter((component) => selectedIds.includes(component.id))

  return (
    <section className="spacecraft-workshop" aria-label="Interactive spacecraft workshop">
      <div className="builder-section-title">
        <div>
          <span className="builder-kicker">STEP 02 / SPACECRAFT</span>
          <h2>Spacecraft workshop</h2>
          <p>Drag named components into the 3D preview or add them from the component library.</p>
        </div>
        <span className="selected-count">{selectedComponents.length} INSTALLED</span>
      </div>

      <div className="spacecraft-workshop-grid">
        <div className="spacecraft-preview-column">
          <div
            className={`spacecraft-stage${isDropTarget ? ' spacecraft-stage-drop-active' : ''}`}
            role="group"
            aria-label="Drop spacecraft components into the 3D preview"
            onDragOver={(event) => {
              event.preventDefault()
              event.dataTransfer.dropEffect = 'copy'
              setIsDropTarget(true)
            }}
            onDragLeave={(event) => {
              if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
                setIsDropTarget(false)
              }
            }}
            onDrop={handleDrop}
          >
            <canvas
              ref={canvasRef}
              className="spacecraft-canvas"
              role="img"
              aria-label="Interactive rotating 3D spacecraft preview. Drag to rotate and use the zoom controls."
            />
            <div className="spacecraft-stage-label">
              <span>LIVE 3D PREVIEW</span>
              <span>{selectedComponents.length} COMPONENTS</span>
            </div>
            {previewState === 'loading' && <p className="spacecraft-preview-message" role="status">Preparing 3D preview…</p>}
            {previewState === 'unsupported' && (
              <p className="spacecraft-preview-message" role="status">
                3D preview is unavailable in this browser. You can still add and remove components.
              </p>
            )}
            {isDropTarget && <p className="spacecraft-drop-message">Drop component to install</p>}
            {selectedComponents.length === 0 && previewState === 'ready' && (
              <p className="spacecraft-empty-message">Add components to begin your build</p>
            )}
          </div>

          <div className="spacecraft-view-controls" aria-label="3D preview controls">
            <span>Drag to rotate · Scroll to zoom</span>
            <div>
              <button type="button" onClick={zoomOut} disabled={previewState !== 'ready'} aria-label="Zoom out">
                −
              </button>
              <button type="button" onClick={zoomIn} disabled={previewState !== 'ready'} aria-label="Zoom in">
                +
              </button>
              <button type="button" onClick={resetView} disabled={previewState !== 'ready'}>Reset view</button>
              <button
                type="button"
                onClick={toggleRotation}
                disabled={previewState !== 'ready'}
                aria-pressed={rotationPaused}
              >
                {rotationPaused ? 'Resume rotation' : 'Pause rotation'}
              </button>
            </div>
          </div>

          <div className="spacecraft-installed">
            <h3>Installed components</h3>
            {selectedComponents.length > 0 ? (
              <ul>
                {selectedComponents.map((component) => (
                  <li key={component.id}>
                    <span>{component.name}</span>
                    <button
                      type="button"
                      onClick={() => toggleComponent(component)}
                      aria-label={`Remove ${component.name}`}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No components installed. Add one from the library or drag it into the preview.</p>
            )}
          </div>
        </div>

        <div className="spacecraft-part-library" aria-label="Spacecraft component library">
          <div className="spacecraft-part-library-heading">
            <h3>Component library</h3>
            <span>DRAG OR ADD</span>
          </div>
          <div className="spacecraft-part-list">
            {components.map((component) => {
              const isSelected = selectedIds.includes(component.id)
              return (
                <article
                  className={`spacecraft-part${isSelected ? ' spacecraft-part-selected' : ''}`}
                  key={component.id}
                  draggable
                  onDragStart={(event) => handleDragStart(event, component)}
                >
                  <div className="spacecraft-part-heading">
                    <strong>{component.name}</strong>
                    <button
                      type="button"
                      onClick={() => toggleComponent(component)}
                      aria-pressed={isSelected}
                      aria-label={`${isSelected ? 'Remove' : 'Add'} ${component.name}`}
                    >
                      {isSelected ? 'Remove' : 'Add'}
                    </button>
                  </div>
                  <p>{component.role}</p>
                  <dl>
                    <div><dt>Mass</dt><dd>{component.massKg} kg</dd></div>
                    <div>
                      <dt>Power</dt>
                      <dd>
                        {component.powerW} W draw
                        {component.powerSupplyW ? ` · ${component.powerSupplyW} W supply` : ''}
                      </dd>
                    </div>
                    <div><dt>Cost</dt><dd>{formatCost(component.costM)}</dd></div>
                  </dl>
                  {component.batteryWh && <small className="spacecraft-part-extra">{component.batteryWh.toLocaleString()} Wh storage</small>}
                  {component.communicationGbDay && <small className="spacecraft-part-extra">{component.communicationGbDay} GB/day link capacity</small>}
                </article>
              )
            })}
          </div>
        </div>
      </div>

      <p className="spacecraft-resource-note">
        Component changes update the existing mission-resource estimates. Values are simplified educational estimates, not real spacecraft specifications.
      </p>
      <span className="spacecraft-visually-hidden" role="status" aria-live="polite">{announcement}</span>
    </section>
  )
}
