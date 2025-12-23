
import { CategoryInfo } from './types';

export const DEFAULT_CATEGORIES: CategoryInfo[] = [
  { id: 'reading', name: '阅读', color: '#3b82f6', glow: '0 0 20px #3b82f6' },
  { id: 'learning', name: '学习', color: '#f97316', glow: '0 0 20px #f97316' },
  { id: 'outfit', name: '尝试', color: '#a855f7', glow: '0 0 20px #a855f7' },
  { id: 'emotion', name: '情绪', color: '#ec4899', glow: '0 0 20px #ec4899' }
];

export const NEBULA_PARTICLE_COUNT = 45000; 
export const BACKGROUND_STAR_COUNT = 5000;
// 视角调整：Z 轴进一步拉近，Y 轴略微下调以保持沉浸感，使星云更具包围感
export const CAMERA_START_POS: [number, number, number] = [0, 50, 80];
