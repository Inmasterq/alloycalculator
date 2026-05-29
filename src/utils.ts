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
    return { validCombos: [], reachablePerMetal: [] };
  }

  // 1. Generate reachable exact values for dry components of each metal
  const reachablePerMetal: ReachablePerMetal[] = currentMetals.map(metal => {
    const lookup: Record<number, SolverLookup> = {};
    
    const maxN = Math.ceil(maxDrySearch / metal.dustNorm) + 1;
    const maxS = Math.ceil(maxDrySearch / metal.dustSmall) + 1;
    const maxT = Math.ceil(maxDrySearch / metal.dustTiny) + 1;

    // Safety limit of 100 loops to keep calculation fast and robust
    const limitN = Math.min(maxN, 100);
    const limitS = Math.min(maxS, 100);
    const limitT = Math.min(maxT, 100);

    for (let n = 0; n <= limitN; n++) {
      const valN = n * metal.dustNorm;
      if (valN > maxDrySearch) break;

      for (let s = 0; s <= limitS; s++) {
        const valS = valN + s * metal.dustSmall;
        if (valS > maxDrySearch) break;

        for (let t = 0; t <= limitT; t++) {
          const val = valS + t * metal.dustTiny;
          if (val <= maxDrySearch) {
            const totalPieces = n + s + t;
            if (!lookup[val] || totalPieces < (lookup[val].n + lookup[val].s + lookup[val].t)) {
              lookup[val] = { n, s, t };
            }
          }
        }
      }
    }
    return {
      metal,
      lookup,
      values: Object.keys(lookup).map(Number).sort((a, b) => a - b)
    };
  });

  // 2. Recursive explorer to find dry components combined with existingVolume
  const validCombos: PerfectCombo[] = [];

  function explore(metalIdx: number, currentSumDry: number, componentsDry: number[]) {
    if (metalIdx === currentMetals.length) {
      const totalCombinedVolume = currentSumDry + existingVolume;
      if (totalCombinedVolume >= minSearch && totalCombinedVolume <= maxSearch) {
        if (totalCombinedVolume % M !== 0) return;

        let allValid = true;
        const percentages: number[] = [];
        let totalItems = 0;

        for (let i = 0; i < currentMetals.length; i++) {
          const val = componentsDry[i];
          const pct = (val / totalCombinedVolume) * 100;
          const m = currentMetals[i];
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
      componentsDry.push(fixedPinnedVolume);
      explore(metalIdx + 1, currentSumDry + fixedPinnedVolume, componentsDry);
      componentsDry.pop();
      return;
    }

    const vals = reachablePerMetal[metalIdx].values;
    for (const val of vals) {
      if (currentSumDry + val > maxDrySearch) break;
      componentsDry.push(val);
      explore(metalIdx + 1, currentSumDry + val, componentsDry);
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

  return { validCombos, reachablePerMetal };
}
