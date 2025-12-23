
export type Category = string;

export interface CategoryInfo {
  id: Category;
  name: string;
  color: string;
  glow: string;
}

export interface DiaryEntry {
  id: string;
  text: string;
  timestamp: number;
  category: Category;
  fragments: string[];
}

export interface StarPoint {
  id: string;
  entryId: string;
  position: [number, number, number];
  color: string;
  content: string;
  category: Category;
  size: number;
}
