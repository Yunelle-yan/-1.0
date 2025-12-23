
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { AnimatePresence, motion } from 'framer-motion';

import Nebula from './components/Nebula';
import { Category, DiaryEntry, StarPoint, CategoryInfo } from './types';
import { DEFAULT_CATEGORIES, CAMERA_START_POS } from './constants';
import { extractFragments, transcribeAudio } from './services/geminiService';

const AmbientLight = 'ambientLight' as any;
const PointLight = 'pointLight' as any;

const FullscreenIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
  </svg>
);

const ShrinkIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7" />
  </svg>
);

const InteractiveDiaryText: React.FC<{ 
  text: string, 
  fragments: string[], 
  color: string,
  isEditing: boolean,
  isLarge?: boolean
}> = ({ text, fragments, color, isEditing, isLarge }) => {
  if (!text) return null;
  if (fragments.length === 0) return <span className={isEditing ? "opacity-100 text-white/60" : "opacity-70"}>{text}</span>;

  const sortedFrags = [...fragments].sort((a, b) => b.length - a.length);
  const escapedFrags = sortedFrags.map(f => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(${escapedFrags.join('|')})`, 'g');
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, i) => {
        const isFragment = fragments.includes(part);
        if (isFragment) {
          return (
            <span
              key={i}
              className={`${isLarge ? 'font-medium' : 'font-normal'} px-2 rounded transition-all duration-300 mx-0.5`}
              style={{ backgroundColor: isEditing ? `${color}55` : 'transparent', color: '#fff', borderBottom: `2.5px solid ${color}` }}
            >
              {part}
            </span>
          );
        }
        return <span key={i} className={isEditing ? "opacity-80 text-white" : "opacity-60"}>{part}</span>;
      })}
    </>
  );
};

const App: React.FC = () => {
  const [entries, setEntries] = useState<DiaryEntry[]>(() => {
    const saved = localStorage.getItem('stardust_entries');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [stars, setStars] = useState<StarPoint[]>(() => {
    const saved = localStorage.getItem('stardust_stars');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [categories, setCategories] = useState<CategoryInfo[]>(() => {
    const saved = localStorage.getItem('stardust_categories');
    return saved ? JSON.parse(saved) : DEFAULT_CATEGORIES;
  });

  useEffect(() => { localStorage.setItem('stardust_entries', JSON.stringify(entries)); }, [entries]);
  useEffect(() => { localStorage.setItem('stardust_stars', JSON.stringify(stars)); }, [stars]);
  useEffect(() => { localStorage.setItem('stardust_categories', JSON.stringify(categories)); }, [categories]);

  const [isWriting, setIsWriting] = useState(false);
  const [inputText, setInputText] = useState('');
  const [manualFragments, setManualFragments] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingFragments, setPendingFragments] = useState<{ id: string; text: string; category: Category; entryId: string }[]>([]);
  
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyFullscreen, setHistoryFullscreen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<DiaryEntry | null>(null);
  const [hoveredStarId, setHoveredStarId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<Category | null>(null);
  const [categoryFullscreen, setCategoryFullscreen] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const handleTextSelection = () => {
    if (!textareaRef.current || !isWriting) return;
    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;
    const selection = inputText.substring(start, end).trim();
    
    if (selection && selection.length > 0) {
      if (manualFragments.includes(selection)) {
        setManualFragments(prev => prev.filter(f => f !== selection));
      } else {
        setManualFragments(prev => [...prev, selection]);
      }
      textareaRef.current.setSelectionRange(end, end);
    }
  };

  const spawnStar = (content: string, categoryId: Category, entryId: string) => {
    const categoryInfo = categories.find(c => c.id === categoryId) || categories[0];
    const maxRadius = 70;
    const r = Math.pow(Math.random(), 1.4) * maxRadius;
    const angle = Math.random() * Math.PI * 2;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    const y = (Math.random() - 0.5) * 10;
    const randomSize = 0.6 + Math.random() * 0.9;

    const newStar: StarPoint = {
      id: Math.random().toString(36).substr(2, 9),
      entryId,
      position: [x, y, z],
      color: categoryInfo.color,
      content,
      category: categoryId,
      size: randomSize
    };
    setStars(prev => [...prev, newStar]);
  };

  const handleRealizeStardust = async () => {
    if (!inputText.trim()) return;
    setLoading(true);
    try {
      const { categoryId, fragments: aiFragments } = await extractFragments(inputText, categories);
      const finalFragments = manualFragments.length > 0 ? manualFragments : aiFragments;
      
      const newEntry: DiaryEntry = {
        id: Date.now().toString(),
        text: inputText,
        timestamp: Date.now(),
        category: categoryId,
        fragments: finalFragments
      };
      setEntries(prev => [newEntry, ...prev]);
      const frags = newEntry.fragments.map(f => ({
        id: Math.random().toString(36).substr(2, 9),
        text: f,
        category: categoryId,
        entryId: newEntry.id
      }));
      setPendingFragments(prev => [...prev, ...frags]);
      setIsWriting(false);
      setInputText('');
      setManualFragments([]);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const handleFragmentDrop = (fragId: string, category: Category, entryId: string) => {
    const frag = pendingFragments.find(f => f.id === fragId);
    if (frag) {
      spawnStar(frag.text, category, entryId);
      setPendingFragments(prev => prev.filter(f => f.id !== fragId));
    }
  };

  const handleCreateCategory = () => {
    if (!newCatName.trim()) return;
    const palette = ['#4ade80', '#fbbf24', '#f87171', '#818cf8', '#2dd4bf', '#f472b6', '#a78bfa'];
    const randomColor = palette[Math.floor(Math.random() * palette.length)];
    const newCat: CategoryInfo = {
      id: newCatName.toLowerCase().replace(/\s+/g, '_'),
      name: newCatName.trim(),
      color: randomColor,
      glow: `0 0 20px ${randomColor}`
    };
    setCategories(prev => [...prev, newCat]);
    setNewCatName('');
    setIsAddingCategory(false);
  };

  const hoveredStar = useMemo(() => stars.find(s => s.id === hoveredStarId), [stars, hoveredStarId]);

  const categoryFragments = useMemo(() => {
    if (!activeCategory) return [];
    return stars.filter(s => s.category === activeCategory);
  }, [stars, activeCategory]);

  const activeCategoryInfo = useMemo(() => 
    categories.find(c => c.id === activeCategory), 
  [activeCategory, categories]);

  return (
    <div className="relative w-screen h-screen bg-black text-white overflow-hidden selection:bg-white/30 serif-tracking">
      <div className="absolute inset-0 z-0">
        <Canvas dpr={[1, 2]} onPointerMissed={() => setActiveCategory(null)}>
          <PerspectiveCamera makeDefault position={CAMERA_START_POS} fov={50} />
          <OrbitControls enableDamping dampingFactor={0.05} minDistance={10} maxDistance={600} />
          <Nebula 
            stars={stars} 
            categories={categories}
            onStarClick={(star) => {
              setActiveCategory(star.category);
              const entry = entries.find(e => e.id === star.entryId);
              if (entry) { setSelectedEntry(entry); }
            }} 
            hoveredStarId={hoveredStarId} 
            setHoveredStar={setHoveredStarId} 
            activeCategory={activeCategory}
          />
          <AmbientLight intensity={0.4} />
          <PointLight position={[20, 50, 20]} intensity={2.0} color="#ffffff" />
        </Canvas>
      </div>

      <AnimatePresence>
        {hoveredStar && (
          <motion.div 
            key={hoveredStar.id}
            initial={{ opacity: 0, scale: 0.98, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 10 }}
            style={{ left: mousePos.x + 25, top: mousePos.y + 25 }}
            className="fixed pointer-events-none z-[100] glass-hud bright-edge px-6 py-4 rounded-2xl max-w-sm shadow-2xl backdrop-blur-3xl"
          >
            <div className="flex items-center gap-3 mb-2">
               <div className="w-2 h-2 rounded-full" style={{ backgroundColor: hoveredStar.color }} />
               <div className="text-[11px] font-bold uppercase tracking-[0.2em] opacity-70 italic">碎片记忆</div>
            </div>
            <div className="text-[14px] leading-relaxed italic font-light opacity-100 select-none">“ {hoveredStar.content} ”</div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute top-10 right-10 z-10 flex items-center gap-4">
        <button onClick={() => { setHistoryOpen(!historyOpen); setActiveCategory(null); }} className="glass-hud bright-edge px-8 py-4 rounded-full text-[13px] font-normal tracking-[0.2em] uppercase hover:bg-white/10 transition-all flex items-center gap-5 group">
          <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_12px_cyan] group-hover:scale-125 transition-transform" />
          时光回溯
        </button>
      </div>

      <AnimatePresence>
        {historyOpen && (
          <motion.div 
            layout
            initial={{ opacity: 0, scale: 0.95, x: 50 }} 
            animate={{ 
              opacity: 1, 
              scale: 1, 
              x: 0,
              width: historyFullscreen ? "calc(100% - 80px)" : "28rem",
              height: historyFullscreen ? "calc(100% - 160px)" : "auto",
              bottom: "32px",
              right: historyFullscreen ? "40px" : "40px",
              top: historyFullscreen ? "80px" : "128px"
            }} 
            exit={{ opacity: 0, scale: 0.95, x: 50 }} 
            className="fixed glass-hud bright-edge rounded-[2.5rem] p-12 z-20 overflow-hidden flex flex-col"
          >
            <div className="flex justify-between items-center mb-12">
              <h3 className="text-[12px] font-normal uppercase tracking-[0.4em] opacity-60 italic">星尘归档</h3>
              <div className="flex items-center gap-6">
                <button 
                  onClick={() => setHistoryFullscreen(!historyFullscreen)} 
                  className="opacity-60 hover:opacity-100 transition-all p-2 rounded-full hover:bg-white/5"
                >
                  {historyFullscreen ? <ShrinkIcon /> : <FullscreenIcon />}
                </button>
                <button onClick={() => { setHistoryOpen(false); setHistoryFullscreen(false); }} className="hover:text-white transition-colors opacity-60 p-2">✕</button>
              </div>
            </div>
            <div className={`flex-1 overflow-y-auto no-scrollbar ${historyFullscreen ? 'grid grid-cols-2 lg:grid-cols-3 gap-10 pb-10' : 'space-y-10'}`}>
              {entries.length === 0 ? <p className="text-white/40 italic text-base font-light text-center py-10">浩瀚星空，静候你的记忆...</p> : (
                entries.map(e => {
                  const cat = categories.find(c => c.id === e.category);
                  return (
                    <div key={e.id} onClick={() => { setSelectedEntry(e); setActiveCategory(e.category); }} className="p-7 rounded-3xl bg-white/[0.02] border border-white/5 hover:border-white/20 hover:bg-white/[0.04] cursor-pointer transition-all group h-fit text-white">
                      <div className="text-[12px] font-light opacity-60 mb-4 tracking-widest uppercase italic">{new Date(e.timestamp).toLocaleDateString()}</div>
                      <div className={`text-base font-light leading-relaxed opacity-80 group-hover:opacity-100 ${historyFullscreen ? 'line-clamp-4' : 'line-clamp-2'}`}>{e.text}</div>
                      <div className="mt-5 text-[10px] uppercase font-normal tracking-[0.3em]" style={{ color: cat?.color }}>{cat?.name}</div>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {activeCategory && (
          <motion.div 
            layout
            initial={{ opacity: 0, scale: 0.95, x: 50 }} 
            animate={{ 
              opacity: 1, 
              scale: 1, 
              x: 0,
              width: categoryFullscreen ? "calc(100% - 80px)" : "26rem",
              height: categoryFullscreen ? "calc(100% - 160px)" : "auto",
              bottom: "40px",
              right: "40px",
              top: categoryFullscreen ? "80px" : "128px"
            }} 
            exit={{ opacity: 0, scale: 0.95, x: 50 }} 
            className="fixed glass-hud bright-edge rounded-[2.5rem] p-12 z-20 flex flex-col overflow-hidden text-white"
          >
            <div className="flex justify-between items-center mb-10">
              <div className="flex items-center gap-5">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: activeCategoryInfo?.color, boxShadow: activeCategoryInfo?.glow }} />
                <h3 className="text-[14px] font-normal uppercase tracking-[0.4em] opacity-100">{activeCategoryInfo?.name}</h3>
              </div>
              <div className="flex items-center gap-6">
                 <button 
                  onClick={() => setCategoryFullscreen(!categoryFullscreen)} 
                  className="opacity-60 hover:opacity-100 transition-all p-2 rounded-full hover:bg-white/5"
                >
                  {categoryFullscreen ? <ShrinkIcon /> : <FullscreenIcon />}
                </button>
                <button onClick={() => { setActiveCategory(null); setCategoryFullscreen(false); }} className="opacity-50 hover:opacity-100 transition-all text-sm font-light p-2">✕</button>
              </div>
            </div>
            
            <div className={`flex-1 overflow-y-auto no-scrollbar ${categoryFullscreen ? 'grid grid-cols-2 lg:grid-cols-4 gap-8 pb-8' : 'space-y-6'}`}>
              {categoryFragments.length === 0 ? (
                <p className="text-white/40 italic text-base text-center mt-16 font-light col-span-full">该星系尚未凝结碎片...</p>
              ) : (
                categoryFragments.map((star) => (
                  <motion.div 
                    key={star.id} 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    onMouseEnter={() => setHoveredStarId(star.id)}
                    onMouseLeave={() => setHoveredStarId(null)}
                    onClick={() => {
                      const entry = entries.find(e => e.id === star.entryId);
                      if (entry) setSelectedEntry(entry);
                    }}
                    className={`p-6 rounded-3xl bg-white/[0.02] border border-white/5 hover:border-white/30 cursor-pointer transition-all group h-fit ${hoveredStarId === star.id ? 'bg-white/[0.06] border-white/40 shadow-xl' : ''}`}
                  >
                    <div className="text-base italic font-light leading-relaxed opacity-90 group-hover:opacity-100 transition-opacity">
                      “ {star.content} ”
                    </div>
                  </motion.div>
                ))
              )}
            </div>
            {!categoryFullscreen && (
              <div className="text-[11px] font-light uppercase tracking-[0.5em] opacity-60 text-center italic mt-4">
                已收集: {categoryFragments.length} 碎片
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-20 w-full flex justify-center px-6">
        {!isWriting && (
          <motion.button 
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            onClick={() => setIsWriting(true)} 
            className="glass-hud bright-edge h-14 w-full max-w-[400px] rounded-full text-[15px] font-light tracking-[0.8em] uppercase hover:bg-white/15 hover:scale-105 active:scale-95 transition-all flex items-center justify-center shadow-2xl group overflow-hidden"
          >
            <span className="relative z-10 transition-all group-hover:tracking-[1.2em] text-white/95">记录日记</span>
          </motion.button>
        )}
      </div>

      <AnimatePresence>
        {isWriting && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} 
            className="fixed inset-0 z-50 flex items-center justify-center p-8 bg-black/98 backdrop-blur-[60px]"
          >
            <div className="relative w-full max-w-[80rem] flex flex-col items-center h-full">
              <div className="relative w-full flex-1 flex flex-col items-center justify-center max-h-[50vh] mt-[5vh]">
                <div className="absolute inset-0 pointer-events-none text-2xl md:text-3xl font-light text-center leading-[1.8] px-8 select-none overflow-y-auto no-scrollbar tracking-wide">
                  <InteractiveDiaryText 
                    text={inputText} 
                    fragments={manualFragments} 
                    color="#22d3ee" 
                    isEditing={true} 
                  />
                </div>

                <textarea 
                  ref={textareaRef}
                  autoFocus 
                  value={inputText} 
                  onChange={(e) => setInputText(e.target.value)}
                  onMouseUp={handleTextSelection}
                  placeholder="在这一刻，记录你的星尘记忆..." 
                  className="w-full h-full bg-transparent border-none outline-none resize-none text-2xl md:text-3xl font-light text-center placeholder:text-white/40 no-scrollbar leading-[1.8] text-transparent caret-white tracking-wide" 
                />
              </div>

              <div className="mt-8 text-[11px] md:text-[12px] font-normal uppercase tracking-[0.5em] text-white/80 animate-pulse italic">
                提示：选中文字以凝结碎片
              </div>
              
              <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col md:flex-row items-center gap-8 md:gap-32 mt-12 py-10 border-t border-white/10 w-full justify-center">
                <button onClick={() => { setIsWriting(false); setManualFragments([]); }} className="text-[14px] font-light uppercase tracking-[0.6em] text-white/70 hover:text-white transition-all italic order-2 md:order-1">
                  放弃
                </button>
                <button 
                  disabled={loading || !inputText.trim()} 
                  onClick={handleRealizeStardust} 
                  className="px-20 md:px-40 py-5 bg-white/20 hover:bg-white/30 text-white rounded-full font-normal text-[16px] uppercase tracking-[1em] transition-all disabled:opacity-20 border border-white/40 shadow-lg order-1 md:order-2"
                >
                  {loading ? '感应中...' : '具现'}
                </button>
                <div className="text-[14px] font-light text-white/70 uppercase tracking-[0.4em] w-auto md:w-48 text-center md:text-right italic order-3">
                   {manualFragments.length} 个碎片
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedEntry && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 flex items-center justify-center z-[100] p-8 bg-black/70 backdrop-blur-3xl" onClick={() => { setSelectedEntry(null); setActiveCategory(null); }}>
            <div className="glass-hud bright-edge p-10 md:p-20 rounded-[3rem] md:rounded-[5rem] max-w-6xl w-full relative shadow-3xl overflow-y-auto no-scrollbar max-h-[90vh] text-white" onClick={e => e.stopPropagation()}>
              <button onClick={() => { setSelectedEntry(null); setActiveCategory(null); }} className="absolute top-10 right-10 text-3xl opacity-60 hover:opacity-100 transition-all font-light">✕</button>
              <div className="text-[12px] font-normal uppercase tracking-[0.8em] mb-10 md:mb-14 opacity-70 italic" style={{ color: categories.find(c => c.id === selectedEntry.category)?.color }}>
                {new Date(selectedEntry.timestamp).toLocaleString()}
              </div>
              <div className="text-2xl md:text-4xl font-light text-center leading-[1.7] mb-16 tracking-tight text-white/95">
                <InteractiveDiaryText 
                  text={selectedEntry.text} 
                  fragments={selectedEntry.fragments} 
                  color={categories.find(c => c.id === selectedEntry.category)?.color || '#fff'} 
                  isEditing={false}
                  isLarge={true}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute left-6 md:left-14 top-0 bottom-0 flex flex-col justify-center py-24 z-10 pointer-events-none">
        <div className="flex flex-col gap-10 overflow-y-auto no-scrollbar py-12 px-4 max-h-full pointer-events-auto">
          {categories.map((info) => (
            <div key={info.id} className="group flex items-center gap-6 md:gap-10 cursor-pointer" onClick={() => { setActiveCategory(info.id === activeCategory ? null : info.id); setHistoryOpen(false); }}>
              <div 
                className={`w-10 h-10 md:w-13 md:h-13 rounded-full border border-white/20 transition-all duration-1000 relative flex items-center justify-center group-hover:scale-110 ${activeCategory === info.id ? 'ring-1 ring-white ring-offset-[8px] ring-offset-black' : ''}`} 
                style={{ backgroundColor: info.color + '20', boxShadow: info.glow }}
              >
                 <div className="absolute inset-0 rounded-full animate-pulse blur-3xl opacity-30" style={{ backgroundColor: info.color }} />
                 <div className="w-2.5 h-2.5 rounded-full z-10 shadow-[0_0_12px_rgba(255,255,255,0.6)]" style={{ backgroundColor: info.color }} />
              </div>
              <span className="text-[12px] md:text-[13px] font-light uppercase tracking-[0.6em] text-white/70 group-hover:text-white transition-all select-none whitespace-nowrap italic">{info.name}</span>
            </div>
          ))}

          <div className="group flex items-center gap-6 md:gap-10 cursor-pointer pt-4" onClick={() => setIsAddingCategory(true)}>
            <div className="w-10 h-10 md:w-13 md:h-13 rounded-full border-2 border-white/50 hover:border-white/100 transition-all flex items-center justify-center group-hover:scale-110 bg-white/[0.1] shadow-[0_0_20px_rgba(255,255,255,0.2)]">
               <span className="text-xl md:text-2xl font-light text-white group-hover:scale-125 transition-transform">+</span>
            </div>
            <span className="text-[12px] md:text-[13px] font-light uppercase tracking-[0.6em] text-white/80 group-hover:text-white transition-all select-none whitespace-nowrap italic">添加分类</span>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isAddingCategory && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 flex items-center justify-center z-[110] bg-black/90 backdrop-blur-2xl" onClick={() => setIsAddingCategory(false)}>
            <motion.div 
              initial={{ scale: 0.98, y: 30 }} animate={{ scale: 1, y: 0 }} 
              className="glass-hud bright-edge p-10 md:p-16 rounded-[2.5rem] md:rounded-[3.5rem] w-[90vw] max-w-[30rem] flex flex-col items-center shadow-3xl text-white" 
              onClick={e => e.stopPropagation()}
            >
              <h4 className="text-[12px] font-normal uppercase tracking-[0.8em] mb-12 opacity-50 italic">创建新星系</h4>
              <input 
                autoFocus
                type="text" 
                maxLength={8}
                value={newCatName} 
                onChange={e => setNewCatName(e.target.value)} 
                onKeyDown={e => e.key === 'Enter' && handleCreateCategory()}
                placeholder="为星尘命名..." 
                className="w-full bg-white/[0.08] border border-white/20 rounded-3xl px-8 py-5 text-xl font-light text-center outline-none focus:border-white/40 transition-all mb-12 text-white placeholder:text-white/30"
              />
              <div className="flex gap-6 md:gap-8 w-full">
                <button onClick={() => setIsAddingCategory(false)} className="flex-1 py-5 rounded-3xl text-[12px] font-light uppercase tracking-[0.4em] text-white/60 hover:text-white transition-all italic">取消</button>
                <button onClick={handleCreateCategory} className="flex-1 py-5 bg-white/15 hover:bg-white/25 rounded-3xl text-[12px] font-normal uppercase tracking-[0.4em] transition-all text-white border border-white/20">开启</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {pendingFragments.length > 0 && (
          <motion.div initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} className="absolute top-32 right-6 md:right-16 bottom-40 w-72 md:w-96 flex flex-col items-end gap-6 md:gap-10 z-20 overflow-y-auto no-scrollbar py-8 text-white">
            <div className="text-[11px] font-normal uppercase tracking-[0.5em] text-white/40 mb-4 text-right italic">未绑定的星尘</div>
            {pendingFragments.map((frag) => (
              <motion.div 
                key={frag.id} drag dragSnapToOrigin 
                onDragEnd={(_, info) => { if (info.point.x < window.innerWidth - 600) handleFragmentDrop(frag.id, frag.category, frag.entryId); }} 
                className="glass-hud bright-edge p-6 md:p-8 rounded-[2rem] md:rounded-[2.5rem] cursor-grab active:cursor-grabbing text-[14px] md:text-[15px] italic font-light leading-relaxed opacity-80 hover:opacity-100 hover:bg-white/[0.05] transition-all w-full shadow-2xl"
              >
                “ {frag.text} ”
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/95 backdrop-blur-[50px] flex items-center justify-center z-[120]">
            <div className="flex flex-col items-center gap-12">
               <div className="w-16 h-16 border border-white/20 border-t-white/90 rounded-full animate-spin" />
               <div className="text-[14px] font-light uppercase tracking-[1.2em] text-white/70 animate-pulse text-center">感应星辰中...</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default App;
