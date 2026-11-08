import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

export default function GlassScene() {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const container = host.current!
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' })
    } catch {
      container.dataset.renderer = 'fallback'
      return
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))
    renderer.setClearColor(0x000000, 0)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    container.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0b0d16)
    const camera = new THREE.PerspectiveCamera(40, 1, .1, 40)
    camera.position.z = 10
    const studio = new RoomEnvironment()
    const pmrem = new THREE.PMREMGenerator(renderer)
    const environment = pmrem.fromScene(studio, .04)
    scene.environment = environment.texture
    studio.dispose()
    pmrem.dispose()

    const glass = new THREE.MeshPhysicalMaterial({
      color: 0xe4ecff, metalness: 0, roughness: .04,
      transmission: 1, thickness: 1.8, ior: 1.48,
      clearcoat: 1, clearcoatRoughness: .04,
      iridescence: .3, iridescenceIOR: 1.3, envMapIntensity: 1.3,
    })
    const silver = new THREE.MeshPhysicalMaterial({
      color: 0xc6cfdf, metalness: 1, roughness: .12,
      clearcoat: 1, envMapIntensity: 1.7,
    })
    const warm = new THREE.MeshPhysicalMaterial({
      color: 0xffba8b, metalness: .6, roughness: .18, clearcoat: 1,
    })
    const knotGeometry = new THREE.TorusKnotGeometry(1.15, .37, 160, 24, 2, 3)
    const ringGeometry = new THREE.TorusGeometry(1.35, .38, 32, 100)
    const sphereGeometry = new THREE.SphereGeometry(.32, 32, 24)
    const knot = new THREE.Mesh(knotGeometry, glass)
    const ring = new THREE.Mesh(ringGeometry, silver)
    const droplet = new THREE.Mesh(sphereGeometry, glass)
    const pearl = new THREE.Mesh(sphereGeometry, warm)
    const octaGeometry = new THREE.OctahedronGeometry(.48, 2)
    const crystal = new THREE.Mesh(octaGeometry, glass)
    scene.add(knot, ring, droplet, pearl, crystal)
    const key = new THREE.DirectionalLight(0xe7edff, 4)
    key.position.set(2, 4, 5)
    const rim = new THREE.DirectionalLight(0xffb080, 3)
    rim.position.set(-4, -2, 3)
    scene.add(key, rim)
    const pointer = new THREE.Vector2()
    const eased = new THREE.Vector2()
    const pageOffset = new THREE.Vector2()
    const easedPage = new THREE.Vector2()
    let pulse = 0
    const reduced = matchMedia('(prefers-reduced-motion: reduce)')
    let activeSurface: HTMLElement | null = null
    let frame = 0
    let last = 0
    let elapsed = 0
    let lost = false
    const syncHash = () => {
      const hash = window.location.hash.replace('#', '')
      if (hash === 'directory') pageOffset.set(-0.6, 0.35)
      else if (hash === 'attendance') pageOffset.set(0.55, -0.3)
      else if (hash === 'leave') pageOffset.set(-0.4, -0.45)
      else pageOffset.set(0, 0)
      pulse = Math.min(pulse + 0.45, 1)
    }
    syncHash()
    const resetSurface = () => {
      activeSurface?.style.removeProperty('--glass-x')
      activeSurface?.style.removeProperty('--glass-y')
      activeSurface?.style.removeProperty('--tilt-x')
      activeSurface?.style.removeProperty('--tilt-y')
    }
    const move = (event: PointerEvent) => {
      if (reduced.matches || event.pointerType === 'touch') return
      pointer.set(event.clientX / innerWidth * 2 - 1, event.clientY / innerHeight * 2 - 1)
      const surface = event.target instanceof Element
        ? event.target.closest<HTMLElement>('.glass-panel, .panel, .hero, .glass-role, .holo-card, .pulse-card') : null
      if (surface !== activeSurface) { resetSurface(); activeSurface = surface }
      if (!surface) return
      const rect = surface.getBoundingClientRect()
      const x = (event.clientX - rect.left) / rect.width
      const y = (event.clientY - rect.top) / rect.height
      const tiltScale = surface.classList.contains('holo-card') ? 7 : surface.classList.contains('stat') ? 4.5 : 3
      surface.style.setProperty('--glass-x', x * 100 + '%')
      surface.style.setProperty('--glass-y', y * 100 + '%')
      surface.style.setProperty('--tilt-x', (0.5 - y) * tiltScale + 'deg')
      surface.style.setProperty('--tilt-y', (x - 0.5) * tiltScale + 'deg')
    }
    const triggerPulse = () => { if (!reduced.matches) pulse = 1 }
    const leave = () => { pointer.set(0, 0); resetSurface(); activeSurface = null }
    const render = () => {
      eased.lerp(pointer, .07)
      easedPage.lerp(pageOffset, .05)
      pulse *= 0.94
      const spread = Math.min(camera.aspect * 2.5, 3.5)
      const boost = 1 + pulse * 0.14
      knot.scale.setScalar(boost)
      knot.position.set(spread + easedPage.x * 1.1, 1.25 + Math.sin(elapsed * .28) * .16 + easedPage.y * .7, -.3)
      knot.rotation.set(.5 + eased.y * .35 + easedPage.y * .4, elapsed * .08 + eased.x * .5 + pulse * .4, -.3)
      ring.position.set(-spread - easedPage.x * .9, -1.3 + Math.cos(elapsed * .3) * .15 - easedPage.y * .6, .3)
      ring.rotation.set(.75 + eased.y * .3, -.5 + eased.x * .45 + easedPage.x * .4, elapsed * -.07)
      droplet.position.set(-spread * .8 + Math.sin(elapsed * .4) * .25, 2.4 + easedPage.y * .5, -.5)
      pearl.position.set(spread * .8 + Math.cos(elapsed * .35) * .25, -2.6 - easedPage.y * .5, -.5)
      crystal.position.set(eased.x * 1.6 - easedPage.x * 1.2, eased.y * -1.1 + Math.sin(elapsed * .5) * .3, -1.4)
      crystal.rotation.set(elapsed * .18 + eased.y * .5, elapsed * .24 + eased.x * .5, 0)
      renderer.render(scene, camera)
      container.dataset.renderer = 'webgl'
    }
    const resize = () => {
      camera.aspect = innerWidth / innerHeight
      camera.updateProjectionMatrix()
      renderer.setSize(innerWidth, innerHeight)
      render()
    }
    const tick = (time: number) => {
      frame = requestAnimationFrame(tick)
      if (time - last < 33) return
      elapsed += Math.min((time - last) / 1000, .05)
      last = time
      render()
    }
    const schedule = () => {
      cancelAnimationFrame(frame)
      if (lost || document.hidden) return
      if (reduced.matches) { pointer.set(0, 0); eased.set(0, 0); resetSurface(); render() }
      else { last = performance.now(); frame = requestAnimationFrame(tick) }
    }
    const contextLost = (event: Event) => { event.preventDefault(); lost = true; cancelAnimationFrame(frame); container.dataset.renderer = 'fallback' }
    const contextRestored = () => { lost = false; schedule() }
    resize()
    schedule()
    window.addEventListener('resize', resize)
    window.addEventListener('hashchange', syncHash)
    window.addEventListener('pointermove', move, { passive: true })
    window.addEventListener('pointerdown', triggerPulse, { passive: true })
    document.documentElement.addEventListener('pointerleave', leave)
    document.addEventListener('visibilitychange', schedule)
    reduced.addEventListener('change', schedule)
    renderer.domElement.addEventListener('webglcontextlost', contextLost)
    renderer.domElement.addEventListener('webglcontextrestored', contextRestored)
    return () => {
      cancelAnimationFrame(frame)
      resetSurface()
      window.removeEventListener('resize', resize)
      window.removeEventListener('hashchange', syncHash)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerdown', triggerPulse)
      document.documentElement.removeEventListener('pointerleave', leave)
      document.removeEventListener('visibilitychange', schedule)
      reduced.removeEventListener('change', schedule)
      renderer.domElement.removeEventListener('webglcontextlost', contextLost)
      renderer.domElement.removeEventListener('webglcontextrestored', contextRestored)
      knotGeometry.dispose(); ringGeometry.dispose(); sphereGeometry.dispose(); octaGeometry.dispose()
      glass.dispose(); silver.dispose(); warm.dispose(); environment.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])
  return <div ref={host} className="liquid-scene" aria-hidden="true" />
}

