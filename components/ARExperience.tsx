/* eslint-disable @typescript-eslint/no-unused-vars */
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
  const [error, setError] = useState<string>("");

  useEffect(() => {
    // Check if WebXR is supported
    console.log("Checking WebXR support...");
    console.log("navigator.xr available:", "xr" in navigator);

    if ("xr" in navigator && navigator.xr) {
      navigator.xr
        .isSessionSupported("immersive-ar")
        .then((supported: boolean) => {
          console.log("immersive-ar supported:", supported);
          setIsSupported(supported);
          if (!supported && navigator.xr) {
            // Check if VR is supported as a fallback info
            navigator.xr
              .isSessionSupported("immersive-vr")
              .then((vrSupported: boolean) => {
                if (vrSupported) {
                  setSupportInfo(
                    "Your browser supports WebXR VR but not AR. For AR, use Chrome on Android or Safari on iOS."
                  );
                } else {
                  setSupportInfo(
                    "Your browser supports WebXR but not AR mode. Try using Chrome on Android or Safari on iOS."
                  );
                }
              });
          }
        })
        .catch((error) => {
          console.error("Error checking AR support:", error);
          setSupportInfo(`Error checking AR support: ${error.message}`);
        });
    } else {
      console.log("WebXR not available in navigator");
      setSupportInfo(
        "WebXR is not available in your browser. Please use a WebXR-compatible browser."
      );
    }
  }, []);

  const initializeAR = async () => {
    console.log("Canvas ref:", canvasRef.current);
    console.log("Is supported:", isSupported);

    if (!canvasRef.current) {
      setError("Canvas not ready - please try again");
      return;
    }

    if (!isSupported) {
      setError("AR is not supported on this device/browser");
      return;
    }

    setError(""); // Clear any previous errors
    console.log("Starting AR initialization...");

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
      console.log("Checking WebXR availability...");
      if (!navigator.xr) {
        throw new Error("WebXR not available");
      }

      console.log("Requesting AR session...");
      const xrSession = await navigator.xr.requestSession("immersive-ar", {
        requiredFeatures: ["hit-test"],
      });
      console.log("AR session created successfully");
      setSession(xrSession);
      // Attach XR session to Three.js renderer so camera feed is displayed
      renderer.xr.setSession(xrSession);

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
      console.error("Failed to start AR session:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
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
  }

  const endSession = () => {
    if (session) {
      session.end();
    }
  }

  return (
    <div className="relative w-full h-screen">
      <canvas
        ref={canvasRef}
        className={`w-full h-full ${!session ? "hidden" : ""}`}
      />
      {!session ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
          <h1 className="text-2xl font-bold mb-4">AR Sphere Demo</h1>
          <p className="text-gray-600 mb-6 text-center">
            Tap the button to start AR and place a sphere on a surface
          </p>
          {isSupported ? (
            <button
              onClick={initializeAR}
              className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              Start AR Experience
            </button>
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
            </div>
          )}
        </div>
      ) : (
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
      )}
    </div>
  );
} 