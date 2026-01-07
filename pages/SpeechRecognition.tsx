import React, { useState, useRef } from 'react';
import { Mic, Square, Upload, ArrowLeft, Loader2, Globe } from 'lucide-react';
import ThreeAvatar from '../components/ThreeAvatar';
import { processSpeech } from '../services/geminiService';

interface SpeechRecognitionProps {
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

const SpeechRecognition: React.FC<SpeechRecognitionProps> = ({ onBack, onSuccess }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [gloss, setGloss] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState("Auto");
  const [playTrigger, setPlayTrigger] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const startRecording = async () => {
    try {
      // Reset state to ensure Avatar triggers even if the same phrase is spoken
      setGloss("");
      setTranscript("");

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
      mediaRecorder.onstop = async () => {
        // Use the actual mime type of the recorder, usually audio/webm or audio/ogg
        const mimeType = mediaRecorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        await handleAudioProcessing(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      alert("Microphone access denied. Please check permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleAudioProcessing = async (blob: Blob) => {
    setIsProcessing(true);
    setGloss(""); // Reset gloss to ensure Avatar triggers on new result (crucial for file uploads)

    try {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        // Extract base64 part
        const base64Audio = (reader.result as string).split(',')[1];
        // Ensure we send the correct MIME type to Gemini
        const result = await processSpeech(base64Audio, blob.type, selectedLanguage);
        console.log("Speech Result:", result); // Debugging: Check console to see if gloss is present
        setTranscript(result.text);
        setGloss(result.gloss);
        setPlayTrigger(prev => prev + 1);
        onSuccess();
      };
    } catch (error) {
      console.error(error);
      setTranscript("Error processing audio. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col w-full min-h-screen md:h-full md:items-center md:justify-center md:py-8">
      <div className="w-full md:max-w-6xl md:h-[85vh] md:bg-white md:dark:bg-gray-900 md:rounded-3xl md:shadow-2xl md:overflow-hidden md:border md:border-gray-200 md:dark:border-gray-800 flex flex-col relative bg-white dark:bg-gray-950 transition-all duration-300">
        
        {/* Header */}
        <div className="flex-none flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800 z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md sticky top-0">
          <div className="flex items-center">
            <button 
              onClick={onBack} 
              aria-label="Back to Home"
              className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <ArrowLeft className="w-5 h-5" aria-hidden="true" />
            </button>
            <h1 className="ml-2 text-lg font-bold text-gray-900 dark:text-white hidden sm:inline tracking-tight">Speech to Sign</h1>
          </div>
          <div className="flex items-center space-x-2">
             {/* Language Selector */}
             <div className="flex items-center bg-orange-50 dark:bg-orange-900/20 rounded-lg px-3 py-1.5 border border-orange-100 dark:border-orange-800 hover:border-orange-500/50 transition-colors">
              <Globe className="w-4 h-4 text-orange-600 dark:text-orange-400 mr-2" aria-hidden="true" />
              <label htmlFor="speech-lang" className="sr-only">Input Language</label>
              <select 
                id="speech-lang"
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
                className="bg-transparent text-sm font-medium text-orange-900 dark:text-orange-200 border-none focus:ring-0 cursor-pointer outline-none appearance-none pr-6 w-24 sm:w-32 truncate"
              >
                {LANGUAGES.map(lang => (
                  <option key={lang.code} value={lang.code} className="text-gray-900 bg-white">{lang.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="flex-grow flex flex-col md:flex-row relative overflow-hidden">
          
          {/* Left/Top Panel: Controls & Transcript */}
          <div className="flex flex-col w-full md:w-5/12 border-b md:border-b-0 md:border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 relative z-10">
            
            {/* Top: Controls */}
            <div className="flex-none p-8 md:p-12 border-b border-gray-100 dark:border-gray-800 flex flex-col items-center justify-center space-y-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
                <button
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={isProcessing}
                  aria-label={isRecording ? "Stop Recording" : isProcessing ? "Processing audio..." : "Start Recording"}
                  className={`w-24 h-24 md:w-28 md:h-28 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-offset-4 focus:ring-orange-500 ${
                    isRecording 
                      ? 'bg-red-500 scale-110 ring-8 ring-red-100 dark:ring-red-900/50 animate-pulse' 
                      : 'bg-gradient-to-tr from-orange-500 to-amber-500 hover:scale-105 hover:shadow-orange-500/30'
                  } disabled:opacity-50 disabled:grayscale`}
                >
                  {isProcessing ? <Loader2 className="w-10 h-10 md:w-12 md:h-12 text-white animate-spin" aria-hidden="true"/> : isRecording ? <Square className="w-10 h-10 md:w-12 md:h-12 text-white fill-current" aria-hidden="true"/> : <Mic className="w-10 h-10 md:w-12 md:h-12 text-white" aria-hidden="true"/>}
                </button>
                
                <div className="text-center" aria-live="polite">
                  <p className="text-xl font-bold text-gray-900 dark:text-white mb-2">{isRecording ? "Listening..." : isProcessing ? "Translating..." : "Tap to Speak"}</p>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full inline-block">
                    {selectedLanguage} Input
                  </p>
                </div>
                
                <div className="pt-2">
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={(e) => e.target.files?.[0] && handleAudioProcessing(e.target.files[0])} 
                    accept="audio/*" 
                    className="hidden" 
                    id="audio-upload"
                  />
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="px-5 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 text-xs text-orange-600 dark:text-orange-400 font-bold flex items-center hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <Upload className="w-3.5 h-3.5 mr-2" aria-hidden="true" /> Upload Audio File
                  </button>
                </div>
            </div>

            {/* Bottom: Transcript */}
            <div 
              className="flex-grow p-6 md:p-8 bg-gray-50/50 dark:bg-gray-900/50 min-h-[150px] md:min-h-[200px] overflow-y-auto"
              aria-live="polite"
              aria-atomic="true"
            >
                <h3 className="text-[10px] font-bold text-gray-400 uppercase mb-3 tracking-widest">Live Transcript</h3>
                {isProcessing ? (
                  <div className="flex flex-col items-center justify-center h-full min-h-[100px] space-y-3">
                    <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
                    <p className="text-sm text-gray-500 font-medium animate-pulse">Processing speech...</p>
                  </div>
                ) : transcript ? (
                  <p className="text-xl md:text-2xl text-gray-800 dark:text-gray-200 font-medium leading-relaxed animate-fade-in">{transcript}</p>
                ) : (
                  <div className="flex flex-col items-center justify-center h-40 text-gray-300 dark:text-gray-700">
                    <p className="italic text-center">Spoken text will appear here...</p>
                  </div>
                )}
            </div>
          </div>

          {/* Right/Bottom Panel: Avatar */}
          {/* Expanded height on mobile for better visibility */}
          <div className="flex flex-col w-full md:w-7/12 h-[65vh] md:h-full relative bg-gray-100 dark:bg-black/40 pb-20 md:pb-0 overflow-hidden">
             {/* Decorative Background */}
             <div className="absolute inset-0 bg-gradient-to-b from-orange-50/30 to-amber-50/30 dark:from-gray-900 dark:to-black opacity-50 pointer-events-none"></div>
            
            <div className="flex-grow relative h-full w-full z-0">
              <ThreeAvatar gloss={gloss} triggerAnimation={playTrigger} />
            </div>

            {/* Result Overlay - Ultra Compact for Mobile */}
            <div 
              className={`absolute top-2 right-2 md:top-auto md:bottom-4 md:left-auto md:right-4 max-w-[120px] md:max-w-[200px] w-auto bg-white/60 dark:bg-gray-900/60 backdrop-blur-md p-1.5 md:p-2.5 rounded-lg border border-gray-200/50 dark:border-gray-700/50 shadow-lg z-20 transition-all duration-300 ${gloss ? 'animate-slide-up opacity-100' : 'opacity-0 pointer-events-none'}`}
              aria-live="polite"
              aria-atomic="true"
            >
              {gloss && (
                <>
                  <p className="text-[8px] md:text-[9px] text-gray-600 dark:text-gray-400 uppercase font-bold mb-0.5 tracking-widest">ASL</p>
                  <p className="text-[10px] md:text-xs font-mono font-bold text-orange-700 dark:text-orange-300 leading-tight break-words">{gloss}</p>
                </>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default SpeechRecognition;