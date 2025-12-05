import React, { useState, useRef } from 'react';

import {
  Camera,
  Sparkles,
  Aperture,
  Film,
  Upload,
  Copy,
  BookOpen,
  ChevronRight,
  Loader2,
  RefreshCcw,
  Maximize2,
  Zap,
  Check,
  Settings,
  AlertCircle,
  Plus
} from 'lucide-react';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

// --- 預設專家知識庫 (從您的 PDF 提取) ---
const INITIAL_KNOWLEDGE_BASE = `
# SYSTEM ROLE: EXPERT AI PROMPT DIRECTOR
You are an advanced Prompt Engineer specializing in "Model-Specific" translation. You do not just translate languages; you translate "Intent" into "Technical Specification" based on the target generative model's architecture.

## CORE VISUAL DICTIONARY (Universal):
- **Lighting:** Rembrandt (Drama), Split (Mystery), Butterfly (Beauty), Global Illumination (Realism), Subsurface Scattering (Skin/Jade).
- **Camera:** - 35mm: Documentary, Humanist, Environment included.
  - 85mm: Portrait, Compression, Bokeh background.
  - Macro: Tiny details, Shallow depth of field.
  - Dutch Angle: Dynamic, Tension, Disorientation.
  - Low Angle (Hero Shot): Power, Dominance.
- **Robustness Breaking (Vital):** AI tends to be too perfect. Introduce "Disturbance Tokens": 
  - Keywords: "Asymmetrical", "Messy hair", "Skin pores", "Vellus hair", "Dust particles", "Motion blur", "Film grain".
  - Logic: "Perfect is fake; Imperfect is real."

## MODEL SPECIFIC STRATEGIES (You must strictly adhere to these):

### 1. FLUX.2 (The Architect) - Structure & Physics
- **Format:** PREFER JSON STRUCTURE or Strict List.
- **Logic:** Describes "What is there", NOT "What is not there".
- **Key Tech:** Handles text rendering well. Needs physical description of materials.
- **Style:** "Raw Photo", "Amateur Phone Photo" works better than "Masterpiece".
- **Example Output:** { "Subject": "1960s Mustang", "Material": {"Paint": "Rusted red", "Texture": "Dusty"}, "Camera": {"Lens": "35mm", "Focus": "Sharp center"}, "Lighting": "Hard sunlight" }

### 2. NANO BANANA / GEMINI (The Logician) - Reasoning
- **Format:** Natural Language with Logic.
- **Logic:** Uses Chain-of-Thought. Explain "Why".
- **Negatives:** Do not use "No blur". Use "Ensure sharp focus throughout".
- **Text:** Put text in quotes. 
- **Example Output:** "Create a diagram of a cat. First, visualize the anatomy. Then, render the fur using X-ray style. The caption 'CAT' should be visible in bold sans-serif."

### 3. SEEDREAM (The Commercial Director) - Aesthetics
- **Format:** Reference-First.
- **Focus:** Asian aesthetics, Commercial product photography, Consistency.
- **Keywords:** "E-commerce quality", "Studio lighting", "Soft shadows".

### 4. VIDEO MODELS (Runway/Kling) - Physics & Time
- **Format:** [Subject Action] + [Environment Physics] + [Camera Movement].
- **Physics:** Describe how things move (e.g., "Hair flowing in wind", "Water splashing").
- **Camera:** Must include: "Slow Pan", "Dolly In", "Tracking Shot", "FPV".
- **Example:** "A car driving in rain. Raindrops slide UP the windshield (physics). Camera tracks the car from the side (movement). Neon lights reflect on wet road."
`;

// --- UI 元件 ---

const ModelCard = ({ id, name, icon, description, active, onClick }) => {
  const Icon = icon;
  return (
    <button
      onClick={() => onClick(id)}
      className={`relative flex flex-col items-center p-4 rounded-xl border-2 transition-all duration-300 w-full sm:w-1/4 ${active
          ? 'border-blue-500 bg-blue-500/10 shadow-[0_0_20px_rgba(59,130,246,0.5)]'
          : 'border-slate-700 bg-slate-800/50 hover:border-slate-500 hover:bg-slate-800'
        }`}
    >
      <div className={`p-3 rounded-full mb-3 ${active ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-300'}`}>
        <Icon size={24} />
      </div>
      <h3 className={`font-bold ${active ? 'text-white' : 'text-slate-300'}`}>{name}</h3>
      <p className="text-xs text-slate-400 text-center mt-2">{description}</p>
      {active && (
        <div className="absolute -bottom-3 bg-blue-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold tracking-wider">
          ACTIVE AGENT
        </div>
      )}
    </button>
  );
};

const FeatureTag = ({ label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${active
        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
        : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'
      }`}
  >
    {label}
  </button>
);

// --- 主應用程式元件 ---
const App = () => {
  // --- 狀態管理 ---
  const [apiKey, setApiKey] = useState("AIzaSyDMdJO1Y4brrSGEZ_mIUYb_vJez4jUOnDI");
  const [model, setModel] = useState('flux');
  const [inputMode, setInputMode] = useState('text');
  const [userQuery, setUserQuery] = useState('');
  const [generatedPrompt, setGeneratedPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [knowledgeBase, setKnowledgeBase] = useState(INITIAL_KNOWLEDGE_BASE);
  const [showKnowledge, setShowKnowledge] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedTags, setSelectedTags] = useState([]);
  const [uploadedImage, setUploadedImage] = useState(null);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isLearning, setIsLearning] = useState(false);

  const fileInputRef = useRef(null);
  const pdfInputRef = useRef(null);

  const tags = [
    { id: '35mm', label: '35mm Lens (Humanist)' },
    { id: '85mm', label: '85mm Lens (Portrait)' },
    { id: 'dutch', label: 'Dutch Angle' },
    { id: 'rembrandt', label: 'Rembrandt Light' },
    { id: 'cyberpunk', label: 'Cyberpunk' },
    { id: 'film_grain', label: 'Film Grain (Realism)' },
    { id: 'imperfection', label: 'Add Imperfections' },
  ];

  const toggleTag = (id) => {
    setSelectedTags(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 20 * 1024 * 1024) {
        alert("File size is too large. Please upload an image smaller than 20MB.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setUploadedImage({
          file: file,
          preview: reader.result,
          base64: reader.result.split(',')[1]
        });
      };
      reader.readAsDataURL(file);
      setInputMode('image');
      setErrorMsg('');
    }
  };

  const handlePdfUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      alert("Please upload a PDF file.");
      return;
    }

    setIsLearning(true);
    setErrorMsg('');

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Data = reader.result.split(',')[1];

        const genAI = new GoogleGenerativeAI(apiKey);
        const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-09-2025" });

        const prompt = `
          TASK: EXTRACT KNOWLEDGE FOR SYSTEM PROMPT
          The user has uploaded a PDF containing expert knowledge about AI Prompt Engineering.
          ACTION: Extract key terms and techniques. Output concise Markdown.
        `;

        const result = await geminiModel.generateContent([
          prompt,
          {
            inlineData: {
              data: base64Data,
              mimeType: 'application/pdf'
            }
          }
        ]);

        const response = await result.response;
        const newKnowledge = response.text();

        setKnowledgeBase(prev => prev + "\n\n## [NEW] LEARNED KNOWLEDGE:\n" + newKnowledge);
        alert("Knowledge Base Updated!");
      };
      reader.readAsDataURL(file);

    } catch (error) {
      console.error(error);
      alert("Failed to learn from PDF.");
    } finally {
      setIsLearning(false);
      if (pdfInputRef.current) pdfInputRef.current.value = '';
    }
  };

  const handleCopy = () => {
    if (!generatedPrompt) return;
    const fallbackCopyTextToClipboard = (text) => {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      textArea.style.top = "0";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        const successful = document.execCommand('copy');
        if (successful) {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }
      } catch (err) { console.error('Fallback failed', err); }
      document.body.removeChild(textArea);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(generatedPrompt)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        })
        .catch(() => fallbackCopyTextToClipboard(generatedPrompt));
    } else {
      fallbackCopyTextToClipboard(generatedPrompt);
    }
  };

  const generatePrompt = async () => {
    setErrorMsg('');
    setGeneratedPrompt('');

    if (!apiKey || !apiKey.startsWith('AIza')) {
      alert("Invalid API Key format. It should start with 'AIza'.");
      setShowSettings(true);
      return;
    }

    if (inputMode === 'image') {
      if (!uploadedImage) {
        alert("Please upload an image first.");
        return;
      }
    } else if (!userQuery) {
      alert("Please enter a text description.");
      return;
    }

    setIsLoading(true);

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const geminiModel = genAI.getGenerativeModel({
        model: "gemini-2.5-flash-preview-09-2025",
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        ]
      });

      let promptText = "";
      let requestParts = [];

      if (inputMode === 'image') {
        promptText = `
          TASK: REVERSE ENGINEER PROMPT
          1. Analyze the uploaded image like a professional cinematographer.
          2. Identify: Focal length, Lighting type, Composition, Texture details, and Atmosphere.
          3. Convert this analysis into a highly optimized prompt specifically for the '${model.toUpperCase()}' model architecture.
          4. User additional notes: ${userQuery || "None"}
          5. Selected Style Tags to Enforce: ${selectedTags.join(', ')}
        `;

        requestParts = [
          { text: promptText },
          {
            inlineData: {
              data: uploadedImage.base64,
              mimeType: uploadedImage.file.type || "image/jpeg"
            }
          }
        ];
      } else {
        promptText = `
          TASK: GENERATE OPTIMIZED PROMPT
          1. User Input: "${userQuery}"
          2. Target Model: ${model.toUpperCase()}
          3. Selected Tags (Must include): ${selectedTags.join(', ')}
          
          PROCEDURE:
          - First, "Thinking Process": Briefly analyze what the user wants vs. what the model needs. Explain what technical terms you are adding.
          - Second, "Final Prompt": The exact prompt block to copy.
        `;
        requestParts = [{ text: promptText }];
      }

      const result = await geminiModel.generateContent({
        contents: [{ role: "user", parts: requestParts }],
        systemInstruction: { parts: [{ text: knowledgeBase }] },
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2000,
        }
      });

      const response = await result.response;
      setGeneratedPrompt(response.text());

    } catch (error) {
      console.error(error);
      const msg = error.message || "Unknown error";
      if (msg.includes("401")) {
        setErrorMsg("Authentication Error (401). Check Settings.");
        setShowSettings(true);
      } else if (msg.includes("SAFETY")) {
        setErrorMsg("Safety Error: Content blocked.");
      } else {
        setErrorMsg(`Error: ${msg}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-blue-500/30">
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-tr from-blue-600 to-purple-600 p-2 rounded-lg shadow-lg">
              <Sparkles className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
                PromptMaster AI
              </h1>
              <p className="text-xs text-slate-500 tracking-wider">MODEL-SPECIFIC PROMPT ENGINEER</p>
            </div>
          </div>
          <div className="flex gap-4">
            <button onClick={() => setShowKnowledge(!showKnowledge)} className={`p-2 rounded-full transition-colors ${showKnowledge ? 'bg-blue-500/20 text-blue-400' : 'hover:bg-slate-800 text-slate-400'}`} title="Knowledge Base"><BookOpen size={20} /></button>
            <button onClick={() => setShowSettings(!showSettings)} className={`p-2 rounded-full transition-colors ${!apiKey || errorMsg ? 'animate-pulse text-red-400 bg-red-400/10' : 'hover:bg-slate-800 text-slate-400'}`} title="Settings"><Settings size={20} /></button>
          </div>
        </div>
      </header>

      {showSettings && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><Settings className="w-5 h-5" /> Settings</h3>
            {errorMsg && (<div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 rounded-lg flex items-start gap-2 text-red-200 text-sm"><AlertCircle className="w-5 h-5 shrink-0" /><p>{errorMsg}</p></div>)}
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-400 mb-2">Google Gemini API Key</label>
              <input type="text" value={apiKey} onChange={(e) => { setApiKey(e.target.value.trim()); setErrorMsg(''); }} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none text-white font-mono text-sm" />
            </div>
            <button onClick={() => setShowSettings(false)} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition-colors">Save & Close</button>
          </div>
        </div>
      )}

      {showKnowledge && (
        <div className="fixed inset-0 bg-black/80 z-[90] flex justify-end">
          <div className="w-full max-w-2xl bg-slate-900 h-full shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-xl font-bold flex items-center gap-2 text-emerald-400"><BookOpen className="w-5 h-5" /> AI Brain (Knowledge Base)</h3>
              <button onClick={() => setShowKnowledge(false)} className="text-slate-400 hover:text-white"><Maximize2 size={20} /></button>
            </div>
            <div className="px-6 py-4 bg-slate-900 border-b border-slate-800">
              <p className="text-xs text-slate-400 mb-3">Upload a PDF to teach the AI new tricks.</p>
              <div className="flex gap-2">
                <button onClick={() => pdfInputRef.current?.click()} disabled={isLearning} className="flex-1 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/50 text-emerald-400 text-sm py-2 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
                  {isLearning ? <Loader2 className="animate-spin w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  {isLearning ? "Learning..." : "Upload PDF to Learn"}
                </button>
                <input type="file" ref={pdfInputRef} className="hidden" accept="application/pdf" onChange={handlePdfUpload} />
              </div>
            </div>
            <div className="p-6 flex-1 overflow-y-auto">
              <textarea value={knowledgeBase} onChange={(e) => setKnowledgeBase(e.target.value)} className="w-full h-full min-h-[500px] bg-slate-950 border border-slate-700 rounded-lg p-4 font-mono text-xs text-emerald-500 leading-relaxed focus:ring-2 focus:ring-emerald-500 outline-none resize-none" />
            </div>
          </div>
        </div>
      )}

      <main className="max-w-6xl mx-auto px-6 py-8">
        <section className="mb-10">
          <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-blue-500"></span> Step 1: Select Target Platform</h2>
          <div className="flex flex-col sm:flex-row gap-4">
            <ModelCard id="flux" name="Flux.2" icon={Aperture} description="Structural, JSON-based. The Architect." active={model === 'flux'} onClick={setModel} />
            <ModelCard id="gemini" name="Nano Banana" icon={Zap} description="Logical, Reasoning. The Logician." active={model === 'gemini'} onClick={setModel} />
            <ModelCard id="seedream" name="Seedream" icon={Camera} description="Commercial, Reference-heavy. The Director." active={model === 'seedream'} onClick={setModel} />
            <ModelCard id="video" name="Video Model" icon={Film} description="Physics, Time. The Cinematographer." active={model === 'video'} onClick={setModel} />
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-10">
          <div className="lg:col-span-2 space-y-6">
            <div className="flex justify-between items-end">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-purple-500"></span> Step 2: Your Vision</h2>
              <div className="flex gap-2">
                <button onClick={() => setInputMode('text')} className={`text-xs px-3 py-1 rounded-md ${inputMode === 'text' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-white'}`}>Text Mode</button>
                <button onClick={() => setInputMode('image')} className={`text-xs px-3 py-1 rounded-md ${inputMode === 'image' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-white'}`}>Image Reverse</button>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-1 relative overflow-hidden group focus-within:border-blue-500/50 focus-within:ring-1 focus-within:ring-blue-500 transition-all">
              {inputMode === 'image' ? (
                <div className="p-8 text-center border-2 border-dashed border-slate-700 rounded-xl hover:bg-slate-800/50 transition-colors relative cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                  <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
                  {uploadedImage ? (
                    <div className="relative">
                      <img src={uploadedImage.preview} alt="Upload" className="max-h-64 mx-auto rounded-lg shadow-lg" />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity rounded-lg">
                        <p className="text-white font-medium flex items-center gap-2"><RefreshCcw size={16} /> Change Image</p>
                      </div>
                    </div>
                  ) : (
                    <div className="py-8">
                      <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-400"><Upload size={32} /></div>
                      <h4 className="text-lg font-medium text-slate-300">Drop an image here</h4>
                      <p className="text-slate-500 mt-2 text-sm">AI will analyze lighting, angle, and style.</p>
                    </div>
                  )}
                </div>
              ) : (
                <textarea value={userQuery} onChange={(e) => setUserQuery(e.target.value)} placeholder="Describe your idea in natural language..." className="w-full bg-slate-900 text-slate-200 p-6 min-h-[200px] outline-none resize-none text-lg placeholder:text-slate-600 rounded-xl" />
              )}
              <div className="flex justify-between items-center bg-slate-950/50 p-3 rounded-b-xl border-t border-slate-800">
                <div className="flex gap-2 overflow-x-auto no-scrollbar">
                  {tags.map(tag => (
                    <FeatureTag key={tag.id} label={tag.label} active={selectedTags.includes(tag.id)} onClick={() => toggleTag(tag.id)} />
                  ))}
                </div>
                <button onClick={generatePrompt} disabled={isLoading} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-medium transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed min-w-[140px] justify-center shadow-lg shadow-blue-900/20">
                  {isLoading ? <Loader2 className="animate-spin w-5 h-5" /> : <>Generate <ChevronRight size={16} /></>}
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-1">
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> Generated Prompt</h2>
            <div className={`h-full min-h-[300px] bg-slate-900 rounded-2xl border border-slate-800 p-6 relative flex flex-col ${isLoading ? 'animate-pulse' : ''} ${errorMsg && !showSettings ? 'border-red-500/50' : ''}`}>
              {generatedPrompt ? (
                <>
                  <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                    <div className="prose prose-invert prose-sm max-w-none">
                      <pre className="whitespace-pre-wrap font-mono text-sm text-slate-300 bg-transparent border-none p-0">{generatedPrompt}</pre>
                    </div>
                  </div>
                  <div className="pt-4 border-t border-slate-800 mt-4 flex justify-end">
                    <button onClick={handleCopy} className={`flex items-center gap-2 text-sm transition-colors ${copied ? 'text-emerald-400' : 'text-blue-400 hover:text-blue-300'}`}>
                      {copied ? <><Check size={16} /> Copied!</> : <><Copy size={16} /> Copy to Clipboard</>}
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-600 opacity-50">
                  <Sparkles size={48} className="mb-4" />
                  <p className="text-sm text-center">{errorMsg ? <span className="text-red-400">Error encountered. Check Settings.</span> : "AI Output will appear here"}</p>
                </div>
              )}
            </div>
          </div>
        </section>
        <footer className="border-t border-slate-800 py-8 text-center text-slate-600 text-xs"><p>Powered by Google Gemini 2.5 Flash • Optimized for Flux.2, Seedream & Runway</p></footer>
      </main>
      <style>{`.custom-scrollbar::-webkit-scrollbar {width: 6px;} .custom-scrollbar::-webkit-scrollbar-track {background: rgba(30, 41, 59, 0.5);} .custom-scrollbar::-webkit-scrollbar-thumb {background: rgba(71, 85, 105, 0.8); border-radius: 4px;} .custom-scrollbar::-webkit-scrollbar-thumb:hover {background: rgba(100, 116, 139, 1);}`}</style>
    </div>
  );
};

// 渲染應用程式
export default App;