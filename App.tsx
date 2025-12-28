
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { AnimatePresence, motion } from 'framer-motion';

import Nebula from './components/Nebula.tsx';
import { Category, DiaryEntry, StarPoint, CategoryInfo } from './types.ts';
import { DEFAULT_CATEGORIES, CAMERA_START_POS } from './constants.ts';
import { categorizeEntry } from './services/geminiService.ts';

const AmbientLight = 'ambientLight' as any;
const PointLight = 'pointLight' as any;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const HistoryIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);

const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const PlusIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>
  </svg>
);

const ListIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line>
  </svg>
);

const CameraController: React.FC<{ active: boolean }> = ({ active }) => {
  const controlsRef = useRef<any>(null);
  const { size } = useThree();
  const isMobile = size.width < 768;
  const targetX = active ? (isMobile ? -10 : -35) : 0; 
  
  useFrame(() => {
    if (controlsRef.current) {
      const lerpFactor = 0.06;
      controlsRef.current.target.x = lerp(controlsRef.current.target.x, targetX, lerpFactor);
      controlsRef.current.update();
    }
  });
  return <OrbitControls ref={controlsRef} enableDamping dampingFactor={0.05} minDistance={10} maxDistance={800} />;
};

const InteractiveDiaryText: React.FC<{ 
  text: string, 
  fragments: string[], 
  color: string,
  isEditing: boolean,
  onFragmentClick?: (frag: string) => void
}> = ({ text, fragments, color, isEditing, onFragmentClick }) => {
  if (!text) return null;
  const sortedFrags = Array.from(new Set(fragments)).sort((a: string, b: string) => b.length - a.length);
  const escapedFrags = sortedFrags.map((f: string) => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (escapedFrags.length === 0) return <span className="opacity-90">{text}</span>;
  
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
              className={`inline border-b-2 transition-all duration-300 ${isEditing ? 'cursor-pointer pointer-events-auto hover:brightness-150' : ''}`}
              style={{ borderColor: color, backgroundColor: isEditing ? `${color}44` : 'transparent' }}
            >
              {part}
            </span>
          );
        }
        return <span key={i} className="opacity-70">{part}</span>;
      })}
    </>
  );
};

const App: React.FC = () => {
  const [entries, setEntries] = useState<DiaryEntry[]>(() => JSON.parse(localStorage.getItem('stardust_entries') || '[]'));
  const [stars, setStars] = useState<StarPoint[]>(() => JSON.parse(localStorage.getItem('stardust_stars') || '[]'));
  const [categories, setCategories] = useState<CategoryInfo[]>(() => JSON.parse(localStorage.getItem('stardust_categories') || JSON.stringify(DEFAULT_CATEGORIES)));

  const [isWriting, setIsWriting] = useState(false);
  const [inputText, setInputText] = useState('');
  const [manualFragments, setManualFragments] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingFragments, setPendingFragments] = useState<{ id: string; text: string; category: Category; entryId: string }[]>([]);
  const [dragHoverCategory, setDragHoverCategory] = useState<Category | null>(null);
  const categoryRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  
  const [activeCategory, setActiveCategory] = useState<Category | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showDetailPanel, setShowDetailPanel] = useState(false);
  const [hoveredStarId, setHoveredStarId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => { localStorage.setItem('stardust_entries', JSON.stringify(entries)); }, [entries]);
  useEffect(() => { localStorage.setItem('stardust_stars', JSON.stringify(stars)); }, [stars]);
  useEffect(() => { localStorage.setItem('stardust_categories', JSON.stringify(categories)); }, [categories]);

  const adaptiveCameraPos = useMemo(() => {
    const pos: [number, number, number] = [...CAMERA_START_POS];
    if (isMobile) pos[2] = 160; 
    return pos;
  }, [isMobile]);

  const handleTextSelection = () => {
    if (!textareaRef.current) return;
    const { selectionStart, selectionEnd, value } = textareaRef.current;
    const selection = value.substring(selectionStart, selectionEnd).trim();
    if (selection && selection.length >= 1 && !manualFragments.includes(selection)) {
      setManualFragments(prev => [...prev, selection]);
    }
  };

  const handleRealizeStardust = async () => {
    if (!inputText.trim()) return;
    setLoading(true);
    try {
      const catId = await categorizeEntry(inputText, categories);
      const newEntry: DiaryEntry = {
        id: Date.now().toString(), text: inputText, timestamp: Date.now(),
        category: catId, fragments: manualFragments
      };
      setEntries(prev => [newEntry, ...prev]);
      const newPending = manualFragments.map(f => ({
        id: Math.random().toString(36).substr(2, 9),
        text: f, category: catId, entryId: newEntry.id
      }));
      setPendingFragments(prev => [...prev, ...newPending]);
      setIsWriting(false); setInputText(''); setManualFragments([]);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const spawnStar = (content: string, catId: Category, entryId: string) => {
    const cat = categories.find(c => c.id === catId) || categories[0];
    const angle = Math.random() * Math.PI * 2;
    const r = 30 + Math.random() * 50;
    const newStar: StarPoint = {
      id: Math.random().toString(36).substr(2, 9),
      entryId, position: [Math.cos(angle) * r, (Math.random() - 0.5) * 20, Math.sin(angle) * r],
      color: cat.color, content, category: catId, size: 2.0 + Math.random() * 1.5
    };
    setStars(prev => [...prev, newStar]);
  };

  const deleteEntry = (id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id));
    setStars(prev => prev.filter(s => s.entryId !== id));
  };

  const deleteStar = (id: string) => {
    setStars(prev => prev.filter(s => s.id !== id));
  };

  const handleAddCategory = () => {
    if (!newCategoryName.trim()) {
      setIsAddingCategory(false);
      return;
    }
    const id = newCategoryName.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now();
    const availableColors = [
      '#2dd4bf', '#f87171', '#fbbf24', '#818cf8', '#34d399', 
      '#f472b6', '#a78bfa', '#fb923c', '#22d3ee', '#60a5fa',
      '#4ade80', '#e879f9', '#94a3b8', '#facc15', '#f87171'
    ];
    const color = availableColors[categories.length % availableColors.length];
    const newCat: CategoryInfo = {
      id,
      name: newCategoryName,
      color,
      glow: `0 0 20px ${color}`
    };
    setCategories(prev => [...prev, newCat]);
    setNewCategoryName('');
    setIsAddingCategory(false);
  };

  const renameCategory = (id: string, newName: string) => {
    if (!newName.trim()) {
      setEditingCategoryId(null);
      return;
    }
    setCategories(prev => prev.map(cat => cat.id === id ? { ...cat, name: newName } : cat));
    setEditingCategoryId(null);
  };

  const SHARED_TEXT_STYLES = `font-light leading-[1.8] tracking-normal whitespace-pre-wrap break-words px-6 md:px-12 py-10 w-full h-full ${isMobile ? 'text-xl text-left' : 'text-2xl md:text-3xl text-center'}`;

  const getNearestCategory = (point: { x: number, y: number }) => {
    let nearest: Category | null = null;
    let minDist = 140; 
    Object.entries(categoryRefs.current).forEach(([id, el]) => {
      if (!el) return;
      const rect = (el as HTMLDivElement).getBoundingClientRect();
      const dist = Math.hypot(point.x - (rect.left + rect.width / 2), point.y - (rect.top + rect.height / 2));
      if (dist < minDist) {
        minDist = dist;
        nearest = id;
      }
    });
    return nearest;
  };

  return (
    <div className="relative w-screen h-screen bg-black text-white overflow-hidden serif-tracking font-serif select-none">
      <div className="absolute inset-0 z-0">
        <Canvas dpr={[1, 2]}>
          <PerspectiveCamera makeDefault position={adaptiveCameraPos} fov={45} />
          <CameraController active={showHistory || showDetailPanel} />
          <Nebula 
            stars={stars} categories={categories} activeCategory={activeCategory}
            hoveredStarId={hoveredStarId} setHoveredStar={setHoveredStarId}
            onStarClick={(s) => { 
                setActiveCategory(s.category);
                setShowDetailPanel(true); 
            }}
          />
          <AmbientLight intensity={0.5} />
          <PointLight position={[10, 10, 10]} intensity={1} />
        </Canvas>
      </div>

      {/* 侧边分类栏 */}
      <div className={`absolute z-10 flex ${isMobile ? 'bottom-28 left-1/2 -translate-x-1/2 flex-row gap-8' : 'left-10 top-1/2 -translate-y-1/2 flex-col gap-10'}`}>
        {categories.map(cat => (
          <div key={cat.id} ref={el => categoryRefs.current[cat.id] = el} className="relative flex items-center group">
            <motion.div 
              onClick={() => { 
                  if (activeCategory === cat.id) {
                      setActiveCategory(null);
                      setShowDetailPanel(false);
                  } else {
                      setActiveCategory(cat.id);
                  }
              }}
              animate={{ 
                scale: dragHoverCategory === cat.id ? 1.4 : 1,
                borderColor: (dragHoverCategory === cat.id || activeCategory === cat.id) ? cat.color : 'rgba(255,255,255,0.1)',
                backgroundColor: activeCategory === cat.id ? `${cat.color}33` : 'rgba(255,255,255,0.05)'
              }}
              className={`w-10 h-10 md:w-12 md:h-12 rounded-full border cursor-pointer flex items-center justify-center transition-all backdrop-blur-sm z-30 shadow-lg`}
            >
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat.color, boxShadow: `0 0 15px ${cat.color}` }} />
            </motion.div>
            
            <AnimatePresence>
                {activeCategory === cat.id && (
                    <motion.button
                        initial={{ opacity: 0, x: -15, scale: 0.8 }}
                        animate={{ opacity: 1, x: isMobile ? 0 : 60, y: isMobile ? -50 : 0, scale: 1 }}
                        exit={{ opacity: 0, x: -15, scale: 0.8 }}
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowDetailPanel(!showDetailPanel);
                        }}
                        className="absolute z-20 w-8 h-8 rounded-full border border-white/20 glass-hud flex items-center justify-center text-white/60 hover:text-white transition-all shadow-xl active:scale-95"
                        style={{ borderColor: showDetailPanel ? cat.color : 'rgba(255,255,255,0.2)' }}
                    >
                        <ListIcon />
                    </motion.button>
                )}
            </AnimatePresence>

            <AnimatePresence>
              {dragHoverCategory === cat.id && (
                <motion.div 
                  initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 30 }} exit={{ opacity: 0, x: -10 }}
                  className="absolute left-full ml-4 text-lg md:text-2xl tracking-tighter whitespace-nowrap font-medium text-white"
                  style={{ textShadow: `0 0 25px ${cat.color}, 0 0 10px rgba(255,255,255,0.8)` }}
                >
                  归于 {cat.name}
                </motion.div>
              )}
            </AnimatePresence>

            {!isMobile && (
                <div className="ml-5">
                    {editingCategoryId === cat.id ? (
                        <input 
                            autoFocus
                            defaultValue={cat.name}
                            className="bg-white/5 border border-white/20 rounded-md px-2 py-0.5 text-[10px] tracking-widest outline-none text-white w-24"
                            onBlur={(e) => renameCategory(cat.id, e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') renameCategory(cat.id, (e.target as HTMLInputElement).value);
                                if (e.key === 'Escape') setEditingCategoryId(null);
                            }}
                        />
                    ) : (
                        <span 
                            onDoubleClick={(e) => {
                                e.stopPropagation();
                                setEditingCategoryId(cat.id);
                            }}
                            className={`text-[10px] tracking-[0.4em] uppercase transition-all whitespace-nowrap cursor-text select-text ${activeCategory === cat.id ? 'opacity-100 font-bold' : 'opacity-0 group-hover:opacity-100'}`}
                            style={{ color: activeCategory === cat.id ? cat.color : 'white' }}
                            title="双击重命名"
                        >
                            {cat.name}
                        </span>
                    )}
                </div>
            )}
          </div>
        ))}

        <div className="relative flex items-center group">
          <AnimatePresence>
            {isAddingCategory ? (
              <motion.div 
                initial={{ width: 0, opacity: 0 }} animate={{ width: isMobile ? 120 : 160, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
                className="absolute left-14 h-10 md:h-12 flex items-center gap-2"
              >
                <input 
                  autoFocus
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onBlur={handleAddCategory}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                  placeholder="分类名称"
                  className="bg-white/10 border border-white/20 rounded-full px-4 h-full text-[10px] tracking-widest outline-none text-white w-full placeholder:text-white/20"
                />
              </motion.div>
            ) : (
              <motion.button 
                whileHover={{ scale: 1.1, borderColor: 'rgba(255,255,255,0.4)' }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setIsAddingCategory(true)}
                className="w-10 h-10 md:w-12 md:h-12 rounded-full border border-dashed border-white/20 flex items-center justify-center text-white/40 hover:text-white/80 transition-all bg-white/5"
              >
                <PlusIcon />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="absolute bottom-10 inset-x-0 z-20 flex justify-center items-center gap-8 px-6">
        <motion.button 
          whileTap={{ scale: 0.9 }} onClick={() => setShowHistory(true)}
          className="w-12 h-12 rounded-full border border-white/10 glass-hud flex items-center justify-center text-white/40 hover:text-white"
        >
          <HistoryIcon />
        </motion.button>
        
        <motion.button 
          whileTap={{ scale: 0.95 }} onClick={() => setIsWriting(true)}
          className="px-14 py-4 rounded-full border border-white/20 glass-hud text-xs tracking-[0.6em] uppercase text-white/90 min-w-[180px]"
        >
          记录星尘
        </motion.button>
      </div>

      {/* 写作模式：优化 Overlay 的层级与交互，确保点击碎片可取消标记 */}
      <AnimatePresence>
        {isWriting && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/95 backdrop-blur-3xl flex flex-col items-center justify-center p-6 md:p-20">
             <div className="relative w-full max-w-5xl h-2/3 md:h-3/4 border border-white/10 rounded-3xl overflow-hidden bg-white/5">
                {/* 文字叠加层：置于 Textarea 之上 (z-10)，但整体禁用 pointer-events 以便点击穿透到 Textarea */}
                <div 
                  ref={overlayRef} 
                  className={`absolute inset-0 pointer-events-none select-none overflow-hidden ${SHARED_TEXT_STYLES} text-transparent z-10`}
                >
                  <InteractiveDiaryText 
                    text={inputText} 
                    fragments={manualFragments} 
                    color="#00f2ff" 
                    isEditing={true} 
                    onFragmentClick={(f) => {
                      // 这里触发取消标记
                      setManualFragments(prev => prev.filter(p => p !== f));
                    }} 
                  />
                </div>
                
                {/* 实际输入框：置于底部 (z-0)，接收点击并获得焦点 */}
                <textarea 
                  ref={textareaRef} 
                  autoFocus 
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)} 
                  onSelect={handleTextSelection}
                  onScroll={(e) => { 
                    if(overlayRef.current) overlayRef.current.scrollTop = e.currentTarget.scrollTop; 
                  }}
                  placeholder="记录此刻星光..."
                  className={`${SHARED_TEXT_STYLES} bg-transparent border-none outline-none resize-none no-scrollbar text-white/90 placeholder:text-white/20 caret-white selection:bg-white/20 z-0`}
                  spellCheck={false}
                />
                
                <div className="absolute bottom-6 left-8 right-8 flex justify-between items-center text-[10px] tracking-[0.2em] uppercase opacity-40 italic z-20">
                  <div>字数: {inputText.length}</div>
                  <div className="text-[#00f2ff]">已选碎片: {manualFragments.length} (直接点击文中碎片可取消)</div>
                </div>
             </div>
             
             <div className="mt-10 flex flex-row gap-12 items-center justify-center w-full">
                <button onClick={() => { setIsWriting(false); setInputText(''); setManualFragments([]); }} className="text-white/40 uppercase tracking-widest text-[10px] hover:text-white transition-colors">消逝</button>
                <button 
                  disabled={!inputText.trim() || loading} onClick={handleRealizeStardust}
                  className="px-16 md:px-24 py-4 bg-white/5 border border-white/20 rounded-full uppercase tracking-[0.8em] text-[10px] md:text-sm hover:bg-white/20 disabled:opacity-20 text-white transition-all shadow-xl"
                >
                  {loading ? '星流汇聚' : '具现'}
                </button>
             </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showHistory && (
          <motion.div 
            initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
            className="fixed inset-y-0 left-0 w-full md:w-96 z-[60] glass-hud border-r border-white/10 backdrop-blur-3xl flex flex-col p-8 shadow-2xl"
          >
            <div className="flex justify-between items-center mb-10 mt-10 md:mt-0">
              <h2 className="text-xs tracking-[0.5em] uppercase opacity-50 italic">星历记录</h2>
              <button onClick={() => setShowHistory(false)} className="text-white/40 hover:text-white text-lg transition-colors">✕</button>
            </div>
            
            <div className="flex-1 overflow-y-auto no-scrollbar space-y-8 pr-2">
              {entries.length === 0 && <div className="text-center py-40 opacity-20 text-[10px] tracking-widest uppercase italic">星轨空寂</div>}
              {entries.map(entry => (
                <div key={entry.id} className="group relative p-6 rounded-2xl bg-white/5 border border-white/5 hover:border-white/10 transition-all">
                  <div className="flex justify-between items-start mb-4">
                    <span className="text-[10px] opacity-30 italic font-light">{new Date(entry.timestamp).toLocaleDateString()}</span>
                    <button onClick={() => deleteEntry(entry.id)} className="opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-opacity text-red-400">
                      <TrashIcon />
                    </button>
                  </div>
                  <div className="text-sm italic font-light leading-relaxed opacity-80">
                    <InteractiveDiaryText text={entry.text} fragments={entry.fragments} color={categories.find(c => c.id === entry.category)?.color || '#fff'} isEditing={false} />
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={`absolute z-30 flex flex-col gap-5 pointer-events-none ${isMobile ? 'top-14 left-6 right-6 items-center' : 'top-20 right-24 items-end'}`}>
        {pendingFragments.map(frag => (
          <motion.div 
            key={frag.id} drag dragSnapToOrigin
            onDrag={(_, info) => setDragHoverCategory(getNearestCategory(info.point))}
            onDragEnd={(_, info) => {
              const nearestCat = getNearestCategory(info.point);
              if (nearestCat) {
                spawnStar(frag.text, nearestCat, frag.entryId);
                setPendingFragments(prev => prev.filter(p => p.id !== frag.id));
              }
              setDragHoverCategory(null);
            }}
            className="p-5 bg-black/40 backdrop-blur-3xl border border-white/10 rounded-2xl pointer-events-auto cursor-grab active:cursor-grabbing text-xs italic text-white/90 shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
          >
            “ {frag.text} ”
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {showDetailPanel && activeCategory && (
          <motion.div 
            initial={{ x: isMobile ? 0 : -50, y: isMobile ? '100%' : 0, opacity: 0 }} 
            animate={{ x: isMobile ? 0 : 0, y: 0, opacity: 1 }} 
            exit={{ x: isMobile ? 0 : -50, y: isMobile ? '100%' : 0, opacity: 0 }}
            className={`fixed z-[60] glass-hud border-white/10 backdrop-blur-3xl flex flex-col p-8 ${isMobile ? 'inset-x-0 bottom-0 h-2/3 rounded-t-[3rem] border-t shadow-2xl' : 'left-[100px] top-[30%] -translate-y-1/2 w-[420px] h-[75vh] rounded-[2.5rem] border shadow-2xl'}`}
          >
            <div className="flex justify-between items-center mb-10 shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: categories.find(c => c.id === activeCategory)?.color, boxShadow: `0 0 15px ${categories.find(c => c.id === activeCategory)?.color}` }} />
                <h3 className="text-xs tracking-[0.6em] uppercase opacity-80 italic">{categories.find(c => c.id === activeCategory)?.name} 星系</h3>
              </div>
              <button onClick={() => { setShowDetailPanel(false); }} className="text-white/30 hover:text-white transition-colors text-xl">✕</button>
            </div>
            
            <div className="flex-1 overflow-y-auto no-scrollbar space-y-6 pr-2">
              {stars.filter(s => s.category === activeCategory).map(star => (
                <div key={star.id} className="group relative p-6 rounded-2xl bg-white/5 border border-white/5 text-sm italic font-light leading-relaxed hover:bg-white/10 transition-all border-l-2" style={{ borderLeftColor: star.color }}>
                  “ {star.content} ”
                  <button 
                    onClick={() => deleteStar(star.id)}
                    className="absolute right-4 top-4 opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-all text-red-400 p-1 rounded-full hover:bg-red-400/10"
                  >
                    <TrashIcon />
                  </button>
                </div>
              ))}
              {stars.filter(s => s.category === activeCategory).length === 0 && (
                <div className="text-center py-40 opacity-10 text-[10px] tracking-[0.8em] uppercase italic">虚空之境</div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {loading && (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-xl flex items-center justify-center">
          <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin shadow-[0_0_30px_rgba(255,255,255,0.2)]" />
        </div>
      )}
    </div>
  );
};

export default App;
