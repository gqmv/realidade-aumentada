interface XRSystem {
  isSessionSupported(mode: string): Promise<boolean>
  requestSession(mode: string, options?: any): Promise<XRSession>
}

interface Navigator {
  xr: XRSystem
}

interface XRSession extends EventTarget {
  end(): Promise<void>
  requestReferenceSpace(type: string): Promise<XRReferenceSpace>
  requestHitTestSource?(options: any): Promise<XRHitTestSource>
  requestAnimationFrame(callback: XRFrameRequestCallback): number
  addEventListener(type: string, listener: EventListener): void
  removeEventListener(type: string, listener: EventListener): void
}

interface XRReferenceSpace extends EventTarget {
  getOffsetReferenceSpace(originOffset: XRRigidTransform): XRReferenceSpace
}

interface XRFrame {
  getViewerPose(referenceSpace: XRReferenceSpace): XRViewerPose | null
  getHitTestResults(hitTestSource: XRHitTestSource): XRHitTestResult[]
  getReferenceSpace(): XRReferenceSpace
}

interface XRViewerPose {
  transform: XRRigidTransform
}

interface XRRigidTransform {
  matrix: Float32Array
  position: DOMPointReadOnly
  orientation: DOMPointReadOnly
}

interface XRHitTestSource {}

interface XRHitTestResult {
  getPose(referenceSpace: XRReferenceSpace): XRPose | null
}

interface XRPose {
  transform: XRRigidTransform
}

type XRFrameRequestCallback = (time: number, frame: XRFrame) => void 