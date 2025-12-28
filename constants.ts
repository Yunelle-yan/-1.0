
import { CategoryInfo } from './types';

export const DEFAULT_CATEGORIES: CategoryInfo[] = [
  { id: 'reading', name: '阅读', color: '#60a5fa', glow: '0 0 20px #60a5fa' }, // 浅蓝色
  { id: 'learning', name: '学习', color: '#fb923c', glow: '0 0 20px #fb923c' }, // 橙色
  { id: 'outfit', name: '尝试', color: '#c084fc', glow: '0 0 20px #c084fc' }, // 紫色
  { id: 'emotion', name: '情绪', color: '#f472b6', glow: '0 0 20px #f472b6' }  // 粉红色
];

export const NEBULA_PARTICLE_COUNT = 45000; 
export const BACKGROUND_STAR_COUNT = 5000;
// 视角调整：Z 轴进一步拉近，Y 轴略微下调以保持沉浸感，使星云更具包围感
export const CAMERA_START_POS: [number, number, number] = [0, 50, 80];
