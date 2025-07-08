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
  const referenceSpaceRef = useRef<XRReferenceSpace | null>(null);
  const [spherePlaced, setSpherePlaced] = useState(false)
  const [error, setError] = useState<string>("");
  const [statusMessage, setStatusMessage] = useState<string>("Idle");
  const [surfaceStatus, setSurfaceStatus] = useState<string>("");
  const spherePlacedRef = useRef<boolean>(false);

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
    setStatusMessage("Initializing AR...");
    setSurfaceStatus("");
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
    const reticleGeometry = new THREE.RingGeometry(0.1, 0.15, 32).rotateX(
      -Math.PI / 2
    );
    const reticleMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    });
    const reticle = new THREE.Mesh(reticleGeometry, reticleMaterial);
    reticle.renderOrder = 1; // Render on top
    reticle.visible = false;
    scene.add(reticle);
    reticleRef.current = reticle;

    // Add a center dot to the reticle for better visibility
    const dotGeometry = new THREE.CircleGeometry(0.02, 32).rotateX(
      -Math.PI / 2
    );
    const dotMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    });
    const dot = new THREE.Mesh(dotGeometry, dotMaterial);
    reticle.add(dot);

    // Add a vertical line to make the reticle more visible
    const lineGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0.1, 0),
    ]);
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00 });
    const line = new THREE.Line(lineGeometry, lineMaterial);
    reticle.add(line);

    // Create sphere (will be placed on tap)
    const sphereGeometry = new THREE.SphereGeometry(0.15, 32, 32);
    const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
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
        optionalFeatures: ["dom-overlay"],
        domOverlay: { root: document.body },
      });
      setStatusMessage("AR session started");
      setSession(xrSession);
      // Attach XR session to Three.js renderer so camera feed is displayed
      renderer.xr.setSession(xrSession);

      // Acquire reference space for placing objects, fallback to local if local-floor unsupported
      let refSpace: XRReferenceSpace;
      try {
        setStatusMessage("Acquiring local-floor reference space");
        refSpace = await xrSession.requestReferenceSpace("local-floor");
      } catch (err) {
        console.warn("local-floor not supported, falling back to local", err);
        setStatusMessage(
          "local-floor not supported, using local reference space"
        );
        refSpace = await xrSession.requestReferenceSpace("local");
      }
      referenceSpaceRef.current = refSpace;
      setStatusMessage("Reference space acquired");

      // Set up hit test source
      const viewerSpace = await xrSession.requestReferenceSpace("viewer");
      if (xrSession.requestHitTestSource) {
        const hitTestSource = await xrSession.requestHitTestSource({
          space: viewerSpace,
        });
        if (hitTestSource) {
          setStatusMessage("Hit test source ready");
          hitTestSourceRef.current = hitTestSource;
        }
      } else {
        throw new Error("Hit test not supported");
      }

      // Set up XR frame loop using xrSession.requestAnimationFrame
      const onXRFrame = (time: number, frame: XRFrame) => {
        if (!frame) {
          setStatusMessage("No XRFrame in session callback");
        } else if (!hitTestSourceRef.current) {
          setStatusMessage("Hit test source missing");
        } else if (!referenceSpaceRef.current) {
          setStatusMessage("Reference space missing");
        } else {
          setStatusMessage("XRFrame received");
          const hitTestResults = frame.getHitTestResults(
            hitTestSourceRef.current
          );
          setStatusMessage(`Hit test results: ${hitTestResults.length}`);
          if (hitTestResults.length > 0 && reticleRef.current) {
            setSurfaceStatus("Surface detected");
            const hit = hitTestResults[0];
            const pose = hit.getPose(referenceSpaceRef.current!);
            if (pose) {
              reticleRef.current.visible = true;
              reticleRef.current.matrix.fromArray(pose.transform.matrix);
              reticleRef.current.matrix.decompose(
                reticleRef.current.position,
                reticleRef.current.quaternion,
                reticleRef.current.scale
              );
              // Log reticle position once when it becomes visible
              if (!reticleRef.current.userData.logged) {
                console.log("Reticle visible at:", reticleRef.current.position);
                reticleRef.current.userData.logged = true;
              }
              const pos = reticleRef.current.position;
              setSurfaceStatus(
                `Surface at (${pos.x.toFixed(2)}, ${pos.y.toFixed(
                  2
                )}, ${pos.z.toFixed(2)})`
              );
            }
          } else if (reticleRef.current) {
            setSurfaceStatus("Searching for surface");
            reticleRef.current.visible = false;
          }
        }
        // If sphere placed, stop updating statuses
        if (spherePlacedRef.current) {
          const xrCamera = renderer.xr.getCamera();
          renderer.render(sceneRef.current!, xrCamera);
          xrSession.requestAnimationFrame(onXRFrame);
          return;
        }
        // Render with XR-aware camera
        const xrCamera = renderer.xr.getCamera();
        renderer.render(sceneRef.current!, xrCamera);
        // Queue next frame
        xrSession.requestAnimationFrame(onXRFrame);
      };
      // Start the XR loop
      xrSession.requestAnimationFrame(onXRFrame);

      xrSession.addEventListener("end", () => {
        setSession(null);
        setStatusMessage("Session ended");
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
    // Debug initial state
    console.log("placeSphere called", {
      reticleExists: !!reticleRef.current,
      sphereExists: !!sphereRef.current,
      reticleVisible: reticleRef.current?.visible,
    });
    setStatusMessage("placeSphere called");
    if (!reticleRef.current) {
      setStatusMessage("No reticle available");
      return;
    }
    if (!sphereRef.current) {
      setStatusMessage("No sphere mesh available");
      return;
    }
    if (!reticleRef.current.visible) {
      setStatusMessage("Reticle not visible - cannot place sphere");
      return;
    }
    // Place sphere at reticle position
    const pos = reticleRef.current.position;
    console.log("Placing sphere at", pos);
    setStatusMessage(
      `Placing sphere at (${pos.x.toFixed(2)}, ${pos.y.toFixed(
        2
      )}, ${pos.z.toFixed(2)})`
    );
    sphereRef.current.position.copy(pos);
    sphereRef.current.quaternion.copy(reticleRef.current.quaternion);
    sphereRef.current.visible = true;
    setSpherePlaced(true);
    spherePlacedRef.current = true;
    setStatusMessage(
      `Sphere placed at (${pos.x.toFixed(2)}, ${pos.y.toFixed(
        2
      )}, ${pos.z.toFixed(2)})`
    );
    console.log("Sphere mesh after placement:", sphereRef.current);
  };

  const endSession = () => {
    if (session) {
      session.end();
      setStatusMessage("Session ended");
    }
  };

  return (
    <div className="relative w-full h-screen">
      <canvas
        ref={canvasRef}
        className={`w-full h-full ${!session ? "hidden" : ""}`}
      />
      {/* General status overlay */}
      <div className="absolute top-2 left-1/2 transform -translate-x-1/2 p-2 bg-yellow-200 bg-opacity-75 rounded z-50 text-black">
        {statusMessage}
      </div>
      {/* Surface status overlay */}
      {surfaceStatus && (
        <div className="absolute top-12 left-1/2 transform -translate-x-1/2 p-2 bg-green-200 border border-green-500 rounded z-50 text-black">
          {surfaceStatus}
        </div>
      )}
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