import type { TemplateId } from './types';

export interface DeviceTemplate {
  id: Exclude<TemplateId, 'custom'>;
  name: string;
  /** Fit to view has no fixed size. */
  size: { width: number; height: number } | null;
}

export const TEMPLATES: DeviceTemplate[] = [
  { id: 'fit', name: 'Fit to view', size: null },
  { id: 'desktop', name: 'Desktop', size: { width: 960, height: 752 } },
  { id: 'laptop', name: 'Laptop', size: { width: 1440, height: 900 } },
  { id: 'tablet', name: 'Tablet portrait', size: { width: 768, height: 1024 } },
  { id: 'tablet-landscape', name: 'Tablet landscape', size: { width: 1024, height: 768 } },
  { id: 'mobile', name: 'Mobile', size: { width: 390, height: 844 } },
];

/** The sizes the Hatch panel offers. Fit to view is a toggle, so it sits outside this list. */
export const DEVICE_TEMPLATES = TEMPLATES.filter((t): t is DeviceTemplate & { size: { width: number; height: number } } => t.size !== null);

export const MIN_SIZE = 240;
export const MAX_SIZE = 4000;

export const clampSize = (n: number): number => Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(n)));

/** The template whose size matches, or 'custom'. */
export function templateForSize(width: number, height: number): TemplateId {
  const match = TEMPLATES.find((t) => t.size && t.size.width === width && t.size.height === height);
  return match ? match.id : 'custom';
}
