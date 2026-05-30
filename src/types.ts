export interface MetalState {
  id: string;
  name: string;
  color: string;
  minPercent: number;
  maxPercent: number;
  defaultPercent: number;
  dustNorm: number;
  dustSmall: number;
  dustTiny: number;
  isPinned: boolean;
  pinnedInputType: 'mb' | 'dust';
  pinnedVolume: number;
  pinnedDustNorm: number;
  pinnedDustSmall: number;
  pinnedDustTiny: number;
  pinnedVolumeInput?: string;
  dustNormInput?: string;
  dustSmallInput?: string;
  dustTinyInput?: string;
  minPercentInput?: string;
  maxPercentInput?: string;
  
  // Nested sub-alloy properties
  isAlloy?: boolean;
  subAlloyKey?: string;
  subAlloyMultiplicity?: number;
  subAlloyMultiplicityInput?: string;
  perfectSubAlloyMode?: boolean;
  selectedPerfectSubAlloyMatchIndex?: number;
  subAlloyComponents?: {
    id: string;
    name: string;
    color: string;
    minPercent: number;
    maxPercent: number;
    defaultPercent: number;
    dustNorm: number;
    dustSmall: number;
    dustTiny: number;
  }[];
}

export interface MetalPreset {
  name: string;
  metals: {
    id: string;
    name: string;
    color: string;
    minPercent: number;
    maxPercent: number;
    defaultPercent: number;
    dustNorm: number;
    dustSmall: number;
    dustTiny: number;
  }[];
}

export interface AlloyCalcState {
  selectedPresetKey: string;
  targetVolume: number;
  targetMultiplicity: number;
  perfectMode: boolean;
  perfectSortBy: 'itemCount' | 'deviation';
  hasExistingMetal: boolean;
  existingMetalVolume: number;
  currentMetals: MetalState[];
  selectedPerfectMatchIndex: number | null;
}
