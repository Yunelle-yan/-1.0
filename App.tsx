
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { AnimatePresence, motion } from 'framer-motion';

import Nebula from './components/Nebula.tsx';
import { Category, DiaryEntry, StarPoint, CategoryInfo } from './types.ts';
import { DEFAULT_CATEGORIES, CAMERA_START_POS } from './constants.ts';
import { categorizeEntry } from './services/geminiService.ts';

const AmbientLight = 'ambientLight' as any;
const PointLight = 'pointLight' as any;

const FullscreenIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
  </svg>
);

const ShrinkIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7" />
  </svg>
);

const ListIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);

const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"></polyline>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
  </svg>
);

const CameraController: React.FC<{ active: boolean }> = ({ active }) => {
  const controlsRef = useRef<any>(null);
  const targetX = active ? 20 : 0; 
  
  useFrame(() => {
    if (controlsRef.current) {
      controlsRef.current.target.x = THREE.MathUtils.lerp(
        controlsRef.current.target.x,
        targetX,
        0.06
      );
      controlsRef.current.update();
    }
  });

  return (
    <OrbitControls 
      ref={controlsRef}
      enableDamping 
      dampingFactor={0.05} 
      minDistance={1} 
      maxDistance={800} 
    />
  );
};

const InteractiveDiaryText: React.FC<{ 
  text: string, 
  fragments: string[], 
  color: string,
  isEditing: boolean,
  isLarge?: boolean,
  onFragmentClick?: (frag: string) => void
}> = ({ text, fragments, color, isEditing, isLarge, onFragmentClick }) => {
  if (!text) return null;
  if (!fragments || fragments.length === 0) return <span className={isEditing ? "opacity-100 text-white/70" : "opacity-90"}>{text}</span>;

  const sortedFrags = [...new Set(fragments)].sort((a, b) => b.length - a.length);
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
              onClick={(e) => {
                if (isEditing && onFragmentClick) {
                  e.stopPropagation();
                  onFragmentClick(part);
                }
              }}
              className={`inline transition-all duration-300 ${isEditing ? 'cursor-pointer pointer-events-auto hover:brightness-150' : ''}`}
              style={{ 
                boxShadow: isEditing ? `inset 0 -2px 0 ${color}, 0 2px 8px ${color}33` : 'none',
                backgroundColor: isEditing ? `${color}33` : 'transparent', 
                color: isEditing ? '#fff' : 'inherit',
                padding: '0',
                margin: '0',
                display: 'inline'
              }}
              title={isEditing ? "点击移除标注" : undefined}
            >
              {part}
            </span>
          );
        }
        return <span key={i} className={isEditing ? "opacity-90 text-white" : "opacity-70"}>{part}</span>;
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
  
  const [dragHoverCategory, setDragHoverCategory] = useState<Category | null>(null);
  const categoryRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyFullscreen, setHistoryFullscreen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<DiaryEntry | null>(null);
  const [hoveredStarId, setHoveredStarId] = useState<string | null>(null);
  
  const [activeCategory, setActiveCategory] = useState<Category | null>(null);
  const [showDetailPanel, setShowDetailPanel] = useState(false);

  const [categoryFullscreen, setCategoryFullscreen] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const handleCategoryClick = (catId: Category) => {
    if (activeCategory === catId) {
      setActiveCategory(null);
      setShowDetailPanel(false);
    } else {
      setActiveCategory(catId);
      setShowDetailPanel(false); 
      setHistoryOpen(false);
    }
  };

  const handleTextSelection = () => {
    if (!textareaRef.current || !isWriting) return;
    const textarea = textareaRef.current;
    const selection = textarea.value.substring(textarea.selectionStart, textarea.selectionEnd).trim();
    if (selection && selection.length > 1) {
      setManualFragments(prev => {
        if (prev.includes(selection)) return prev.filter(f => f !== selection);
        return [...prev, selection];
      });
    }
  };

  const removeManualFragment = (frag: string) => {
    setManualFragments(prev => prev.filter(f => f !== frag));
  };

  const spawnStar = (content: string, categoryId: Category, entryId: string) => {
    const categoryInfo = categories.find(c => c.id === categoryId) || categories[0];
    const maxRadius = 70;
    const r = Math.pow(Math.random(), 1.4) * maxRadius;
    const angle = Math.random() * Math.PI * 2;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    const y = (Math.random() - 0.5) * 10;
    const randomSize = 1.4 + Math.random() * 0.8;
    const newStar: StarPoint = {
      id: Math.random().toString(36).substr(2, 9),
      entryId, position: [x, y, z], color: categoryInfo.color,
      content, category: categoryId, size: randomSize
    };
    setStars(prev => [...prev, newStar]);
  };

  const deleteStar = (starId: string) => {
    setStars(prev => prev.filter(s => s.id !== starId));
    if (hoveredStarId === starId) setHoveredStarId(null);
  };

  const handleRealizeStardust = async () => {
    if (!inputText.trim()) return;
    setLoading(true);
    try {
      const categoryId = await categorizeEntry(inputText, categories);
      const finalFragments = [...new Set(manualFragments)];
      const newEntry: DiaryEntry = {
        id: Date.now().toString(), text: inputText, timestamp: Date.now(),
        category: categoryId, fragments: finalFragments
      };
      setEntries(prev => [newEntry, ...prev]);
      if (finalFragments.length > 0) {
        const frags = finalFragments.map(f => ({
          id: Math.random().toString(36).substr(2, 9),
          text: f, category: categoryId, entryId: newEntry.id
        }));
        setPendingFragments(prev => [...prev, ...frags]);
      }
      setIsWriting(false); setInputText(''); setManualFragments([]);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const handleFragmentDrop = (fragId: string, category: Category, entryId: string) => {
    const frag = pendingFragments.find(f => f.id === fragId);
    if (frag) {
      spawnStar(frag.text, category, entryId);
      setPendingFragments(prev => prev.filter(f => f.id !== fragId));
    }
  };

  const discardPendingFragment = (fragId: string) => {
    setPendingFragments(prev => prev.filter(f => f.id !== fragId));
  };

  const updateNearestCategory = (point: { x: number, y: number }) => {
    let nearestCat: Category | null = null;
    let minDistance = 160; 

    Object.entries(categoryRefs.current).forEach(([id, el]) => {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dist = Math.hypot(point.x - centerX, point.y - centerY);
      
      if (dist < minDistance) {
        minDistance = dist;
        nearestCat = id;
      }
    });

    setDragHoverCategory(nearestCat);
  };

  const handleCreateCategory = () => {
    if (!newCatName.trim()) return;
    const palette = ['#4ade80', '#fbbf24', '#f87171', '#818cf8', '#2dd4bf', '#f472b6', '#a78bfa'];
    const randomColor = palette[Math.floor(Math.random() * palette.length)];
    const newCat: CategoryInfo = {
      id: newCatName.toLowerCase().replace(/\s+/g, '_'),
      name: newCatName.trim(), color: randomColor, glow: `0 0 20px ${randomColor}`
    };
    setCategories(prev => [...prev, newCat]); setNewCatName(''); setIsAddingCategory(false);
  };

  const hoveredStar = useMemo(() => stars.find(s => s.id === hoveredStarId), [stars, hoveredStarId]);
  const categoryFragments = useMemo(() => {
    if (!activeCategory) return [];
    return stars.filter(s => s.category === activeCategory);
  }, [stars, activeCategory]);
  const activeCategoryInfo = useMemo(() => categories.find(c => c.id === activeCategory), [activeCategory, categories]);

  const SHARED_TEXT_STYLES = "text-2xl md:text-3xl font-light text-center leading-[1.8] tracking-normal whitespace-pre-wrap break-words px-12 py-8";

  return (
    <div className="relative w-screen h-screen bg-black text-white overflow-hidden selection:bg-white/30 serif-tracking">
      <div className="absolute inset-0 z-0">
        <Canvas dpr={[1, 2]} onPointerMissed={() => { setActiveCategory(null); setShowDetailPanel(false); }}>
          <PerspectiveCamera makeDefault position={CAMERA_START_POS} fov={50} near={0.1} far={10000} />
          <CameraController active={showDetailPanel} />
          <Nebula 
            stars={stars} 
            categories={categories}
            onStarClick={(star) => { setActiveCategory(star.category); setShowDetailPanel(false); }} 
            hoveredStarId={hoveredStarId} 
            setHoveredStar={setHoveredStarId} 
            activeCategory={activeCategory}
          />
          <AmbientLight intensity={0.4} />
          <PointLight position={[20, 50, 20]} intensity={2.0} color="#ffffff" />
        </Canvas>
      </div>

      <AnimatePresence>
        {hoveredStar && !activeCategory && (
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
               <div className="text-[11px] font-bold uppercase tracking-[0.2em] opacity-80 italic text-white">碎片记忆</div>
            </div>
            <div className="text-[14px] leading-relaxed italic font-light opacity-100 select-none text-white">“ {hoveredStar.content} ”</div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute top-10 right-10 z-10 flex items-center gap-4">
        <button onClick={() => { setHistoryOpen(!historyOpen); setActiveCategory(null); setShowDetailPanel(false); }} className="glass-hud bright-edge px-8 py-4 rounded-full text-[13px] font-normal tracking-[0.2em] uppercase hover:bg-white/10 transition-all text-white">
          时光回溯
        </button>
      </div>

      <AnimatePresence>
        {historyOpen && (
          <motion.div 
            layout initial={{ opacity: 0, scale: 0.95, x: 50 }} 
            animate={{ 
              opacity: 1, scale: 1, x: 0,
              width: historyFullscreen ? "calc(100% - 80px)" : "28rem",
              height: historyFullscreen ? "calc(100% - 160px)" : "auto",
              bottom: "32px", right: "40px",
              top: historyFullscreen ? "80px" : "128px"
            }} 
            exit={{ opacity: 0, scale: 0.95, x: 50 }} 
            className="fixed glass-hud bright-edge rounded-[2.5rem] p-12 z-20 overflow-hidden flex flex-col"
          >
            <div className="flex justify-between items-center mb-12">
              <h3 className="text-[12px] font-normal uppercase tracking-[0.4em] opacity-80 italic text-white">星尘归档</h3>
              <div className="flex items-center gap-6">
                <button onClick={() => setHistoryFullscreen(!historyFullscreen)} className="opacity-70 text-white">
                  {historyFullscreen ? <ShrinkIcon /> : <FullscreenIcon />}
                </button>
                <button onClick={() => { setHistoryOpen(false); setHistoryFullscreen(false); }} className="opacity-60 text-white">✕</button>
              </div>
            </div>
            <div className={`flex-1 overflow-y-auto no-scrollbar ${historyFullscreen ? 'grid grid-cols-2 lg:grid-cols-3 gap-10 pb-10' : 'space-y-10'}`}>
              {entries.map(e => (
                <div key={e.id} onClick={() => { setSelectedEntry(e); }} className="p-7 rounded-3xl bg-white/[0.02] border border-white/5 hover:border-white/20 hover:bg-white/[0.04] cursor-pointer transition-all group h-fit text-white">
                  <div className="text-[12px] font-light opacity-60 mb-4 tracking-widest uppercase italic">{new Date(e.timestamp).toLocaleDateString()}</div>
                  <div className={`text-base font-light leading-relaxed opacity-90 group-hover:opacity-100 ${historyFullscreen ? 'line-clamp-4' : 'line-clamp-2'}`}>{e.text}</div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDetailPanel && activeCategory && (
          <motion.div 
            layout initial={{ opacity: 0, x: -80 }} 
            animate={{ 
              opacity: 1, x: 0,
              width: categoryFullscreen ? "calc(100% - 240px)" : "22rem",
              height: "calc(100% - 200px)",
              left: "150px", top: "100px"
            }} 
            exit={{ opacity: 0, x: -80 }} 
            className="fixed glass-hud bright-edge rounded-[2rem] p-8 z-20 flex flex-col overflow-hidden text-white shadow-2xl backdrop-blur-3xl group"
          >
            <div className="flex justify-between items-center mb-8">
              <div className="flex items-center gap-4">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: activeCategoryInfo?.color }} />
                <h3 className="text-[13px] font-normal uppercase tracking-[0.3em] opacity-100">{activeCategoryInfo?.name}</h3>
              </div>
              <div className="flex items-center gap-4">
                 <button onClick={() => setCategoryFullscreen(!categoryFullscreen)} className="opacity-40 group-hover:opacity-70 text-white transition-opacity">
                  {categoryFullscreen ? <ShrinkIcon /> : <FullscreenIcon />}
                </button>
                <button onClick={() => { setShowDetailPanel(false); setCategoryFullscreen(false); }} className="opacity-40 group-hover:opacity-70 text-white">✕</button>
              </div>
            </div>
            <div className={`flex-1 overflow-y-auto no-scrollbar ${categoryFullscreen ? 'grid grid-cols-2 lg:grid-cols-3 gap-6 pb-6' : 'space-y-4'}`}>
              <AnimatePresence mode="popLayout">
                {categoryFragments.map((star) => (
                  <motion.div 
                    key={star.id} 
                    layout
                    initial={{ opacity: 0, scale: 0.9 }} 
                    animate={{ opacity: 1, scale: 1 }} 
                    exit={{ opacity: 0, scale: 0.8 }}
                    onMouseEnter={() => setHoveredStarId(star.id)} onMouseLeave={() => setHoveredStarId(null)}
                    className={`relative p-5 pr-12 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/20 transition-all group/item h-fit ${hoveredStarId === star.id ? 'bg-white/[0.06] border-white/30' : ''}`}
                  >
                    <div 
                      onClick={() => {
                        const entry = entries.find(e => e.id === star.entryId);
                        if (entry) setSelectedEntry(entry);
                      }}
                      className="text-[14px] italic font-light leading-relaxed text-white opacity-80 group-hover/item:opacity-100 cursor-pointer"
                    >
                      “ {star.content} ”
                    </div>
                    
                    <button 
                      onClick={(e) => { e.stopPropagation(); deleteStar(star.id); }}
                      className="absolute top-1/2 -translate-y-1/2 right-4 p-2 opacity-0 group-hover/item:opacity-40 hover:opacity-100 hover:text-red-400 transition-all"
                      title="尘埃化（删除碎片）"
                    >
                      <TrashIcon />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
              {categoryFragments.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full opacity-20 italic text-xs py-20">暂无碎片星尘</div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-20 w-full flex justify-center px-6 pointer-events-none">
        {!isWriting && (
          <motion.button 
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            onClick={() => setIsWriting(true)} 
            className="glass-hud bright-edge h-12 w-full max-w-[400px] rounded-full text-[14px] font-light tracking-[0.8em] uppercase hover:bg-white/15 transition-all text-white border border-white/20 pointer-events-auto"
          >
            记录星尘
          </motion.button>
        )}
      </div>

      <AnimatePresence>
        {isWriting && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-8 bg-black/98 backdrop-blur-[60px]">
            <div className="relative w-full max-w-[80rem] flex flex-col items-center h-full">
              <div className="relative w-full flex-1 max-h-[60vh] mt-[5vh] overflow-hidden">
                <div 
                  ref={overlayRef}
                  className={`absolute inset-0 pointer-events-none select-none overflow-hidden ${SHARED_TEXT_STYLES}`}
                  style={{ wordBreak: 'break-word' }}
                >
                  <InteractiveDiaryText 
                    text={inputText} fragments={manualFragments} 
                    color="#22d3ee" isEditing={true} onFragmentClick={removeManualFragment}
                  />
                </div>
                <textarea 
                  ref={textareaRef} 
                  autoFocus 
                  value={inputText} 
                  onChange={(e) => setInputText(e.target.value)} 
                  onMouseUp={handleTextSelection}
                  onScroll={(e) => {
                    if (overlayRef.current) {
                      overlayRef.current.scrollTop = e.currentTarget.scrollTop;
                    }
                  }}
                  placeholder="记录此刻的星尘..." 
                  className={`w-full h-full bg-transparent border-none outline-none resize-none no-scrollbar text-transparent caret-white overflow-y-auto ${SHARED_TEXT_STYLES} placeholder:text-white/40`}
                  spellCheck={false}
                  style={{ wordBreak: 'break-word', outline: 'none' }}
                />
              </div>
              <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} className="flex gap-16 mt-12 py-10 border-t border-white/10 w-full justify-center items-center">
                <button onClick={() => { setIsWriting(false); setManualFragments([]); }} className="text-[14px] uppercase tracking-[0.4em] text-white/70 italic">放弃</button>
                <button disabled={loading || !inputText.trim()} onClick={handleRealizeStardust} className="px-24 py-5 bg-white/15 hover:bg-white/25 text-white rounded-full font-normal uppercase tracking-[1em] border border-white/30">{loading ? '归纳中...' : '具现'}</button>
                <div className="text-[14px] uppercase tracking-[0.4em] text-white/70 italic min-w-[80px] text-center">
                   {manualFragments.length > 0 ? `${manualFragments.length} 碎片` : "无碎片"}
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedEntry && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 flex items-center justify-center z-[100] p-8 bg-black/70 backdrop-blur-3xl" onClick={() => { setSelectedEntry(null); }}>
            <div className="glass-hud bright-edge p-10 md:p-20 rounded-[4rem] max-w-6xl w-full relative overflow-y-auto no-scrollbar max-h-[90vh] text-white" onClick={e => e.stopPropagation()}>
              <button onClick={() => { setSelectedEntry(null); }} className="absolute top-10 right-10 text-3xl font-light text-white">✕</button>
              <div className="text-[12px] font-normal uppercase tracking-[0.8em] mb-14 opacity-50 italic text-white/70">{new Date(selectedEntry.timestamp).toLocaleString()}</div>
              <div className="text-2xl md:text-4xl font-light text-center leading-[1.7] tracking-tight text-white">
                <InteractiveDiaryText text={selectedEntry.text} fragments={selectedEntry.fragments} color={categories.find(c => c.id === selectedEntry.category)?.color || '#fff'} isEditing={false} isLarge={true} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute left-10 top-0 bottom-0 flex flex-col justify-center py-24 z-10 pointer-events-none">
        <div className="flex flex-col gap-10 pointer-events-auto items-start">
          {categories.map((info) => (
            <div 
              key={info.id} 
              ref={el => { categoryRefs.current[info.id] = el; }}
              className="relative flex items-center gap-6 group"
            >
              <motion.div 
                onClick={() => handleCategoryClick(info.id)}
                animate={{ 
                  scale: activeCategory === info.id || dragHoverCategory === info.id ? 1.25 : 1,
                  borderColor: dragHoverCategory === info.id ? info.color : 'rgba(255,255,255,0.2)'
                }}
                className="relative z-10 flex items-center justify-center cursor-pointer"
              >
                <div className={`w-12 h-12 rounded-full border flex items-center justify-center transition-all ${activeCategory === info.id || dragHoverCategory === info.id ? 'ring-2 ring-white ring-offset-4 ring-offset-black bg-white/10 shadow-[0_0_30px_rgba(255,255,255,0.3)]' : 'bg-white/5 hover:bg-white/15 border-white/20'}`}>
                   <div 
                    className="w-2.5 h-2.5 rounded-full transition-all duration-300" 
                    style={{ 
                      backgroundColor: info.color, 
                      boxShadow: dragHoverCategory === info.id ? `0 0 20px 4px ${info.color}` : 'none',
                      transform: dragHoverCategory === info.id ? 'scale(1.8)' : 'scale(1)'
                    }} 
                   />
                </div>
                
                <div className="absolute -right-4 top-1/2 -translate-y-1/2 flex items-center translate-x-full">
                  <AnimatePresence>
                    {(activeCategory === info.id || dragHoverCategory === info.id) && (
                      <motion.span 
                        initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
                        className={`text-[12px] uppercase tracking-[0.3em] whitespace-nowrap italic font-bold ${dragHoverCategory === info.id ? 'text-white underline decoration-2' : 'text-white/80'}`}
                        style={{ textDecorationColor: info.color }}
                      >
                        {dragHoverCategory === info.id ? `归于：${info.name}` : info.name}
                      </motion.span>
                    )}
                  </AnimatePresence>
                  
                  <AnimatePresence>
                    {activeCategory === info.id && (
                      <motion.button
                        initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0 }}
                        onClick={(e) => { e.stopPropagation(); setShowDetailPanel(!showDetailPanel); }}
                        className={`ml-6 w-10 h-10 rounded-full flex items-center justify-center transition-all border ${showDetailPanel ? 'bg-white text-black border-white' : 'bg-white/10 text-white border-white/30 hover:bg-white/20'}`}
                        title="查阅碎片"
                      >
                        <ListIcon />
                      </motion.button>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            </div>
          ))}
          <div className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center bg-white/5 hover:bg-white/15 transition-all cursor-pointer group pointer-events-auto mt-4" onClick={() => setIsAddingCategory(true)}>
             <span className="text-xl font-light text-white opacity-40 group-hover:opacity-100">+</span>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isAddingCategory && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 flex items-center justify-center z-[110] bg-black/90 backdrop-blur-2xl" onClick={() => setIsAddingCategory(false)}>
            <motion.div initial={{ scale: 0.98, y: 30 }} animate={{ scale: 1, y: 0 }} className="glass-hud p-16 rounded-[3.5rem] w-full max-w-md flex flex-col items-center" onClick={e => e.stopPropagation()}>
              <h4 className="text-[12px] uppercase tracking-[0.6em] mb-12 opacity-60 italic text-white">创建新星系</h4>
              <input 
                autoFocus type="text" maxLength={8} value={newCatName} onChange={e => setNewCatName(e.target.value)} 
                onKeyDown={e => e.key === 'Enter' && handleCreateCategory()} placeholder="命名星尘..." 
                className="w-full bg-white/5 border border-white/20 rounded-3xl px-8 py-5 text-xl font-light text-center outline-none focus:border-white/50 transition-all mb-12 text-white"
              />
              <div className="flex gap-8 w-full">
                <button onClick={() => setIsAddingCategory(false)} className="flex-1 py-5 text-[12px] uppercase tracking-[0.4em] text-white/50 italic">取消</button>
                <button onClick={handleCreateCategory} className="flex-1 py-5 bg-white/10 rounded-3xl text-[12px] uppercase tracking-[0.4em] text-white border border-white/20">开启</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="fixed bottom-10 right-10 text-[10px] uppercase tracking-[0.4em] opacity-20 text-white pointer-events-none">Project Stardust v1.1.0</div>

      <AnimatePresence>
        {pendingFragments.length > 0 && (
          <div className="absolute top-32 right-12 bottom-40 w-80 flex flex-col items-end gap-8 z-20 overflow-y-auto no-scrollbar py-8 pointer-events-none">
            {pendingFragments.map((frag) => (
              <motion.div 
                key={frag.id} 
                layout 
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.8 }}
                drag 
                dragSnapToOrigin 
                dragElastic={0.02} 
                onDrag={(_, info) => {
                  updateNearestCategory(info.point);
                }}
                onDragEnd={(_, info) => { 
                  if (dragHoverCategory) {
                    handleFragmentDrop(frag.id, dragHoverCategory, frag.entryId);
                  }
                  setDragHoverCategory(null);
                }} 
                whileDrag={{ 
                  scale: 0.85, 
                  opacity: 0.9, 
                  zIndex: 200,
                  filter: 'brightness(1.5)',
                  cursor: 'grabbing'
                }}
                className="relative glass-hud p-6 pr-10 rounded-[2rem] cursor-grab active:cursor-grabbing text-[14px] italic font-medium leading-relaxed w-full shadow-2xl text-white pointer-events-auto border border-white/20 hover:border-white/40 group/pending"
              >
                “ {frag.text} ”
                
                <button 
                  onClick={(e) => { e.stopPropagation(); discardPendingFragment(frag.id); }}
                  className="absolute top-4 right-4 p-1.5 opacity-0 group-hover/pending:opacity-40 hover:opacity-100 transition-opacity"
                  title="放弃该碎片"
                >
                  ✕
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/95 backdrop-blur-[50px] flex items-center justify-center z-[120]">
            <div className="flex flex-col items-center gap-12">
               <div className="w-16 h-16 border border-white/30 border-t-white animate-spin rounded-full" />
               <div className="text-[14px] font-light uppercase tracking-[1em] text-white animate-pulse">归纳中...</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default App;
