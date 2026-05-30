import { MetalState } from "./types";

export function getPinnedMetalEquivalentMb(metal: MetalState): number {
  if (metal.pinnedInputType === 'mb') {
    return metal.pinnedVolume;
  } else {
    return metal.pinnedDustNorm * metal.dustNorm + 
           metal.pinnedDustSmall * metal.dustSmall + 
           metal.pinnedDustTiny * metal.dustTiny;
  }
}

export function adjustSumTo100(metals: MetalState[]): MetalState[] {
  const newMetals = metals.map(m => ({ ...m }));
  const total = newMetals.reduce((acc, curr) => acc + curr.defaultPercent, 0);
  const diff = 100 - total;
  if (diff !== 0 && newMetals.length > 0) {
    newMetals[0].defaultPercent = Math.max(0, newMetals[0].defaultPercent + diff);
  }
  return newMetals;
}

export function balancePercentages(activeIdx: number, metals: MetalState[]): MetalState[] {
  if (metals.length <= 1) {
    const newMetals = [...metals];
    if (newMetals[0]) newMetals[0].defaultPercent = 100;
    return newMetals;
  }

  const newMetals = metals.map(m => ({ ...m }));
  const activeMetal = newMetals[activeIdx];
  const remainingTarget = 100 - activeMetal.defaultPercent;
  
  const otherMetalsSum = newMetals.reduce((acc, curr, idx) => {
    return idx !== activeIdx ? acc + curr.defaultPercent : acc;
  }, 0);

  if (otherMetalsSum > 0) {
    newMetals.forEach((m, idx) => {
      if (idx !== activeIdx) {
        m.defaultPercent = Math.round((m.defaultPercent / otherMetalsSum) * remainingTarget);
      }
    });
  } else {
    const count = newMetals.length - 1;
    newMetals.forEach((m, idx) => {
      if (idx !== activeIdx) {
        m.defaultPercent = Math.round(remainingTarget / count);
      }
    });
  }

  return adjustSumTo100(newMetals);
}

export interface PerfectCombo {
  totalVolume: number;
  components: number[];
  percentages: number[];
  totalItems: number;
  deviationScore: number;
}

export interface SolverLookup {
  n: number;
  s: number;
  t: number;
}

export interface ReachablePerMetal {
  metal: MetalState;
  lookup: Record<number, SolverLookup>;
  values: number[];
}

const perfectComboCache = new Map<string, { validCombos: PerfectCombo[]; reachablePerMetal: ReachablePerMetal[] }>();

const serializeMetalsForCache = (metals: MetalState[]): string => {
  return metals.map(m => {
    const subStr = m.isAlloy && m.subAlloyComponents
      ? m.subAlloyComponents.map(sub => `${sub.id}:${sub.minPercent}:${sub.maxPercent}:${sub.defaultPercent}:${sub.dustNorm}:${sub.dustSmall}:${sub.dustTiny}`).join(',')
      : '';
    return `${m.id}:${m.minPercent}:${m.maxPercent}:${m.defaultPercent}:${m.isPinned}:${m.pinnedVolume}:${m.dustNorm}:${m.dustSmall}:${m.dustTiny}:${m.isAlloy}:${m.subAlloyMultiplicity}:${subStr}`;
  }).join('|');
};

export function findPerfectPercentCombinations(
  currentMetals: MetalState[],
  totalVolume: number,
  multiplicity: number,
  existingVolume: number,
  sortBy: 'itemCount' | 'deviation'
): { validCombos: PerfectCombo[]; reachablePerMetal: ReachablePerMetal[] } {
  if (currentMetals.length === 0 || totalVolume <= 0) {
    return { validCombos: [], reachablePerMetal: [] };
  }

  const cacheKey = `${serializeMetalsForCache(currentMetals)}#${totalVolume}#${multiplicity}#${existingVolume}#${sortBy}`;
  if (perfectComboCache.has(cacheKey)) {
    return perfectComboCache.get(cacheKey)!;
  }

  const M = multiplicity || 1;
  const pinnedIdx = currentMetals.findIndex(m => m.isPinned);
  const hasPinned = pinnedIdx !== -1;

  let minSearch = totalVolume;
  let maxSearch = totalVolume;
  let fixedPinnedVolume = 0;

  if (hasPinned) {
    const pm = currentMetals[pinnedIdx];
    fixedPinnedVolume = getPinnedMetalEquivalentMb(pm);
    const maxPct = Math.max(pm.minPercent, pm.maxPercent);
    const minPct = Math.min(pm.minPercent, pm.maxPercent);

    const idealTotal = Math.round(fixedPinnedVolume / (pm.defaultPercent / 100));

    const pctMinSearch = maxPct > 0 ? Math.floor((fixedPinnedVolume / maxPct) * 100) : 10;
    const pctMaxSearch = minPct > 0 ? Math.ceil((fixedPinnedVolume / minPct) * 100) : 100000;

    minSearch = Math.max(pctMinSearch, idealTotal - 1000);
    maxSearch = Math.min(pctMaxSearch, idealTotal + 1000);

    minSearch = Math.max(10 + existingVolume, minSearch);
    maxSearch = Math.min(100000, maxSearch);
  }

  const maxDrySearch = maxSearch - existingVolume;
  if (maxDrySearch <= 0) {
    const res = { validCombos: [], reachablePerMetal: [] };
    perfectComboCache.set(cacheKey, res);
    return res;
  }

  // 1. Generate reachable exact values for dry components of each metal
  const reachablePerMetal: ReachablePerMetal[] = currentMetals.map(metal => {
    const lookup: Record<number, SolverLookup> = {};

    const existingVolForMetal = metal.isPinned ? 0 : (metal.defaultPercent / 100) * existingVolume;
    const minValForMetal = Math.max(0, Math.floor((metal.minPercent / 100) * minSearch - existingVolForMetal));
    const maxValForMetal = Math.min(maxDrySearch, Math.ceil((metal.maxPercent / 100) * maxSearch - existingVolForMetal));
    
    if (metal.isAlloy) {
      const mult = metal.subAlloyMultiplicity || 144;
      // Generate multiples of sub-alloy multiplicity up to maxDrySearch that fit within bounds
      for (let val = 0; val <= maxDrySearch; val += mult) {
        if (val >= minValForMetal && val <= maxValForMetal) {
          lookup[val] = { n: 0, s: 0, t: 0 };
        }
      }
      return {
        metal,
        lookup,
        values: Object.keys(lookup).map(Number).sort((a, b) => a - b)
      };
    }

    const maxN = metal.dustNorm > 0 ? Math.ceil(maxDrySearch / metal.dustNorm) + 1 : 0;
    const maxS = metal.dustSmall > 0 ? Math.ceil(maxDrySearch / metal.dustSmall) + 1 : 0;
    const maxT = metal.dustTiny > 0 ? Math.ceil(maxDrySearch / metal.dustTiny) + 1 : 0;

    // Standard GregTech: 4 small = 1 normal, 9 tiny = 1 normal. No need to loop excessively if normal exists.
    const limitN = metal.dustNorm > 0 ? Math.min(maxN, 100) : 0;
    const limitS = metal.dustSmall > 0 ? (metal.dustNorm > 0 ? Math.min(maxS, 3) : Math.min(maxS, 30)) : 0;
    const limitT = metal.dustTiny > 0 ? (metal.dustNorm > 0 || metal.dustSmall > 0 ? Math.min(maxT, 8) : Math.min(maxT, 35)) : 0;

    for (let n = 0; n <= limitN; n++) {
      const valN = n * metal.dustNorm;
      if (metal.dustNorm > 0 && valN > maxValForMetal) break;

      for (let s = 0; s <= limitS; s++) {
        const valS = valN + s * metal.dustSmall;
        if (metal.dustSmall > 0 && valS > maxValForMetal) break;

        for (let t = 0; t <= limitT; t++) {
          const val = valS + (metal.dustTiny > 0 ? t * metal.dustTiny : 0);
          if (metal.dustTiny > 0 && val > maxValForMetal) break;

          if (val >= minValForMetal && val <= maxValForMetal) {
            const totalPieces = n + s + t;
            if (!lookup[val] || totalPieces < (lookup[val].n + lookup[val].s + lookup[val].t)) {
              lookup[val] = { n, s, t };
            }
          }
          if (metal.dustTiny <= 0) break;
        }
        if (metal.dustSmall <= 0) break;
      }
      if (metal.dustNorm <= 0) break;
    }
    return {
      metal,
      lookup,
      values: Object.keys(lookup).map(Number).sort((a, b) => a - b)
    };
  });

  // Calculate suffix bounds for recursive explorer to prune search paths immediately
  const L = currentMetals.length;
  const minSuffix = new Array(L + 1).fill(0);
  const maxSuffix = new Array(L + 1).fill(0);

  for (let i = L - 1; i >= 0; i--) {
    const vals = reachablePerMetal[i].values;
    const minVal = vals.length > 0 ? vals[0] : 0;
    const maxVal = vals.length > 0 ? vals[vals.length - 1] : 0;
    
    minSuffix[i] = minSuffix[i + 1] + minVal;
    maxSuffix[i] = maxSuffix[i + 1] + maxVal;
  }

  // 2. Recursive explorer to find dry components combined with existingVolume
  const validCombos: PerfectCombo[] = [];

  function explore(metalIdx: number, currentSumDry: number, componentsDry: number[]) {
    if (metalIdx === L) {
      const totalCombinedVolume = currentSumDry + existingVolume;
      if (totalCombinedVolume >= minSearch && totalCombinedVolume <= maxSearch) {
        if (totalCombinedVolume % M !== 0) return;

        let allValid = true;
        const percentages: number[] = [];
        let totalItems = 0;

        for (let i = 0; i < L; i++) {
          const val = componentsDry[i];
          const m = currentMetals[i];
          const existingVolForMetal = m.isPinned ? 0 : (m.defaultPercent / 100) * existingVolume;
          const pct = ((val + existingVolForMetal) / totalCombinedVolume) * 100;
          if (pct < m.minPercent || pct > m.maxPercent) {
            allValid = false;
            break;
          }
          percentages.push(pct);
          
          const solverLookup = reachablePerMetal[i].lookup[val];
          if (solverLookup) {
            totalItems += (solverLookup.n + solverLookup.s + solverLookup.t);
          }
        }
        if (allValid) {
          validCombos.push({
            totalVolume: totalCombinedVolume,
            components: [...componentsDry],
            percentages,
            totalItems,
            deviationScore: 0 // Will adjust below
          });
        }
      }
      return;
    }

    if (hasPinned && metalIdx === pinnedIdx) {
      const val = fixedPinnedVolume;
      if (currentSumDry + val + minSuffix[metalIdx + 1] <= maxDrySearch &&
          currentSumDry + val + maxSuffix[metalIdx + 1] >= minSearch - existingVolume) {
        componentsDry.push(val);
        explore(metalIdx + 1, currentSumDry + val, componentsDry);
        componentsDry.pop();
      }
      return;
    }

    const vals = reachablePerMetal[metalIdx].values;
    for (const val of vals) {
      const tempSum = currentSumDry + val;
      if (tempSum + minSuffix[metalIdx + 1] > maxDrySearch) break; // since values are sorted, further values are too large
      if (tempSum + maxSuffix[metalIdx + 1] < minSearch - existingVolume) continue; // too small to reach minimum

      componentsDry.push(val);
      explore(metalIdx + 1, tempSum, componentsDry);
      componentsDry.pop();
    }
  }

  explore(0, 0, []);

  // Calculate deviation and sort
  validCombos.forEach(combo => {
    let totalDiff = 0;
    for (let i = 0; i < currentMetals.length; i++) {
      totalDiff += Math.abs(combo.percentages[i] - currentMetals[i].defaultPercent);
    }
    combo.deviationScore = totalDiff;
  });

  if (sortBy === 'itemCount') {
    validCombos.sort((a, b) => {
      if (a.totalItems !== b.totalItems) {
        return a.totalItems - b.totalItems;
      }
      return a.deviationScore - b.deviationScore;
    });
  } else {
    validCombos.sort((a, b) => {
      if (Math.abs(a.deviationScore - b.deviationScore) > 0.01) {
        return a.deviationScore - b.deviationScore;
      }
      return a.totalItems - b.totalItems;
    });
  }

  if (perfectComboCache.size > 200) {
    perfectComboCache.clear();
  }
  const result = { validCombos, reachablePerMetal };
  perfectComboCache.set(cacheKey, result);
  return result;
}
