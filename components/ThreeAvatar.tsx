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

  LeftHandThumb1: ['LeftHandThumb1', 'Thumb_01_L', 'mixamorigLeftHandThumb1'],
  LeftHandIndex1: ['LeftHandIndex1', 'Index_01_L', 'mixamorigLeftHandIndex1'],
  LeftHandMiddle1: ['LeftHandMiddle1', 'Middle_01_L', 'mixamorigLeftHandMiddle1'],
  LeftHandRing1: ['LeftHandRing1', 'Ring_01_L', 'mixamorigLeftHandRing1'],
  LeftHandPinky1: ['LeftHandPinky1', 'Pinky_01_L', 'mixamorigLeftHandPinky1'],
};

// Hand Shapes
const FINGER_SHAPES = {
  OPEN: { thumb: -0.5, index: 0, middle: 0, ring: 0, pinky: 0 },
  FIST: { thumb: 0, index: 2.3, middle: 2.3, ring: 2.3, pinky: 2.3 },
  POINT: { thumb: 1.0, index: 0, middle: 1.5, ring: 1.5, pinky: 1.5 },
  FLAT: { thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 },
  PINCH: { thumb: 0.7, index: 0.0, middle: 2.5, ring: 2.5, pinky: 2.5 },
};

// --- GESTURE LIBRARY ---
// Calibrated for Standard GLB / Ready Player Me T-Pose
const POSE_LIBRARY: Record<string, any> = {
  // 1. HELLO: Handled dynamically by createCalibratedHello, but keeping fallback here
  "HELLO": {
    RightArm: [-0.6, 0.0, 0.0],
    RightForeArm: [-0.7, 0.60, -1.0],
    RightHand: [-0.6, 0.6, 0.0],
    wave: true
  },
  "HI": { link: "HELLO" },
  "HEY": { link: "HELLO" },
  "BYE": { link: "HELLO" },

  // 2. THANKS: Hand to Chin
  "THANKS": {
    RightArm: [1.10, -0.2, -0.3],        // Arm down (elbow down)
    RightForeArm: [2.4, 0.9, -0.8],    // Bent up and towards left (chin)
    RightHand: [0.0, -0.9, 0.0],       // Palm to side
    LeftArm: [1.30, 0, 0],         // Keep left arm down (using new idle)
    fingers: FINGER_SHAPES.OPEN,
    animation: "chin_to_front"
  },
  "THANK": { link: "THANKS" },
  "GOOD": { link: "THANKS" },

  // 3. PLEASE: Rub chest
  "PLEASE": {
    RightArm: [1.5, 0, -0.1],       // Lower, close to body
    RightForeArm: [2.7, 0.5, -1],
    RightHand: [0.0, -2.1, 0],   // Bend up to chest
    LeftArm: [1.30, 0, 0],         // Keep left arm down
    fingers: FINGER_SHAPES.OPEN,
    animation: "rub_chest"
  },

  // 4. YES: Fist Front
  "YES": {
    RightArm: [1.3, 0, 0.8],       // Elbow front
    RightForeArm: [-2.4, 0.60, -1.0],
    RightHand: [-2.5, 0.6, 0.0],  // Hand up
    LeftArm: [1.30, 0, 0],         // Keep left arm down
    fingers: FINGER_SHAPES.FIST,
    animation: "nod_wrist"
  },

  // 5. NO: Snap Front
  "NO": {
    RightArm: [1.3, 0, 0.8],       // Elbow front
    RightForeArm: [-1.8, 0.70, -1.1],
    RightHand: [-1, 0.1, 0.0],  // Hand up
    LeftArm: [1.30, 1, 0],
    LeftForeArm: [0.9, 0.20, 0.8],
    fingers: FINGER_SHAPES.PINCH,
    animation: "shake_hand"
  },

  "YOU": {
    // Arm slightly forward
    RightArm: [0.4, 0.0, 0.0],

    // Elbow bent so hand comes forward
    RightForeArm: [0.0, 0.0, -1.7],

    // Fingers: only index open
    fingers: FINGER_SHAPES.POINT
  },

  "EAT": {
    RightArm: [1.5, 0, -0.1],       // Lower, close to body
    RightForeArm: [-2.4, 0.98, -1.3],
    RightHand: [0.0, 1.95, 0],
    fingers: FINGER_SHAPES.PINCH,
    animation: "mouth_tap"
  },

  "DRINK": {
    RightArm: [1.3, 0, -0.7],       // Lower, close to body
    RightForeArm: [-2.5, 0.3, -1.1],
    RightHand: [0.2, 0.9, 0],
    fingers: FINGER_SHAPES.FIST,
    animation: "tilt_drink"
  },
  "WHY": {
    RightArm: [1.10, -0.2, -0.3],
    RightForeArm: [-0.8, 0.5, -0.8],
    RightHand: [0.4, 1.4, -0.5],
    fingers: FINGER_SHAPES.OPEN,
    animation: "shake_hand"
  },
  "ME": {
    RightArm: [1.2, 0, 0],
    RightForeArm: [2.7, 0.5, -0.8],
    RightHand: [0.5, -1.5, 1],
    fingers: FINGER_SHAPES.FLAT,
    animation: "tap_chest"
  },
  "MY": { link: "ME" },

  "WE": {
    RightArm: [0.6, 0.2, 0.2],
    RightForeArm: [-0.6, 0.4, -1.4],
    RightHand: [0, 0.3, 0],
    fingers: FINGER_SHAPES.OPEN,
    animation: "sweep_front"
  },
  "OK": {
    RightArm: [0.4, 0, 0],
    RightForeArm: [-1.2, 0.2, -1.3],
    fingers: {
      thumb: 0.7,
      index: 0.7,
      middle: 2.5,
      ring: 2.5,
      pinky: 2.5
    }
  },
  "LOVE": {
    RightArm: [1.3, 0, 0],
    RightForeArm: [2.6, 0.6, -1.3],
    LeftArm: [1.3, 0, 0],
    LeftForeArm: [2.6, -0.6, 1.3],
    fingers: FINGER_SHAPES.FIST
  },

  "HAPPY": {
    RightArm: [0.9, 0, 0],
    RightForeArm: [-1.2, 0.4, -1.3],
    RightHand: [-1, 0.1, 0.0],
    LeftArm: [0.9, 0, 0],
    LeftForeArm: [-1.2, -0.4, 1.3],
    LeftHand: [-1, -0.1, 0.0],
    fingers: FINGER_SHAPES.OPEN,
    animation: "circular_chest"
  },
  "HOW": {
    RightArm: [1.10, -0.2, -0.3],
    RightForeArm: [-0.8, 0.5, -0.8],
    RightHand: [0.4, 1.4, -0.5],

    fingers: FINGER_SHAPES.OPEN,
    animation: "question_shake"
  },
  "ARE": {
    RightArm: [1.10, -0.2, -0.3],
    RightForeArm: [-0.8, 0.5, -0.8],
    fingers: FINGER_SHAPES.OPEN,
    animation: "small_forward"
  },

"MORNING": {
  RightArm: [1.4, 0, 0],
  RightForeArm: [-2.4, 0.6, -1.2],
  RightHand: [0, 0, 0],
  fingers: FINGER_SHAPES.FIST,
  animation: "morning_sun"
},
"NIGHT": {
  RightArm: [1.2, -0.3, -0.4],
  RightForeArm: [-1.6, 0.4, -1.0],
  RightHand: [0, 0, 0],
  LeftArm: [1.2, 0, 0],
  LeftForeArm: [0, 0, 0],
  Head: [-1.0, 0.0, -0.18],
  fingers: FINGER_SHAPES.FLAT,
  animation: "night_fall"
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

// --- AVATAR MODEL COMPONENT ---

const AvatarModel = ({ url, gloss, triggerAnimation, onLoad }: { url: string, gloss: string, triggerAnimation?: number, onLoad?: () => void }) => {
  const { scene } = useGLTF(url);
  const { nodes } = useGraph(scene);
  const lastTriggerTime = useRef(0);
  const prevTriggerVal = useRef(triggerAnimation);

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
    const upperGloss = gloss?.toUpperCase() || "";

    // Split gloss into words for sequential playback
    const words = upperGloss.split(/\s+/).filter(w => w.length > 0);
    const WORD_DURATION = 2.5; // Seconds per word

    // Determine which word is active based on time
    const activeWordIndex = Math.floor(timeSinceTrigger / WORD_DURATION);
    const isAnimating = activeWordIndex < words.length && timeSinceTrigger >= 0;

    // Determine Target Pose for standard library
    let target = POSE_LIBRARY["IDLE"];
    let activeKey: string | undefined;

    if (isAnimating) {
      const currentWord = words[activeWordIndex];
      // Find key: Exact match or contained within word
      activeKey = Object.keys(POSE_LIBRARY).find(k => k !== "IDLE" && (currentWord === k || currentWord.includes(k) || k.includes(currentWord)));

      if (activeKey && POSE_LIBRARY[activeKey].link) {
        activeKey = POSE_LIBRARY[activeKey].link;
      }
      if (activeKey) target = POSE_LIBRARY[activeKey];
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
    rotateBone('RightArm', target.RightArm || POSE_LIBRARY.IDLE.RightArm);
    rotateBone('RightForeArm', target.RightForeArm || POSE_LIBRARY.IDLE.RightForeArm);
    rotateBone('RightHand', target.RightHand || POSE_LIBRARY.IDLE.RightHand || [0, 0, 0]);

    rotateBone('LeftArm', target.LeftArm || POSE_LIBRARY.IDLE.LeftArm);
    rotateBone('LeftForeArm', target.LeftForeArm || POSE_LIBRARY.IDLE.LeftForeArm);
    rotateBone('LeftHand', target.LeftHand || POSE_LIBRARY.IDLE.LeftHand || [0, 0, 0]);

    // 3. Fingers (Both Hands)
    const shapes = target.fingers || FINGER_SHAPES.OPEN;
    ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'].forEach(finger => {
      const curl = shapes[finger.toLowerCase()] || 0;

      const isThumb = finger === 'Thumb';

      // Right Hand
      const rKey = `RightHand${finger}1`;
      if (bones[rKey]) {
        if (isThumb) {
          bones[rKey]!.rotation.z = THREE.MathUtils.lerp(bones[rKey]!.rotation.z, curl, lerpSpeed);
        } else {
          bones[rKey]!.rotation.x = THREE.MathUtils.lerp(bones[rKey]!.rotation.x, curl, lerpSpeed);
          bones[rKey]!.rotation.z = THREE.MathUtils.lerp(bones[rKey]!.rotation.z, 0, lerpSpeed);
        }
      }

      // Left Hand (Mirrored: usually requires negative Z for curl)
      const lKey = `LeftHand${finger}1`;
      if (bones[lKey]) {
        if (isThumb) {
          bones[lKey]!.rotation.z = THREE.MathUtils.lerp(bones[lKey]!.rotation.z, curl, lerpSpeed);
        } else {
          bones[lKey]!.rotation.x = THREE.MathUtils.lerp(bones[lKey]!.rotation.x, curl, lerpSpeed);
          bones[lKey]!.rotation.z = THREE.MathUtils.lerp(bones[lKey]!.rotation.z, 0, lerpSpeed);
        }
      }
    });

    // --- PROCEDURAL ANIMATIONS (Only if Active Gesture AND within time window) ---
    if (activeKey && isAnimating) {
      const t = timeSinceTrigger % WORD_DURATION; // Local time for this specific word

      // Wave (Standard fallback)
      if (target.wave && bones.RightForeArm) {
        bones.RightForeArm.rotation.x += Math.sin(t * 9) * 0.2;
      }

      // Chin to Front (Thanks)
      if (target.animation === "chin_to_front" && bones.RightForeArm) {
        const progress = Math.min(t * 1, 1);
        bones.RightForeArm.rotation.y += Math.sin(progress * Math.PI) * (Math.PI / -16);
      }

      // Rub Chest (Please)
      if (target.animation === "rub_chest" && bones.RightHand) {
        bones.RightHand.rotation.z -= Math.sin(t * 8) * 0.1;
      }

      // Nod Wrist (Yes)
      if (target.animation === "nod_wrist" && bones.RightHand) {
        bones.RightHand.rotation.x = Math.sin(t * 8) * 0.5;
      }

      // Shake Hand (No)
      if (target.animation === "shake_hand" && bones.RightHand) {
        bones.RightHand.rotation.z -= Math.sin(t * 10) * 0.3;
      }
      // ---------------- EAT ----------------
      if (target.animation === "mouth_tap" && bones.RightHand) {
        bones.RightHand.rotation.x += Math.sin(t * 7) * 0.25;
      }

      // ---------------- DRINK ----------------
      if (target.animation === "tilt_drink" && bones.RightForeArm) {
        bones.RightForeArm.rotation.y += Math.sin(t * 4) * 0.1;
      }
      // ---------------- HAPPY ----------------
      if (target.animation === "circular_chest" && bones.RightHand && bones.LeftHand) {
        bones.RightHand.rotation.z += Math.sin(t * 5) * 0.2;
        bones.LeftHand.rotation.z -= Math.sin(t * 5) * 0.2;
      }

      // ---------------- WHY ----------------
      if (target.animation === "question_shake" && bones.RightHand) {
        bones.RightHand.rotation.z += Math.sin(t * 12) * 0.25;
      }
      // ---------- GOOD (chin → forward) ----------
  if (target.animation === "good_chin" && bones.RightHand) {
    bones.RightHand.rotation.x -= Math.sin(t * 4) * 0.25;
  }

  // ---------- MORNING (sun rising from elbow) ----------
  if (target.animation === "morning_sun" && bones.RightForeArm) {
    bones.RightForeArm.rotation.x += Math.sin(t * 3) * 0.4;
  }

  // ---------- NIGHT (sun setting downward) ----------
  if (
    target.animation === "night_fall" &&
    bones.RightHand &&
    bones.LeftForeArm
  ) {
    bones.RightHand.rotation.x += Math.sin(t * 3) * 0.25;
  }
      // ---------- HOW ----------
      if (target.animation === "question_shake" && bones.RightHand) {
        bones.RightHand.rotation.x -= Math.sin(t * 5) * 0.1;
      }

      // ---------- ARE ----------
      if (target.animation === "small_forward" && bones.RightForeArm) {
        bones.RightForeArm.rotation.x += Math.sin(t * 5) * 0.15;
      }
      // ---------------- ME / MY ----------------
  if (target.animation === "tap_chest" && bones.RightHand) {
    bones.RightHand.rotation.y += Math.sin(t * 8) * 0.1;
  }

  // ---------------- WE ----------------
  if (target.animation === "sweep_front" && bones.RightForeArm) {
    bones.RightForeArm.rotation.z += Math.sin(t * 2) * 0.25;
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