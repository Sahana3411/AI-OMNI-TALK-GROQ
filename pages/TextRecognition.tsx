import React, { useState, useRef } from 'react';
import { Play, Volume2, Image as ImageIcon, ArrowLeft, X, Languages, Upload } from 'lucide-react';
import { RecognitionMode } from '../types';
import { processTextForAvatar } from '../services/geminiService';
import ThreeAvatar from '../components/ThreeAvatar';

interface TextRecognitionProps {
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

const TextRecognition: React.FC<TextRecognitionProps> = ({ onBack, onSuccess }) => {
  const [inputText, setInputText] = useState('');
  const [mode, setMode] = useState<RecognitionMode>(RecognitionMode.SENTENCE);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [resultGloss, setResultGloss] = useState<string>('');
  const [selectedLanguage, setSelectedLanguage] = useState("Auto");
  const [playTrigger, setPlayTrigger] = useState(0); // Trigger to replay animation
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleProcess = async () => {
    if ((!inputText && !uploadedImage) || isProcessing) return;
    setIsProcessing(true);
    try {
      const cleanBase64 = uploadedImage ? uploadedImage.split(',')[1] : null;
      const { original, gloss } = await processTextForAvatar(inputText, cleanBase64, mode, selectedLanguage);
      if (uploadedImage) setInputText(original);
      setResultGloss(gloss);
      setPlayTrigger(prev => prev + 1); // Increment trigger to force re-render
      onSuccess();
    } catch (error) {
      alert("Processing failed. Try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setUploadedImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="flex flex-col w-full min-h-screen md:h-full md:items-center md:justify-center md:py-8">
      <div className="w-full md:max-w-6xl md:h-[85vh] md:bg-white md:dark:bg-gray-900 md:rounded-3xl md:shadow-2xl md:overflow-hidden md:border md:border-gray-200 md:dark:border-gray-800 flex flex-col relative bg-white dark:bg-gray-950 transition-all duration-300">
        
        {/* Header */}
        <div className="flex-none flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md z-20 sticky top-0">
          <div className="flex items-center">
            <button 
              onClick={onBack} 
              aria-label="Back to Home"
              className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <ArrowLeft className="w-5 h-5" aria-hidden="true" />
            </button>
            <h1 className="ml-2 text-lg font-bold text-gray-900 dark:text-white hidden sm:inline tracking-tight">Text to Sign</h1>
          </div>
          
          <div className="flex items-center space-x-3">
             {/* Language Selector */}
             <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg px-2 py-1.5 border border-gray-200 dark:border-gray-700 hover:border-emerald-500/50 transition-colors">
              <Languages className="w-4 h-4 text-emerald-500 mr-2" aria-hidden="true" />
              <label htmlFor="text-lang" className="sr-only">Input Language</label>
              <select 
                id="text-lang"
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
                className="bg-transparent text-sm font-medium text-gray-700 dark:text-gray-200 border-none focus:ring-0 cursor-pointer outline-none appearance-none pr-6 w-24 sm:w-32 truncate"
              >
                {LANGUAGES.map(lang => (
                  <option key={lang.code} value={lang.code} className="text-gray-900 bg-white">{lang.name}</option>
                ))}
              </select>
            </div>

             <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1" role="radiogroup" aria-label="Processing Mode">
                <button 
                  onClick={() => {
                    setMode(RecognitionMode.WORD);
                    // Truncate to single word if switching to Word mode
                    if (inputText.trim().includes(' ')) {
                      setInputText(inputText.trim().split(/\s+/)[0]);
                    }
                  }}
                  role="radio"
                  aria-checked={mode === RecognitionMode.WORD}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500 ${mode === RecognitionMode.WORD ? 'bg-white dark:bg-gray-700 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-gray-400'}`}
                >
                  Word
                </button>
                <button 
                  onClick={() => setMode(RecognitionMode.SENTENCE)}
                  role="radio"
                  aria-checked={mode === RecognitionMode.SENTENCE}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500 ${mode === RecognitionMode.SENTENCE ? 'bg-white dark:bg-gray-700 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-gray-400'}`}
                >
                  Sentence
                </button>
             </div>
          </div>
        </div>

        <div className="flex-grow flex flex-col md:flex-row relative overflow-hidden">
          
          {/* Input Panel (Top on Mobile, Left on Desktop) */}
          <div className="flex flex-col w-full md:w-5/12 border-b md:border-b-0 md:border-r border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 z-10">
            
            {/* Toolbar */}
            <div className="flex items-center p-3 px-4 gap-3 border-b border-gray-100 dark:border-gray-800/50">
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleImageUpload} 
                  accept="image/*" 
                  className="hidden" 
                  id="image-upload"
                  aria-label="Upload image containing text"
                />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex-1 py-2 px-3 rounded-lg transition-all flex items-center justify-center space-x-2 text-xs font-bold uppercase tracking-wide border border-dashed focus:outline-none focus:ring-2 focus:ring-emerald-500 ${uploadedImage ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-500 hover:bg-gray-50'}`}
                >
                  <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{uploadedImage ? "Replace Image" : "Upload Image"}</span>
                </button>
                
                {uploadedImage && (
                  <div className="relative group shrink-0">
                    <img src={uploadedImage} alt="Uploaded text preview" className="h-9 w-9 object-cover rounded-lg border border-gray-300 dark:border-gray-600 shadow-sm" />
                    <button 
                      onClick={() => setUploadedImage(null)} 
                      aria-label="Remove uploaded image"
                      className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 shadow-md hover:bg-red-600 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
                    >
                      <X className="w-3 h-3" aria-hidden="true" />
                    </button>
                  </div>
                )}
            </div>

            {/* Text Input Area */}
            <div className="flex-grow p-4 md:p-6 min-h-[150px] md:min-h-[200px]">
              <label htmlFor="text-input" className="sr-only">Type text to convert to sign language</label>
              <textarea
                id="text-input"
                value={inputText}
                onChange={(e) => {
                  const val = e.target.value;
                  if (mode === RecognitionMode.WORD) {
                    // Enforce single word: take first part if space is typed
                    const clean = val.replace(/[\n\r]/g, '');
                    setInputText(clean.split(' ')[0]);
                  } else {
                    setInputText(val);
                  }
                }}
                placeholder={`Type here in ${selectedLanguage === 'Auto' ? 'any language' : selectedLanguage}...`}
                className="w-full h-full bg-transparent border-none resize-none outline-none text-lg md:text-xl text-gray-800 dark:text-gray-100 placeholder-gray-400 font-medium focus:ring-0"
              />
            </div>

            {/* Action Buttons */}
            <div className="p-4 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 flex gap-3 sticky bottom-0 z-10 shadow-[0_-5px_15px_rgba(0,0,0,0.02)]">
                <button 
                  onClick={handleProcess}
                  disabled={isProcessing || (!inputText && !uploadedImage)}
                  className="flex-1 py-3.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-xl font-bold shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:shadow-none transition-all active:scale-95 flex items-center justify-center text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                >
                  {isProcessing ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true"/> : <><Play className="w-5 h-5 mr-2 fill-current" aria-hidden="true"/> Process & Sign</>}
                </button>
                <button 
                  onClick={() => {
                    if ('speechSynthesis' in window && inputText) window.speechSynthesis.speak(new SpeechSynthesisUtterance(inputText));
                  }}
                  disabled={!inputText}
                  aria-label="Read text aloud"
                  className="p-3.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400"
                >
                  <Volume2 className="w-5 h-5" aria-hidden="true" />
                </button>
            </div>
          </div>

          {/* Output Avatar Panel (Bottom on Mobile, Right on Desktop) */}
          {/* Expanded height on mobile for better visibility */}
          <div className="flex flex-col w-full md:w-7/12 h-[65vh] md:h-full relative bg-gray-100 dark:bg-black/40 pb-20 md:pb-0 overflow-hidden">
             {/* Decorative Background */}
             <div className="absolute inset-0 bg-gradient-to-b from-gray-200/50 to-gray-300/50 dark:from-gray-900 dark:to-black opacity-50 pointer-events-none"></div>

            <div className="flex-grow relative h-full w-full z-0">
                <ThreeAvatar gloss={resultGloss} triggerAnimation={playTrigger} />
            </div>

            {/* Result Overlay - Ultra Compact for Mobile */}
            <div 
              className={`absolute top-2 right-2 md:top-auto md:bottom-4 md:left-auto md:right-4 max-w-[120px] md:max-w-[200px] w-auto bg-white/60 dark:bg-gray-900/60 backdrop-blur-md p-1.5 md:p-2.5 rounded-lg border border-gray-200/50 dark:border-gray-700/50 shadow-lg z-20 transition-all duration-300 ${resultGloss ? 'animate-fade-in opacity-100' : 'opacity-0 pointer-events-none'}`}
              aria-live="polite"
              aria-atomic="true"
            >
              {resultGloss && (
                <>
                  <div className="flex justify-between items-center mb-0.5 gap-1">
                    <p className="text-[8px] md:text-[9px] text-gray-600 dark:text-gray-400 uppercase font-bold tracking-widest">ASL</p>
                    <button 
                      className="p-0.5 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-full transition-colors focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      aria-label="Speak translation"
                      onClick={() => 'speechSynthesis' in window && window.speechSynthesis.speak(new SpeechSynthesisUtterance(resultGloss))}
                    >
                       <Volume2 className="w-2.5 h-2.5 md:w-3 md:h-3 text-emerald-600 dark:text-emerald-400 cursor-pointer" aria-hidden="true" />
                    </button>
                  </div>
                  <p className="text-[10px] md:text-xs font-mono font-bold text-emerald-700 dark:text-emerald-300 leading-tight tracking-tight break-words">{resultGloss}</p>
                </>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default TextRecognition;