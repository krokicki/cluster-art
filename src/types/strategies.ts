// Strategy interfaces for color and layout

import type { IResource, LegendItem } from './domain';

export interface ColorStrategy {
  colorMap: Map<string | null, string>;
  initialize(resources: IResource[]): void;
  getColor(resource: IResource): string;
  getLegendItems(resources: IResource[]): LegendItem[];
}

export interface LayoutStrategy {
  getName(): string;
  layout(resources: IResource[], gridWidth: number, gridHeight: number): void;
}
