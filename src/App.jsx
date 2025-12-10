import React, { useState, useRef, useEffect } from 'react';
import { INITIAL_KNOWLEDGE_BASE, PDF_TAGS } from './knowledge';

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
  Plus,
  SlidersHorizontal,
  Wand2,
  Banana,
  Palette
} from 'lucide-react';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

// --- 預設專家知識庫由 knowledge.js 導入 ---

// --- UI 元件 ---

const ModelCard = ({ id, name, icon, description, active, onClick }) => {
  const Icon = icon;
  return (
    <button
      onClick={() => onClick(id)}
      className={`relative flex flex-col items-center p-4 rounded-xl border-2 transition-all duration-300 w-full sm:w-1/4 ${active
        ? 'border-blue-500 bg-blue-500/10 shadow-[0_0_20px_rgba(59,130,246,0.5)]'
        : 'border-slate-700 bg-[rgba(30,41,59,0.5)] hover:border-slate-500 hover:bg-[#1e293b]'
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
    className={`px-4 py-1.5 rounded-full text-xs font-medium border transition-all whitespace-nowrap ${active
      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.3)]'
      : 'bg-[#1e293b] border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'
      }`}
  >
    {label}
  </button>
);

// --- 主應用程式元件 ---
const App = () => {
  // --- 狀態管理 ---
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("gemini_api_key") || "");

  const handleApiKeyChange = (e) => {
    const newKey = e.target.value.trim();
    setApiKey(newKey);
    localStorage.setItem("gemini_api_key", newKey);
    setErrorMsg('');
  };
  const [model, setModel] = useState('flux');
  const [inputMode, setInputMode] = useState('text');
  const [userQuery, setUserQuery] = useState('');
  const [generatedPrompt, setGeneratedPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [knowledgeBase, setKnowledgeBase] = useState(() => localStorage.getItem("gemini_knowledge_base") || INITIAL_KNOWLEDGE_BASE);
  const [knowledgeVersions, setKnowledgeVersions] = useState(() => JSON.parse(localStorage.getItem("gemini_kb_versions") || "[]"));

  // Persist knowledge base & versions
  useEffect(() => {
    localStorage.setItem("gemini_knowledge_base", knowledgeBase);
  }, [knowledgeBase]);

  useEffect(() => {
    localStorage.setItem("gemini_kb_versions", JSON.stringify(knowledgeVersions));
  }, [knowledgeVersions]);

  const handleResetKnowledge = () => {
    if (confirm("Are you sure you want to reset the knowledge base to default? All learned information will be lost.")) {
      setKnowledgeBase(INITIAL_KNOWLEDGE_BASE);
    }
  };
  const [showKnowledge, setShowKnowledge] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedTags, setSelectedTags] = useState([]);
  const [uploadedImage, setUploadedImage] = useState(null);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isLearning, setIsLearning] = useState(false);
  const [isTagsOpen, setIsTagsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef(null);
  const pdfInputRef = useRef(null);

  const tags = PDF_TAGS;

  const toggleTag = (id) => {
    setSelectedTags(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  };

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) processImageFile(file);
  };

  const processImageFile = (file) => {
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
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      processImageFile(file);
    } else if (file) {
      alert("Please upload an image file.");
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
        const geminiModel = genAI.getGenerativeModel({
          model: "gemini-2.0-flash-exp", // Uses flash experimental for speed/reasoning
          generationConfig: { responseMimeType: "application/json" }
        });

        const prompt = `
          TASK: EXTRACT KNOWLEDGE FOR SYSTEM PROMPT
          The user has uploaded a PDF containing expert knowledge about AI Prompt Engineering.
          
          ACTION: 
          1. Extract key terms, techniques, and style modifiers.
          2. Create a concise dictionary/instruction block suitable for appending to the system prompt.
          3. summarize what was new in this PDF (max 2 sentences).
          
          OUTPUT JSON FORMAT:
          {
            "knowledge_block": "Markdown formatted technical knowledge extracted...",
            "summary": "Brief summary of added concepts..."
          }
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
        const text = response.text();

        try {
          const data = JSON.parse(text);
          const newKnowledge = data.knowledge_block;
          const summary = data.summary;

          setKnowledgeBase(prev => prev + "\n\n## [NEW] LEARNED FROM: " + file.name + "\n" + newKnowledge);

          setKnowledgeVersions(prev => [{
            id: Date.now(),
            date: new Date().toLocaleString(),
            fileName: file.name,
            summary: summary
          }, ...prev]);

          alert(`Knowledge Base Updated! Added: ${summary}`);
        } catch (e) {
          // Fallback if JSON fails
          setKnowledgeBase(prev => prev + "\n\n## [NEW] LEARNED FROM: " + file.name + "\n" + text);
          alert("Knowledge Base Updated (Raw Text)!");
        }
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
          TASK: REVERSE ENGINEER PROMPT (ROLE: EXPERT CINEMATOGRAPHER & PROMPT ENGINEER)
          
          IMAGE ANALYSIS:
          1. **Subject**: Detailed description of the main subject.
          2. **Camera**: Estimate Focal Length (e.g., 35mm, 85mm, 200mm), Angle (Low/High/Dutch), and Depth of Field.
          3. **Lighting**: Identify specific lighting technique (Rembrandt, Butterfly, Split, Chiaroscuro, etc.) and source (Softbox, Natural, Neon).
          4. **Atmosphere/Style**: Describe the mood, color palette (e.g., Cyberpunk, Pastel, Vintage), and texture (Film grain, Glossy).
          
          GENERATION ACTION:
          - Convert this analysis into a highly optimized prompt specifically for the '${model.toUpperCase()}' model architecture.
          - Incorporate these user constraints: "${userQuery || "No additional constraints"}"
          - MUST enforce these tags: ${selectedTags.map(id => tags.find(t => t.id === id)?.label || id).join(', ')}
          
          OUTPUT RULES (STRICT):
          - Output ONLY the Final Prompt (No thinking process).
          - Provide output in format:
            [CN] <Chinese Prompt>
            [EN] <English Prompt>
          - For 'SEEDREAM' model, strictly limit English prompt to 800 characters.
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
          3. Selected Tags (Must include): ${selectedTags.map(id => tags.find(t => t.id === id)?.label || id).join(', ')}

          PROCEDURE:
          - Internal Thinking: Briefly analyze what the user wants vs. what the model needs.
          - Output: ONLY the Final Prompt block.
          
          OUTPUT RULES:
          - DO NOT show the thinking process.
          - Provide output in format:
            [CN] <Chinese Prompt>
            [EN] <English Prompt>
          - For 'SEEDREAM' model, strictly limit English prompt to 800 characters.
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
        setErrorMsg(`Error: ${msg} `);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-blue-500/30">
      <header className="border-b border-slate-800 bg-[rgba(15,23,42,0.5)] backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
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
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><Settings className="w-5 h-5" /> 設定</h3>
            {errorMsg && (<div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 rounded-lg flex items-start gap-2 text-red-200 text-sm"><AlertCircle className="w-5 h-5 shrink-0" /><p>{errorMsg}</p></div>)}
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-400 mb-2">Google Gemini API Key</label>
              <input type="text" value={apiKey} onChange={handleApiKeyChange} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none text-white font-mono text-sm" />
            </div>
            <button onClick={() => setShowSettings(false)} className="w-full bg-[#2563eb] hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition-colors">儲存並關閉</button>
          </div>
        </div>
      )}

      {showKnowledge && (
        <div className="fixed inset-0 bg-black/80 z-[90] flex justify-end">
          <div className="w-full max-w-2xl bg-slate-900 h-full shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-xl font-bold flex items-center gap-2 text-emerald-400"><BookOpen className="w-5 h-5" /> AI 大腦 (知識庫)</h3>
              <button onClick={() => setShowKnowledge(false)} className="text-slate-400 hover:text-white"><Maximize2 size={20} /></button>
            </div>
            <div className="px-6 py-4 bg-slate-900 border-b border-slate-800">
              <p className="text-xs text-slate-400 mb-3">上傳 PDF 以教導 AI 新技巧。</p>
              <div className="flex gap-2">
                <button onClick={() => pdfInputRef.current?.click()} disabled={isLearning} className="flex-1 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/50 text-emerald-400 text-sm py-2 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
                  {isLearning ? <Loader2 className="animate-spin w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  {isLearning ? "學習中..." : "上傳 PDF 進行學習"}
                </button>
                <button onClick={handleResetKnowledge} className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-sm rounded-lg border border-red-500/30 transition-colors" title="重置為預設知識庫">
                  <RefreshCcw className="w-4 h-4" />
                </button>
                <input type="file" ref={pdfInputRef} className="hidden" accept="application/pdf" onChange={handlePdfUpload} />
              </div>
            </div>
            <div className="p-6 flex-1 overflow-y-auto">
              <div className="mb-6 p-4 bg-slate-950/50 rounded-lg border border-slate-800">
                <h4 className="text-sm font-bold text-slate-300 mb-2">更新紀錄 (Versions)</h4>
                {knowledgeVersions.length === 0 ? <p className="text-slate-500 text-xs">尚無更新。</p> : (
                  <ul className="space-y-2">
                    {knowledgeVersions.map((v) => (
                      <li key={v.id} className="text-xs border-l-2 border-emerald-500 pl-3">
                        <div className="flex justify-between text-slate-400"><span>{v.fileName}</span> <span>{v.date}</span></div>
                        <p className="text-slate-300 mt-1">{v.summary}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <textarea value={knowledgeBase} onChange={(e) => setKnowledgeBase(e.target.value)} className="w-full h-[400px] bg-slate-950 border border-slate-700 rounded-lg p-4 font-mono text-xs text-emerald-500 leading-relaxed focus:ring-2 focus:ring-emerald-500 outline-none resize-none" placeholder="Current Knowledge Base..." />
            </div>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-6 py-8">
        <section className="mb-10">
          <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-blue-500"></span> 第一步：選擇目標模型 (Target Model)</h2>
          <div className="flex flex-col sm:flex-row gap-4">
            <ModelCard id="flux" name="Flux.2" icon={Aperture} description="結構化，JSON 格式。架構師。" active={model === 'flux'} onClick={setModel} />
            <ModelCard id="midjourney" name="Midjourney" icon={Palette} description="藝術，風格化。藝術家。" active={model === 'midjourney'} onClick={setModel} />
            <ModelCard id="gemini" name="Nano Banana" icon={Banana} description="邏輯，推理。邏輯學家。" active={model === 'gemini'} onClick={setModel} />
            <ModelCard id="seedream" name="Seedream" icon={Camera} description="商業，參考圖優先。導演。" active={model === 'seedream'} onClick={setModel} />
            <ModelCard id="video" name="Video Model" icon={Film} description="物理，時間。攝影師。" active={model === 'video'} onClick={setModel} />
          </div>
        </section>

        <section className="flex flex-col gap-8 mb-10 w-full">
          <div className="w-full space-y-6">
            <div className="flex justify-between items-end">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-purple-500"></span> 第二步：您的構想</h2>
              <div className="flex gap-2">
                <button onClick={() => setInputMode('text')} className={`text-xs px-3 py-1 rounded-md ${inputMode === 'text' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-white'}`}>文字模式</button>
                <button onClick={() => setInputMode('image')} className={`text-xs px-3 py-1 rounded-md ${inputMode === 'image' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-white'}`}>圖片反推</button>
              </div>
            </div>

            <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-1 relative overflow-hidden group focus-within:border-blue-500/50 focus-within:ring-1 focus-within:ring-blue-500 transition-all">
              {inputMode === 'image' ? (
                <div
                  className={`p-8 text-center border-2 border-dashed rounded-xl transition-all relative cursor-pointer ${isDragging
                    ? 'border-blue-500 bg-blue-500/10 scale-[1.02]'
                    : 'border-slate-700 hover:bg-slate-800/50'
                    }`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
                  {uploadedImage ? (
                    <div className="relative">
                      <img src={uploadedImage.preview} alt="Upload" className="max-h-64 mx-auto rounded-lg shadow-lg" />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity rounded-lg">
                        <p className="text-white font-medium flex items-center gap-2"><RefreshCcw size={16} /> 更換圖片</p>
                      </div>
                    </div>
                  ) : (
                    <div className="py-8 pointer-events-none">
                      <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 transition-colors ${isDragging ? 'bg-blue-500 text-white' : 'bg-slate-800 text-blue-400'}`}>
                        <Upload size={32} />
                      </div>
                      <h4 className={`text-lg font-medium transition-colors ${isDragging ? 'text-blue-400' : 'text-slate-300'}`}>
                        {isDragging ? '放開以已上傳' : '將圖片拖放到這裡'}
                      </h4>
                      <p className="text-slate-500 mt-2 text-sm">AI 將分析光線、角度和風格。</p>
                    </div>
                  )}
                </div>
              ) : (
                <textarea value={userQuery} onChange={(e) => setUserQuery(e.target.value)} placeholder="請用自然語言描述您的想法..." className="w-full bg-[#0f172a] text-slate-200 p-6 min-h-[200px] outline-none resize-none text-lg placeholder:text-slate-600 rounded-xl" />
              )}
              <div className="bg-[rgba(2,6,23,0.5)] p-4 rounded-b-xl border-t border-slate-800 flex flex-col gap-4">
                <div className="flex justify-between items-center gap-4">
                  <button
                    onClick={() => setIsTagsOpen(!isTagsOpen)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 border ${isTagsOpen ? 'bg-slate-800 border-slate-600 text-white' : 'bg-transparent border-slate-700 text-slate-400 hover:border-slate-500'}`}
                  >
                    <SlidersHorizontal size={16} />
                    {isTagsOpen ? '收起風格參數' : '設定風格參數 (Style Tags)'}
                    {selectedTags.length > 0 && <span className="bg-blue-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{selectedTags.length}</span>}
                  </button>

                  <button
                    onClick={generatePrompt}
                    disabled={isLoading}
                    className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white px-6 py-3 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(37,99,235,0.4)] hover:shadow-[0_0_30px_rgba(37,99,235,0.6)] transform active:scale-[0.98]"
                  >
                    {isLoading ? <Loader2 className="animate-spin w-6 h-6" /> : <><Wand2 size={24} /> 立即生成 Prompt</>}
                  </button>
                </div>

                {isTagsOpen && (
                  <div className="animate-in slide-in-from-top-2 duration-200">
                    <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-800 flex flex-wrap gap-2">
                      {tags.map(tag => (
                        <FeatureTag key={tag.id} label={tag.label} active={selectedTags.includes(tag.id)} onClick={() => toggleTag(tag.id)} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="w-full">
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> 生成的提示詞</h2>
            <div className={`h-full min-h-[200px] bg-[#0f172a] rounded-2xl border border-slate-800 p-6 relative flex flex-col ${isLoading ? 'animate-pulse' : ''} ${errorMsg && !showSettings ? 'border-red-500/50' : ''}`}>
              {generatedPrompt ? (
                <>
                  <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                    <div className="prose prose-invert prose-sm max-w-none">
                      <pre className="whitespace-pre-wrap font-mono text-sm text-slate-300 bg-transparent border-none p-0">{generatedPrompt}</pre>
                    </div>
                  </div>
                  <div className="pt-4 border-t border-slate-800 mt-4 flex justify-end">
                    <button onClick={handleCopy} className={`flex items-center gap-2 text-sm transition-colors ${copied ? 'text-emerald-400' : 'text-blue-400 hover:text-blue-300'}`}>
                      {copied ? <><Check size={16} /> 已複製！</> : <><Copy size={16} /> 複製到剪貼簿</>}
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-600 opacity-50 py-12">
                  <Sparkles size={48} className="mb-4" />
                  <p className="text-sm text-center">{errorMsg ? <span className="text-red-400">發生錯誤。請檢查設定。</span> : "AI 輸出將顯示於此"}</p>
                </div>
              )}
            </div>
          </div>
        </section>
        <footer className="border-t border-slate-800 py-8 text-center text-slate-600 text-xs"><p>由 Google Gemini 2.5 Flash 驅動 • 針對 Flux.2, Seedream & Runway 優化</p></footer>
      </main>
      <style>{`.custom-scrollbar::-webkit-scrollbar { width: 6px; } .custom-scrollbar::-webkit-scrollbar-track { background: rgba(30, 41, 59, 0.5); } .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(71, 85, 105, 0.8); border-radius: 4px; } .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(100, 116, 139, 1); }`}</style>
    </div>
  );
};

// 渲染應用程式
export default App;