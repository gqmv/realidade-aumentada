'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

type ARState = 'idle' | 'checking-support' | 'requesting-session' | 'setting-up' | 'ready' | 'placing'

export default function ARExperience2() {
  // UI State
  const [arState, setArState] = useState<ARState>('idle')
  const [isSupported, setIsSupported] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState('Ready to start AR')
  
  // WebXR refs
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sessionRef = useRef<XRSession | null>(null)
  const hitTestSourceRef = useRef<XRHitTestSource | null>(null)
  const viewerSpaceRef = useRef<XRReferenceSpace | null>(null)
  const localSpaceRef = useRef<XRReferenceSpace | null>(null)
  
  // Three.js refs
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const reticleRef = useRef<THREE.Mesh | null>(null)
  const sphereRef = useRef<THREE.Mesh | null>(null)
  
  // Placement state
  const [spherePlaced, setSpherePlaced] = useState(false)
  const anchorRef = useRef<XRAnchor | null>(null)

  // 1. Feature & permission check
  useEffect(() => {
    setArState('checking-support')
    setStatusMessage('Checking WebXR AR support...')
    
    if (!('xr' in navigator) || !navigator.xr) {
      setError('WebXR is not available in this browser')
      setArState('idle')
      return
    }

    navigator.xr.isSessionSupported('immersive-ar')
      .then((supported) => {
        setIsSupported(supported)
        if (supported) {
          setStatusMessage('AR is supported! Click "Start AR" to begin')
          setArState('idle')
        } else {
          setError('AR is not supported on this device/browser')
          setArState('idle')
        }
      })
      .catch((err) => {
        setError(`Error checking AR support: ${err.message}`)
        setArState('idle')
      })
  }, [])

  // 3. Build the 3D scene
  const initializeScene = useCallback(() => {
    if (!canvasRef.current) {
      throw new Error('Canvas not available')
    }

    // Create Three.js scene
    const scene = new THREE.Scene()
    sceneRef.current = scene

    // Create camera (will be controlled by WebXR)
    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20)
    cameraRef.current = camera

    // Create WebGL renderer
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      alpha: true,
      antialias: true,
    })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.xr.enabled = true
    rendererRef.current = renderer

    // Add lights
    const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1)
    hemisphereLight.position.set(0.5, 1, 0.25)
    scene.add(hemisphereLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5)
    directionalLight.position.set(0, 1, 0)
    scene.add(directionalLight)

    // Create reticle (hit indicator) - ring shape
    const reticleGeometry = new THREE.RingGeometry(0.05, 0.1, 32).rotateX(-Math.PI / 2)
    const reticleMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
    })
    const reticle = new THREE.Mesh(reticleGeometry, reticleMaterial)
    reticle.visible = false
    scene.add(reticle)
    reticleRef.current = reticle

    // Add center dot to reticle
    const dotGeometry = new THREE.CircleGeometry(0.02, 16).rotateX(-Math.PI / 2)
    const dotMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.9,
    })
    const dot = new THREE.Mesh(dotGeometry, dotMaterial)
    reticle.add(dot)

    // Create sphere mesh (don't add to scene yet)
    const sphereGeometry = new THREE.SphereGeometry(0.1, 32, 32)
    const sphereMaterial = new THREE.MeshStandardMaterial({
      color: 0xff4444,
      metalness: 0.1,
      roughness: 0.2,
    })
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial)
    sphereRef.current = sphere

    return { scene, camera, renderer }
  }, [])

  // 4. Reference spaces setup
  const setupReferenceSpaces = useCallback(async (session: XRSession) => {
    setStatusMessage('Setting up reference spaces...')
    
    // Get viewer space (follows the camera/device)
    const viewerSpace = await session.requestReferenceSpace('viewer')
    viewerSpaceRef.current = viewerSpace

    // Get local space (world origin), prefer local-floor for stable tracking
    let localSpace: XRReferenceSpace
    try {
      localSpace = await session.requestReferenceSpace('local-floor')
      setStatusMessage('Using local-floor reference space')
    } catch (err) {
      console.warn('local-floor not supported, falling back to local')
      localSpace = await session.requestReferenceSpace('local')
      setStatusMessage('Using local reference space')
    }
    localSpaceRef.current = localSpace
  }, [])

  // 5. Hit-test setup
  const setupHitTesting = useCallback(async (session: XRSession) => {
    if (!viewerSpaceRef.current) {
      throw new Error('Viewer space not available')
    }

    setStatusMessage('Setting up hit testing...')
    
    if (!session.requestHitTestSource) {
      throw new Error('Hit testing not supported')
    }

    const hitTestSource = await session.requestHitTestSource({
      space: viewerSpaceRef.current,
    })
    hitTestSourceRef.current = hitTestSource
    setStatusMessage('Hit testing ready')
  }, [])

  // 6. Per-frame loop
  const onXRFrame = useCallback((time: number, frame: XRFrame) => {
    if (!frame || !sessionRef.current || !rendererRef.current || !sceneRef.current) {
      return
    }

    const session = sessionRef.current
    const renderer = rendererRef.current
    const scene = sceneRef.current

    // Get camera pose for local space
    if (localSpaceRef.current) {
      const pose = frame.getViewerPose(localSpaceRef.current)
      if (pose) {
        // Camera tracking is handled by Three.js WebXR integration
      }
    }

    // Perform hit testing
    if (hitTestSourceRef.current && !spherePlaced) {
      const hitTestResults = frame.getHitTestResults(hitTestSourceRef.current)
      
      if (hitTestResults.length > 0 && reticleRef.current && localSpaceRef.current) {
        const hit = hitTestResults[0]
        const pose = hit.getPose(localSpaceRef.current)
        
        if (pose) {
          // Update reticle position
          reticleRef.current.visible = true
          const transform = pose.transform
          reticleRef.current.position.set(
            transform.position.x,
            transform.position.y,
            transform.position.z
          )
          reticleRef.current.quaternion.set(
            transform.orientation.x,
            transform.orientation.y,
            transform.orientation.z,
            transform.orientation.w
          )
          setStatusMessage(`Surface found - tap to place sphere`)
        }
      } else if (reticleRef.current) {
        reticleRef.current.visible = false
        setStatusMessage('Point camera at a flat surface')
      }
    }

    // Render the scene
    const camera = renderer.xr.getCamera()
    renderer.render(scene, camera)

    // Request next frame
    session.requestAnimationFrame(onXRFrame)
  }, [spherePlaced])

  // 7. Place the sphere
  const placeSphere = useCallback(async () => {
    if (!reticleRef.current || !reticleRef.current.visible || !sphereRef.current || !sceneRef.current) {
      setError('Cannot place sphere - no valid surface detected')
      return
    }

    if (!sessionRef.current || !localSpaceRef.current) {
      setError('Cannot place sphere - session not ready')
      return
    }

    setArState('placing')
    setStatusMessage('Placing sphere...')

    try {
      // Copy reticle position and rotation to sphere
      sphereRef.current.position.copy(reticleRef.current.position)
      sphereRef.current.quaternion.copy(reticleRef.current.quaternion)
      
      // Add sphere to scene
      sceneRef.current.add(sphereRef.current)
      
      // Create anchor for stable tracking (if supported)
      const session = sessionRef.current
      if ('createAnchor' in session && localSpaceRef.current) {
        try {
          const anchorPose = new XRRigidTransform(
            {
              x: sphereRef.current.position.x,
              y: sphereRef.current.position.y,
              z: sphereRef.current.position.z,
              w: 1
            },
            {
              x: sphereRef.current.quaternion.x,
              y: sphereRef.current.quaternion.y,
              z: sphereRef.current.quaternion.z,
              w: sphereRef.current.quaternion.w
            }
          )
          
          const anchor = await (session as any).createAnchor(anchorPose, localSpaceRef.current)
          anchorRef.current = anchor
          setStatusMessage('Sphere placed with anchor for stable tracking')
        } catch (anchorError) {
          console.warn('Could not create anchor:', anchorError)
          setStatusMessage('Sphere placed (anchor not supported)')
        }
      } else {
        setStatusMessage('Sphere placed')
      }

      // Hide reticle
      reticleRef.current.visible = false
      setSpherePlaced(true)
      setArState('ready')
      
    } catch (err) {
      setError(`Failed to place sphere: ${err instanceof Error ? err.message : 'Unknown error'}`)
      setArState('ready')
    }
  }, [])

  // 2. Kick-off AR session
  const startARSession = useCallback(async () => {
    if (!isSupported) {
      setError('AR is not supported on this device')
      return
    }

    setArState('requesting-session')
    setError(null)
    setStatusMessage('Requesting AR session...')

    try {
      // Initialize 3D scene first
      const { renderer } = initializeScene()
      
      // Request AR session with required features
      const session = await navigator.xr!.requestSession('immersive-ar', {
        requiredFeatures: ['local-floor', 'hit-test'],
        optionalFeatures: ['anchors', 'dom-overlay'],
        domOverlay: { root: document.body }
      })
      
      sessionRef.current = session
      setArState('setting-up')
      setStatusMessage('AR session started, setting up...')

      // Connect session to renderer
      renderer.xr.setSession(session)

      // Setup reference spaces
      await setupReferenceSpaces(session)

      // Setup hit testing
      await setupHitTesting(session)

      // Start the render loop
      session.requestAnimationFrame(onXRFrame)

      // Handle session end
      session.addEventListener('end', () => {
        setArState('idle')
        setStatusMessage('AR session ended')
        setSpherePlaced(false)
        sessionRef.current = null
        if (anchorRef.current) {
          anchorRef.current = null
        }
        if (sphereRef.current && sceneRef.current) {
          sceneRef.current.remove(sphereRef.current)
        }
      })

      // Listen for select events (tap/click)
      session.addEventListener('select', placeSphere)

      setArState('ready')
      setStatusMessage('Point camera at a flat surface')

    } catch (err) {
      setError(`Failed to start AR session: ${err instanceof Error ? err.message : 'Unknown error'}`)
      setArState('idle')
    }
  }, [isSupported, initializeScene, setupReferenceSpaces, setupHitTesting, onXRFrame, placeSphere])

  // 9. End session
  const endARSession = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.end()
    }
  }, [])

  return (
    <div className="relative w-full h-screen bg-black">
      {/* Canvas for WebXR rendering */}
      <canvas
        ref={canvasRef}
        className={`w-full h-full ${arState === 'idle' ? 'hidden' : ''}`}
      />

      {/* Status overlay */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50">
        <div className="px-4 py-2 bg-black bg-opacity-70 text-white rounded-lg text-sm">
          {statusMessage}
        </div>
      </div>

      {/* Error overlay */}
      {error && (
        <div className="absolute top-16 left-1/2 transform -translate-x-1/2 z-50">
          <div className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm max-w-sm text-center">
            {error}
          </div>
        </div>
      )}

      {/* Main UI */}
      {arState === 'idle' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6">
          <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
            <h1 className="text-3xl font-bold mb-4 text-gray-900">
              WebXR AR Demo
            </h1>
            <p className="text-gray-600 mb-6">
              A sphere-on-table AR experience following WebXR best practices
            </p>
            
            {isSupported ? (
              <button
                onClick={startARSession}
                className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
              >
                Start AR Experience
              </button>
            ) : (
              <div>
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg mb-4">
                  <p className="text-red-700 font-medium">AR Not Supported</p>
                  <p className="text-red-600 text-sm mt-1">
                    This device/browser doesn't support WebXR AR
                  </p>
                </div>
                
                <div className="text-left bg-gray-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-gray-900 mb-2">Requirements:</h3>
                  <ul className="text-sm text-gray-700 space-y-1">
                    <li>• Chrome 81+ on Android with ARCore</li>
                    <li>• Safari on iOS 15+ with ARKit</li>
                    <li>• HTTPS connection (or localhost)</li>
                    <li>• Device with AR capabilities</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* AR Controls */}
      {arState !== 'idle' && (
        <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-50">
          <div className="flex gap-3">
            {arState === 'ready' && !spherePlaced && (
              <button
                onClick={placeSphere}
                className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold"
              >
                Place Sphere
              </button>
            )}
            
            <button
              onClick={endARSession}
              className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-semibold"
            >
              End AR
            </button>
          </div>
        </div>
      )}

      {/* Instructions overlay */}
      {arState === 'ready' && !spherePlaced && (
        <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 z-40">
          <div className="px-4 py-2 bg-black bg-opacity-70 text-white rounded-lg text-sm text-center max-w-xs">
            Point your camera at a flat surface like a table or floor, then tap to place the sphere
          </div>
        </div>
      )}
    </div>
  )
} 