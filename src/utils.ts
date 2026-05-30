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
  if (metals.length === 0) return [];
  const newMetals = metals.map(m => ({ ...m }));
  
  let total = newMetals.reduce((acc, curr) => acc + curr.defaultPercent, 0);
  let diff = 100 - total;
  
  if (diff === 0) return newMetals;
  
  if (diff > 0) {
    // We need to add diff. Adding to the first element is a good default.
    newMetals[0].defaultPercent = Math.min(100, newMetals[0].defaultPercent + diff);
    // If there's still some leftover (e.g. if the first element was capped), add to others
    total = newMetals.reduce((acc, curr) => acc + curr.defaultPercent, 0);
    diff = 100 - total;
    if (diff > 0) {
      for (let i = 1; i < newMetals.length; i++) {
        const canAdd = 100 - newMetals[i].defaultPercent;
        const add = Math.min(canAdd, diff);
        newMetals[i].defaultPercent += add;
        diff -= add;
        if (diff === 0) break;
      }
    }
  } else {
    // We need to subtract abs(diff) because the total is greater than 100.
    // Let's subtract from the first element first
    const firstVal = newMetals[0].defaultPercent;
    const firstSubtract = Math.min(firstVal, -diff);
    newMetals[0].defaultPercent -= firstSubtract;
    diff += firstSubtract;
    
    // If we still need to subtract more, subtract from other elements starting from the second one
    if (diff < 0) {
      for (let i = 1; i < newMetals.length; i++) {
        const val = newMetals[i].defaultPercent;
        const subtract = Math.min(val, -diff);
        newMetals[i].defaultPercent -= subtract;
        diff += subtract;
        if (diff === 0) break;
      }
    }
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

  // Adjust sum to exactly 100 without modifying the active metal
  const total = newMetals.reduce((acc, curr) => acc + curr.defaultPercent, 0);
  let diff = 100 - total;
  if (diff !== 0) {
    if (diff > 0) {
      // Find a non-active metal to increase
      for (let i = 0; i < newMetals.length; i++) {
        if (i !== activeIdx) {
          const canAdd = 100 - newMetals[i].defaultPercent;
          const add = Math.min(canAdd, diff);
          newMetals[i].defaultPercent += add;
          diff -= add;
          if (diff === 0) break;
        }
      }
    } else {
      // Find non-active metals to decrease
      for (let i = 0; i < newMetals.length; i++) {
        if (i !== activeIdx) {
          const val = newMetals[i].defaultPercent;
          const subtract = Math.min(val, -diff);
          newMetals[i].defaultPercent -= subtract;
          diff += subtract;
          if (diff === 0) break;
        }
      }
    }
  }

  return newMetals;
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
    return `${m.id}:${m.minPercent}:${m.maxPercent}:${m.defaultPercent}:${m.isPinned}:${m.pinnedVolume}:${m.dustNorm}:${m.dustSmall}:${m.dustTiny}:${m.isAlloy}:${m.subAlloyMultiplicity}:${m.perfectSubAlloyMode}:${m.selectedPerfectSubAlloyMatchIndex}:${subStr}`;
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

  // 1. Generate reachable exact values for dry components of each metal once up to maxDrySearch
  const reachablePerMetal: ReachablePerMetal[] = currentMetals.map(metal => {
    const lookup: Record<number, SolverLookup> = {};

    if (metal.isAlloy) {
      const mult = metal.subAlloyMultiplicity || 144;
      // Generate multiples of sub-alloy multiplicity up to maxDrySearch
      for (let val = 0; val <= maxDrySearch; val += mult) {
        lookup[val] = { n: 0, s: 0, t: 0 };
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

    // Use broader limits to find correct answers without excessive search thanks to early breaks
    const limitN = metal.dustNorm > 0 ? Math.min(maxN, 1200) : 0;
    const limitS = metal.dustSmall > 0 ? Math.min(maxS, 32) : 0;
    const limitT = metal.dustTiny > 0 ? Math.min(maxT, 72) : 0;

    for (let n = 0; n <= limitN; n++) {
      const valN = n * metal.dustNorm;
      if (metal.dustNorm > 0 && valN > maxDrySearch) break;

      for (let s = 0; s <= limitS; s++) {
        const valS = valN + s * metal.dustSmall;
        if (metal.dustSmall > 0 && valS > maxDrySearch) break;

        for (let t = 0; t <= limitT; t++) {
          const val = valS + (metal.dustTiny > 0 ? t * metal.dustTiny : 0);
          if (metal.dustTiny > 0 && val > maxDrySearch) break;

          const totalPieces = n + s + t;
          if (!lookup[val] || totalPieces < (lookup[val].n + lookup[val].s + lookup[val].t)) {
            lookup[val] = { n, s, t };
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

  // Binary search helper to find elements in [min, max]
  function getValuesInRange(values: number[], min: number, max: number): number[] {
    if (values.length === 0 || min > max) return [];
    let low = 0;
    let high = values.length - 1;
    let firstIdx = values.length;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (values[mid] >= min) {
        firstIdx = mid;
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }
    low = 0;
    high = values.length - 1;
    let lastIdx = -1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (values[mid] <= max) {
        lastIdx = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    if (firstIdx <= lastIdx) {
      return values.slice(firstIdx, lastIdx + 1);
    }
    return [];
  }

  const L = currentMetals.length;
  const validCombos: PerfectCombo[] = [];

  // Determine possible values of V (total volume including existingVolume) that are multiples of M
  const minV = Math.ceil(minSearch / M) * M;
  const maxV = Math.floor(maxSearch / M) * M;

  let matchesChecked = 0;
  const maxMatchesAllowed = 10000;

  for (let V = minV; V <= maxV; V += M) {
    if (matchesChecked >= maxMatchesAllowed) break;

    const targetDry = V - existingVolume;
    if (targetDry < 0) continue;

    // For this V, filter the valid constructible dry values for each metal
    const validValsPerMetal: number[][] = [];
    let possible = true;

    for (let i = 0; i < L; i++) {
      const m = currentMetals[i];
      const existingVolForMetal = m.isPinned ? 0 : (m.defaultPercent / 100) * existingVolume;

      let minValForV = Math.max(0, Math.ceil((m.minPercent / 100) * V - existingVolForMetal));
      let maxValForV = Math.floor((m.maxPercent / 100) * V - existingVolForMetal);

      if (hasPinned && i === pinnedIdx) {
        if (fixedPinnedVolume < minValForV || fixedPinnedVolume > maxValForV) {
          possible = false;
          break;
        }
        minValForV = fixedPinnedVolume;
        maxValForV = fixedPinnedVolume;
      }

      if (minValForV > maxValForV) {
        possible = false;
        break;
      }

      const inRange = getValuesInRange(reachablePerMetal[i].values, minValForV, maxValForV);
      if (inRange.length === 0) {
        possible = false;
        break;
      }

      validValsPerMetal.push(inRange);
    }

    if (!possible) continue;

    // Precalculate suffix sums for recursive sum solver on the filtered valid sets
    const minSuffixValid = new Array(L + 1).fill(0);
    const maxSuffixValid = new Array(L + 1).fill(0);
    for (let i = L - 1; i >= 0; i--) {
      const vals = validValsPerMetal[i];
      minSuffixValid[i] = minSuffixValid[i + 1] + vals[0];
      maxSuffixValid[i] = maxSuffixValid[i + 1] + vals[vals.length - 1];
    }

    // Now solve subset-sum backtrack over the extremely reduced state space
    function solveSum(metalIdx: number, currentSum: number, path: number[]) {
      if (matchesChecked >= maxMatchesAllowed) return;

      if (metalIdx === L) {
        if (currentSum === targetDry) {
          // Verify exact percentages of each component to avoid any rounding/accuracy edge cases
          let allValidPercentages = true;
          const percentages: number[] = [];
          let totalItems = 0;

          for (let i = 0; i < L; i++) {
            const val = path[i];
            const m = currentMetals[i];
            const existingVolForMetal = m.isPinned ? 0 : (m.defaultPercent / 100) * existingVolume;
            const pct = ((val + existingVolForMetal) / V) * 100;
            if (pct < m.minPercent || pct > m.maxPercent) {
              allValidPercentages = false;
              break;
            }
            percentages.push(pct);

            const solverLookup = reachablePerMetal[i].lookup[val];
            if (solverLookup) {
              totalItems += (solverLookup.n + solverLookup.s + solverLookup.t);
            }
          }

          if (allValidPercentages) {
            validCombos.push({
              totalVolume: V,
              components: [...path],
              percentages,
              totalItems,
              deviationScore: 0
            });
            matchesChecked++;
          }
        }
        return;
      }

      const options = validValsPerMetal[metalIdx];
      for (const val of options) {
        const nextSum = currentSum + val;
        if (nextSum + minSuffixValid[metalIdx + 1] > targetDry) break; // since values are sorted, further values will exceed target
        if (nextSum + maxSuffixValid[metalIdx + 1] < targetDry) continue; // too small to reach target

        path.push(val);
        solveSum(metalIdx + 1, nextSum, path);
        path.pop();
      }
    }

    solveSum(0, 0, []);
  }

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
