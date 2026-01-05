import React, { Component, useRef, Suspense, ReactNode, useEffect, useMemo, useState, useCallback } from 'react';
import { Canvas, useFrame, useGraph } from '@react-three/fiber';
import { useGLTF, OrbitControls, Environment, Html } from '@react-three/drei';
import * as THREE from 'three';
import { AlertCircle, Loader2, User } from 'lucide-react';

// Preload the model securely
try {
  useGLTF.preload('/model.glb');
} catch (e) {
  console.warn("Failed to preload avatar model:", e);
}

// --- CONSTANTS ---

const BONE_KEYWORDS = {
  Hips: ['Hips', 'mixamorigHips', 'Hip', 'Pelvis', 'Root'],
  RightArm: ['RightArm', 'Right_Arm', 'mixamorigRightArm', 'Arm_R'],
  RightForeArm: ['RightForeArm', 'Right_ForeArm', 'mixamorigRightForeArm', 'ForeArm_R'],
  RightHand: ['RightHand', 'Right_Hand', 'mixamorigRightHand', 'Hand_R'],
  
  LeftArm: ['LeftArm', 'Left_Arm', 'mixamorigLeftArm', 'Arm_L'],
  LeftForeArm: ['LeftForeArm', 'Left_ForeArm', 'mixamorigLeftForeArm', 'ForeArm_L'],
  LeftHand: ['LeftHand', 'Left_Hand', 'mixamorigLeftHand', 'Hand_L'],

  Head: ['Head', 'mixamorigHead', 'Head_01'],
  
  RightHandThumb1: ['RightHandThumb1', 'Thumb_01_R', 'mixamorigRightHandThumb1'],
  RightHandIndex1: ['RightHandIndex1', 'Index_01_R', 'mixamorigRightHandIndex1'],
  RightHandMiddle1: ['RightHandMiddle1', 'Middle_01_R', 'mixamorigRightHandMiddle1'],
  RightHandRing1: ['RightHandRing1', 'Ring_01_R', 'mixamorigRightHandRing1'],
  RightHandPinky1: ['RightHandPinky1', 'Pinky_01_R', 'mixamorigRightHandPinky1'],
};

// Hand Shapes
const FINGER_SHAPES = {
  OPEN: { thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 },
  FIST: { thumb: 1.0, index: 1.5, middle: 1.5, ring: 1.5, pinky: 1.5 },
  POINT: { thumb: 1.0, index: 0, middle: 1.5, ring: 1.5, pinky: 1.5 },
  FLAT: { thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 },
  PINCH: { thumb: 0.5, index: 0.5, middle: 0, ring: 0, pinky: 0 },
};

// --- GESTURE LIBRARY ---
// Calibrated for Standard GLB / Ready Player Me T-Pose
const POSE_LIBRARY: Record<string, any> = {
  // 1. HELLO: Handled dynamically by createCalibratedHello, but keeping fallback here
  "HELLO": {
    RightArm: [-0.55, 0.10, 0.05],
    RightForeArm: [0.0, -0.30, 1.25],
    RightHand: [0.0, 1.10, 0.0],
    fingers: FINGER_SHAPES.OPEN,
    wave: true
  },
  "HI": { link: "HELLO" },

  // 2. THANKS: Hand to Chin
  "THANKS": {
    RightArm: [0.4, 0, 0.6],       // Lift forward
    RightForeArm: [0, -0.2, 2.2],  // Deep bend to chin
    LeftArm: [1.30, 0, 0],         // Keep left arm down (using new idle)
    fingers: FINGER_SHAPES.FLAT,
    animation: "chin_to_front"
  },
  "THANK": { link: "THANKS" },

  // 3. PLEASE: Rub chest
  "PLEASE": {
    RightArm: [0.2, 0, -2.1],       // Lower, close to body
    RightForeArm: [0, 0, -1.5],     // Bend up to chest
    LeftArm: [1.30, 0, 0],         // Keep left arm down
    fingers: FINGER_SHAPES.FLAT,
    animation: "rub_chest"
  },

  // 4. YES: Fist Front
  "YES": {
    RightArm: [0.3, 0, 0.8],       // Elbow front
    RightForeArm: [0, -0.5, 1.8],  // Hand up
    LeftArm: [1.30, 0, 0],         // Keep left arm down
    fingers: FINGER_SHAPES.FIST,
    animation: "nod_wrist"
  },

  // 5. NO: Snap Front
  "NO": {
    RightArm: [0.3, 0, 0.8],
    RightForeArm: [0, -0.5, 1.8],
    LeftArm: [1.30, 0, 0],         // Keep left arm down
    fingers: FINGER_SHAPES.PINCH,
    animation: "shake_hand"
  },

YOU: {
    // Arm slightly forward
    RightArm: [0.4, 0.0, 0.9],

    // Elbow bent so hand comes forward
    RightForeArm: [0.0, -0.2, 1.6],

    // Fingers: only index open
    fingers: {
      thumb: 1.0,
      index: 0.0,     // 👈 pointing
      middle: 1.5,
      ring: 1.5,
      pinky: 1.5,
    }
  },
  // 6. IDLE (Arms Down / Natural Stand)
  "IDLE": {
    // ---- RIGHT ARM DOWN ----
    RightArm: [1.30, 0.00, 0.00],   // ↓ arm naturally (Positive rotation)
    RightForeArm: [0.00, 0.00, 0.00],
    RightHand: [0.00, 0.00, 0.00],

    // ---- LEFT ARM DOWN ----
    LeftArm: [1.30, 0.00, 0.00],    // ↓ arm naturally (Positive rotation)
    LeftForeArm: [0.00, 0.00, 0.00],
    LeftHand: [0.00, 0.00, 0.00],

    // Fingers open naturally
    fingers: FINGER_SHAPES.OPEN
  }
};

// --- ERROR BOUNDARY ---
interface ErrorBoundaryProps {
  fallback: (error: Error) => ReactNode;
  children?: ReactNode;
  onError?: (error: Error) => void;
}

interface ErrorBoundaryState { 
  hasError: boolean; 
  error?: Error; 
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }
  
  componentDidCatch(error: Error) {
    if (this.props.onError) {
      this.props.onError(error);
    }
  }
  
  render() {
    if (this.state.hasError && this.state.error) {
      return this.props.fallback(this.state.error);
    }
    return this.props.children;
  }
}

// --- HELPER: Recursively find a bone ---
const findBone = (object: THREE.Object3D, possibleNames: string[]): THREE.Object3D | null => {
  if (possibleNames.some(name => object.name.includes(name))) {
    return object;
  }
  for (const child of object.children) {
    const found = findBone(child, possibleNames);
    if (found) return found;
  }
  return null;
};

// --- DYNAMIC CALIBRATION LOGIC ---
function createCalibratedHello(bones: Record<string, THREE.Object3D | null>, side: 'Right' | 'Left' = 'Right') {
  // quick safety
  const shoulderName = side + 'Arm';
  const foreName = side + 'ForeArm';
  const handName = side + 'Hand';
  // Hips is usually the root for position reference
  const hipCandidates = ['Hips', 'mixamorigHips', 'Hip', 'Pelvis', 'Root'];

  const shoulder = bones[shoulderName];
  const fore = bones[foreName];
  const hand = bones[handName];

  if (!shoulder || !hand) {
    // console.warn('CalibratedHello: required bones missing', shoulderName, handName);
    return null;
  }

  // find hip/root for target reference
  let hip: THREE.Object3D | null = null;
  // Try to find hip from our bones map first (preferable)
  if (bones['Hips']) {
    hip = bones['Hips'];
  } else {
    // Fallback search
    hip = shoulder.parent ?? null;
  }

  // store original rotations to restore after tests
  const orig = {
    shoulder: shoulder.rotation.clone(),
    fore: fore ? fore.rotation.clone() : new THREE.Euler(),
    hand: hand.rotation.clone()
  };

  // helper: world position of a bone
  const worldPos = (obj: THREE.Object3D) => {
    obj.updateMatrixWorld(true);
    const p = new THREE.Vector3();
    obj.getWorldPosition(p);
    return p;
  };

  // target point near hip (down + slightly to side)
  const hipPos = hip ? worldPos(hip) : new THREE.Vector3(0, 0.9, 0);
  const sideSign = (side === 'Right') ? 1 : -1;
  const targetHand = hipPos.clone();
  targetHand.y -= 0.25;              // down a bit
  targetHand.x += sideSign * 0.18;   // to side so hand rests near hip
  targetHand.z += 0.05;              // slightly forward

  // function to test a small rotation on a given axis & sign and return distance to target
  const testDelta = 0.5; // radians (≈28°) for detection
  const axes: Array<'x'|'y'|'z'> = ['x','y','z'];
  let best = { axis: 'x' as 'x'|'y'|'z', sign: 1, dist: Number.POSITIVE_INFINITY };

  for (const ax of axes) {
    for (const s of [1, -1]) {
      // apply test rotation
      shoulder.rotation[ax] += s * testDelta;
      shoulder.updateMatrixWorld(true);
      // measure new hand pos
      const p = worldPos(hand);
      const d = p.distanceTo(targetHand);
      // revert
      shoulder.rotation[ax] -= s * testDelta;
      if (d < best.dist) {
        best = { axis: ax, sign: s, dist: d };
      }
    }
  }

  // restore original rotations just in case
  shoulder.rotation.copy(orig.shoulder);
  if (fore) fore.rotation.copy(orig.fore);
  hand.rotation.copy(orig.hand);
  shoulder.updateMatrixWorld(true);

  // Now compute absolute target Euler values (safe magnitudes)
  // These magnitudes are conservative — they won't fling the arm.
  const DOWN_ANGLE = 1.1;    // base angle to bring arm down from T-pose
  const FORWARD_LIFT = 0.15; // small additional lift so hand is in front
  const FORE_BEND = 1.35;    // elbow bend
  const PALM_TWIST = (side === 'Right') ? 1.1 : -1.1; // twist so palm faces front

  // Build target Euler object
  const shoulderTarget = new THREE.Euler().copy(orig.shoulder);
  // set axis that moves arm down toward the sign chosen
  shoulderTarget[best.axis] = best.sign * DOWN_ANGLE;
  // add a small forward lift on z if that axis is not the chosen axis (safe)
  if (best.axis !== 'z') shoulderTarget.z += FORWARD_LIFT;

  const foreTarget = new THREE.Euler();
  foreTarget.x = 0;
  foreTarget.y = -0.35; // small twist
  foreTarget.z = FORE_BEND;

  const handTarget = new THREE.Euler();
  handTarget.x = 0;
  handTarget.y = PALM_TWIST;
  handTarget.z = 0;

  // Return an updater that animates from current to target (and waves)
  let animState = { phase: 'lift', t: 0, wavesDone: 0 };
  const durLift = 0.45, durHold = 0.18, durWave = 0.28, durLower = 0.40;
  const waves = 2;
  const lerp = (a: number, b: number, v: number) => a + (b - a) * v;

  return function calibratedHelloUpdate(dt: number) {
    // dt in seconds
    animState.t += dt;
    const s = Math.min(1, dt * 12); // frame smoothing not required but used for micro smoothing

    // convenience apply: interpolate rotation towards target
    const applyEulerLerp = (bone: THREE.Object3D, targetEuler: THREE.Euler, alpha: number) => {
      bone.rotation.x = lerp(bone.rotation.x, targetEuler.x, alpha);
      bone.rotation.y = lerp(bone.rotation.y, targetEuler.y, alpha);
      bone.rotation.z = lerp(bone.rotation.z, targetEuler.z, alpha);
      bone.updateMatrixWorld(true);
    };

    if (animState.phase === 'lift') {
      const p = Math.min(1, animState.t / durLift);
      applyEulerLerp(shoulder, shoulderTarget, p);
      if (fore) applyEulerLerp(fore, foreTarget, p);
      applyEulerLerp(hand, handTarget, p);
      if (animState.t >= durLift) { animState.phase = 'hold'; animState.t = 0; }
    } else if (animState.phase === 'hold') {
      // hold pose stable
      applyEulerLerp(shoulder, shoulderTarget, s);
      if (fore) applyEulerLerp(fore, foreTarget, s);
      applyEulerLerp(hand, handTarget, s);
      if (animState.t >= durHold) { animState.phase = 'waveOut'; animState.t = 0; }
    } else if (animState.phase === 'waveOut') {
      const p = Math.min(1, animState.t / durWave);
      // blend shoulder slightly to outward wave using the same axis
      const extra = 0.08 * Math.sin(Math.PI * p); // small outward push
      shoulder.rotation[best.axis] = lerp(shoulder.rotation[best.axis], shoulderTarget[best.axis] + best.sign * extra, 0.6);
      if (fore) fore.rotation.z += Math.sin(Date.now() / 1000 * 8) * 0.18;
      if (animState.t >= durWave) { animState.phase = 'waveIn'; animState.t = 0; }
    } else if (animState.phase === 'waveIn') {
      const p = Math.min(1, animState.t / durWave);
      // relax back a bit
      shoulder.rotation[best.axis] = lerp(shoulder.rotation[best.axis], shoulderTarget[best.axis], 0.6);
      if (fore) fore.rotation.z += Math.sin(Date.now() / 1000 * 8) * 0.12;
      if (animState.t >= durWave) {
        animState.wavesDone += 1;
        animState.t = 0;
        if (animState.wavesDone >= waves) animState.phase = 'lower';
        else animState.phase = 'waveOut';
      }
    } else if (animState.phase === 'lower') {
      const p = Math.min(1, animState.t / durLower);
      // smooth return to original
      applyEulerLerp(shoulder, orig.shoulder, p);
      if (fore) applyEulerLerp(fore, orig.fore, p);
      applyEulerLerp(hand, orig.hand, p);
      if (animState.t >= durLower) {
        // finished — restore exact originals
        shoulder.rotation.copy(orig.shoulder);
        if (fore) fore.rotation.copy(orig.fore);
        hand.rotation.copy(orig.hand);
        shoulder.updateMatrixWorld(true);
        if (fore) fore.updateMatrixWorld(true);
        hand.updateMatrixWorld(true);
        return true; // finished
      }
    }
    return false; // not finished
  };
}

// --- AVATAR MODEL COMPONENT ---

const AvatarModel = ({ url, gloss, triggerAnimation, onLoad }: { url: string, gloss: string, triggerAnimation?: number, onLoad?: () => void }) => {
  const { scene } = useGLTF(url); 
  const { nodes } = useGraph(scene); 
  const lastTriggerTime = useRef(0);
  const prevTriggerVal = useRef(triggerAnimation);
  
  // Custom Animation Refs
  const helloUpdaterRef = useRef<null | ((dt:number)=>boolean)>(null);
  const helloActiveRef = useRef(false);
  const lastHelloTrigger = useRef<number>(0);

  // Signal load completion on mount
  useEffect(() => {
    if (onLoad) {
      // Small delay to ensure frames have started
      const timer = setTimeout(onLoad, 100);
      return () => clearTimeout(timer);
    }
  }, [onLoad]);

  // Update trigger time when prop changes
  useEffect(() => {
    if (triggerAnimation !== prevTriggerVal.current) {
      lastTriggerTime.current = Date.now();
      prevTriggerVal.current = triggerAnimation;
    }
  }, [triggerAnimation]);

  // 1. Auto-Rigging: Find bones on mount
  const bones = useMemo(() => {
    const foundBones: Record<string, THREE.Object3D | null> = {};
    Object.entries(BONE_KEYWORDS).forEach(([key, possibleNames]) => {
      let bone: THREE.Object3D | null = null;
      for (const name of possibleNames) {
        if (nodes[name]) {
          bone = nodes[name];
          break;
        }
      }
      if (!bone) {
         bone = findBone(scene, possibleNames);
      }
      foundBones[key] = bone;
    });
    return foundBones;
  }, [nodes, scene]);


  // 2. Material Fixes
  useEffect(() => {
    scene.traverse((child: any) => {
      if (child.isMesh) {
        // Performance: Disable shadows
        child.castShadow = false;
        child.receiveShadow = false;
        if (child.material) {
           child.material.side = THREE.DoubleSide; 
           child.material.alphaTest = 0.5;
           child.material.depthWrite = true;
           child.material.transparent = false; 
        }
      }
    });
  }, [scene]);

  // 3. Animation Loop
  useFrame((state, delta) => {
    const now = Date.now();
    const timeSinceTrigger = (now - lastTriggerTime.current) / 1000;
    
    // Animation Duration: 2.0s window
    const isAnimating = timeSinceTrigger < 2.0; 

    const upperGloss = gloss?.toUpperCase() || "";

    // --- CHECK FOR CALIBRATED HELLO TRIGGER ---
    if (!helloActiveRef.current && upperGloss.includes("HELLO") && triggerAnimation !== undefined && triggerAnimation !== lastHelloTrigger.current) {
        lastHelloTrigger.current = triggerAnimation;
        const animator = createCalibratedHello(bones, 'Right');
        if (animator) { 
          helloUpdaterRef.current = animator; 
          helloActiveRef.current = true; 
        }
    }

    // --- EXECUTE CUSTOM ANIMATION ---
    let skipRightArm = false;
    if (helloUpdaterRef.current) {
        const done = helloUpdaterRef.current(delta);
        skipRightArm = true;
        if (done) {
            helloUpdaterRef.current = null;
            helloActiveRef.current = false;
            skipRightArm = false;
        }
    }

    // Determine Target Pose for standard library
    let target = POSE_LIBRARY["IDLE"];
    
    // Keyword matching
    let activeKey = Object.keys(POSE_LIBRARY).find(k => k !== "IDLE" && upperGloss.includes(k));
    
    if (activeKey && POSE_LIBRARY[activeKey].link) {
      activeKey = POSE_LIBRARY[activeKey].link;
    }

    if (activeKey && isAnimating) {
      target = POSE_LIBRARY[activeKey];
    } 

    // --- APPLY ROTATIONS (Smooth Lerp) ---
    const lerpSpeed = 0.1;

    // Helper to rotate a bone if it exists
    const rotateBone = (boneName: string, targetRot: number[]) => {
      const bone = bones[boneName];
      if (bone) {
        bone.rotation.x = THREE.MathUtils.lerp(bone.rotation.x, targetRot[0], lerpSpeed);
        bone.rotation.y = THREE.MathUtils.lerp(bone.rotation.y, targetRot[1], lerpSpeed);
        bone.rotation.z = THREE.MathUtils.lerp(bone.rotation.z, targetRot[2], lerpSpeed);
      }
    };

    // 1. Core Limbs
    // If Custom Animation is running on Right Arm, don't override it with POSE_LIBRARY
    if (!skipRightArm) {
      rotateBone('RightArm', target.RightArm || POSE_LIBRARY.IDLE.RightArm);
      rotateBone('RightForeArm', target.RightForeArm || POSE_LIBRARY.IDLE.RightForeArm);
      rotateBone('RightHand', target.RightHand || POSE_LIBRARY.IDLE.RightHand || [0,0,0]);
    }
    
    rotateBone('LeftArm', target.LeftArm || POSE_LIBRARY.IDLE.LeftArm); 
    rotateBone('LeftForeArm', target.LeftForeArm || POSE_LIBRARY.IDLE.LeftForeArm);
    rotateBone('LeftHand', target.LeftHand || POSE_LIBRARY.IDLE.LeftHand || [0,0,0]);
    
    // 3. Fingers (Right Hand)
    // Custom animator doesn't handle fingers, so we let standard logic apply fingers (like OPEN)
    const shapes = target.fingers || FINGER_SHAPES.OPEN;
    ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'].forEach(finger => {
       const boneName = `RightHandThumb1` === `RightHand${finger}1` ? `RightHandThumb1` : `RightHand${finger}1`;
       const boneKey = `RightHand${finger}1`;
       const curl = shapes[finger.toLowerCase()] || 0;
       if(bones[boneKey]) bones[boneKey]!.rotation.z = THREE.MathUtils.lerp(bones[boneKey]!.rotation.z, curl, lerpSpeed);
    });

    // --- PROCEDURAL ANIMATIONS (Only if Active Gesture AND within time window) ---
    // Only run standard procedural waves if we are NOT running the custom calibrated wave
    if (activeKey && isAnimating && !skipRightArm) {
        const t = now / 1000; 

        // Wave (Standard fallback)
        if (target.wave && bones.RightForeArm) {
          bones.RightForeArm.rotation.z += Math.sin(t * 8) * 0.3; 
        }
        
        // Chin to Front (Thanks)
        if (target.animation === "chin_to_front" && bones.RightForeArm) {
           const progress = Math.min(timeSinceTrigger * 2, 1); 
           bones.RightForeArm.rotation.z += Math.sin(progress * Math.PI) * 0.5;
        }
        
        // Rub Chest (Please)
        if (target.animation === "rub_chest" && bones.RightArm) {
           bones.RightArm.rotation.x += Math.cos(t * 5) * 0.1;
        }
        
        // Nod Wrist (Yes)
        if (target.animation === "nod_wrist" && bones.RightHand) {
           bones.RightHand.rotation.z = Math.sin(t * 8) * 0.5; 
        }

        // Shake Hand (No)
        if (target.animation === "shake_hand" && bones.RightForeArm) {
           bones.RightForeArm.rotation.y += Math.sin(t * 10) * 0.2;
        }
    }

  });

  return (
    // Centering: Y = 0.2 places avatar slightly lower than 0.4
    <group dispose={null} position={[0, 0.2, 0]}>
      <primitive object={scene} scale={0.8} />
    </group>
  );
};

// --- MAIN COMPONENT ---

const ThreeAvatar = ({ gloss, triggerAnimation }: { gloss: string, triggerAnimation?: number }) => {
  const [isLoading, setIsLoading] = useState(true);

  const handleLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleError = useCallback(() => {
    setIsLoading(false);
  }, []);

  // Safety Timeout
  useEffect(() => {
    const safetyTimer = setTimeout(() => {
        if (isLoading) setIsLoading(false);
    }, 10000); // 10 seconds timeout for avatar loading
    return () => clearTimeout(safetyTimer);
  }, [isLoading]);

  const renderErrorFallback = (error: Error) => {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full text-center p-6 text-gray-500 bg-gray-100 rounded-xl">
         <AlertCircle className="w-10 h-10 text-red-400 mb-2" />
         <p className="font-bold">Avatar Error</p>
         <p className="text-xs mt-1 opacity-70">{error.message}</p>
         <p className="text-[10px] mt-4 text-blue-500">Ensure model.glb is in public folder</p>
      </div>
    );
  };

  return (
    <div className="w-full h-full relative group">
      
      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-50/90 dark:bg-gray-900/90 backdrop-blur-sm transition-all duration-500">
           <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700 flex flex-col items-center transform transition-all animate-in fade-in zoom-in-95 duration-300">
              <div className="relative mb-4">
                 <div className="w-16 h-16 border-4 border-blue-100 dark:border-blue-900 rounded-full"></div>
                 <div className="w-16 h-16 border-4 border-blue-500 rounded-full border-t-transparent animate-spin absolute inset-0"></div>
                 <User className="w-8 h-8 text-blue-500 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Initializing Avatar</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center max-w-[150px]">
                Loading 3D assets and rigging...
              </p>
           </div>
        </div>
      )}

      <ErrorBoundary fallback={renderErrorFallback} onError={handleError}>
        <Canvas 
          camera={{ position: [0, 1.2, 2.0], fov: 45 }} 
          className="w-full h-full bg-transparent"
          shadows={false}
        >
          <ambientLight intensity={1.5} />
          <spotLight position={[2, 5, 5]} angle={0.5} penumbra={1} intensity={2.0} />
          <directionalLight position={[-2, 2, 4]} intensity={1.5} />
          <Environment preset="city" />
          
          <Suspense fallback={null}>
            <AvatarModel 
              url="/model.glb" 
              gloss={gloss} 
              triggerAnimation={triggerAnimation}
              onLoad={handleLoad} 
            />
          </Suspense>
          
          <OrbitControls 
            enablePan={false} 
            minDistance={1} 
            maxDistance={4} 
            target={[0, 0.9, 0]} 
            minPolarAngle={Math.PI / 3}
            maxPolarAngle={Math.PI / 1.8}
          />
        </Canvas>
      </ErrorBoundary>
      
      {/* Gloss Overlay */}
      {gloss && !isLoading && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-black/60 backdrop-blur-sm text-white px-4 py-1 rounded-full text-xs font-mono border border-white/20 animate-fade-in z-10">
           {gloss}
        </div>
      )}
    </div>
  );
};

export default ThreeAvatar;