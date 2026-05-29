import React, { useState, useEffect } from "react";
import { 
  Flame, 
  Settings, 
  Plus, 
  Trash2, 
  Sliders, 
  Calculator, 
  Weight, 
  Layers, 
  BookOpen, 
  Sparkles, 
  CheckCircle2, 
  X, 
  Scale, 
  Save, 
  Lock, 
  BookOpenCheck,
  ChevronDown,
  Info,
  RotateCcw
} from "lucide-react";

import { PRESETS } from "./constants";
import { MetalState, MetalPreset } from "./types";
import { 
  getPinnedMetalEquivalentMb, 
  balancePercentages, 
  adjustSumTo100, 
  findPerfectPercentCombinations 
} from "./utils";

const LOCAL_STORAGE_KEY = "gregtech_tfc_alloy_calc_state_v3";

// --- Safe Mathematical Expression Evaluator ---
export function evaluateMathExpression(expr: string): number | null {
  if (!expr) return null;
  // Replace comma decimal separators with dots for standard mathematical formatting
  const clean = expr.replace(/,/g, '.').replace(/[^0-9.+\-*/() ]/g, '').trim();
  if (!clean) return null;
  try {
    const result = new Function(`return (${clean})`)();
    if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
      return result;
    }
  } catch (e) {
    // Math expression is in-progress or contains syntax issues
  }
  return null;
}

export default function App() {
  // --- States ---
  const [presets, setPresets] = useState<Record<string, MetalPreset>>(() => {
    try {
      const saved = localStorage.getItem("gregtech_tfc_dynamic_presets_v3");
      return saved ? JSON.parse(saved) : PRESETS;
    } catch {
      return PRESETS;
    }
  });

  const [selectedPresetKey, setSelectedPresetKey] = useState<string>("bronze");
  const [targetVolume, setTargetVolume] = useState<number>(2016);
  const [targetVolumeInput, setTargetVolumeInput] = useState<string>("2016");
  
  const [targetMultiplicity, setTargetMultiplicity] = useState<number>(144);
  const [targetMultiplicityInput, setTargetMultiplicityInput] = useState<string>("144");

  const [perfectMode, setPerfectMode] = useState<boolean>(false);
  const [perfectSortBy, setPerfectSortBy] = useState<'itemCount' | 'deviation'>("itemCount");
  
  const [hasExistingMetal, setHasExistingMetal] = useState<boolean>(false);
  const [existingMetalVolume, setExistingMetalVolume] = useState<number>(0);
  const [existingMetalVolumeInput, setExistingMetalVolumeInput] = useState<string>("0");

  const [currentMetals, setCurrentMetals] = useState<MetalState[]>([]);
  const [selectedPerfectMatchIndex, setSelectedPerfectMatchIndex] = useState<number | null>(null);
  const [autosaveVisible, setAutosaveVisible] = useState<boolean>(false);

  // For Preset Creation Modal
  const [newPresetName, setNewPresetName] = useState<string>("");
  const [showSavePresetDialog, setShowSavePresetDialog] = useState<boolean>(false);

  // --- Load Initial State ---
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.presets) setPresets(parsed.presets);
        if (parsed.selectedPresetKey) setSelectedPresetKey(parsed.selectedPresetKey);
        
        if (parsed.targetVolume !== undefined) {
          setTargetVolume(parsed.targetVolume);
          setTargetVolumeInput(parsed.targetVolumeInput ?? parsed.targetVolume.toString());
        }
        if (parsed.targetMultiplicity !== undefined) {
          setTargetMultiplicity(parsed.targetMultiplicity);
          setTargetMultiplicityInput(parsed.targetMultiplicityInput ?? parsed.targetMultiplicity.toString());
        }
        if (parsed.perfectMode !== undefined) setPerfectMode(parsed.perfectMode);
        if (parsed.perfectSortBy !== undefined) setPerfectSortBy(parsed.perfectSortBy);
        if (parsed.hasExistingMetal !== undefined) setHasExistingMetal(parsed.hasExistingMetal);
        if (parsed.existingMetalVolume !== undefined) {
          setExistingMetalVolume(parsed.existingMetalVolume);
          setExistingMetalVolumeInput(parsed.existingMetalVolumeInput ?? parsed.existingMetalVolume.toString());
        }
        if (parsed.currentMetals !== undefined) {
          const parsedMetals = parsed.currentMetals.map((m: any) => ({
            ...m,
            pinnedVolumeInput: m.pinnedVolumeInput ?? (m.pinnedVolume ?? 144).toString(),
            dustNormInput: m.dustNormInput ?? (m.dustNorm ?? 100).toString(),
            dustSmallInput: m.dustSmallInput ?? (m.dustSmall ?? 25).toString(),
            dustTinyInput: m.dustTinyInput ?? (m.dustTiny ?? 10).toString(),
            minPercentInput: m.minPercentInput ?? (m.minPercent ?? 0).toString(),
            maxPercentInput: m.maxPercentInput ?? (m.maxPercent ?? 100).toString(),
          }));
          setCurrentMetals(parsedMetals);
        } else {
          resetToPreset("bronze", parsed.presets || presets);
        }
        if (parsed.selectedPerfectMatchIndex !== undefined) {
          setSelectedPerfectMatchIndex(parsed.selectedPerfectMatchIndex);
        }
      } else {
        resetToPreset("bronze", presets);
      }
    } catch (e) {
      console.error("Error loading localStorage state:", e);
      resetToPreset("bronze", presets);
    }
  }, []);

  // --- Auto-Save To LocalStorage ---
  useEffect(() => {
    if (currentMetals.length === 0) return;

    const timer = setTimeout(() => {
      const stateToSave = {
        selectedPresetKey,
        targetVolume,
        targetVolumeInput,
        targetMultiplicity,
        targetMultiplicityInput,
        perfectMode,
        perfectSortBy,
        hasExistingMetal,
        existingMetalVolume,
        existingMetalVolumeInput,
        currentMetals,
        selectedPerfectMatchIndex,
        presets,
      };
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(stateToSave));
      localStorage.setItem("gregtech_tfc_dynamic_presets_v3", JSON.stringify(presets));
      
      setAutosaveVisible(true);
      const flashTimer = setTimeout(() => setAutosaveVisible(false), 1500);
      return () => clearTimeout(flashTimer);
    }, 400);

    return () => clearTimeout(timer);
  }, [
    selectedPresetKey,
    targetVolume,
    targetVolumeInput,
    targetMultiplicity,
    targetMultiplicityInput,
    perfectMode,
    perfectSortBy,
    hasExistingMetal,
    existingMetalVolume,
    existingMetalVolumeInput,
    currentMetals,
    selectedPerfectMatchIndex,
    presets,
  ]);

  // Helper setup
  function setupMetalState(metals: any[]): MetalState[] {
    return metals.map(m => ({
      ...m,
      isPinned: m.isPinned ?? false,
      pinnedInputType: m.pinnedInputType ?? 'mb',
      pinnedVolume: m.pinnedVolume ?? 144,
      pinnedVolumeInput: (m.pinnedVolume ?? 144).toString(),
      pinnedDustNorm: m.pinnedDustNorm ?? 1,
      pinnedDustSmall: m.pinnedDustSmall ?? 0,
      pinnedDustTiny: m.pinnedDustTiny ?? 0,
      dustNormInput: (m.dustNorm ?? 100).toString(),
      dustSmallInput: (m.dustSmall ?? 25).toString(),
      dustTinyInput: (m.dustTiny ?? 10).toString(),
      minPercentInput: (m.minPercent ?? 0).toString(),
      maxPercentInput: (m.maxPercent ?? 100).toString(),
    }));
  }

  const resetToPreset = (key: string, customPresetsList?: Record<string, MetalPreset>) => {
    const list = customPresetsList || presets;
    if (list[key]) {
      const initialMetals = setupMetalState(JSON.parse(JSON.stringify(list[key].metals)));
      setCurrentMetals(initialMetals);
      setSelectedPerfectMatchIndex(0);
    }
  };

  // Preset Selection Event Handler
  const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const key = e.target.value;
    setSelectedPresetKey(key);
    setSelectedPerfectMatchIndex(0);
    resetToPreset(key);
  };

  // --- Handlers for metals configuration ---
  const handleUpdateMetalName = (index: number, name: string) => {
    const updated = currentMetals.map((m, idx) => idx === index ? { ...m, name } : m);
    setCurrentMetals(updated);
  };

  const handleTogglePinMetal = (index: number, isChecked: boolean) => {
    const updated = currentMetals.map((m, idx) => {
      if (idx === index) {
        return { ...m, isPinned: isChecked };
      }
      return { ...m, isPinned: false }; // Only one metal can be pinned at a time
    });
    setCurrentMetals(updated);
    setSelectedPerfectMatchIndex(0);
  };

  const handleSetPinnedInputType = (index: number, type: 'mb' | 'dust') => {
    const updated = currentMetals.map((m, idx) => idx === index ? { ...m, pinnedInputType: type } : m);
    setCurrentMetals(updated);
    setSelectedPerfectMatchIndex(0);
  };

  const handleUpdatePinnedVolume = (index: number, valStr: string) => {
    const updated = currentMetals.map((m, idx) => {
      if (idx === index) {
        let volume = m.pinnedVolume;
        const parsed = evaluateMathExpression(valStr);
        if (parsed !== null && parsed > 0) {
          volume = Math.round(parsed);
        }
        return { 
          ...m, 
          pinnedVolumeInput: valStr, 
          pinnedVolume: volume 
        };
      }
      return m;
    });
    setCurrentMetals(updated);
    setSelectedPerfectMatchIndex(0);
  };

  const handleBlurEvaluatePinnedVolume = (index: number) => {
    const updated = currentMetals.map((m, idx) => {
      if (idx === index && m.pinnedVolumeInput) {
        const parsed = evaluateMathExpression(m.pinnedVolumeInput);
        const resolvedVal = parsed !== null && parsed > 0 ? Math.round(parsed) : m.pinnedVolume;
        return {
          ...m,
          pinnedVolume: resolvedVal,
          pinnedVolumeInput: resolvedVal.toString()
        };
      }
      return m;
    });
    setCurrentMetals(updated);
  };

  const handleAdjustPinnedDust = (index: number, field: 'pinnedDustNorm' | 'pinnedDustSmall' | 'pinnedDustTiny', amount: number) => {
    const updated = currentMetals.map((m, idx) => {
      if (idx === index) {
        return {
          ...m,
          [field]: Math.max(0, (m[field] as number) + amount)
        };
      }
      return m;
    });
    setCurrentMetals(updated);
    setSelectedPerfectMatchIndex(0);
  };

  const handleUpdatePercentBound = (index: number, field: 'minPercent' | 'maxPercent', valStr: string) => {
    const updated = currentMetals.map((m, idx) => {
      if (idx === index) {
        let val = m[field];
        const parsed = evaluateMathExpression(valStr);
        if (parsed !== null && parsed >= 0 && parsed <= 100) {
          val = Math.round(parsed);
        }
        return {
          ...m,
          [`${field}Input`]: valStr,
          [field]: val
        };
      }
      return m;
    });
    setCurrentMetals(updated);
    setSelectedPerfectMatchIndex(0);
  };

  const handleBlurEvaluatePercentBound = (index: number, field: 'minPercent' | 'maxPercent') => {
    const updated = currentMetals.map((m, idx) => {
      if (idx === index) {
        const inputStr = m[`${field}Input` as keyof MetalState] as string;
        const parsed = evaluateMathExpression(inputStr || "");
        const resolvedVal = parsed !== null && parsed >= 0 && parsed <= 100 ? Math.round(parsed) : m[field];
        return {
          ...m,
          [field]: resolvedVal,
          [`${field}Input`]: resolvedVal.toString()
        };
      }
      return m;
    });
    setCurrentMetals(updated);
  };

  const handleUpdateTargetPercent = (index: number, valStr: string) => {
    const val = Math.max(0, Math.min(100, parseInt(valStr) || 0));
    let updated = currentMetals.map((m, idx) => idx === index ? { ...m, defaultPercent: val } : m);
    updated = balancePercentages(index, updated);
    setCurrentMetals(updated);
    setSelectedPerfectMatchIndex(0);
  };

  const handleUpdateMetalDustCalibration = (index: number, field: 'dustNorm' | 'dustSmall' | 'dustTiny', valStr: string) => {
    const updated = currentMetals.map((m, idx) => {
      if (idx === index) {
        let val = m[field];
        const parsed = evaluateMathExpression(valStr);
        if (parsed !== null && parsed > 0) {
          val = Math.round(parsed);
        }
        return {
          ...m,
          [`${field}Input`]: valStr,
          [field]: val
        };
      }
      return m;
    });
    setCurrentMetals(updated);
    setSelectedPerfectMatchIndex(0);
  };

  const handleBlurEvaluateMetalDustCalibration = (index: number, field: 'dustNorm' | 'dustSmall' | 'dustTiny') => {
    const updated = currentMetals.map((m, idx) => {
      if (idx === index) {
        const inputStr = m[`${field}Input` as keyof MetalState] as string;
        const parsed = evaluateMathExpression(inputStr || "");
        const resolvedVal = parsed !== null && parsed > 0 ? Math.round(parsed) : m[field];
        return {
          ...m,
          [field]: resolvedVal,
          [`${field}Input`]: resolvedVal.toString()
        };
      }
      return m;
    });
    setCurrentMetals(updated);
  };

  const handleAddMetal = () => {
    const colors = [
      "from-teal-600 to-emerald-700",
      "from-pink-500 to-rose-600",
      "from-sky-300 to-indigo-455",
      "from-yellow-400 to-amber-500",
      "from-purple-500 to-violet-600"
    ];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    
    const newMetal: MetalState = {
      id: `metal_${Date.now()}`,
      name: `Новый Металл ${currentMetals.length + 1}`,
      color: randomColor,
      minPercent: 10,
      maxPercent: 40,
      defaultPercent: 20,
      dustNorm: 100,
      dustSmall: 25,
      dustTiny: 10,
      isPinned: false,
      pinnedInputType: 'mb',
      pinnedVolume: 100,
      pinnedDustNorm: 1,
      pinnedDustSmall: 0,
      pinnedDustTiny: 0
    };

    const newMetalsList = [...currentMetals, newMetal];
    setSelectedPerfectMatchIndex(0);
    const balanced = adjustSumTo100(newMetalsList);
    setCurrentMetals(balanced);
    setSelectedPresetKey("custom");
  };

  const handleRemoveMetal = (index: number) => {
    const filtered = currentMetals.filter((_, idx) => idx !== index);
    if (filtered.length > 0) {
      const sum = filtered.reduce((acc, curr) => acc + curr.defaultPercent, 0);
      if (sum > 0) {
        filtered.forEach(m => {
          m.defaultPercent = Math.round((m.defaultPercent / sum) * 100);
        });
      } else {
        filtered[0].defaultPercent = 100;
      }
      const adjusted = adjustSumTo100(filtered);
      setCurrentMetals(adjusted);
    } else {
      setCurrentMetals([]);
    }
    setSelectedPerfectMatchIndex(0);
  };

  // --- Live Math Formula Input Handlers ---
  const handleTargetVolumeInputChange = (valStr: string) => {
    setTargetVolumeInput(valStr);
    const parsed = evaluateMathExpression(valStr);
    if (parsed !== null && parsed > 0) {
      setTargetVolume(Math.round(parsed));
      setSelectedPerfectMatchIndex(0);
    }
  };

  const handleBlurEvaluateTargetVolume = () => {
    const parsed = evaluateMathExpression(targetVolumeInput);
    if (parsed !== null && parsed > 0) {
      const rounded = Math.round(parsed);
      setTargetVolume(rounded);
      setTargetVolumeInput(rounded.toString());
    } else {
      setTargetVolumeInput(targetVolume.toString());
    }
  };

  const handleExistingMetalVolumeInputChange = (valStr: string) => {
    setExistingMetalVolumeInput(valStr);
    const parsed = evaluateMathExpression(valStr);
    if (parsed !== null && parsed >= 0) {
      setExistingMetalVolume(Math.round(parsed));
      setSelectedPerfectMatchIndex(0);
    }
  };

  const handleBlurEvaluateExistingMetal = () => {
    const parsed = evaluateMathExpression(existingMetalVolumeInput);
    if (parsed !== null && parsed >= 0) {
      const rounded = Math.round(parsed);
      setExistingMetalVolume(rounded);
      setExistingMetalVolumeInput(rounded.toString());
    } else {
      setExistingMetalVolumeInput(existingMetalVolume.toString());
    }
  };

  const handleTargetMultiplicityInputChange = (valStr: string) => {
    setTargetMultiplicityInput(valStr);
    const parsed = evaluateMathExpression(valStr);
    if (parsed !== null && parsed > 0) {
      setTargetMultiplicity(Math.round(parsed));
      setSelectedPerfectMatchIndex(0);
    }
  };

  const handleBlurEvaluateTargetMultiplicity = () => {
    const parsed = evaluateMathExpression(targetMultiplicityInput);
    if (parsed !== null && parsed > 0) {
      const rounded = Math.round(parsed);
      setTargetMultiplicity(rounded);
      setTargetMultiplicityInput(rounded.toString());
    } else {
      setTargetMultiplicityInput(targetMultiplicity.toString());
    }
  };

  // --- Preset CRUD Handlers ---
  const handleSaveAsPreset = () => {
    if (!newPresetName.trim()) return;
    const newKey = `user_preset_${Date.now()}`;
    const newPresetDetails = {
      name: newPresetName.trim(),
      metals: currentMetals.map(m => ({
        id: m.id,
        name: m.name,
        color: m.color,
        minPercent: m.minPercent,
        maxPercent: m.maxPercent,
        defaultPercent: m.defaultPercent,
        dustNorm: m.dustNorm,
        dustSmall: m.dustSmall,
        dustTiny: m.dustTiny
      }))
    };
    const updatedPresets = {
      ...presets,
      [newKey]: newPresetDetails
    };
    setPresets(updatedPresets);
    setSelectedPresetKey(newKey);
    setNewPresetName("");
    setShowSavePresetDialog(false);
  };

  const handleDeletePreset = () => {
    const remainingKeys = Object.keys(presets).filter(k => k !== selectedPresetKey);
    if (remainingKeys.length === 0) return;
    const nextKey = remainingKeys[0];
    const { [selectedPresetKey]: _, ...updatedPresets } = presets;
    setPresets(updatedPresets);
    setSelectedPresetKey(nextKey);
    resetToPreset(nextKey, updatedPresets);
  };

  const handleRestoreDefaultPresets = () => {
    setPresets(PRESETS);
    setSelectedPresetKey("bronze");
    resetToPreset("bronze", PRESETS);
  };

  // Fast multiplicity helpers
  const handleSetMultiplicity = (val: number) => {
    setTargetMultiplicity(val);
    setSelectedPerfectMatchIndex(0);
  };

  // --- Calculations ---
  const pinnedIdx = currentMetals.findIndex(m => m.isPinned);
  const hasPinned = pinnedIdx !== -1;
  const existingVolume = hasExistingMetal ? Math.max(0, existingMetalVolume) : 0;

  // Derive net target alloy volume (which may change dynamically if pinned metal is set)
  let derivedTargetVolume = targetVolume;
  if (hasPinned) {
    const pm = currentMetals[pinnedIdx];
    const dryAdded = getPinnedMetalEquivalentMb(pm);
    const pinnedPercent = pm.defaultPercent || 1;
    derivedTargetVolume = Math.round(dryAdded / (pinnedPercent / 100)) + existingVolume;
    
    // Round to multiplicity
    if (!perfectMode && targetMultiplicity > 1) {
      derivedTargetVolume = Math.round(derivedTargetVolume / targetMultiplicity) * targetMultiplicity;
    }
  } else {
    // Standard target volume rounded on-fly
    if (targetMultiplicity > 1) {
      derivedTargetVolume = Math.round(targetVolume / targetMultiplicity) * targetMultiplicity;
    }
  }

  // Running dry mass calculations
  const dryNeeded = derivedTargetVolume - existingVolume;

  let perfectOptions: any[] = [];
  let perfectReachableLookup: any[] = [];
  let showPerfectModeAlert = false;

  if (perfectMode && derivedTargetVolume > 0 && dryNeeded >= 0) {
    const searchRes = findPerfectPercentCombinations(
      currentMetals,
      derivedTargetVolume,
      targetMultiplicity,
      existingVolume,
      perfectSortBy
    );
    perfectOptions = searchRes.validCombos;
    perfectReachableLookup = searchRes.reachablePerMetal;
    
    if (perfectOptions.length === 0) {
      showPerfectModeAlert = true;
    }
  }

  // Determine current active perfect match if selected
  const activePerfectMatch = (perfectMode && perfectOptions.length > 0) 
    ? perfectOptions[selectedPerfectMatchIndex ?? 0] ?? perfectOptions[0]
    : null;

  if (activePerfectMatch) {
    derivedTargetVolume = activePerfectMatch.totalVolume;
  }

  // Building final recipes results structure
  let results: {
    metal: MetalState;
    solution: { norm: number; small: number; tiny: number; totalVal: number };
    targetMb: number;
    minPercent: number;
    maxPercent: number;
  }[] = [];

  if (perfectMode && activePerfectMatch) {
    results = currentMetals.map((metal, idx) => {
      const targetMb = activePerfectMatch.components[idx];
      const lookupObj = perfectReachableLookup[idx]?.lookup[targetMb] || { n: 0, s: 0, t: 0 };
      return {
        metal,
        solution: {
          norm: lookupObj.n,
          small: lookupObj.s,
          tiny: lookupObj.t,
          totalVal: targetMb
        },
        targetMb,
        minPercent: metal.minPercent,
        maxPercent: metal.maxPercent
      };
    });
  } else {
    // Normal heuristic solver matching desired percentage ratio
    const metalTargets = currentMetals.map((metal, idx) => {
      const sharePct = metal.defaultPercent;
      const minMb = Math.max(0, Math.floor((metal.minPercent / 100) * derivedTargetVolume));
      const maxMb = Math.max(0, Math.ceil((metal.maxPercent / 100) * derivedTargetVolume));
      
      const idealMb = Math.max(
        0, 
        Math.round((sharePct / 100) * derivedTargetVolume) - 
        (metal.isPinned ? 0 : Math.round((sharePct / 100) * existingVolume))
      );
      
      return { metal, idx, minMb, maxMb, targetMb: idealMb };
    });

    results = metalTargets.map((targetObj, idx) => {
      const m = targetObj.metal;
      const minVal = targetObj.minMb;
      const maxVal = targetObj.maxMb;
      let finalTarget = targetObj.targetMb;

      let finalMin = Math.max(0, minVal - (idx === 0 ? existingVolume : 0));
      let finalMax = Math.max(0, maxVal - (idx === 0 ? existingVolume : 0));

      if (m.isPinned) {
        const val = getPinnedMetalEquivalentMb(m);
        finalTarget = val;
        finalMin = val;
        finalMax = val;
      }

      // Loop dust counts to minimize delta
      let bestSol = { n: 0, s: 0, t: 0, totalVal: 0 };
      let minPenalty = Infinity;

      const maxNorm = Math.ceil(Math.max(finalMax, finalTarget) / m.dustNorm) + 2;
      const maxSmall = Math.ceil(Math.max(finalMax, finalTarget) / m.dustSmall) + 2;
      const maxTiny = Math.ceil(Math.max(finalMax, finalTarget) / m.dustTiny) + 2;

      // Restrict iteration sizes for fast live response
      const limN = Math.min(maxNorm, 40);
      const limS = Math.min(maxSmall, 40);
      const limT = Math.min(maxTiny, 45);

      for (let n = 0; n <= limN; n++) {
        const valN = n * m.dustNorm;
        if (valN > finalMax + m.dustNorm) break;

        for (let s = 0; s <= limS; s++) {
          const valS = valN + s * m.dustSmall;
          if (valS > finalMax + m.dustSmall) break;

          for (let t = 0; t <= limT; t++) {
            const total = valS + t * m.dustTiny;
            const absDiff = Math.abs(total - finalTarget);
            const insideBounds = total >= finalMin && total <= finalMax;

            let penalty = absDiff;
            if (!insideBounds) {
              penalty += 50000;
            }
            penalty += (n + s + t) * 0.1;

            if (penalty < minPenalty) {
              minPenalty = penalty;
              bestSol = { n, s, t, totalVal: total };
            }
          }
        }
      }

      return {
        metal: m,
        solution: bestSol,
        targetMb: finalTarget,
        minPercent: m.minPercent,
        maxPercent: m.maxPercent
      };
    });
  }

  // Calculate combined resulting volume of current mix for layout stats
  let actualTotalDry = 0;
  results.forEach(res => {
    actualTotalDry += res.solution.totalVal;
  });
  const actualTotalCombined = actualTotalDry + existingVolume;

  const totalDeviation = Math.abs(actualTotalCombined - derivedTargetVolume);
  const precisionPercent = derivedTargetVolume > 0 
    ? Math.max(0, 100 - (totalDeviation / derivedTargetVolume) * 100) 
    : 0;

  return (
    <div className="min-h-screen bg-[#080b11] bg-[radial-gradient(circle_at_center,_#121626_0%,_#080b11_100%)] text-[#e2e8f0] flex flex-col justify-between font-sans selection:bg-indigo-600/50 selection:text-white">
      
      {/* Header */}
      <header className="h-14 border-b border-[#1c2438] flex items-center justify-between px-6 bg-[#0c0f18] sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-[0_0_8px_#6366f1] animate-pulse"></div>
          <h1 className="text-sm font-black tracking-[0.2em] uppercase bg-gradient-to-r from-blue-400 via-indigo-400 to-violet-400 bg-clip-text text-transparent flex items-center gap-2">
            Alloy Forge System <span className="text-[#a5b4fc] text-[10px] font-mono tracking-normal lowercase hidden sm:inline">v3.3.0</span>
          </h1>
        </div>
        <div className="flex items-center gap-6 text-[10px] font-mono text-slate-400">
          <div className={`flex gap-2 items-center font-bold tracking-wider ${autosaveVisible ? "text-indigo-400" : "text-emerald-400"}`}>
            <span className={`w-2 h-2 rounded-full ${autosaveVisible ? "bg-indigo-400 animate-ping" : "bg-emerald-500"}`}></span>
            {autosaveVisible ? "SAVING SESSION..." : "CLOUD CONTAINER SECURE"}
          </div>
        </div>
      </header>

      {/* Main Core */}
      <main className="max-w-6xl mx-auto p-4 w-full flex-grow grid grid-cols-1 lg:grid-cols-12 gap-6 my-4">
        
        {/* Left Grid: Controls and inputs */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          
          {/* Main settings config card */}
          <section className="bg-[#0d121f] border border-[#242b3d] rounded-xl p-5 shadow-xl relative overflow-hidden">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 mb-4 relative z-50">
              <h2 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2">
                <Sliders className="text-indigo-400 w-4 h-4" /> ОСНОВНЫЕ НАСТРОЙКИ ПЛАВКИ
              </h2>
              
              {/* Perfect Mode Toggle */}
              <label className="flex items-center gap-2 text-[10px] font-bold text-indigo-400 bg-indigo-950/20 border border-indigo-850/40 px-3 py-1.5 rounded-md cursor-pointer hover:bg-indigo-950/40 hover:border-indigo-500 transition-all select-none">
                <input 
                  type="checkbox" 
                  checked={perfectMode}
                  onChange={(e) => {
                    setPerfectMode(e.target.checked);
                    setSelectedPerfectMatchIndex(0);
                  }}
                  className="rounded bg-[#0c0c0e] border-[#2c354e] text-indigo-500 focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5 cursor-pointer accent-indigo-500"
                />
                <span className="flex items-center gap-1 uppercase tracking-wider"><Sparkles className="w-3 h-3" /> ИДЕАЛЬНЫЙ ПОДБОР</span>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 relative z-10">
              {/* Preset selection dropdown with Delete and Save buttons */}
              <div>
                <label className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                  <span>ВЫБЕРИТЕ СПЛАВ</span>
                  <div className="flex gap-2 text-[9px] font-bold text-indigo-400">
                    <button 
                      type="button"
                      onClick={handleRestoreDefaultPresets}
                      className="hover:underline flex items-center gap-0.5 cursor-pointer"
                      title="Восстановить исходные пресеты сплавов"
                    >
                      <RotateCcw className="w-2.5 h-2.5" /> СБРОСИТЬ
                    </button>
                  </div>
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-grow">
                    <select 
                      value={selectedPresetKey}
                      onChange={handlePresetChange}
                      className="w-full bg-[#0d121fa8] border border-[#2c354e] rounded-lg pl-4 pr-10 py-3 text-gray-100 focus:outline-none focus:border-indigo-500 transition-colors appearance-none cursor-pointer text-xs uppercase tracking-wide font-medium"
                    >
                      {(Object.entries(presets) as [string, MetalPreset][]).map(([key, item]) => (
                        <option key={key} value={key} className="bg-[#0b0e17] text-gray-200">
                          {item.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>

                  {/* Delete active preset button */}
                  <button
                    type="button"
                    onClick={handleDeletePreset}
                    disabled={Object.keys(presets).length <= 1}
                    className="px-3 bg-red-950/20 border border-red-900/35 hover:bg-red-900/40 hover:border-red-500 text-red-400 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-all flex items-center justify-center shrink-0 cursor-pointer"
                    title="Удалить этот сплав"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  {/* Save current metals as a custom preset button */}
                  <button
                    type="button"
                    onClick={() => setShowSavePresetDialog(!showSavePresetDialog)}
                    className="px-3 bg-indigo-950/30 border border-indigo-900/35 hover:bg-indigo-900/45 hover:border-indigo-500 text-indigo-400 rounded-lg transition-all flex items-center justify-center shrink-0 cursor-pointer"
                    title="Сохранить текущую сборку как новый сплав"
                  >
                    <Save className="w-4 h-4" />
                  </button>
                </div>

                {/* Save Preset Dialog modal form */}
                {showSavePresetDialog && (
                  <div className="mt-3 p-3 bg-indigo-950/20 border border-indigo-900/40 rounded-lg animate-in slide-in-from-top-2 duration-200">
                    <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-2">Название нового пресета сплава:</div>
                    <div className="flex gap-2">
                      <input 
                        type="text"
                        value={newPresetName}
                        onChange={(e) => setNewPresetName(e.target.value)}
                        placeholder="Например: Сплав Силы v2"
                        className="flex-grow bg-[#0c0c0e] border border-[#2c354e] rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveAsPreset()}
                      />
                      <button 
                        onClick={handleSaveAsPreset}
                        disabled={!newPresetName.trim()}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-slate-950 font-bold text-xs rounded transition-all disabled:opacity-45 cursor-pointer"
                      >
                        Сохранить
                      </button>
                      <button 
                        onClick={() => { setShowSavePresetDialog(false); setNewPresetName(""); }}
                        className="px-2 py-1.5 hover:bg-slate-800 text-gray-400 text-xs rounded transition-all cursor-pointer"
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Target volumes inputs */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                  {hasPinned ? "ОЖИДАЕМЫЙ ОБЪЕМ СПЛАВА" : "ЖЕЛАЕМЫЙ ОБЪЕМ СПЛАВА (мБ)"}
                </label>
                <div className="relative">
                  <input 
                    type="text"
                    value={hasPinned ? derivedTargetVolume : targetVolumeInput}
                    disabled={hasPinned}
                    onChange={(e) => handleTargetVolumeInputChange(e.target.value)}
                    onBlur={handleBlurEvaluateTargetVolume}
                    className="w-full bg-[#0d121f] border border-[#2c354e] rounded-lg pl-4 pr-32 py-3 text-indigo-455 focus:outline-none focus:border-indigo-500 transition-colors font-mono font-bold text-xl disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 pointer-events-none">
                    {evaluateMathExpression(targetVolumeInput) !== null && targetVolumeInput.match(/[+\-*/()]/) && (
                      <span className="text-[10px] font-mono font-bold text-indigo-400 bg-indigo-950/60 px-1.5 py-0.5 rounded border border-indigo-850/40">
                        = {Math.round(evaluateMathExpression(targetVolumeInput)!)}
                      </span>
                    )}
                    <span className="text-xs text-slate-500 font-bold font-mono">мБ</span>
                  </div>
                </div>
                {hasPinned && (
                  <div className="mt-1.5 text-[9px] text-indigo-400 flex items-center gap-1 font-bold bg-indigo-950/20 border border-indigo-900/30 px-2 py-1 rounded-md uppercase tracking-wider">
                    <Calculator className="w-3.5 h-3.5 shrink-0" /> Рассчитано автоматически по весу зафиксированного компонента
                  </div>
                )}
              </div>
            </div>

            {/* Target multiplicity configuration */}
            <div className="pt-4 border-t border-[#242b3d]/60 grid grid-cols-1 md:grid-cols-2 gap-4 mb-2 relative z-10">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">КРАТНОСТЬ ИТОГОВОГО ОБЪЕМА (мБ)</label>
                <div className="relative">
                  <input 
                    type="text" 
                    value={targetMultiplicityInput}
                    onChange={(e) => handleTargetMultiplicityInputChange(e.target.value)}
                    onBlur={handleBlurEvaluateTargetMultiplicity}
                    className="w-full bg-[#0d121f] border border-[#2c354e] rounded-lg pl-4 pr-32 py-2.5 text-gray-100 focus:outline-none focus:border-indigo-500 transition-colors font-mono font-bold text-sm"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 pointer-events-none">
                    {evaluateMathExpression(targetMultiplicityInput) !== null && targetMultiplicityInput.match(/[+\-*/()]/) && (
                      <span className="text-[9px] font-mono font-bold text-indigo-400 bg-indigo-950/60 px-1.5 py-0.5 rounded border border-indigo-850/40">
                        = {Math.round(evaluateMathExpression(targetMultiplicityInput)!)}
                      </span>
                    )}
                    <span className="text-xs text-slate-500 font-bold font-mono">мБ</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-col justify-end gap-1.5">
                <span className="text-[9px] text-[#8e9bb8] uppercase font-bold tracking-widest">БЫСТРЫЕ ПРЕСЕТЫ КРАТНОСТИ</span>
                <div className="flex gap-1.5 flex-wrap">
                  <button 
                    onClick={() => { setTargetMultiplicity(1); setTargetMultiplicityInput("1"); setSelectedPerfectMatchIndex(0); }} 
                    className={`text-[9px] px-2.5 py-1.5 rounded transition-all font-bold tracking-wider border cursor-pointer uppercase ${
                      targetMultiplicity === 1 
                        ? 'bg-indigo-600 text-[#0c0f18] border-indigo-700 shadow-[0_0_8px_rgba(99,102,241,0.4)]' 
                        : 'bg-[#0f1424] hover:bg-[#1a213b] text-slate-350 border-[#242b3d] hover:border-indigo-500'
                    }`}
                  >
                    ЛЮБАЯ (1)
                  </button>
                  <button 
                    onClick={() => { setTargetMultiplicity(100); setTargetMultiplicityInput("100"); setSelectedPerfectMatchIndex(0); }} 
                    className={`text-[9px] px-2.5 py-1.5 rounded transition-all font-bold tracking-wider border cursor-pointer uppercase ${
                      targetMultiplicity === 100 
                        ? 'bg-indigo-600 text-[#0c0f18] border-indigo-700 shadow-[0_0_8px_rgba(99,102,241,0.4)]' 
                        : 'bg-[#0f1424] hover:bg-[#1a213b] text-slate-350 border-[#242b3d] hover:border-indigo-500'
                    }`}
                  >
                    СЛИTOK GT (100)
                  </button>
                  <button 
                    onClick={() => { setTargetMultiplicity(144); setTargetMultiplicityInput("144"); setSelectedPerfectMatchIndex(0); }} 
                    className={`text-[9px] px-2.5 py-1.5 rounded transition-all font-bold tracking-wider border cursor-pointer uppercase ${
                      targetMultiplicity === 144 
                        ? 'bg-indigo-600 text-[#0c0f18] border-indigo-700 shadow-[0_0_8px_rgba(99,102,241,0.4)]' 
                        : 'bg-[#0f1424] hover:bg-[#1a213b] text-slate-350 border-[#242b3d] hover:border-indigo-500'
                    }`}
                  >
                    СЛИTOK TFC (144)
                  </button>
                  <button 
                    onClick={() => { setTargetMultiplicity(2016); setTargetMultiplicityInput("2016"); setSelectedPerfectMatchIndex(0); }} 
                    className={`text-[9px] px-2.5 py-1.5 rounded transition-all font-bold tracking-wider border cursor-pointer uppercase ${
                      targetMultiplicity === 2016 
                        ? 'bg-indigo-600 text-[#0c0f18] border-indigo-700 shadow-[0_0_8px_rgba(99,102,241,0.4)]' 
                        : 'bg-[#0f1424] hover:bg-[#1a213b] text-slate-350 border-[#242b3d] hover:border-indigo-500'
                    }`}
                  >
                    СОСУД (2016)
                  </button>
                </div>
              </div>
            </div>

            {/* Perfect mode interactive selector list */}
            {perfectMode && (
              <div className="mt-4 pt-4 border-t border-[#242b3d] transition-all relative z-10">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-2">
                  <label className="block text-[10px] font-bold tracking-wider text-indigo-455 uppercase">
                    <span className="flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5" /> ТОЧНЫЕ ПРОПОРЦИИ ДЛЯ СПЛАВА (
                      <em className="font-mono font-bold text-white underline not-italic">{derivedTargetVolume}</em> мБ):
                    </span>
                  </label>
                  
                  {/* Sorting dropdown */}
                  <div className="flex items-center gap-1.5 bg-[#090d19] border border-[#242b3d] px-2 py-1 rounded">
                    <span className="text-[9px] text-[#8e9bb8] uppercase font-bold tracking-wider">Сортировать по:</span>
                    <select 
                      value={perfectSortBy}
                      onChange={(e) => {
                        setPerfectSortBy(e.target.value as any);
                        setSelectedPerfectMatchIndex(0);
                      }}
                      className="bg-transparent text-[9px] text-indigo-400 font-bold focus:outline-none cursor-pointer tracking-wider"
                    >
                      <option value="itemCount" className="bg-[#0b0e17]">МИНИМУМ КУЧЕК (БЫСТРЕЕ)</option>
                      <option value="deviation" className="bg-[#0b0e17]">БЛИЖЕ К ЖЕЛАЕМЫМ %</option>
                    </select>
                  </div>
                </div>
                
                {showPerfectModeAlert ? (
                  <div className="text-xs text-red-400 p-3 text-center bg-red-950/20 border border-red-900/40 rounded-xl font-mono leading-relaxed select-none">
                    Невозможно подобрать точную комбинацию кучек пыли с учетом уже жидких {existingVolume} мБ в сосуде под кратность {targetMultiplicity} мБ. Измените пропорции металлов или кратность.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2 max-h-52 overflow-y-auto pr-1">
                    {perfectOptions.map((match, idx) => {
                      const isSelected = idx === (selectedPerfectMatchIndex ?? 0);
                      const pctLabel = match.percentages.map((p: number, i: number) => {
                        return `${currentMetals[i]?.name?.split(' ')[0] || "Металл"}: ${p.toFixed(1)}%`;
                      }).join(' | ');

                      return (
                        <button 
                          key={idx}
                          type="button"
                          onClick={() => setSelectedPerfectMatchIndex(idx)}
                          className={`px-3.5 py-2.5 text-left rounded border transition-all duration-150 flex flex-col justify-center relative overflow-hidden select-none cursor-pointer ${
                            isSelected 
                              ? 'bg-indigo-600 border-indigo-700 text-[#0c0f18] shadow-[0_0_12px_rgba(99,102,241,0.35)] font-bold' 
                              : 'bg-[#0b0e17] border-[#242b3d] hover:border-[#2f3957] text-[#8e9bb8] hover:text-white'
                          }`}
                        >
                          <div className="flex justify-between items-center w-full gap-2">
                            <span className="text-xs font-bold uppercase tracking-wide">{pctLabel}</span>
                            <span className={`text-[9px] px-1.5 py-1 rounded font-bold uppercase shrink-0 ${
                              isSelected ? 'bg-slate-950/20 text-slate-950 border border-slate-950/30' : 'bg-[#111114] text-indigo-400 border border-[#242b3d]'
                            }`}>
                              Досыпать: {match.totalItems} шт.
                            </span>
                          </div>
                          <div className="flex justify-between text-[10px] opacity-80 mt-1.5 font-mono">
                            <span>Пыль добора: {match.components.map((c: any) => c + ' мБ').join(' + ')}</span>
                            <span className={`font-bold ${isSelected ? 'text-slate-950' : 'text-indigo-400'}`}>
                              Итого: {match.totalVolume} мБ
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Existing hot/molten liquid inside the crucible */}
            <div className="mt-4 pt-4 border-t border-[#242b3d]/60 grid grid-cols-1 md:grid-cols-2 gap-4 relative z-10">
              <div>
                <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#8e9bb8] mb-2 cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    checked={hasExistingMetal}
                    onChange={(e) => {
                      setHasExistingMetal(e.target.checked);
                      if (!e.target.checked) setExistingMetalVolume(0);
                      setSelectedPerfectMatchIndex(0);
                    }}
                    className="rounded bg-[#0c0c0e] border-[#2c354e] text-indigo-500 focus:ring-0 focus:ring-offset-0 w-4 h-4 cursor-pointer accent-indigo-500"
                  />
                  <span>В сосуде уже есть жидкий металл?</span>
                </label>
                {hasExistingMetal && (
                  <div className="relative animate-in fade-in duration-250">
                    <input 
                      type="text" 
                      value={existingMetalVolumeInput}
                      onChange={(e) => handleExistingMetalVolumeInputChange(e.target.value)}
                      onBlur={handleBlurEvaluateExistingMetal}
                      className="w-full bg-[#0d121f] border border-[#2c354e] rounded-lg pl-4 pr-32 py-2.5 text-sm text-indigo-400 focus:outline-none focus:border-indigo-500 transition-colors font-mono font-bold"
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 pointer-events-none">
                      {evaluateMathExpression(existingMetalVolumeInput) !== null && existingMetalVolumeInput.match(/[+\-*/()]/) && (
                        <span className="text-[9px] font-mono font-bold text-indigo-400 bg-indigo-950/60 px-1.5 py-0.5 rounded border border-indigo-850/40 font-bold">
                          = {Math.round(evaluateMathExpression(existingMetalVolumeInput)!)}
                        </span>
                      )}
                      <span className="text-xs text-slate-500 font-bold font-mono">мБ</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end md:text-right">
                <span className="text-[10px] text-slate-450 uppercase tracking-wide italic block leading-normal">
                  Поддерживает как добавление твердого добора пыли, так и вычисление недостающего сырья с учетом жидкой фазы
                </span>
              </div>
            </div>
          </section>

          {/* Core alloys component card lists */}
          <section className="bg-[#0d121f] border border-[#242b3d] rounded-xl p-5 shadow-xl flex-grow relative overflow-hidden">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2">
                <Settings className="text-indigo-400 w-4 h-4" /> КОМПОНЕНТЫ СПЛАВА
              </h2>
              <button 
                onClick={handleAddMetal}
                className="text-[10px] uppercase tracking-wider bg-indigo-600 text-[#0c0f18] px-3.5 py-2 rounded font-extrabold hover:bg-indigo-500 transition-all cursor-pointer flex items-center gap-1.5 shadow-[0_0_8px_rgba(99,102,241,0.25)]"
              >
                <Plus className="w-3.5 h-3.5" /> Добавить металл
              </button>
            </div>

            {/* List entries */}
            <div className="flex flex-col gap-4">
              {currentMetals.map((metal, index) => (
                <div 
                  key={metal.id}
                  className={`bg-[#0d111ca9] border rounded p-4 flex flex-col gap-3 relative transition-all duration-200 ${
                    metal.isPinned 
                      ? 'border-indigo-550/60 shadow-md shadow-indigo-550/5 bg-[#0e1424]' 
                      : 'border-[#242b3d]/85 hover:border-[#2f3957]'
                  }`}
                >
                  {/* Top bar controls */}
                  <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 pb-2 border-b border-[#242b3d]/60">
                    <div className="flex items-center gap-2">
                      <span className={`w-3.5 h-3.5 rounded-full bg-gradient-to-tr ${metal.color || 'from-slate-500 to-slate-600'} shadow`}></span>
                      <input 
                        type="text" 
                        value={metal.name}
                        onChange={(e) => handleUpdateMetalName(index, e.target.value)}
                        className="bg-transparent border-b border-transparent hover:border-[#384366] focus:border-indigo-500 text-sm font-bold text-gray-150 px-1.5 focus:outline-none transition-colors uppercase tracking-wider"
                      />
                    </div>
                    
                    <div className="flex items-center gap-3">
                      {/* Pinned weight lock */}
                      <label className="flex items-center gap-1.5 text-[10px] text-indigo-400 font-bold uppercase tracking-wider cursor-pointer select-none">
                        <input 
                          type="checkbox" 
                          checked={metal.isPinned}
                          onChange={(e) => handleTogglePinMetal(index, e.target.checked)}
                          className="rounded bg-[#0c0c0e] border-[#2c354e] text-indigo-500 focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5 cursor-pointer accent-indigo-500"
                        />
                        <span className="flex items-center gap-1">
                          <Lock className="w-3 h-3 text-indigo-400" /> Фиксировать
                        </span>
                      </label>

                      {/* Remove item */}
                      <button 
                        onClick={() => handleRemoveMetal(index)}
                        className="text-xs text-red-400/80 hover:text-red-300 transition-colors p-1 cursor-pointer"
                        title="Удалить металл"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Manual lock box */}
                  {metal.isPinned && (
                    <div className="bg-indigo-950/10 border border-indigo-900/30 p-3.5 rounded flex flex-col gap-3 animate-in slide-in-from-top-1 duration-200">
                      <div className="flex justify-between items-center">
                        <span className="text-[9px] uppercase tracking-widest text-[#a5b4fc] font-bold flex items-center gap-1">
                          <Scale className="w-3.5 h-3.5 text-indigo-400" /> Заданный вес компонента:
                        </span>
                        
                        {/* Unit selector */}
                        <div className="flex gap-1 text-[9px] bg-[#0c0c0e] p-0.5 rounded border border-[#2c354e] font-bold font-mono">
                          <button 
                            onClick={() => handleSetPinnedInputType(index, 'mb')} 
                            className={`px-2 py-0.5 rounded transition-all cursor-pointer uppercase ${
                              metal.pinnedInputType === 'mb' ? 'bg-indigo-600 text-[#0c0f18] font-bold' : 'text-[#8e9bb8] hover:text-white'
                            }`}
                          >
                            В мБ
                          </button>
                          <button 
                            onClick={() => handleSetPinnedInputType(index, 'dust')} 
                            className={`px-2 py-0.5 rounded transition-all cursor-pointer uppercase ${
                              metal.pinnedInputType === 'dust' ? 'bg-indigo-600 text-[#0c0f18] font-bold' : 'text-[#8e9bb8] hover:text-white'
                            }`}
                          >
                            Пылью
                          </button>
                        </div>
                      </div>

                      {/* Manual inputs fields with live math indicator */}
                      {metal.pinnedInputType === 'mb' ? (
                        <div className="relative">
                          <input 
                            type="text" 
                            value={metal.pinnedVolumeInput ?? metal.pinnedVolume.toString()}
                            onChange={(e) => handleUpdatePinnedVolume(index, e.target.value)}
                            onBlur={() => handleBlurEvaluatePinnedVolume(index)}
                            className="w-full bg-[#0d121f] border border-[#2c354e] rounded px-3 py-2 text-xs text-indigo-400 focus:outline-none focus:border-indigo-500 transition-colors font-mono font-bold"
                          />
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
                            {evaluateMathExpression(metal.pinnedVolumeInput || "") !== null && (metal.pinnedVolumeInput || "").match(/[+\-*/()]/) && (
                              <span className="text-[9px] font-mono font-bold text-indigo-400 bg-indigo-950/60 px-1.5 py-0.5 rounded border border-indigo-850/40">
                                = {Math.round(evaluateMathExpression(metal.pinnedVolumeInput || "")!)}
                              </span>
                            )}
                            <span className="text-[10px] text-slate-500 font-bold font-mono">мБ</span>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-2">
                          <div className="bg-[#0b0e17] border border-[#242b3d] p-1.5 rounded text-center">
                            <span className="text-[8px] uppercase text-[#8e9bb8] font-bold tracking-wider block mb-1">Пыль</span>
                            <div className="flex items-center justify-between gap-1">
                              <button 
                                onClick={() => handleAdjustPinnedDust(index, 'pinnedDustNorm', -1)} 
                                className="w-5 h-5 rounded bg-[#0d121f] border border-[#242b3d] text-[#8e9bb8] hover:text-white text-[10px] font-bold cursor-pointer hover:border-indigo-500 transition-colors"
                              >
                                -
                              </button>
                              <span className="font-mono font-bold text-white text-xs">{metal.pinnedDustNorm}</span>
                              <button 
                                onClick={() => handleAdjustPinnedDust(index, 'pinnedDustNorm', 1)} 
                                className="w-5 h-5 rounded bg-[#0d121f] border border-[#242b3d] text-[#8e9bb8] hover:text-white text-[10px] font-bold cursor-pointer hover:border-indigo-500 transition-colors"
                              >
                                +
                              </button>
                            </div>
                          </div>
                          <div className="bg-[#0b0e17] border border-[#242b3d] p-1.5 rounded text-center">
                            <span className="text-[8px] uppercase text-[#8e9bb8] font-bold tracking-wider block mb-1">Малая</span>
                            <div className="flex items-center justify-between gap-1">
                              <button 
                                onClick={() => handleAdjustPinnedDust(index, 'pinnedDustSmall', -1)} 
                                className="w-5 h-5 rounded bg-[#0d121f] border border-[#242b3d] text-[#8e9bb8] hover:text-white text-[10px] font-bold cursor-pointer hover:border-indigo-500 transition-colors"
                              >
                                -
                              </button>
                              <span className="font-mono font-bold text-white text-xs">{metal.pinnedDustSmall}</span>
                              <button 
                                onClick={() => handleAdjustPinnedDust(index, 'pinnedDustSmall', 1)} 
                                className="w-5 h-5 rounded bg-[#0d121f] border border-[#242b3d] text-[#8e9bb8] hover:text-white text-[10px] font-bold cursor-pointer hover:border-indigo-500 transition-colors"
                              >
                                +
                              </button>
                            </div>
                          </div>
                          <div className="bg-[#0b0e17] border border-[#242b3d] p-1.5 rounded text-center">
                            <span className="text-[8px] uppercase text-[#8e9bb8] font-bold tracking-wider block mb-1">Кроха</span>
                            <div className="flex items-center justify-between gap-1">
                              <button 
                                onClick={() => handleAdjustPinnedDust(index, 'pinnedDustTiny', -1)} 
                                className="w-5 h-5 rounded bg-[#0d121f] border border-[#242b3d] text-[#8e9bb8] hover:text-white text-[10px] font-bold cursor-pointer hover:border-indigo-500 transition-colors"
                              >
                                -
                              </button>
                              <span className="font-mono font-bold text-white text-xs">{metal.pinnedDustTiny}</span>
                              <button 
                                onClick={() => handleAdjustPinnedDust(index, 'pinnedDustTiny', 1)} 
                                className="w-5 h-5 rounded bg-[#0d121f] border border-[#242b3d] text-[#8e9bb8] hover:text-white text-[10px] font-bold cursor-pointer hover:border-indigo-500 transition-colors"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="text-[10px] text-gray-400 flex justify-between items-center px-1 font-mono">
                        <span>Эквивалент в жидкости:</span>
                        <span className="font-bold text-indigo-400">{getPinnedMetalEquivalentMb(metal)} мБ</span>
                      </div>
                    </div>
                  )}

                  {/* Percentage configurations */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
                    <div>
                      <label className="block text-[9px] uppercase font-bold tracking-widest text-slate-500 mb-1">Мин % в сплаве</label>
                      <div className="relative">
                        <input 
                          type="text" 
                          value={metal.minPercentInput ?? metal.minPercent.toString()} 
                          onChange={(e) => handleUpdatePercentBound(index, 'minPercent', e.target.value)}
                          onBlur={() => handleBlurEvaluatePercentBound(index, 'minPercent')}
                          className="w-full bg-[#0d121f] border border-[#2c354e] rounded px-2.5 py-1 text-xs text-indigo-400 focus:outline-none focus:border-indigo-500 transition-colors font-mono font-bold text-center"
                        />
                        {evaluateMathExpression(metal.minPercentInput || "") !== null && (metal.minPercentInput || "").match(/[+\-*/()]/) && (
                          <div className="absolute left-1/2 -translate-x-1/2 bottom-[-18px] z-10 text-[8px] font-mono font-bold text-indigo-455 bg-[#0b0e17] px-1 py-0.5 rounded border border-indigo-850/30 whitespace-nowrap">
                            = {Math.round(evaluateMathExpression(metal.minPercentInput || "")!)}%
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-[9px] uppercase font-bold tracking-widest text-slate-500 mb-1">Макс % в сплаве</label>
                      <div className="relative">
                        <input 
                          type="text" 
                          value={metal.maxPercentInput ?? metal.maxPercent.toString()} 
                          onChange={(e) => handleUpdatePercentBound(index, 'maxPercent', e.target.value)}
                          onBlur={() => handleBlurEvaluatePercentBound(index, 'maxPercent')}
                          className="w-full bg-[#0d121f] border border-[#2c354e] rounded px-2.5 py-1 text-xs text-indigo-400 focus:outline-none focus:border-indigo-500 transition-colors font-mono font-bold text-center"
                        />
                        {evaluateMathExpression(metal.maxPercentInput || "") !== null && (metal.maxPercentInput || "").match(/[+\-*/()]/) && (
                          <div className="absolute left-1/2 -translate-x-1/2 bottom-[-18px] z-10 text-[8px] font-mono font-bold text-indigo-455 bg-[#0b0e17] px-1 py-0.5 rounded border border-indigo-850/30 whitespace-nowrap">
                            = {Math.round(evaluateMathExpression(metal.maxPercentInput || "")!)}%
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-[9px] uppercase font-bold tracking-widest text-[#8e9bb8] mb-1">Желаемый %</label>
                      <div className="flex items-center gap-2">
                        <input 
                          type="range" 
                          min="0" 
                          max="100" 
                          value={metal.defaultPercent} 
                          onChange={(e) => handleUpdateTargetPercent(index, e.target.value)}
                          className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                        />
                        <input 
                          type="number" 
                          min="0" 
                          max="100" 
                          value={metal.defaultPercent} 
                          onChange={(e) => handleUpdateTargetPercent(index, e.target.value)}
                          className="w-14 bg-[#0d121f] border border-[#2c354e] rounded text-center px-1 py-0.5 text-xs text-indigo-400 font-bold font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Dust volume custom calibration ratios */}
                  <div className="bg-[#0b0e17] p-3 rounded border border-[#242b3d] grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[8px] uppercase font-bold tracking-widest text-[#8e9bb8] mb-1">Пыль (1.0)</label>
                      <div className="relative">
                        <input 
                          type="text" 
                          value={metal.dustNormInput ?? metal.dustNorm.toString()} 
                          onChange={(e) => handleUpdateMetalDustCalibration(index, 'dustNorm', e.target.value)}
                          onBlur={() => handleBlurEvaluateMetalDustCalibration(index, 'dustNorm')}
                          className="w-full bg-[#0d121f] border border-[#2c354e] rounded px-2 py-1 text-xs text-indigo-400 focus:outline-none focus:border-indigo-500 transition-colors text-center font-bold font-mono"
                        />
                        {evaluateMathExpression(metal.dustNormInput || "") !== null && (metal.dustNormInput || "").match(/[+\-*/()]/) && (
                          <div className="absolute left-1/2 -translate-x-1/2 bottom-[-18px] z-10 text-[8px] font-mono font-bold text-indigo-444 bg-[#0b0e17] px-1 py-0.5 rounded border border-indigo-850/30 whitespace-nowrap">
                            = {Math.round(evaluateMathExpression(metal.dustNormInput || "")!)}
                          </div>
                        )}
                        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-gray-600 font-bold font-mono">мБ</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[8px] uppercase font-bold tracking-widest text-[#8e9bb8] mb-1">Малая кучка</label>
                      <div className="relative">
                        <input 
                          type="text" 
                          value={metal.dustSmallInput ?? metal.dustSmall.toString()} 
                          onChange={(e) => handleUpdateMetalDustCalibration(index, 'dustSmall', e.target.value)}
                          onBlur={() => handleBlurEvaluateMetalDustCalibration(index, 'dustSmall')}
                          className="w-full bg-[#0d121f] border border-[#2c354e] rounded px-2 py-1 text-xs text-indigo-400 focus:outline-none focus:border-indigo-500 transition-colors text-center font-bold font-mono"
                        />
                        {evaluateMathExpression(metal.dustSmallInput || "") !== null && (metal.dustSmallInput || "").match(/[+\-*/()]/) && (
                          <div className="absolute left-1/2 -translate-x-1/2 bottom-[-18px] z-10 text-[8px] font-mono font-bold text-indigo-444 bg-[#0b0e17] px-1 py-0.5 rounded border border-indigo-850/30 whitespace-nowrap">
                            = {Math.round(evaluateMathExpression(metal.dustSmallInput || "")!)}
                          </div>
                        )}
                        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-gray-600 font-bold font-mono">мБ</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[8px] uppercase font-bold tracking-widest text-[#8e9bb8] mb-1">Крохотная</label>
                      <div className="relative">
                        <input 
                          type="text" 
                          value={metal.dustTinyInput ?? metal.dustTiny.toString()} 
                          onChange={(e) => handleUpdateMetalDustCalibration(index, 'dustTiny', e.target.value)}
                          onBlur={() => handleBlurEvaluateMetalDustCalibration(index, 'dustTiny')}
                          className="w-full bg-[#0d121f] border border-[#2c354e] rounded px-2 py-1 text-xs text-indigo-400 focus:outline-none focus:border-indigo-500 transition-colors text-center font-bold font-mono"
                        />
                        {evaluateMathExpression(metal.dustTinyInput || "") !== null && (metal.dustTinyInput || "").match(/[+\-*/()]/) && (
                          <div className="absolute left-1/2 -translate-x-1/2 bottom-[-18px] z-10 text-[8px] font-mono font-bold text-indigo-444 bg-[#0b0e17] px-1 py-0.5 rounded border border-indigo-850/30 whitespace-nowrap">
                            = {Math.round(evaluateMathExpression(metal.dustTinyInput || "")!)}
                          </div>
                        )}
                        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-gray-600 font-bold font-mono">мБ</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {currentMetals.length === 0 && (
                <div className="text-center py-8 text-[#8e9bb8] text-xs font-bold uppercase tracking-widest border border-dashed border-[#242b3d] bg-[#0c0c0e]/30 rounded">
                  Нет добавленных металлов. Используйте кнопку добавления в заголовке.
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Right Grid: Resulting outputs summaries & manuals sheets */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          
          {/* Active recipe output stats */}
          <section className="bg-[#0d121f] border border-[#242b3d] rounded-xl p-5 shadow-xl relative overflow-hidden flex flex-col justify-between min-h-[420px]">
            {/* Ambient decorations blobs */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-500/3 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-violet-555/3 rounded-full blur-3xl pointer-events-none"></div>

            <div className="relative z-10">
              <div className="flex justify-between items-center pb-4 border-b border-[#242b3d]/60 mb-5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#8e9bb8]">Результаты Расчета</span>
                
                {actualTotalCombined === derivedTargetVolume ? (
                  <span className="px-2.5 py-1 text-[9px] uppercase tracking-wider rounded font-bold bg-[#0d2219] border border-emerald-800/80 text-emerald-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span> Идеально
                  </span>
                ) : (
                  <span className="px-2.5 py-1 text-[9px] uppercase tracking-wider rounded font-bold bg-[#141d33] border border-indigo-900 text-indigo-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-550 animate-pulse"></span> Добор пыли
                  </span>
                )}
              </div>

              {/* Dynamic recipe output breakdown */}
              <div className="flex flex-col gap-4">
                {results.map((res, idx) => {
                  const sol = res.solution;
                  const ratioPercent = actualTotalCombined > 0 
                    ? (((sol.totalVal + (res.metal.isPinned ? 0 : (res.metal.defaultPercent/100)*existingVolume)) / actualTotalCombined) * 100) 
                    : 0;
                  const validRatio = ratioPercent >= res.minPercent && ratioPercent <= res.maxPercent;

                  return (
                    <div key={idx} className="bg-[#0b0e17] border border-[#242b3d] rounded p-4 flex flex-col gap-3">
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <h4 className="text-xs font-bold text-gray-200 uppercase tracking-widest flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full bg-gradient-to-tr ${res.metal.color || 'from-slate-500 to-slate-600'} shadow`}></span>
                            {res.metal.name}
                          </h4>
                          <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider block">
                            Доля:{" "}
                            <span className={`font-bold font-mono ${validRatio ? 'text-emerald-400' : 'text-red-400'}`}>
                              {ratioPercent.toFixed(1)}%
                            </span>{" "}
                            <span className="text-gray-500 text-[9px] tracking-normal font-sans">(Допуск: {res.minPercent}-{res.maxPercent}%)</span>
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-extrabold text-indigo-400 font-mono block">
                            Досыпать: +{sol.totalVal} мБ
                          </span>
                          <span className="text-[9px] text-[#8e9bb8] uppercase font-mono font-bold block">
                            цель: {res.targetMb} мБ
                          </span>
                        </div>
                      </div>

                      {/* Dust portions breakdown boxes */}
                      <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono select-none">
                        <div className={`p-2 rounded bg-[#0d121f] border border-[#1e2436] transition-all ${
                          sol.norm > 0 ? 'opacity-100 ring-1 ring-indigo-500/35 z-10 scale-[1.02]' : 'opacity-35'
                        }`}>
                          <span className={`block text-base font-extrabold ${sol.norm > 0 ? 'text-indigo-400' : 'text-slate-600'}`}>{sol.norm}</span>
                          <span className="text-[8px] text-gray-500 uppercase font-semibold">Пыль</span>
                        </div>
                        <div className={`p-2 rounded bg-[#0d121f] border border-[#1e2436] transition-all ${
                          sol.small > 0 ? 'opacity-100 ring-1 ring-indigo-500/35 z-10 scale-[1.02]' : 'opacity-35'
                        }`}>
                          <span className={`block text-base font-extrabold ${sol.small > 0 ? 'text-indigo-400' : 'text-slate-600'}`}>{sol.small}</span>
                          <span className="text-[8px] text-gray-500 uppercase font-semibold">Малая</span>
                        </div>
                        <div className={`p-2 rounded bg-[#0d121f] border border-[#1e2436] transition-all ${
                          sol.tiny > 0 ? 'opacity-100 ring-1 ring-indigo-500/35 z-10 scale-[1.02]' : 'opacity-35'
                        }`}>
                          <span className={`block text-base font-extrabold ${sol.tiny > 0 ? 'text-indigo-400' : 'text-slate-600'}`}>{sol.tiny}</span>
                          <span className="text-[8px] text-gray-500 uppercase font-semibold">Кроха</span>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {currentMetals.length === 0 && (
                  <div className="text-center py-10 text-gray-500 text-xs font-bold uppercase tracking-widest border border-dashed border-[#242b3d] rounded bg-[#0b0e17]">
                    Ожидание входных данных компонентов...
                  </div>
                )}
              </div>
            </div>

            {/* Bottom aggregate metrics info */}
            <div className="mt-6 pt-5 border-t border-[#242b3d]/60 relative z-10">
              <div className="grid grid-cols-2 gap-4 select-none">
                <div className="bg-[#0b0e17] p-3 rounded border border-[#242b3d] text-center">
                  <span className="block text-[#8e9bb8] text-[9px] uppercase font-bold tracking-widest mb-1">Итоговый объем</span>
                  <span className="text-base font-extrabold text-gray-200 tracking-tight font-mono">
                    {actualTotalCombined} мБ
                  </span>
                </div>
                <div className="bg-[#0b0e17] p-3 rounded border border-[#242b3d] text-center">
                  <span className="block text-[#8e9bb8] text-[9px] uppercase font-bold tracking-widest mb-1">
                    {hasPinned ? "Точность пропорции" : "Точность объема"}
                  </span>
                  <span className={`text-base font-extrabold tracking-tight font-mono ${
                    precisionPercent >= 99.9 ? 'text-emerald-400' : 'text-indigo-400'
                  }`}>
                    {precisionPercent.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Reference guidelines sheet */}
          <section className="bg-[#0d121fc9] border border-[#242b3d] rounded-xl p-5 shadow-lg select-none">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-widest mb-3.5 flex items-center gap-2 border-b border-[#242b3d]/65 pb-2.5">
              <BookOpen className="text-indigo-400 w-4 h-4" /> Справочник пропорций сплавов TFC
            </h3>
            <div className="text-xs text-[#8e9bb8] space-y-1.5 font-sans">
              <p className="flex justify-between border-b border-[#242b3d]/30 pb-2 hover:bg-[#0c0c0e]/35 transition-colors px-1 py-1">
                <span className="font-bold uppercase tracking-wider text-[10px]">Бронза (Bronze):</span>
                <strong className="text-indigo-400 text-[11px] font-mono">Медь 70-80% / Олово 20-30%</strong>
              </p>
              <p className="flex justify-between border-b border-[#242b3d]/30 pb-2 hover:bg-[#0c0c0e]/35 transition-colors px-1 py-1">
                <span className="font-bold uppercase tracking-wider text-[10px]">Латунь (Brass TFC):</span>
                <strong className="text-indigo-400 text-[11px] font-mono">Медь 70-80% / Цинк 20-30%</strong>
              </p>
              <p className="flex justify-between border-b border-[#242b3d]/30 pb-2 hover:bg-[#0c0c0e]/35 transition-colors px-1 py-1">
                <span className="font-bold uppercase tracking-wider text-[10px]">Красный сплав (Red):</span>
                <strong className="text-indigo-400 text-[11px] font-mono">Редстоун 75-85% / Медь 15-25%</strong>
              </p>
              <p className="flex justify-between border-b border-[#242b3d]/30 pb-2 hover:bg-[#0c0c0e]/35 transition-colors px-1 py-1">
                <span className="font-bold uppercase tracking-wider text-[10px]">Оловянный сплав (Tin):</span>
                <strong className="text-indigo-400 text-[11px] font-mono">Олово 45-55% / Чугун 45-55%</strong>
              </p>
              <p className="flex justify-between border-b border-[#242b3d]/30 pb-2 hover:bg-[#0c0c0e]/35 transition-colors px-1 py-1">
                <span className="font-bold uppercase tracking-wider text-[10px]">Инвар (Invar):</span>
                <strong className="text-indigo-400 text-[11px] font-mono">Никель 30-40% / Чугун 60-70%</strong>
              </p>
              <p className="flex justify-between border-b border-[#242b3d]/30 pb-2 hover:bg-[#0c0c0e]/35 transition-colors px-1 py-1">
                <span className="font-bold uppercase tracking-wider text-[10px]">Черная бронза:</span>
                <strong className="text-indigo-400 text-[11px] font-mono flex-wrap text-right">Медь 50-70% / Серебро 10-25% / Золото 10-25%</strong>
              </p>
              <p className="flex justify-between border-b border-[#242b3d]/30 pb-2 hover:bg-[#0c0c0e]/35 transition-colors px-1 py-1">
                <span className="font-bold uppercase tracking-wider text-[10px]">Висмутовая бронза:</span>
                <strong className="text-indigo-400 text-[11px] font-mono flex-wrap text-right">Медь 50-65% / Цинк 20-30% / Висмут 10-20%</strong>
              </p>
              <p className="flex justify-between border-b border-[#242b3d]/30 pb-2 hover:bg-[#0c0c0e]/35 transition-colors px-1 py-1">
                <span className="font-bold uppercase tracking-wider text-[10px]">Потин (Potin):</span>
                <strong className="text-indigo-400 text-[11px] font-mono">Медь 63-69% / Олово 19-25% / Свинец 8-14%</strong>
              </p>
              <p className="flex justify-between pb-1 hover:bg-[#0c0c0e]/35 transition-colors px-1 py-1">
                <span className="font-bold uppercase tracking-wider text-[10px]">Кобальтовая латунь:</span>
                <strong className="text-indigo-400 text-[11px] font-mono flex-wrap text-right">Латунь 74-81% / Кобальт 8-14% / Синт.Глина 8-14%</strong>
              </p>
            </div>
            
            <div className="mt-4 pt-3 border-t border-[#242b3d]/55 text-[10px] text-slate-500 leading-relaxed flex items-start gap-1.5 font-sans">
              <Info className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
              <span>
                Все пресеты соответствуют официальным рецептам KubeJS и Terrafirmacraft. Значения мБ для каждой пыли можно калибровать прямо во вкладках компонентов.
              </span>
            </div>
          </section>

        </div>

      </main>

      {/* Footer sticky bottom */}
      <footer className="border-t border-[#1c2438] bg-[#06080e] py-4 text-center text-[10px] text-[#8e9bb8] px-4 flex flex-col sm:flex-row justify-between items-center max-w-7xl mx-auto w-full gap-2 relative z-10">
        <p>© 2026 Калькулятор металлургии GregTech & TFC. Создано для идеального баланса сплавов.</p>
        <p className="text-[10px] text-slate-500 font-mono font-bold uppercase tracking-wide">Версия 3.3.0 • Локальное сохранение активно</p>
      </footer>
    </div>
  );
}
