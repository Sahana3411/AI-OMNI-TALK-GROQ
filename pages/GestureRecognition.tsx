import React, { useRef, useState, useEffect, useCallback } from 'react';
import { RefreshCw, Volume2, StopCircle, PlayCircle, ArrowLeft, Globe, Settings2, X, Activity, Download, Cloud, Cpu, Info, Check, Zap, Monitor, Scan, Wifi, WifiOff, AlertCircle, Loader2 } from 'lucide-react';
import { RecognitionMode } from '../types';
import { analyzeGesture } from '../services/geminiService';
// @ts-ignore
import { GestureRecognizer, FilesetResolver } from '@mediapipe/tasks-vision';

interface GestureRecognitionProps {
  onBack: () => void;
  onSuccess: () => void;
}

const LANGUAGES = [
  { code: 'Auto', name: 'Auto-Detect' },
  { code: 'English', name: 'English' },
  { code: 'Hindi', name: 'Hindi (हिन्दी)' },
  { code: 'Bengali', name: 'Bengali (বাংলা)' },
  { code: 'Tamil', name: 'Tamil (தமிழ்)' },
  { code: 'Telugu', name: 'Telugu (తెలుగు)' },
  { code: 'Marathi', name: 'Marathi (मराठी)' },
  { code: 'Gujarati', name: 'Gujarati (ગુજરાતી)' },
  { code: 'Kannada', name: 'Kannada (ಕನ್ನಡ)' },
  { code: 'Malayalam', name: 'Malayalam (മലയാളം)' },
  { code: 'Punjabi', name: 'Punjabi (ਪੰਜਾਬੀ)' },
  { code: 'Urdu', name: 'Urdu (اردو)' },
  { code: 'Spanish', name: 'Spanish' },
  { code: 'French', name: 'French' },
  { code: 'Mandarin', name: 'Mandarin' },
  { code: 'Arabic', name: 'Arabic' },
  { code: 'German', name: 'German' },
  { code: 'Japanese', name: 'Japanese' },
];

const RESOLUTIONS = [
  { label: 'High (720p)', width: 1280, height: 720 },
  { label: 'Medium (480p)', width: 640, height: 480 },
  { label: 'Low (240p)', width: 320, height: 240 },
];

const LOCAL_GESTURE_MAP: Record<string, string> = {
  "Thumb_Up": "👍 Thumbs Up(ok)",
  "Thumb_Down": "👎 Thumbs Down(no)",
  "Closed_Fist": "✊ Closed Fist",
  "Open_Palm": "✋ Open Palm",
  "Pointing_Up": "☝️ Pointing Up",
  "Victory": "✌️ Victory",
  "ILoveYou": "🤟 I Love You",
  // Custom Heuristic Gestures
  "Call_Me": "🤙 Call Me",
  "Rock_On": "🤘 Rock On",
  "Okay": "👌 Super",
  "Point_Right": "👉 Point Right",
  "Point_Left": "👈 Point Left",
  "None": "Tracking..."
};

// Helper to calculate distance between two landmarks
const calcDistance = (p1: any, p2: any) => {
  return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
};

// Helper to detect if a finger is curled (Tip is closer to wrist than base)
const isFingerCurled = (landmarks: any[], tipIdx: number, pipIdx: number, wrist: any) => {
  const tip = landmarks[tipIdx];
  const pip = landmarks[pipIdx];
  return calcDistance(tip, wrist) < calcDistance(pip, wrist);
};

export default function GestureRecognition({ onBack, onSuccess }: GestureRecognitionProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  // Logic Refs
  const requestRef = useRef<number>(0);
  const lastVideoTimeRef = useRef<number>(-1);
  const lastProcessedTimeRef = useRef<number>(0);
  
  // Cloud Logic Refs
  const previousFrameRef = useRef<Uint8ClampedArray | null>(null);
  const lastCaptureTimeRef = useRef<number>(0);
  const isMotionDetectedRef = useRef<boolean>(false);
  const stabilityTimerRef = useRef<number>(0);
  
  // Reusable Canvas Refs for performance (Avoid creating new elements in loops)
  const motionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const inferenceCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Local Logic Refs (Smoothing & Segmentation)
  const gestureRecognizerRef = useRef<any>(null);
  const [isModelLoading, setIsModelLoading] = useState(true);
  const [modelError, setModelError] = useState<string | null>(null);
  const gestureHistoryRef = useRef<Array<{category: string, score: number}>>([]); 
  const lastConfirmedGestureRef = useRef<string | null>(null);
  const gestureCooldownRef = useRef<number>(0);
  const usingCpuBackendRef = useRef<boolean>(false);
  const isInitializingRef = useRef(false);

  // State
  const [isActive, setIsActive] = useState(false);
  const [mode, setMode] = useState<RecognitionMode>(RecognitionMode.SENTENCE);
  const [result, setResult] = useState<string>("Waiting for gesture...");
  const [isProcessing, setIsProcessing] = useState(false);
  const [autoCapture, setAutoCapture] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState("Auto");
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  // Modes: 'CLOUD' (Groq) or 'LOCAL' (MediaPipe)
  // Persist preference in localStorage
  const [preferredMode, setPreferredMode] = useState<'CLOUD' | 'LOCAL'>(() => {
    return (localStorage.getItem('gestureMode') as 'CLOUD' | 'LOCAL') || 'LOCAL';
  });

  // Effective mode forces LOCAL if offline
  const effectiveMode = !isOnline ? 'LOCAL' : preferredMode;
  
  // --- Refs for Stale Closures in Loop ---
  const effectiveModeRef = useRef(effectiveMode);
  const autoCaptureRef = useRef(autoCapture);
  const isModelLoadingRef = useRef(isModelLoading);
  const isProcessingRef = useRef(isProcessing);

  useEffect(() => { effectiveModeRef.current = effectiveMode; }, [effectiveMode]);
  useEffect(() => { autoCaptureRef.current = autoCapture; }, [autoCapture]);
  useEffect(() => { isModelLoadingRef.current = isModelLoading; }, [isModelLoading]);
  useEffect(() => { isProcessingRef.current = isProcessing; }, [isProcessing]);

  const [gestureStatus, setGestureStatus] = useState<'IDLE' | 'MOVING' | 'STABLE' | 'CAPTURING' | 'CONFIRMED'>('IDLE');
  
  // Settings
  const [showSettings, setShowSettings] = useState(false);
  // Default to Medium (480p) for better performance on CPU inference devices
  const [resolution, setResolution] = useState(RESOLUTIONS[1]);
  const [stabilityThreshold, setStabilityThreshold] = useState(1000); 

  // Save preference whenever it changes
  useEffect(() => {
    localStorage.setItem('gestureMode', preferredMode);
  }, [preferredMode]);

  // --- 1. Load Offline Model (Robust) ---
  const loadModel = async () => {
    if (isInitializingRef.current || gestureRecognizerRef.current) return;
    isInitializingRef.current = true;
    
    setIsModelLoading(true);
    setModelError(null);
    try {
      // Use version 0.10.18 matching importmap for best stability
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm"
      );
      
      const createRecognizer = async (delegate: "GPU" | "CPU") => {
        return await GestureRecognizer.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
            delegate: delegate
          },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5
        });
      };

      try {
        // Simple check for WebGL support
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) throw new Error("WebGL not supported");

        console.log("Attempting to load Gesture Recognizer with GPU...");
        gestureRecognizerRef.current = await createRecognizer("GPU");
        usingCpuBackendRef.current = false;
        console.log("GPU Delegate initialized successfully");
      } catch (gpuError) {
        console.warn("GPU load failed or not supported, falling back to CPU...", gpuError);
        gestureRecognizerRef.current = await createRecognizer("CPU");
        usingCpuBackendRef.current = true;
        console.log("CPU Delegate initialized");
      }

      setIsModelLoading(false);
      
    } catch (error) {
      console.error("Failed to load offline model", error);
      setModelError("Failed to load gesture model. Check connection.");
      setIsModelLoading(false);
    } finally {
      isInitializingRef.current = false;
    }
  };

  useEffect(() => {
    loadModel();
  }, []);

  const handleRetryModelLoad = () => {
    gestureRecognizerRef.current = null;
    loadModel();
  };

  // --- 2. Network Listener ---
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => {
      setIsOnline(false);
      // Automatically fallback is handled by effectiveMode variable
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // --- 3. Camera Start/Stop ---
  const startCamera = async (width: number, height: number) => {
    stopCamera(); // Clean up previous stream
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
       setResult("Error: Camera API not supported in this browser.");
       return;
    }

    try {
      // Try with preferred constraints first
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'user', 
          width: { ideal: width }, 
          height: { ideal: height },
          frameRate: { ideal: 30 }
        } 
      });
      handleStreamSuccess(stream);
    } catch (err: any) {
      console.warn("Camera with preferences failed, retrying with basic constraints:", err);
      // Fallback: Try basic video constraints
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        handleStreamSuccess(stream);
      } catch (fallbackErr: any) {
        console.error("Error accessing camera:", fallbackErr);
        if (fallbackErr.name === 'NotAllowedError' || fallbackErr.name === 'PermissionDeniedError') {
          setResult("Error: Camera permission denied. Please allow access.");
        } else if (fallbackErr.name === 'NotFoundError' || fallbackErr.name === 'DevicesNotFoundError') {
          setResult("Error: No camera found.");
        } else {
          setResult(`Error: Camera access failed (${fallbackErr.name}).`);
        }
      }
    }
  };

  const handleStreamSuccess = (stream: MediaStream) => {
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.onloadedmetadata = () => {
        videoRef.current?.play()
          .then(() => {
            setIsActive(true);
            if (!requestRef.current) {
              requestRef.current = requestAnimationFrame(processingLoop);
            }
          })
          .catch(e => {
            console.error("Play error", e);
            setResult("Error: Could not start video stream.");
          });
      };
    }
  };

  const stopCamera = () => {
    if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
        requestRef.current = 0;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsActive(false);
  };

  useEffect(() => {
    startCamera(resolution.width, resolution.height);
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  // Restart camera if resolution changes
  useEffect(() => {
    if (isActive) {
      startCamera(resolution.width, resolution.height);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolution]);

  // Mode Switch Logic
  useEffect(() => {
    // Reset state when switching modes
    if (gestureStatus !== 'IDLE') {
        setResult("Waiting for gesture...");
        setGestureStatus('IDLE');
    }
    lastConfirmedGestureRef.current = null;
    gestureHistoryRef.current = [];
    
    if (effectiveMode === 'LOCAL' && isActive) {
      setAutoCapture(true); // Force auto-scan for local mode
    } else {
      setAutoCapture(false);
    }
  }, [effectiveMode, isActive]);

  // --- 4. Main Processing Loop ---
  const processingLoop = (timestamp: number) => {
    if (!videoRef.current) return;
    
    // Continue loop
    requestRef.current = requestAnimationFrame(processingLoop);

    const video = videoRef.current;
    if (video.readyState !== 4) return; // HAVE_ENOUGH_DATA

    // 1. Local Mode Processing
    if (effectiveModeRef.current === 'LOCAL') {
      // Dynamic throttling based on Backend:
      // GPU: 100ms (10 FPS)
      // CPU: 150ms (6-7 FPS) - Much lighter on main thread
      const throttle = usingCpuBackendRef.current ? 150 : 100;
      
      if (timestamp - lastProcessedTimeRef.current > throttle) { 
        // Use refs for logic inside loop
        if (autoCaptureRef.current && !isModelLoadingRef.current && gestureRecognizerRef.current) {
          processLocalFrame();
        }
        lastProcessedTimeRef.current = timestamp;
      }
    } 
    // 2. Cloud Mode Motion Detection
    else if (effectiveModeRef.current === 'CLOUD' && autoCaptureRef.current) {
      if (timestamp - lastProcessedTimeRef.current > 200) {
        processCloudMotion();
        lastProcessedTimeRef.current = timestamp;
      }
    }
  };

  // --- Custom Heuristic Gesture Detection ---
  const detectCustomGestures = (landmarks: any[]) => {
    if (!landmarks) return null;

    const wrist = landmarks[0];
    
    // Finger Status
    const thumbOpen = !isFingerCurled(landmarks, 4, 3, wrist);
    const indexOpen = !isFingerCurled(landmarks, 8, 7, wrist);
    const middleOpen = !isFingerCurled(landmarks, 12, 11, wrist);
    const ringOpen = !isFingerCurled(landmarks, 16, 15, wrist);
    const pinkyOpen = !isFingerCurled(landmarks, 20, 19, wrist);

    // CALL ME: Thumb and Pinky Open, others closed
    if (thumbOpen && pinkyOpen && !indexOpen && !middleOpen && !ringOpen) {
      return "Call_Me";
    }

    // ROCK ON: Index and Pinky Open, others closed (Thumb can be open or closed, usually closed)
    if (indexOpen && pinkyOpen && !middleOpen && !ringOpen) {
      return "Rock_On";
    }

    // OKAY: Thumb tip and Index tip are close, others open
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const pinchDist = calcDistance(thumbTip, indexTip);
    // Normalized distance threshold approx 0.05
    if (pinchDist < 0.06 && middleOpen && ringOpen && pinkyOpen) {
       return "Super";
    }

    // POINTING: Only index open
    if (indexOpen && !middleOpen && !ringOpen && !pinkyOpen) {
      // Check direction using Index Tip vs MCP
      const idxTip = landmarks[8];
      const idxMcp = landmarks[5];
      
      // If tip x is significantly > mcp x (and we are mirrored), it's pointing one way
      if (idxTip.x < idxMcp.x - 0.1) return "Point_Left"; // Mirrored
      if (idxTip.x > idxMcp.x + 0.1) return "Point_Right"; // Mirrored
    }

    return null;
  };

  // --- 5. Local Processing (MediaPipe) ---
  const processLocalFrame = () => {
    const video = videoRef.current;
    if (!video || !gestureRecognizerRef.current) return;

    // Prevent timestamp errors
    if (video.currentTime <= lastVideoTimeRef.current) return;
    lastVideoTimeRef.current = video.currentTime;

    try {
      const nowInMs = Date.now();
      
      // PERFORMANCE OPTIMIZATION: Downscale input for inference
      // If using CPU backend, scale down aggressively to 160x120 for speed
      const targetWidth = usingCpuBackendRef.current ? 160 : 256;
      const targetHeight = usingCpuBackendRef.current ? 120 : 192;

      if (!inferenceCanvasRef.current) {
        inferenceCanvasRef.current = document.createElement('canvas');
      }
      
      // Resize only if needed
      if (inferenceCanvasRef.current.width !== targetWidth) {
         inferenceCanvasRef.current.width = targetWidth;
         inferenceCanvasRef.current.height = targetHeight;
      }

      const infCtx = inferenceCanvasRef.current.getContext('2d', { willReadFrequently: true });
      if (infCtx) {
         infCtx.drawImage(video, 0, 0, inferenceCanvasRef.current.width, inferenceCanvasRef.current.height);
         
         // Measure inference time to detect silent CPU fallback
         const startT = performance.now();
         const results = gestureRecognizerRef.current.recognizeForVideo(inferenceCanvasRef.current, nowInMs);
         const duration = performance.now() - startT;

         // If inference is sluggish (>20ms), force CPU optimization mode even if delegate=GPU
         // This handles cases where XNNPACK delegate is used silently
         if (duration > 20 && !usingCpuBackendRef.current) {
            console.log(`Inference slow (${duration.toFixed(1)}ms). Switching to CPU optimization mode.`);
            usingCpuBackendRef.current = true;
         }

         // Draw Landmarks (uses original video size for proper overlay)
         drawSkeleton(results);

         let currentCategory = "None";
         let currentScore = 0;

         // Extract raw gesture from MediaPipe
         if (results.gestures.length > 0 && results.gestures[0].length > 0) {
           const topGesture = results.gestures[0][0];
           currentCategory = topGesture.categoryName;
           currentScore = topGesture.score;
         }

         // --- CUSTOM GESTURE OVERRIDE ---
         if (results.landmarks && results.landmarks.length > 0) {
           const customGesture = detectCustomGestures(results.landmarks[0]);
           if (customGesture) {
             // Heuristics override model if confident
             currentCategory = customGesture;
             currentScore = 0.9; 
           }
         }

         // --- TEMPORAL SMOOTHING & SEGMENTATION ---
         const HISTORY_SIZE = 8;
         const CONFIRMATION_THRESHOLD = 5; // Need 5/8 frames to agree
         const COOLDOWN_MS = 1000;

         // 1. Update History
         gestureHistoryRef.current.push({ category: currentCategory, score: currentScore });
         if (gestureHistoryRef.current.length > HISTORY_SIZE) {
           gestureHistoryRef.current.shift();
         }

         // 2. Voting
         const counts: Record<string, number> = {};
         gestureHistoryRef.current.forEach(item => {
           counts[item.category] = (counts[item.category] || 0) + 1;
         });

         // Find winner
         let smoothedGesture = "None";
         let maxCount = 0;
         Object.entries(counts).forEach(([cat, count]) => {
           if (count > maxCount) {
             maxCount = count;
             smoothedGesture = cat;
           }
         });

         // 3. Logic State Machine
         const now = Date.now();
         
         // Check if hands are present even if gesture is None
         const handsDetected = results.landmarks && results.landmarks.length > 0;

         if (!handsDetected) {
            if (gestureStatus !== 'IDLE') {
                setResult("Waiting for gesture...\nEnsure hands are in frame.");
                setGestureStatus('IDLE');
            }
            gestureHistoryRef.current = []; // Clear history on idle
            lastConfirmedGestureRef.current = null;
            return;
         }

         // If we have a stable gesture (matches threshold)
         if (smoothedGesture !== 'None' && maxCount >= CONFIRMATION_THRESHOLD) {
            
            // Segmentation: Is this a new gesture or the same one?
            if (smoothedGesture !== lastConfirmedGestureRef.current) {
               
               // Check cooldown (prevents spamming if user holds gesture loosely)
               if (now - gestureCooldownRef.current > COOLDOWN_MS || lastConfirmedGestureRef.current === null) {
                   const displayText = LOCAL_GESTURE_MAP[smoothedGesture] || smoothedGesture;
                   setResult(displayText);
                   setGestureStatus('CONFIRMED');
                   lastConfirmedGestureRef.current = smoothedGesture;
                   gestureCooldownRef.current = now;
                   
                   // Occasional success trigger for analytics
                   if (Math.random() > 0.8) onSuccess();
               }
            } else {
               // Holding the same gesture
               setGestureStatus('STABLE');
            }

         } else {
            // Ambiguous or transitioning
            if (handsDetected) {
               setResult("Tracking Hand...\nHold gesture steady.");
               setGestureStatus('MOVING');
            } else {
               setResult("Waiting for gesture...");
               setGestureStatus('IDLE');
            }
         }
      }

    } catch (e) {
      console.error("MP Error", e);
    }
  };

  const drawSkeleton = (results: any) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!results.landmarks || results.landmarks.length === 0) return;

    // We need to mirror the drawing to match the CSS mirrored video
    ctx.save();
    ctx.scale(-1, 1);
    ctx.translate(-canvas.width, 0);

    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
      [0, 5], [5, 6], [6, 7], [7, 8], // Index
      [0, 9], [9, 10], [10, 11], [11, 12], // Middle
      [0, 13], [13, 14], [14, 15], [15, 16], // Ring
      [0, 17], [17, 18], [18, 19], [19, 20], // Pinky
      [5, 9], [9, 13], [13, 17], [0, 5], [0, 17] // Palm
    ];

    for (const landmarks of results.landmarks) {
      
      // Calculate Bounding Box
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      landmarks.forEach((p: any) => {
          minX = Math.min(minX, p.x * canvas.width);
          minY = Math.min(minY, p.y * canvas.height);
          maxX = Math.max(maxX, p.x * canvas.width);
          maxY = Math.max(maxY, p.y * canvas.height);
      });

      // Optimized Draw Glow around hand - Removed ShadowBlur for performance
      const padding = 20;
      ctx.beginPath();
      ctx.roundRect(minX - padding, minY - padding, (maxX - minX) + padding*2, (maxY - minY) + padding*2, 15);
      
      // Faux glow using thick transparent stroke instead of expensive shadowBlur
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.2)';
      ctx.stroke();
      
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.6)';
      ctx.stroke();

      // Draw Connections
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#00f0ff'; // Cyan

      connections.forEach(([start, end]) => {
        const p1 = landmarks[start];
        const p2 = landmarks[end];
        ctx.beginPath();
        ctx.moveTo(p1.x * canvas.width, p1.y * canvas.height);
        ctx.lineTo(p2.x * canvas.width, p2.y * canvas.height);
        ctx.stroke();
      });

      // Draw Joints
      ctx.fillStyle = '#ffcc00'; // Yellow
      landmarks.forEach((p: any) => {
        ctx.beginPath();
        ctx.arc(p.x * canvas.width, p.y * canvas.height, 4, 0, 2 * Math.PI);
        ctx.fill();
      });
    }

    ctx.restore();
  };

  // --- 6. Cloud Processing (Motion Detection) ---
  const processCloudMotion = () => {
    const video = videoRef.current;
    if (!video) return;

    // Use cached canvas to avoid creating elements in loop
    if (!motionCanvasRef.current) {
        motionCanvasRef.current = document.createElement('canvas');
        motionCanvasRef.current.width = 64; 
        motionCanvasRef.current.height = 48;
    }
    const canvas = motionCanvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

    if (previousFrameRef.current) {
      let diff = 0;
      for (let i = 0; i < data.length; i += 16) {
        if (Math.abs(data[i] - previousFrameRef.current[i]) > 30) diff++;
      }

      if (diff > 5) { // Moving
        isMotionDetectedRef.current = true;
        setGestureStatus('MOVING');
        stabilityTimerRef.current = Date.now();
      } else { // Stable
        const stableDuration = Date.now() - stabilityTimerRef.current;
        if (isMotionDetectedRef.current && stableDuration > stabilityThreshold) {
           // Trigger Capture
           if (!isProcessingRef.current && (Date.now() - lastCaptureTimeRef.current > 3000)) {
               captureAndAnalyze();
               lastCaptureTimeRef.current = Date.now();
               isMotionDetectedRef.current = false;
               setGestureStatus('CAPTURING');
           } else {
               setGestureStatus('STABLE');
           }
        } else if (!isMotionDetectedRef.current) {
           setGestureStatus('IDLE');
        }
      }
    }
    // Store deep copy only if needed, but for diffing we can just keep reference if buffer isn't reused by browser
    // But getImageData returns a new ClampedArray so it's safe to store
    previousFrameRef.current = data;
  };

  const captureAndAnalyze = useCallback(async () => {
    if (!videoRef.current || isProcessingRef.current) return;
    setIsProcessing(true);
    setResult("Analyzing...");

    try {
      const video = videoRef.current;
      
      // Reuse capture canvas
      if (!captureCanvasRef.current) {
          captureCanvasRef.current = document.createElement('canvas');
      }
      const canvas = captureCanvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      
      if (ctx) {
        // Draw the RAW video frame (unmirrored) so Gemini gets the correct orientation
        // Draw the RAW video frame (unmirrored) so AI gets the correct orientation
        // User sees mirrored, but AI should see reality (Right hand = Right hand in image)
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const base64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
        const text = await analyzeGesture(base64, mode, selectedLanguage);
        
        if (text && text.includes("No gesture detected")) {
          setResult("No gesture detected.\nTry improving lighting or moving closer.");
        } else {
          setResult(text);
          if (text) onSuccess();
        }
      }
    } catch (e: any) {
      console.error(e);
      let errorMsg = "Analysis failed. Please ensure good lighting and try again.";
      
      // Determine error type based on message
      if (e.message?.includes("Failed to fetch") || e.message?.includes("NetworkError")) {
          errorMsg = "Connection lost. Please check internet or switch to Local Mode.";
      } else if (e.message?.includes("429")) {
          errorMsg = "Server busy (Rate Limit). Please wait a moment.";
      } else if (e.message?.includes("503") || e.message?.includes("500") || e.message?.includes("Rpc failed")) {
          errorMsg = "Cloud Service unavailable. Try Local Mode or wait.";
      }
      
      setResult(errorMsg);
    } finally {
      setIsProcessing(false);
      setGestureStatus('IDLE');
    }
  }, [mode, selectedLanguage, onSuccess]);


  // Calculate Visual Feedback Classes based on Status
  const getVideoBorderClass = () => {
    if (effectiveMode === 'LOCAL' && modelError) return "ring-4 ring-red-500 border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.5)]";
    if (isProcessing || gestureStatus === 'CAPTURING') return "ring-4 ring-blue-500 shadow-[0_0_50px_rgba(59,130,246,0.5)] border-blue-400";
    if (gestureStatus === 'CONFIRMED') return "ring-4 ring-emerald-500 shadow-[0_0_50px_rgba(16,185,129,0.5)] border-emerald-400";
    if (gestureStatus === 'STABLE') return "ring-2 ring-blue-300 shadow-[0_0_20px_rgba(59,130,246,0.3)] border-blue-300";
    if (gestureStatus === 'MOVING') return "ring-1 ring-orange-300/50 border-orange-300/30";
    return "border-gray-800";
  };
  
  const isErrorResult = result && (result.includes("failed") || result.includes("Error") || result.includes("Connection") || result.includes("Server busy") || result.includes("Service unavailable"));

  const displayResult = result.split('|||')[0];

  return (
    <div className="flex flex-col w-full min-h-screen md:h-full md:items-center md:justify-center md:py-8">
      {/* Main Glass Container */}
      <div className="w-full md:max-w-6xl md:h-[85vh] bg-black/80 md:bg-gray-900/60 backdrop-blur-2xl md:rounded-3xl md:shadow-2xl md:overflow-hidden md:border md:border-white/10 flex flex-col relative transition-all duration-300">
        
        {/* Header Bar - Transparent Glass */}
        <div className="flex items-center justify-between p-4 bg-transparent z-30 sticky top-0 border-b border-white/10">
          <div className="flex items-center">
            <button 
              onClick={onBack} 
              aria-label="Back to Home"
              className="p-2 -ml-2 rounded-full bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white mr-3 transition-all focus:outline-none focus:ring-2 focus:ring-white/50"
            >
              <ArrowLeft className="w-5 h-5" aria-hidden="true" />
            </button>
            <span className="text-white font-bold text-base hidden sm:inline tracking-wide">Gesture Recognition</span>
          </div>
          <div className="flex items-center space-x-2">
            
            {/* Mode Segmented Control */}
            <div className="flex bg-gray-800/80 p-1 rounded-lg border border-gray-700">
              <button
                onClick={() => setPreferredMode('LOCAL')}
                className={`flex items-center px-3 py-1.5 rounded-md text-xs font-bold transition-all focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
                  effectiveMode === 'LOCAL' 
                    ? 'bg-emerald-600 text-white shadow-sm' 
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Cpu className="w-3.5 h-3.5 mr-1.5" /> 
                Local
              </button>
              <button
                onClick={() => isOnline && setPreferredMode('CLOUD')}
                disabled={!isOnline}
                title={!isOnline ? "Requires Internet Connection" : "Groq Cloud AI"}
                className={`flex items-center px-3 py-1.5 rounded-md text-xs font-bold transition-all focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                  effectiveMode === 'CLOUD' 
                    ? 'bg-blue-600 text-white shadow-sm' 
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                } ${!isOnline ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {isOnline ? <Cloud className="w-3.5 h-3.5 mr-1.5" /> : <WifiOff className="w-3.5 h-3.5 mr-1.5" />}
                Cloud
              </button>
            </div>

            {/* Recognition Scope (Cloud only mostly) */}
            <div className={`flex bg-white/10 rounded-lg p-0.5 border border-white/10 ${effectiveMode === 'LOCAL' ? 'opacity-50 pointer-events-none' : ''}`}>
                <button 
                  onClick={() => setMode(RecognitionMode.WORD)}
                  className={`px-2 py-1 text-[10px] font-bold rounded ${mode === RecognitionMode.WORD ? 'bg-gray-800 text-white' : 'text-gray-400'}`}
                >
                  Word
                </button>
                <button 
                  onClick={() => setMode(RecognitionMode.SENTENCE)}
                  className={`px-2 py-1 text-[10px] font-bold rounded ${mode === RecognitionMode.SENTENCE ? 'bg-gray-800 text-white' : 'text-gray-400'}`}
                >
                  Sent.
                </button>
             </div>

            {/* Language Selector */}
            <div className={`hidden sm:block relative group transition-opacity ${effectiveMode === 'LOCAL' ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
              <div className="flex items-center bg-white/5 rounded-lg pl-2 pr-1 py-1.5 border border-white/10 hover:border-blue-500/50 transition-colors">
                <Globe className="w-4 h-4 text-blue-400 mr-2" aria-hidden="true" />
                <select 
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                  className="bg-transparent text-sm text-gray-200 border-none focus:ring-0 cursor-pointer outline-none appearance-none pr-6 font-medium w-24 truncate"
                  disabled={effectiveMode === 'LOCAL'}
                >
                  {LANGUAGES.map(lang => (
                    <option key={lang.code} value={lang.code} className="text-gray-900 bg-white">{lang.name}</option>
                  ))}
                </select>
              </div>
            </div>

             {/* Settings Toggle */}
             <button 
              onClick={() => setShowSettings(true)}
              className="p-2 rounded-lg bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-colors border border-white/10 focus:outline-none focus:ring-2 focus:ring-white/50"
            >
              <Settings2 className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-grow flex flex-col md:flex-row relative overflow-hidden">
          
          {/* Camera Feed */}
          <div className="relative w-full md:w-3/4 h-[50vh] md:h-full bg-black flex items-center justify-center overflow-hidden group">
            
            {/* Scanner Line Animation (Cloud Idle) */}
            {effectiveMode === 'CLOUD' && autoCapture && gestureStatus === 'IDLE' && (
               <div className="absolute inset-0 z-10 opacity-30 pointer-events-none overflow-hidden">
                 <div className="w-full h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent absolute top-0 animate-scan"></div>
               </div>
            )}

            {/* Video Element */}
            <div className={`relative w-full h-full transition-all duration-300 ${getVideoBorderClass()}`}>
                <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    muted 
                    className={`w-full h-full object-cover transform scale-x-[-1] transition-opacity duration-700 ${isActive ? 'opacity-100' : 'opacity-20'}`}
                />
            </div>
            
            {/* Overlay Canvas for Local AI Landmarks */}
            <canvas 
              ref={canvasRef} 
              className="absolute inset-0 w-full h-full pointer-events-none transform scale-x-[-1]" 
            />

            {/* Cloud AI Processing Overlay */}
            {isProcessing && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
                <div className="relative">
                   <div className="w-20 h-20 border-4 border-blue-500/30 rounded-full animate-ping absolute inset-0"></div>
                   <div className="w-20 h-20 border-4 border-t-blue-500 border-r-blue-500 border-b-transparent border-l-transparent rounded-full animate-spin shadow-[0_0_30px_rgba(59,130,246,0.6)]"></div>
                </div>
                <div className="mt-8 bg-blue-500/20 backdrop-blur-md px-6 py-2 rounded-full border border-blue-500/40">
                  <p className="text-blue-100 font-bold tracking-widest text-sm animate-pulse flex items-center">
                    <Cloud className="w-4 h-4 mr-2"/>
                    ANALYZING GESTURE...
                  </p>
                </div>
              </div>
            )}

            {/* --- NEW OVERLAYS FOR LOCAL MODEL --- */}
            {effectiveMode === 'LOCAL' && (
              <>
                {isModelLoading && (
                   <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
                      <div className="relative mb-4">
                        <div className="w-16 h-16 border-4 border-gray-700 rounded-full"></div>
                        <div className="w-16 h-16 border-4 border-emerald-500 rounded-full animate-spin absolute top-0 left-0 border-t-transparent"></div>
                        <Cpu className="w-6 h-6 text-emerald-500 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 animate-pulse" />
                      </div>
                      <h3 className="text-white font-bold text-lg tracking-wide">INITIALIZING AI VISION</h3>
                      <p className="text-gray-400 text-sm mt-2 font-mono">Loading local gesture model...</p>
                   </div>
                )}

                {modelError && (
                   <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/90 backdrop-blur-md p-6 text-center animate-in zoom-in-95 duration-300">
                      <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-4 border border-red-500/30">
                        <AlertCircle className="w-10 h-10 text-red-500" />
                      </div>
                      <h3 className="text-white font-bold text-xl mb-2">Model Load Failed</h3>
                      <p className="text-gray-400 text-sm mb-8 max-w-xs leading-relaxed">
                        {modelError} <br/>
                        Please check your internet connection for the initial download.
                      </p>
                      <button 
                        onClick={handleRetryModelLoad}
                        className="px-8 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-all transform hover:scale-105 shadow-lg shadow-red-600/30 flex items-center gap-2"
                      >
                        <RefreshCw className="w-5 h-5" /> Retry Connection
                      </button>
                   </div>
                )}
              </>
            )}
            
            {/* Status Overlays */}
            <div className="absolute top-4 left-4 z-20 flex flex-col gap-2 pointer-events-none">
              {/* Capture Status */}
              {(autoCapture || isProcessing || isActive) && (
                 <div className={`
                    px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg border backdrop-blur-md flex items-center transition-all duration-300
                    ${effectiveMode === 'LOCAL' && modelError ? 'bg-red-900 border-red-500 text-red-100' :
                      gestureStatus === 'CAPTURING' ? 'bg-green-500 border-green-400 text-white animate-pulse shadow-green-500/50' : 
                      gestureStatus === 'STABLE' ? 'bg-blue-500 border-blue-400 text-white' : 
                      gestureStatus === 'CONFIRMED' ? 'bg-emerald-500 border-emerald-400 text-white scale-110 shadow-emerald-500/50' :
                      gestureStatus === 'MOVING' ? 'bg-orange-500 border-orange-400 text-white' : 
                      'bg-gray-800/80 border-white/10 text-gray-400'}
                 `}>
                   {effectiveMode === 'LOCAL' && modelError ? <AlertCircle className="w-3 h-3 mr-2"/> :
                    gestureStatus === 'CAPTURING' ? <RefreshCw className="w-3 h-3 mr-2 animate-spin"/> :
                    gestureStatus === 'STABLE' ? <Check className="w-3 h-3 mr-2"/> :
                    gestureStatus === 'CONFIRMED' ? <Check className="w-3 h-3 mr-2"/> :
                    gestureStatus === 'MOVING' ? <Activity className="w-3 h-3 mr-2"/> :
                    <Zap className="w-3 h-3 mr-2"/>}
                   
                   {effectiveMode === 'LOCAL' && modelError ? "MODEL ERROR" : gestureStatus}
                 </div>
              )}
            </div>

            {!isActive && <p className="absolute text-gray-500 animate-pulse font-mono text-sm" role="status">INITIALIZING SYSTEM...</p>}
            
            {/* Mobile Bottom Controls Overlay */}
            <div className="absolute bottom-6 left-0 right-0 flex justify-center items-center space-x-6 md:hidden px-4 z-20">
                <button 
                  onClick={() => setAutoCapture(!autoCapture)}
                  aria-label={autoCapture ? "Stop Scan" : "Start Scan"}
                  className={`flex flex-col items-center justify-center transition-all active:scale-95 focus:outline-none focus:ring-4 focus:ring-white/50 rounded-full`}
                >
                  <div className={`p-4 rounded-full shadow-xl border ${autoCapture ? 'bg-blue-600 border-blue-400 text-white' : 'bg-white/10 backdrop-blur-md border-white/20 text-white'}`}>
                      {autoCapture ? <StopCircle className="w-6 h-6"/> : <PlayCircle className="w-6 h-6"/>}
                  </div>
                </button>
                
                {effectiveMode === 'LOCAL' && (
                  <button 
                    onClick={captureAndAnalyze}
                    disabled={isProcessing}
                    className="flex flex-col items-center justify-center transition-all active:scale-95 disabled:opacity-50 disabled:grayscale focus:outline-none focus:ring-4 focus:ring-blue-500 rounded-full"
                  >
                    <div className="p-5 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-600 border border-blue-400 text-white shadow-xl shadow-blue-500/30">
                        {isProcessing ? <RefreshCw className="w-7 h-7 animate-spin"/> : <Cloud className="w-7 h-7"/>}
                    </div>
                  </button>
                )}
            </div>
          </div>

          {/* Results Panel - Semi-Transparent Glass */}
          <div className="flex flex-col w-full md:w-1/4 h-full bg-white/90 dark:bg-gray-900/60 backdrop-blur-xl border-t md:border-t-0 md:border-l border-gray-200 dark:border-white/10 shadow-2xl relative z-10">
            
            {/* Desktop Controls */}
            <div className="hidden md:flex flex-col p-6 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-white/5 space-y-3">
                <button 
                  onClick={() => setAutoCapture(!autoCapture)}
                  className={`w-full py-3 rounded-xl font-bold transition-all shadow-sm flex items-center justify-center text-sm border focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                    autoCapture 
                    ? 'bg-blue-600 border-blue-500 text-white hover:bg-blue-700 shadow-blue-500/20' 
                    : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-800 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-600'
                  }`}
                >
                  {autoCapture ? <><StopCircle className="mr-2 w-4 h-4"/> Stop {effectiveMode === 'CLOUD' ? 'Smart Scan' : 'Live Scan'}</> : <><PlayCircle className="mr-2 w-4 h-4"/> Start {effectiveMode === 'CLOUD' ? 'Smart Scan' : 'Live Scan'}</>}
                </button>
                
                {effectiveMode === 'LOCAL' && (
                  <button 
                    onClick={captureAndAnalyze}
                    disabled={isProcessing}
                    className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl font-bold shadow-lg disabled:opacity-50 flex items-center justify-center text-sm transition-all active:scale-95"
                  >
                    {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin mr-2"/> : <Cloud className="w-4 h-4 mr-2"/>}
                    Manual Capture (Cloud)
                  </button>
                )}
            </div>

            {/* Results Output */}
            <div className="flex-grow p-6 flex flex-col bg-gray-50/80 dark:bg-black/20 overflow-y-auto">
                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${isErrorResult ? 'bg-red-500' : isProcessing || (autoCapture && gestureStatus !== 'IDLE') ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'}`} />
                  {effectiveMode === 'CLOUD' ? (isProcessing ? 'Translating...' : 'Ready') : 'Real-time Inference'}
                </h3>
                
                <div 
                  className={`flex-grow flex items-center justify-center min-h-[120px] bg-white/80 dark:bg-black/40 rounded-2xl border transition-all duration-300 p-4 shadow-inner relative overflow-hidden backdrop-blur-sm ${
                    isErrorResult ? 'border-red-300 ring-2 ring-red-500/20 bg-red-50/80 dark:bg-red-900/10' :
                    gestureStatus === 'CONFIRMED' ? 'border-emerald-500 ring-2 ring-emerald-500/30 bg-emerald-50/80 dark:bg-emerald-900/10' : 
                    'border-gray-100 dark:border-gray-700'
                  }`}
                >
                  {effectiveMode === 'LOCAL' && modelError ? (
                     <div className="flex flex-col items-center gap-2 text-center opacity-50">
                        <p className="text-sm font-bold text-red-600 dark:text-red-400">See error overlay</p>
                     </div>
                  ) : (
                    <>
                      {gestureStatus === 'CONFIRMED' && !isErrorResult && (
                         <div className="absolute inset-0 bg-emerald-500/10 animate-pulse pointer-events-none"></div>
                      )}
                      <p className={`text-xl font-medium text-center leading-snug animate-fade-in relative z-10 ${isErrorResult ? 'text-red-500 dark:text-red-400' : 'text-gray-800 dark:text-gray-100'}`}>
                        {displayResult}
                      </p>
                    </>
                  )}
                </div>
                
                {effectiveMode === 'LOCAL' && !modelError && (
                  <div className="mt-4 p-4 rounded-xl bg-emerald-50/80 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-900/30 text-xs text-emerald-800 dark:text-emerald-200 space-y-2">
                    <div className="font-bold flex items-center"><Info className="w-3.5 h-3.5 mr-2" /> Offline Gestures:</div>
                    <ul className="grid grid-cols-2 gap-2 text-[10px] list-none">
                       <li>👍 Thumbs Up(ok)</li>
                       <li>👎 Thumbs Down/no</li>
                       <li>✊ Closed Fist</li>
                       <li>✋ Open Palm</li>
                       <li>☝️ Pointing Up</li>
                       <li>✌️ Victory</li>
                       <li>🤟 I Love You</li>
                       <li>🤙 Call Me</li>
                       <li>🤘 Rock On</li>
                       <li>👌 Super</li>
                    </ul>
                  </div>
                )}
            </div>

            {/* Bottom Action */}
            <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-white/50 dark:bg-gray-900/50 pb-20 md:pb-4 backdrop-blur-md">
                <button 
                  onClick={() => 'speechSynthesis' in window && window.speechSynthesis.speak(new SpeechSynthesisUtterance(displayResult))}
                  disabled={!result || result.includes("Waiting") || result.includes("Tracking") || isErrorResult || !!modelError}
                  className="w-full flex items-center justify-center p-3.5 bg-gray-100 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-700 dark:text-gray-200 font-bold shadow-sm active:scale-95 transition-transform hover:bg-gray-200 dark:hover:bg-gray-700 text-sm disabled:opacity-50"
                >
                  <Volume2 className="w-4 h-4 mr-2 text-blue-500" />
                  Read Aloud
                </button>
            </div>
          </div>
        </div>

          {/* Settings Modal */}
          {showSettings && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="flex justify-between items-center p-4 border-b border-gray-100 dark:border-gray-700">
                <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Settings2 className="w-4 h-4" /> Camera Config
                </h3>
                <button onClick={() => setShowSettings(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-5 space-y-6">
                <div>
                  <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 block flex items-center">
                    <Monitor className="w-3.5 h-3.5 mr-1.5" /> Resolution
                  </label>
                  <div className="grid grid-cols-1 gap-2">
                    {RESOLUTIONS.map(res => (
                      <button
                        key={res.label}
                        onClick={() => setResolution(res)}
                        className={`flex items-center justify-between px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
                          resolution.label === res.label 
                            ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500 text-blue-600 dark:text-blue-400' 
                            : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                        }`}
                      >
                        {res.label}
                        {resolution.label === res.label && <Check className="w-4 h-4" />}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={effectiveMode === 'LOCAL' ? 'opacity-50 pointer-events-none' : ''}>
                   <div className="flex justify-between items-center mb-3">
                      <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center">
                        <Zap className="w-3.5 h-3.5 mr-1.5" /> Stability Hold Time
                      </label>
                      <span className="text-xs font-mono text-blue-500 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded">
                        {stabilityThreshold}ms
                      </span>
                   </div>
                   <input 
                      type="range" min="500" max="3000" step="250" 
                      value={stabilityThreshold}
                      onChange={(e) => setStabilityThreshold(parseInt(e.target.value))}
                      className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                </div>
              </div>

              <div className="p-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-100 dark:border-gray-700">
                <button 
                  onClick={() => setShowSettings(false)}
                  className="w-full py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl font-bold text-sm"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
