'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

export default function ARExperience() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isSupported, setIsSupported] = useState(false)
  const [supportInfo, setSupportInfo] = useState<string>('')
  const [session, setSession] = useState<XRSession | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const reticleRef = useRef<THREE.Mesh | null>(null)
  const sphereRef = useRef<THREE.Mesh | null>(null)
  const hitTestSourceRef = useRef<XRHitTestSource | null>(null)
  const [spherePlaced, setSpherePlaced] = useState(false)
  const [error, setError] = useState<string>('')
  const [debugInfo, setDebugInfo] = useState<string[]>([]);
  const [isCheckingSupport, setIsCheckingSupport] = useState(true);

  useEffect(() => {
    // Check if WebXR is supported
    const checkSupport = async () => {
      const debug: string[] = [];

      debug.push(`Checking WebXR support...`);
      debug.push(`Browser: ${navigator.userAgent.substring(0, 50)}...`);
      debug.push(`navigator.xr available: ${"xr" in navigator}`);

      setDebugInfo([...debug]);

      if ("xr" in navigator && navigator.xr) {
        try {
          const arSupported = await navigator.xr.isSessionSupported(
            "immersive-ar"
          );
          debug.push(`immersive-ar supported: ${arSupported}`);
          setDebugInfo([...debug]);
          setIsSupported(arSupported);

          if (!arSupported && navigator.xr) {
            // Check if VR is supported as a fallback info
            try {
              const vrSupported = await navigator.xr.isSessionSupported(
                "immersive-vr"
              );
              debug.push(`immersive-vr supported: ${vrSupported}`);
              setDebugInfo([...debug]);

              if (vrSupported) {
                setSupportInfo(
                  "Your browser supports WebXR VR but not AR. For AR, use Chrome on Android or Safari on iOS."
                );
              } else {
                setSupportInfo(
                  "Your browser supports WebXR but not AR mode. Try using Chrome on Android or Safari on iOS."
                );
              }
            } catch (e) {
              debug.push(`Error checking VR support: ${e}`);
              setDebugInfo([...debug]);
            }
          }
        } catch (error: any) {
          debug.push(`Error checking AR support: ${error.message}`);
          setDebugInfo([...debug]);
          setSupportInfo(`Error checking AR support: ${error.message}`);
        }
      } else {
        debug.push("WebXR not available in navigator");
        setDebugInfo([...debug]);
        setSupportInfo(
          "WebXR is not available in your browser. Please use a WebXR-compatible browser."
        );
      }

      setIsCheckingSupport(false);
    };

    checkSupport();
  }, []);

  const initializeAR = async () => {
    const debug = [...debugInfo];
    debug.push("--- Button clicked ---");
    debug.push(`Canvas ref exists: ${!!canvasRef.current}`);
    debug.push(`AR supported: ${isSupported}`);
    setDebugInfo(debug);

    if (!canvasRef.current) {
      setError("Canvas not ready - please try again");
      debug.push("ERROR: Canvas not ready");
      setDebugInfo(debug);
      return;
    }

    if (!isSupported) {
      setError("AR is not supported on this device/browser");
      debug.push("ERROR: AR not supported");
      setDebugInfo(debug);
      return;
    }

    setError(""); // Clear any previous errors
    debug.push("Starting AR initialization...");
    setDebugInfo(debug);

    // Initialize Three.js
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.01,
      20
    );
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      alpha: true,
      antialias: true,
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    rendererRef.current = renderer;

    // Add lights
    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
    light.position.set(0.5, 1, 0.25);
    scene.add(light);

    // Create reticle (placement indicator)
    const reticleGeometry = new THREE.RingGeometry(0.15, 0.2, 32).rotateX(
      -Math.PI / 2
    );
    const reticleMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const reticle = new THREE.Mesh(reticleGeometry, reticleMaterial);
    reticle.visible = false;
    scene.add(reticle);
    reticleRef.current = reticle;

    // Create sphere (will be placed on tap)
    const sphereGeometry = new THREE.SphereGeometry(0.1, 32, 32);
    const sphereMaterial = new THREE.MeshPhongMaterial({
      color: 0x00ff00,
      emissive: 0x00ff00,
      emissiveIntensity: 0.2,
    });
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphere.visible = false;
    scene.add(sphere);
    sphereRef.current = sphere;

    // Start AR session
    try {
      debug.push("Checking WebXR availability...");
      setDebugInfo([...debug]);

      if (!navigator.xr) {
        throw new Error("WebXR not available");
      }

      debug.push("Requesting AR session...");
      setDebugInfo([...debug]);

      const xrSession = await navigator.xr.requestSession("immersive-ar", {
        requiredFeatures: ["hit-test"],
      });

      debug.push("AR session created successfully!");
      setDebugInfo([...debug]);
      setSession(xrSession);

      // Set up hit test source
      const viewerSpace = await xrSession.requestReferenceSpace("viewer");
      if (xrSession.requestHitTestSource) {
        const hitTestSource = await xrSession.requestHitTestSource({
          space: viewerSpace,
        });
        if (hitTestSource) {
          hitTestSourceRef.current = hitTestSource;
        }
      } else {
        throw new Error("Hit test not supported");
      }

      // Set up render loop
      renderer.setAnimationLoop((timestamp, frame) => {
        if (frame && hitTestSourceRef.current) {
          const hitTestResults = frame.getHitTestResults(
            hitTestSourceRef.current
          );

          if (hitTestResults.length > 0 && reticleRef.current) {
            const hit = hitTestResults[0];
            const pose = hit.getPose(frame.getReferenceSpace());

            if (pose) {
              reticleRef.current.visible = true;
              reticleRef.current.matrix.fromArray(pose.transform.matrix);
              reticleRef.current.matrix.decompose(
                reticleRef.current.position,
                reticleRef.current.quaternion,
                reticleRef.current.scale
              );
            }
          } else if (reticleRef.current) {
            reticleRef.current.visible = false;
          }
        }

        renderer.render(scene, camera);
      });

      xrSession.addEventListener("end", () => {
        setSession(null);
        if (rendererRef.current) {
          rendererRef.current.setAnimationLoop(null);
        }
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      debug.push(`ERROR: Failed to start AR session - ${errorMessage}`);
      setDebugInfo([...debug]);
      setError(`Failed to start AR: ${errorMessage}`);
    }
  };

  const placeSphere = () => {
    if (reticleRef.current && sphereRef.current && reticleRef.current.visible) {
      sphereRef.current.position.copy(reticleRef.current.position);
      sphereRef.current.quaternion.copy(reticleRef.current.quaternion);
      sphereRef.current.visible = true;
      setSpherePlaced(true);
    }
  };

  const endSession = () => {
    if (session) {
      session.end();
    }
  };

  return (
    <div className="relative w-full h-screen">
      {!session ? (
        <div className="flex flex-col items-center justify-center h-full p-4">
          <h1 className="text-2xl font-bold mb-4">AR Sphere Demo</h1>
          <p className="text-gray-600 mb-6 text-center">
            Tap the button to start AR and place a sphere on a surface
          </p>

          {isCheckingSupport ? (
            <div className="text-center">
              <p className="text-gray-500 mb-4">Checking WebXR support...</p>
              <div className="animate-pulse">
                <div className="h-12 bg-gray-200 rounded w-48 mx-auto"></div>
              </div>
            </div>
          ) : isSupported ? (
            <>
              <button
                onClick={initializeAR}
                className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                Start AR Experience
              </button>
              {error && (
                <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                  <p className="text-sm">{error}</p>
                </div>
              )}

              {/* Testing Instructions */}
              <div className="mt-6 p-3 bg-blue-50 border border-blue-200 rounded-lg max-w-md">
                <p className="text-sm text-blue-700">
                  <span className="font-semibold">📱 Testing on Mobile?</span>
                  <br />
                  Access this page at:{" "}
                  <code className="bg-blue-100 px-1 rounded">
                    http://[YOUR-IP]:3001
                  </code>
                </p>
              </div>

              {/* Debug Information Panel */}
              {debugInfo.length > 0 && (
                <details className="mt-4 max-w-md">
                  <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-800">
                    Show Debug Info
                  </summary>
                  <div className="mt-2 p-3 bg-gray-800 text-white rounded-lg text-left">
                    <div className="space-y-1 text-xs font-mono">
                      {debugInfo.map((info, index) => (
                        <div key={index} className="text-gray-300">
                          {info}
                        </div>
                      ))}
                    </div>
                  </div>
                </details>
              )}
            </>
          ) : (
            <div className="text-center">
              <p className="text-red-500 mb-4">
                WebXR AR is not supported on this device
              </p>
              <p className="text-sm text-gray-600 max-w-md">{supportInfo}</p>
              <div className="mt-6 p-4 bg-gray-100 rounded-lg text-left">
                <h3 className="font-semibold mb-2">
                  Requirements for WebXR AR:
                </h3>
                <ul className="text-sm text-gray-700 space-y-1">
                  <li>• Chrome 81+ on Android with AR support</li>
                  <li>• Safari on iOS 15+ with AR support</li>
                  <li>• HTTPS connection (or localhost)</li>
                  <li>• Device with ARCore (Android) or ARKit (iOS)</li>
                </ul>
              </div>
              <button
                onClick={() =>
                  (window.location.href = "https://immersiveweb.dev/")
                }
                className="mt-4 px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
              >
                Learn more about WebXR
              </button>

              {/* Debug Information Panel */}
              <div className="mt-6 p-4 bg-gray-800 text-white rounded-lg text-left max-w-md">
                <h3 className="font-semibold mb-2 text-yellow-400">
                  Debug Info:
                </h3>
                <div className="space-y-1 text-xs font-mono">
                  {debugInfo.map((info, index) => (
                    <div key={index} className="text-gray-300">
                      {info}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          <canvas ref={canvasRef} className="w-full h-full" />
          <div className="absolute bottom-0 left-0 right-0 p-4 flex flex-col items-center gap-4">
            {!spherePlaced && (
              <button
                onClick={placeSphere}
                className="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
              >
                Place Sphere
              </button>
            )}
            <button
              onClick={endSession}
              className="px-6 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
            >
              End AR Session
            </button>
          </div>
        </>
      )}
    </div>
  );
} 