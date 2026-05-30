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
  RotateCcw,
  Download,
  Smartphone,
  Wifi,
  WifiOff
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

const subDustCache = new Map<string, { n: number; s: number; t: number; totalVal: number }>();

// Solve optimal dust counts for a nested sub-alloy ingredient amount
export function solveDustForSubAmount(targetMb: number, dNorm: number, dSmall: number, dTiny: number) {
  const cacheKey = `${targetMb}#${dNorm}#${dSmall}#${dTiny}`;
  if (subDustCache.has(cacheKey)) {
    return subDustCache.get(cacheKey)!;
  }

  let bestSol = { n: 0, s: 0, t: 0, totalVal: 0 };
  let minPenalty = Infinity;
  
  if (targetMb <= 0) return bestSol;
  
  const maxNorm = dNorm > 0 ? Math.ceil(targetMb / dNorm) + 1 : 0;
  const maxSmall = dSmall > 0 ? Math.ceil(targetMb / dSmall) + 1 : 0;
  const maxTiny = dTiny > 0 ? Math.ceil(targetMb / dTiny) + 1 : 0;
  
  const limN = dNorm > 0 ? Math.min(maxNorm, 30) : 0;
  const limS = dSmall > 0 ? Math.min(maxSmall, 30) : 0;
  const limT = dTiny > 0 ? Math.min(maxTiny, 35) : 0;
  
  for (let n = 0; n <= limN; n++) {
    const valN = n * dNorm;
    if (dNorm > 0 && valN > targetMb + dNorm) break;
    
    for (let s = 0; s <= limS; s++) {
      const valS = valN + s * dSmall;
      if (dSmall > 0 && valS > targetMb + dSmall) break;
      
      for (let t = 0; t <= limT; t++) {
        const total = valS + (dTiny > 0 ? t * dTiny : 0);
        if (dTiny > 0 && total > targetMb + dTiny && Math.abs(total - targetMb) > Math.abs(valS - targetMb) + dTiny) {
          break;
        }
        const absDiff = Math.abs(total - targetMb);
        let penalty = absDiff + (n + s + t) * 0.1;
        if (penalty < minPenalty) {
          minPenalty = penalty;
          bestSol = { n, s, t, totalVal: total };
        }
        if (dTiny <= 0) break;
      }
      if (dSmall <= 0) break;
    }
    if (dNorm <= 0) break;
  }

  if (subDustCache.size > 1000) {
    subDustCache.clear();
  }
  subDustCache.set(cacheKey, bestSol);
  return bestSol;
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
  const [showAddAlloyState, setShowAddAlloyState] = useState<boolean>(false);

  // For Preset Creation Modal
  const [newPresetName, setNewPresetName] = useState<string>("");
  const [showSavePresetDialog, setShowSavePresetDialog] = useState<boolean>(false);

  // --- PWA & Android 16 Offline States ---
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState<boolean>(false);
  const [isOffline, setIsOffline] = useState<boolean>(!navigator.onLine);
  const [showAndroidInstallGuide, setShowAndroidInstallGuide] = useState<boolean>(false);
  const [isInstalledApp, setIsInstalledApp] = useState<boolean>(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Detect standalone display mode
    if (window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone) {
      setIsInstalledApp(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handlePwaInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstalledApp(true);
        setIsInstallable(false);
      }
      setDeferredPrompt(null);
    } else {
      setShowAndroidInstallGuide(true);
    }
  };

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
            isAlloy: m.isAlloy ?? false,
            subAlloyKey: m.subAlloyKey ?? "",
            subAlloyMultiplicity: m.subAlloyMultiplicity ?? 144,
            subAlloyMultiplicityInput: (m.subAlloyMultiplicityInput ?? m.subAlloyMultiplicity ?? 144).toString(),
            perfectSubAlloyMode: m.perfectSubAlloyMode ?? false,
            selectedPerfectSubAlloyMatchIndex: m.selectedPerfectSubAlloyMatchIndex ?? 0,
            subAlloyComponents: m.subAlloyComponents ?? []
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
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(stateToSave));
        localStorage.setItem("gregtech_tfc_dynamic_presets_v3", JSON.stringify(presets));
        
        setAutosaveVisible(true);
      } catch (e) {
        console.error("Autosave error:", e);
      }
    }, 2000); // 2 second debounce to prevent aggressive I/O during slider adjustment

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

  // Clean, leak-free autosave visual fadeout effect
  useEffect(() => {
    if (autosaveVisible) {
      const timer = setTimeout(() => {
        setAutosaveVisible(false);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [autosaveVisible]);

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
      isAlloy: m.isAlloy ?? false,
      subAlloyKey: m.subAlloyKey ?? "",
      subAlloyMultiplicity: m.subAlloyMultiplicity ?? 144,
      subAlloyMultiplicityInput: (m.subAlloyMultiplicityInput ?? m.subAlloyMultiplicity ?? 144).toString(),
      perfectSubAlloyMode: m.perfectSubAlloyMode ?? false,
      selectedPerfectSubAlloyMatchIndex: m.selectedPerfectSubAlloyMatchIndex ?? 0,
      subAlloyComponents: m.subAlloyComponents ?? []
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
        if (parsed !== null && parsed >= 0) {
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
        const resolvedVal = parsed !== null && parsed >= 0 ? Math.round(parsed) : m[field];
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

  const handleAddSubAlloyComponent = (presetKey: string) => {
    const subAlloy = presets[presetKey] || PRESETS[presetKey];
    if (!subAlloy) return;

    const newMetal: MetalState = {
      id: `alloy_${Date.now()}`,
      name: `Сплав: ${subAlloy.name}`,
      color: "from-amber-500 to-yellow-600",
      minPercent: 10,
      maxPercent: 40,
      defaultPercent: 20,
      dustNorm: 144,
      dustSmall: 36,
      dustTiny: 16,
      isPinned: false,
      pinnedInputType: 'mb',
      pinnedVolume: 144,
      pinnedDustNorm: 1,
      pinnedDustSmall: 0,
      pinnedDustTiny: 0,
      
      // Special indicators for sub-alloy
      isAlloy: true,
      subAlloyKey: presetKey,
      subAlloyMultiplicity: 144,
      subAlloyMultiplicityInput: "144",
      subAlloyComponents: subAlloy.metals.map((m: any) => ({
        ...m,
        id: m.id,
        name: m.name,
        color: m.color || "from-zinc-500 to-slate-700",
        minPercent: m.minPercent ?? 0,
        maxPercent: m.maxPercent ?? 100,
        defaultPercent: m.defaultPercent ?? 50,
        dustNorm: m.dustNorm ?? 100,
        dustSmall: m.dustSmall ?? 25,
        dustTiny: m.dustTiny ?? 10
      }))
    };

    const newMetalsList = [...currentMetals, newMetal];
    setSelectedPerfectMatchIndex(0);
    const balanced = adjustSumTo100(newMetalsList);
    setCurrentMetals(balanced);
    setSelectedPresetKey("custom");
  };

  const handleUpdateSubAlloyMultiplicity = (index: number, valStr: string) => {
    const updated = currentMetals.map((m, idx) => {
      if (idx === index) {
        let mult = m.subAlloyMultiplicity || 144;
        const parsed = evaluateMathExpression(valStr);
        if (parsed !== null && parsed > 0) {
          mult = Math.round(parsed);
        }
        return {
          ...m,
          subAlloyMultiplicityInput: valStr,
          subAlloyMultiplicity: mult
        };
      }
      return m;
    });
    setCurrentMetals(updated);
    setSelectedPerfectMatchIndex(0);
  };

  const handleBlurEvaluateSubAlloyMultiplicity = (index: number) => {
    const updated = currentMetals.map((m, idx) => {
      if (idx === index) {
        const multInput = m.subAlloyMultiplicityInput;
        const parsed = evaluateMathExpression(multInput || "");
        const resolvedVal = parsed !== null && parsed > 0 ? Math.round(parsed) : (m.subAlloyMultiplicity || 144);
        return {
          ...m,
          subAlloyMultiplicity: resolvedVal,
          subAlloyMultiplicityInput: resolvedVal.toString()
        };
      }
      return m;
    });
    setCurrentMetals(updated);
  };

  const handleUpdateSubAlloyConstituentPercent = (metalIndex: number, subComponentId: string, valStr: string) => {
    const val = Math.max(0, Math.min(100, parseFloat(valStr) || 0));
    const updated = currentMetals.map((m, idx) => {
      if (idx === metalIndex && m.isAlloy && m.subAlloyComponents) {
        let components = m.subAlloyComponents.map(sub => ({ ...sub }));
        const activeSubIdx = components.findIndex(sub => sub.id === subComponentId);
        if (activeSubIdx !== -1) {
          components[activeSubIdx].defaultPercent = val;
          
          if (components.length <= 1) {
            components[0].defaultPercent = 100;
          } else {
            const activeSub = components[activeSubIdx];
            const remainingTarget = 100 - activeSub.defaultPercent;
            const otherSubSum = components.reduce((acc, curr, sIdx) => {
              return sIdx !== activeSubIdx ? acc + curr.defaultPercent : acc;
            }, 0);
            
            if (otherSubSum > 0) {
              components.forEach((sub, sIdx) => {
                if (sIdx !== activeSubIdx) {
                  sub.defaultPercent = parseFloat(((sub.defaultPercent / otherSubSum) * remainingTarget).toFixed(2));
                }
              });
            } else {
              const count = components.length - 1;
              components.forEach((sub, sIdx) => {
                if (sIdx !== activeSubIdx) {
                  sub.defaultPercent = parseFloat((remainingTarget / count).toFixed(2));
                }
              });
            }
            
            // Adjust sum to exactly 100
            const total = components.reduce((acc, curr) => acc + curr.defaultPercent, 0);
            const diff = 100 - total;
            if (Math.abs(diff) > 0.001 && components.length > 0) {
              const targetAdjustIdx = activeSubIdx === 0 ? 1 : 0;
              if (components[targetAdjustIdx]) {
                components[targetAdjustIdx].defaultPercent = parseFloat(Math.max(0, components[targetAdjustIdx].defaultPercent + diff).toFixed(2));
              }
            }
          }
        }
        return {
          ...m,
          subAlloyComponents: components
        };
      }
      return m;
    });
    setCurrentMetals(updated);
    setSelectedPerfectMatchIndex(0);
  };

  const handleUpdateSubAlloyPercentBound = (metalIndex: number, subComponentId: string, field: 'minPercent' | 'maxPercent', valStr: string) => {
    const val = Math.max(0, Math.min(100, parseFloat(valStr) || 0));
    const updated = currentMetals.map((m, idx) => {
      if (idx === metalIndex && m.isAlloy && m.subAlloyComponents) {
        const components = m.subAlloyComponents.map(sub => {
          if (sub.id === subComponentId) {
            return {
              ...sub,
              [field]: val
            };
          }
          return sub;
        });
        return {
          ...m,
          subAlloyComponents: components
        };
      }
      return m;
    });
    setCurrentMetals(updated);
    setSelectedPerfectMatchIndex(0);
  };

  const handleToggleSubAlloyPerfectMode = (metalIndex: number, enabled: boolean) => {
    const updated = currentMetals.map((m, idx) => {
      if (idx === metalIndex) {
        return {
          ...m,
          perfectSubAlloyMode: enabled,
          selectedPerfectSubAlloyMatchIndex: 0
        };
      }
      return m;
    });
    setCurrentMetals(updated);
    setSelectedPerfectMatchIndex(0);
  };

  const handleSelectSubAlloyPerfectMatchIndex = (metalIndex: number, matchIndex: number) => {
    const updated = currentMetals.map((m, idx) => {
      if (idx === metalIndex) {
        return {
          ...m,
          selectedPerfectSubAlloyMatchIndex: matchIndex
        };
      }
      return m;
    });
    setCurrentMetals(updated);
    setSelectedPerfectMatchIndex(0);
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
        ...m
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

  const perfectSearchData = React.useMemo(() => {
    if (!perfectMode || derivedTargetVolume <= 0 || dryNeeded < 0) {
      return { perfectOptions: [], perfectReachableLookup: [], showPerfectModeAlert: false };
    }

    const searchRes = findPerfectPercentCombinations(
      currentMetals,
      derivedTargetVolume,
      targetMultiplicity,
      existingVolume,
      perfectSortBy
    );

    const enrichedOptions = searchRes.validCombos.map((match) => {
      const subAlloySolvable = currentMetals.map((m, mIdx) => {
        if (m.isAlloy && m.perfectSubAlloyMode) {
          const allocatedVol = match.components[mIdx];
          const subMetalStates = (m.subAlloyComponents || []).map((subM) => ({
            id: subM.id,
            name: subM.name,
            color: subM.color,
            minPercent: subM.minPercent,
            maxPercent: subM.maxPercent,
            defaultPercent: subM.defaultPercent,
            dustNorm: subM.dustNorm,
            dustSmall: subM.dustSmall,
            dustTiny: subM.dustTiny,
            isPinned: false,
            pinnedInputType: 'mb' as const,
            pinnedVolume: 0,
            pinnedDustNorm: 1,
            pinnedDustSmall: 0,
            pinnedDustTiny: 0
          }));
          const subMult = m.subAlloyMultiplicity || 144;
          const subSearchRes = findPerfectPercentCombinations(
            subMetalStates,
            allocatedVol,
            subMult,
            0,
            perfectSortBy
          );
          return subSearchRes.validCombos.length > 0;
        }
        return false;
      });

      const alloyComponents = currentMetals.filter(m => m.isAlloy && m.perfectSubAlloyMode);
      const hasAlloys = alloyComponents.length > 0;
      let allAlloysSolvable = true;

      if (hasAlloys) {
        for (let mIdx = 0; mIdx < currentMetals.length; mIdx++) {
          const m = currentMetals[mIdx];
          if (m.isAlloy && m.perfectSubAlloyMode) {
            if (!subAlloySolvable[mIdx]) {
              allAlloysSolvable = false;
              break;
            }
          }
        }
      }

      const showDoublePerfect = hasAlloys && allAlloysSolvable;

      return {
        ...match,
        subAlloySolvable,
        showDoublePerfect
      };
    });

    const isAlert = enrichedOptions.length === 0;

    return {
      perfectOptions: enrichedOptions,
      perfectReachableLookup: searchRes.reachablePerMetal,
      showPerfectModeAlert: isAlert
    };
  }, [perfectMode, currentMetals, derivedTargetVolume, dryNeeded, targetMultiplicity, existingVolume, perfectSortBy]);

  const { perfectOptions, perfectReachableLookup, showPerfectModeAlert } = perfectSearchData;

  // Determine current active perfect match if selected
  const activePerfectMatch = (perfectMode && perfectOptions.length > 0) 
    ? perfectOptions[selectedPerfectMatchIndex ?? 0] ?? perfectOptions[0]
    : null;

  if (activePerfectMatch) {
    derivedTargetVolume = activePerfectMatch.totalVolume;
  }

  const getSubAlloyCalculatedVolume = (metal: MetalState, proposedVolume: number): number => {
    if (!metal.isAlloy || !metal.perfectSubAlloyMode) {
      return proposedVolume;
    }
    
    const subMetalStates = (metal.subAlloyComponents || []).map((subM) => ({
      id: subM.id,
      name: subM.name,
      color: subM.color,
      minPercent: subM.minPercent,
      maxPercent: subM.maxPercent,
      defaultPercent: subM.defaultPercent,
      dustNorm: subM.dustNorm,
      dustSmall: subM.dustSmall,
      dustTiny: subM.dustTiny,
      isPinned: false,
      pinnedInputType: 'mb' as const,
      pinnedVolume: 0,
      pinnedDustNorm: 1,
      pinnedDustSmall: 0,
      pinnedDustTiny: 0
    }));

    const mult = metal.subAlloyMultiplicity || 144;
    const searchRes = findPerfectPercentCombinations(
      subMetalStates,
      proposedVolume,
      mult,
      0,
      perfectSortBy
    );

    if (searchRes.validCombos.length > 0) {
      const idx = metal.selectedPerfectSubAlloyMatchIndex ?? 0;
      const selectedCombo = searchRes.validCombos[idx] || searchRes.validCombos[0];
      return selectedCombo.totalVolume;
    }

    return proposedVolume;
  };

  // Building final recipes results structure
  let results: {
    metal: MetalState;
    solution: { norm: number; small: number; tiny: number; totalVal: number };
    targetMb: number;
    proposedTargetMb: number;
    minPercent: number;
    maxPercent: number;
  }[] = [];

  if (perfectMode && activePerfectMatch) {
    results = currentMetals.map((metal, idx) => {
      const targetMb = activePerfectMatch.components[idx];
      const lookupObj = perfectReachableLookup[idx]?.lookup[targetMb] || { n: 0, s: 0, t: 0 };
      const finalVolumeVal = getSubAlloyCalculatedVolume(metal, targetMb);
      return {
        metal,
        solution: {
          norm: lookupObj.n,
          small: lookupObj.s,
          tiny: lookupObj.t,
          totalVal: finalVolumeVal
        },
        targetMb: finalVolumeVal,
        proposedTargetMb: targetMb,
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

      if (m.isAlloy) {
        const subMult = m.subAlloyMultiplicity || 144;
        let roundedSubVolume = Math.round(finalTarget / subMult) * subMult;
        if (roundedSubVolume <= 0 && finalTarget > 0) {
          roundedSubVolume = subMult;
        }
        const finalVolumeVal = getSubAlloyCalculatedVolume(m, roundedSubVolume);
        return {
          metal: m,
          solution: { n: 0, s: 0, t: 0, totalVal: finalVolumeVal },
          targetMb: finalVolumeVal,
          proposedTargetMb: roundedSubVolume,
          minPercent: m.minPercent,
          maxPercent: m.maxPercent
        };
      }

      // Loop dust counts to minimize delta
      let bestSol = { n: 0, s: 0, t: 0, totalVal: 0 };
      let minPenalty = Infinity;

      const maxNorm = m.dustNorm > 0 ? Math.ceil(Math.max(finalMax, finalTarget) / m.dustNorm) + 2 : 0;
      const maxSmall = m.dustSmall > 0 ? Math.ceil(Math.max(finalMax, finalTarget) / m.dustSmall) + 2 : 0;
      const maxTiny = m.dustTiny > 0 ? Math.ceil(Math.max(finalMax, finalTarget) / m.dustTiny) + 2 : 0;

      // Restrict iteration sizes for fast live response
      const limN = m.dustNorm > 0 ? Math.min(maxNorm, 40) : 0;
      const limS = m.dustSmall > 0 ? Math.min(maxSmall, 40) : 0;
      const limT = m.dustTiny > 0 ? Math.min(maxTiny, 45) : 0;

      for (let n = 0; n <= limN; n++) {
        const valN = n * m.dustNorm;
        if (m.dustNorm > 0 && valN > finalMax + m.dustNorm) break;

        for (let s = 0; s <= limS; s++) {
          const valS = valN + s * m.dustSmall;
          if (m.dustSmall > 0 && valS > finalMax + m.dustSmall) break;

          for (let t = 0; t <= limT; t++) {
            const total = valS + (m.dustTiny > 0 ? t * m.dustTiny : 0);
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
            if (m.dustTiny <= 0) break;
          }
          if (m.dustSmall <= 0) break;
        }
        if (m.dustNorm <= 0) break;
      }

      return {
        metal: m,
        solution: bestSol,
        targetMb: finalTarget,
        proposedTargetMb: finalTarget,
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
    <div className="min-h-screen bg-[#070708] bg-[radial-gradient(circle_at_center,_#141416_0%,_#070708_100%)] text-[#f4f4f5] flex flex-col justify-between font-sans selection:bg-zinc-800 selection:text-white">
      
      {/* Header */}
      <header className="h-14 border-b border-[#1c1c1f] flex items-center justify-between px-4 sm:px-6 bg-[#0c0c0d] sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-zinc-300 shadow-[0_0_8px_#f4f4f5] animate-pulse"></div>
          <h1 className="text-xs sm:text-sm font-black tracking-[0.1em] sm:tracking-[0.2em] uppercase text-zinc-100 flex items-center gap-2">
            Alloy Forge System <span className="text-zinc-500 text-[9px] font-mono tracking-normal lowercase hidden md:inline">v3.3.0</span>
          </h1>
        </div>
        
        <div className="flex items-center gap-3 sm:gap-4 text-[10px] font-mono">
          {/* Offline/Online Badge */}
          <div className={`flex gap-1.5 items-center px-2 py-1 rounded bg-[#131315] border ${isOffline ? "border-amber-900/60 text-amber-400" : "border-emerald-900/40 text-emerald-400"} text-[9px] font-bold tracking-wider uppercase`}>
            {isOffline ? (
              <>
                <WifiOff className="w-3 h-3 text-amber-400 animate-pulse" />
                <span className="hidden xs:inline">Автономно</span>
              </>
            ) : (
              <>
                <Wifi className="w-3 h-3 text-emerald-450" />
                <span className="hidden xs:inline">Загружено (ОК)</span>
              </>
            )}
          </div>

          {/* Android PWA Install Trigger */}
          {!isInstalledApp && (
            <button
              type="button"
              onClick={handlePwaInstall}
              className="flex items-center gap-1 bg-zinc-100 hover:bg-white text-zinc-950 px-2.5 py-1 rounded text-[9px] font-black uppercase tracking-wider transition-all duration-150 cursor-pointer shadow-[0_0_8px_rgba(255,255,255,0.06)] shrink-0"
              title="Установить на Android 16"
            >
              <Download className="w-3 h-3 text-zinc-950" />
              <span>ДЛЯ ANDROID</span>
            </button>
          )}

          <div className="hidden sm:flex items-center gap-2 text-[10px] text-zinc-400 font-bold tracking-wider">
            <span className={`w-1.5 h-1.5 rounded-full ${autosaveVisible ? "bg-zinc-400 animate-ping" : "bg-emerald-500"}`}></span>
            {autosaveVisible ? "SAVING..." : "АВТОНОМНОСТЬ АКТИВНА"}
          </div>
        </div>
      </header>
 
      {/* Main Core */}
      <main className="max-w-6xl mx-auto p-4 w-full flex-grow grid grid-cols-1 lg:grid-cols-12 gap-6 my-4">
        
        {/* Left Grid: Controls and inputs */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          
          {/* Main settings config card */}
          <section className="bg-[#101012] border border-[#212124] rounded-xl p-5 shadow-xl relative overflow-hidden">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 mb-4 relative z-50">
              <h2 className="text-xs font-bold text-zinc-300 uppercase tracking-widest flex items-center gap-2">
                <Sliders className="text-zinc-400 w-4 h-4" /> ОСНОВНЫЕ НАСТРОЙКИ ПЛАВКИ
              </h2>
              
              {/* Perfect Mode Toggle */}
              <label className="flex items-center gap-2 text-[10px] font-bold text-zinc-300 bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-md cursor-pointer hover:bg-zinc-800 hover:border-zinc-500 transition-all select-none">
                <input 
                  type="checkbox" 
                  checked={perfectMode}
                  onChange={(e) => {
                    setPerfectMode(e.target.checked);
                    setSelectedPerfectMatchIndex(0);
                  }}
                  className="rounded bg-[#080809] border-zinc-800 text-zinc-100 focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5 cursor-pointer accent-zinc-100"
                />
                <span className="flex items-center gap-1 uppercase tracking-wider"><Sparkles className="w-3 h-3 text-zinc-400" /> ИДЕАЛЬНЫЙ ПОДБОР</span>
              </label>
            </div>
 
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 relative z-10">
              {/* Preset selection dropdown with Delete and Save buttons */}
              <div>
                <label className="flex items-center justify-between text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">
                  <span>ВЫБЕРИТЕ СПЛАВ</span>
                  <div className="flex gap-2 text-[9px] font-bold text-zinc-400">
                    <button 
                      type="button"
                      onClick={handleRestoreDefaultPresets}
                      className="hover:underline flex items-center gap-0.5 cursor-pointer text-zinc-300 hover:text-white"
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
                      className="w-full bg-[#18181c] border border-zinc-800 rounded-lg pl-4 pr-10 py-3 text-zinc-100 focus:outline-none focus:border-zinc-500 transition-colors appearance-none cursor-pointer text-xs uppercase tracking-wide font-medium"
                    >
                      {(Object.entries(presets) as [string, MetalPreset][]).map(([key, item]) => (
                        <option key={key} value={key} className="bg-[#121214] text-zinc-200">
                          {item.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-zinc-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>

                  {/* Delete active preset button */}
                  <button
                    type="button"
                    onClick={handleDeletePreset}
                    disabled={Object.keys(presets).length <= 1}
                    className="px-3 bg-zinc-900 border border-zinc-800 hover:bg-zinc-850 hover:border-red-900/80 hover:text-red-400 text-zinc-400 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-all flex items-center justify-center shrink-0 cursor-pointer"
                    title="Удалить этот сплав"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  {/* Save current metals as a custom preset button */}
                  <button
                    type="button"
                    onClick={() => setShowSavePresetDialog(!showSavePresetDialog)}
                    className="px-3 bg-zinc-900 border border-zinc-800 hover:bg-zinc-850 hover:border-zinc-500 text-zinc-300 rounded-lg transition-all flex items-center justify-center shrink-0 cursor-pointer"
                    title="Сохранить текущую сборку как новый сплав"
                  >
                    <Save className="w-4 h-4" />
                  </button>
                </div>

                {/* Save Preset Dialog modal form */}
                {showSavePresetDialog && (
                  <div className="mt-3 p-3 bg-zinc-900/60 border border-zinc-800 rounded-lg animate-in slide-in-from-top-2 duration-200">
                    <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Название нового пресета сплава:</div>
                    <div className="flex gap-2">
                      <input 
                        type="text"
                        value={newPresetName}
                        onChange={(e) => setNewPresetName(e.target.value)}
                        placeholder="Например: Сплав Силы v2"
                        className="flex-grow bg-[#09090a] border border-zinc-800 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-zinc-500"
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveAsPreset()}
                      />
                      <button 
                        onClick={handleSaveAsPreset}
                        disabled={!newPresetName.trim()}
                        className="px-3 py-1.5 bg-zinc-100 hover:bg-white text-zinc-950 font-bold text-xs rounded transition-all disabled:opacity-45 cursor-pointer"
                      >
                        Сохранить
                      </button>
                      <button 
                        onClick={() => { setShowSavePresetDialog(false); setNewPresetName(""); }}
                        className="px-2 py-1.5 hover:bg-zinc-800 text-zinc-400 text-xs rounded transition-all cursor-pointer"
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Target volumes inputs */}
              <div>
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">
                  {hasPinned ? "ОЖИДАЕМЫЙ ОБЪЕМ СПЛАВА" : "ЖЕЛАЕМЫЙ ОБЪЕМ СПЛАВА (мБ)"}
                </label>
                <div className="relative">
                  <input 
                    type="text"
                    value={hasPinned ? derivedTargetVolume : targetVolumeInput}
                    disabled={hasPinned}
                    onChange={(e) => handleTargetVolumeInputChange(e.target.value)}
                    onBlur={handleBlurEvaluateTargetVolume}
                    className="w-full bg-[#18181c] border border-zinc-800 rounded-lg pl-4 pr-32 py-3 text-zinc-100 focus:outline-none focus:border-zinc-500 transition-colors font-mono font-bold text-xl disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 pointer-events-none">
                    {evaluateMathExpression(targetVolumeInput) !== null && targetVolumeInput.match(/[+\-*/()]/) && (
                      <span className="text-[10px] font-mono font-bold text-zinc-300 bg-zinc-800/80 px-1.5 py-0.5 rounded border border-zinc-700">
                        = {Math.round(evaluateMathExpression(targetVolumeInput)!)}
                      </span>
                    )}
                    <span className="text-xs text-zinc-500 font-bold font-mono">мБ</span>
                  </div>
                </div>
                {hasPinned && (
                  <div className="mt-1.5 text-[9px] text-zinc-400 flex items-center gap-1 font-bold bg-zinc-950/20 border border-zinc-850/35 px-2 py-1 rounded-md uppercase tracking-wider">
                    <Calculator className="w-3.5 h-3.5 shrink-0" /> Рассчитано автоматически по весу зафиксированного компонента
                  </div>
                )}
              </div>
            </div>

            {/* Target multiplicity configuration */}
            <div className="pt-4 border-t border-zinc-800/85 grid grid-cols-1 md:grid-cols-2 gap-4 mb-2 relative z-10">
              <div>
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">КРАТНОСТЬ ИТОГОВОГО ОБЪЕМА (мБ)</label>
                <div className="relative">
                  <input 
                    type="text" 
                    value={targetMultiplicityInput}
                    onChange={(e) => handleTargetMultiplicityInputChange(e.target.value)}
                    onBlur={handleBlurEvaluateTargetMultiplicity}
                    className="w-full bg-[#18181c] border border-zinc-800 rounded-lg pl-4 pr-32 py-2.5 text-zinc-100 focus:outline-none focus:border-zinc-500 transition-colors font-mono font-bold text-sm"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 pointer-events-none">
                    {evaluateMathExpression(targetMultiplicityInput) !== null && targetMultiplicityInput.match(/[+\-*/()]/) && (
                      <span className="text-[9px] font-mono font-bold text-zinc-300 bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-700">
                        = {Math.round(evaluateMathExpression(targetMultiplicityInput)!)}
                      </span>
                    )}
                    <span className="text-xs text-zinc-500 font-bold font-mono">мБ</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-col justify-end gap-1.5">
                <span className="text-[9px] text-zinc-400 uppercase font-bold tracking-widest">БЫСТРЫЕ ПРЕСЕТЫ КРАТНОСТИ</span>
                <div className="flex gap-1.5 flex-wrap">
                  <button 
                    onClick={() => { setTargetMultiplicity(1); setTargetMultiplicityInput("1"); setSelectedPerfectMatchIndex(0); }} 
                    className={`text-[9px] px-2.5 py-1.5 rounded transition-all font-bold tracking-wider border cursor-pointer uppercase ${
                      targetMultiplicity === 1 
                        ? 'bg-zinc-100 text-zinc-950 border-zinc-200 shadow-[0_0_8px_rgba(255,255,255,0.15)]' 
                        : 'bg-[#18181c] hover:bg-[#222226] text-zinc-300 border-zinc-800 hover:border-zinc-500'
                    }`}
                  >
                    ЛЮБАЯ (1)
                  </button>
                  <button 
                    onClick={() => { setTargetMultiplicity(100); setTargetMultiplicityInput("100"); setSelectedPerfectMatchIndex(0); }} 
                    className={`text-[9px] px-2.5 py-1.5 rounded transition-all font-bold tracking-wider border cursor-pointer uppercase ${
                      targetMultiplicity === 100 
                        ? 'bg-zinc-100 text-zinc-950 border-zinc-200 shadow-[0_0_8px_rgba(255,255,255,0.15)]' 
                        : 'bg-[#18181c] hover:bg-[#222226] text-zinc-300 border-zinc-800 hover:border-zinc-500'
                    }`}
                  >
                    СЛИTOK GT (100)
                  </button>
                  <button 
                    onClick={() => { setTargetMultiplicity(144); setTargetMultiplicityInput("144"); setSelectedPerfectMatchIndex(0); }} 
                    className={`text-[9px] px-2.5 py-1.5 rounded transition-all font-bold tracking-wider border cursor-pointer uppercase ${
                      targetMultiplicity === 144 
                        ? 'bg-zinc-100 text-zinc-950 border-zinc-200 shadow-[0_0_8px_rgba(255,255,255,0.15)]' 
                        : 'bg-[#18181c] hover:bg-[#222226] text-zinc-300 border-zinc-800 hover:border-zinc-500'
                    }`}
                  >
                    СЛИTOK TFC (144)
                  </button>
                  <button 
                    onClick={() => { setTargetMultiplicity(2016); setTargetMultiplicityInput("2016"); setSelectedPerfectMatchIndex(0); }} 
                    className={`text-[9px] px-2.5 py-1.5 rounded transition-all font-bold tracking-wider border cursor-pointer uppercase ${
                      targetMultiplicity === 2016 
                        ? 'bg-zinc-100 text-zinc-950 border-zinc-200 shadow-[0_0_8px_rgba(255,255,255,0.15)]' 
                        : 'bg-[#18181c] hover:bg-[#222226] text-zinc-300 border-zinc-800 hover:border-zinc-500'
                    }`}
                  >
                    СОСУД (2016)
                  </button>
                </div>
              </div>
            </div>

            {/* Perfect mode interactive selector list */}
            {perfectMode && (
              <div className="mt-4 pt-4 border-t border-zinc-800 transition-all relative z-10">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-2">
                  <label className="block text-[10px] font-bold tracking-wider text-zinc-400 uppercase">
                    <span className="flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5" /> ТОЧНЫЕ ПРОПОРЦИИ ДЛЯ СПЛАВА (
                      <em className="font-mono font-bold text-white underline not-italic">{derivedTargetVolume}</em> мБ):
                    </span>
                  </label>
                  
                  {/* Sorting dropdown */}
                  <div className="flex items-center gap-1.5 bg-[#141416] border border-zinc-800 px-2 py-1 rounded">
                    <span className="text-[9px] text-[#8e9bb8] uppercase font-bold tracking-wider">Сортировать по:</span>
                    <select 
                       value={perfectSortBy}
                       onChange={(e) => {
                         setPerfectSortBy(e.target.value as any);
                         setSelectedPerfectMatchIndex(0);
                       }}
                       className="bg-[#141416] text-[9px] text-zinc-300 font-bold focus:outline-none cursor-pointer tracking-wider"
                    >
                      <option value="itemCount" className="bg-[#121214]">МИНИМУМ КУЧЕК (БЫСТРЕЕ)</option>
                      <option value="deviation" className="bg-[#121214]">БЛИЖЕ К ЖЕЛАЕМЫМ %</option>
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

                      const showDoublePerfect = match.showDoublePerfect;

                      const buttonClass = isSelected 
                        ? 'bg-zinc-100 border-zinc-200 text-zinc-950 shadow-[0_0_12px_rgba(255,255,255,0.15)] font-bold'
                        : 'bg-[#141416] border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white';

                      return (
                        <button 
                          key={idx}
                          type="button"
                          onClick={() => setSelectedPerfectMatchIndex(idx)}
                          className={`px-3.5 py-2.5 text-left rounded border transition-all duration-150 flex flex-col justify-center relative overflow-hidden select-none cursor-pointer ${buttonClass}`}
                        >
                          <div className="flex justify-between items-center w-full gap-2">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-bold uppercase tracking-wide">{pctLabel}</span>
                              {showDoublePerfect && (
                                <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border flex items-center gap-1 shrink-0 ${
                                  isSelected 
                                    ? 'bg-emerald-100 border-emerald-300 text-emerald-800' 
                                    : 'bg-emerald-950/35 border-emerald-900/50 text-emerald-400'
                                }`}>
                                  <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse"></span>
                                  Вложенность OK
                                </span>
                              )}
                            </div>
                            <span className={`text-[9px] px-1.5 py-1 rounded font-bold uppercase shrink-0 ${
                              isSelected ? 'bg-zinc-200/40 text-zinc-950 border border-zinc-300' : 'bg-[#19191c] text-zinc-400 border border-zinc-800'
                            }`}>
                              Досыпать: {match.totalItems} шт.
                            </span>
                          </div>
                          <div className="flex justify-between text-[10px] opacity-80 mt-1.5 font-mono">
                            <span>
                              Пыль добора:{" "}
                              {match.components.map((c: any, mIdx: number) => {
                                const m = currentMetals[mIdx];
                                const isSolvableAlloy = !!match.subAlloySolvable?.[mIdx];

                                const isLast = mIdx === match.components.length - 1;
                                let valClass = isSelected ? 'text-zinc-900' : 'text-zinc-300';
                                if (isSolvableAlloy) {
                                  valClass = isSelected ? 'text-emerald-700 font-extrabold' : 'text-emerald-400 font-bold';
                                }

                                return (
                                  <React.Fragment key={mIdx}>
                                    <span className={valClass}>{c} мБ</span>
                                    {!isLast && <span className={isSelected ? 'text-zinc-400' : 'text-zinc-600'}> + </span>}
                                  </React.Fragment>
                                );
                              })}
                            </span>
                            <span className={`font-bold ${isSelected ? 'text-zinc-950' : 'text-zinc-400'}`}>
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
            <div className="mt-4 pt-4 border-t border-zinc-800/85 grid grid-cols-1 md:grid-cols-2 gap-4 relative z-10">
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
                    className="rounded bg-[#08080a] border-zinc-800 text-zinc-200 focus:ring-0 focus:ring-offset-0 w-4 h-4 cursor-pointer accent-zinc-200"
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
                      className="w-full bg-[#18181c] border border-zinc-805 rounded-lg pl-4 pr-32 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500 transition-colors font-mono font-bold"
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 pointer-events-none">
                      {evaluateMathExpression(existingMetalVolumeInput) !== null && existingMetalVolumeInput.match(/[+\-*/()]/) && (
                        <span className="text-[9px] font-mono font-bold text-zinc-300 bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-700">
                          = {Math.round(evaluateMathExpression(existingMetalVolumeInput)!)}
                        </span>
                      )}
                      <span className="text-xs text-zinc-500 font-bold font-mono">мБ</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end md:text-right">
                <span className="text-[10px] text-zinc-400 uppercase tracking-wide italic block leading-normal">
                  Поддерживает как добавление твердого добора пыли, так и вычисление недостающего сырья с учетом жидкой фазы
                </span>
              </div>
            </div>
          </section>

          {/* Core alloys component card lists */}
          <section className="bg-[#101012] border border-[#212124] rounded-xl p-5 shadow-xl flex-grow relative overflow-hidden">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 mb-4">
              <h2 className="text-xs font-bold text-zinc-300 uppercase tracking-widest flex items-center gap-2">
                <Settings className="text-zinc-400 w-4 h-4" /> КОМПОНЕНТЫ СПЛАВА
              </h2>
              <div className="flex items-center gap-2 relative">
                {/* Button for nested alloys templates selection */}
                <div className="relative">
                  <button 
                    onClick={() => setShowAddAlloyState(!showAddAlloyState)}
                    className="text-[10px] uppercase tracking-wider bg-[#141416] text-zinc-300 border border-zinc-805 hover:border-zinc-500 px-3 py-2 rounded font-extrabold hover:text-white transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
                  >
                    <Layers className="w-3.5 h-3.5" /> Добавить сплав
                  </button>
                  {showAddAlloyState && (
                    <div className="absolute right-0 mt-2 w-72 bg-[#121214] border border-zinc-800 rounded-xl p-3 shadow-2xl z-50 max-h-80 overflow-y-auto animate-in fade-in duration-150">
                      <div className="text-[10px] uppercase font-black text-zinc-400 tracking-wider mb-2 pb-1.5 border-b border-zinc-800/80">Выберите вложенный сплав:</div>
                      <div className="flex flex-col gap-1.5">
                        {Object.entries(presets).map(([key, item]) => {
                          if (key === 'custom') return null;
                          const presetItem = item as MetalPreset;
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => {
                                handleAddSubAlloyComponent(key);
                                setShowAddAlloyState(false);
                              }}
                              className="text-left py-2 px-2.5 rounded-lg hover:bg-zinc-900 text-zinc-350 hover:text-white transition-all cursor-pointer"
                            >
                              <div className="font-bold uppercase tracking-wider text-xs">{presetItem.name}</div>
                              <div className="text-[9px] text-zinc-500 font-mono mt-0.5">
                                {presetItem.metals.map(subM => `${subM.name?.split(' ')[0] || "Металл"}: ${subM.defaultPercent}%`).join(' / ')}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <button 
                  onClick={handleAddMetal}
                  className="text-[10px] uppercase tracking-wider bg-zinc-100 text-zinc-950 px-3.5 py-2 rounded font-extrabold hover:bg-white transition-all cursor-pointer flex items-center gap-1.5 shadow-[0_0_8px_rgba(255,255,255,0.08)]"
                >
                  <Plus className="w-3.5 h-3.5" /> Добавить металл
                </button>
              </div>
            </div>

            {/* List entries */}
            <div className="flex flex-col gap-4">
              {currentMetals.map((metal, index) => (
                <div 
                  key={metal.id}
                  className={`border rounded p-4 flex flex-col gap-3 relative transition-all duration-200 ${
                    metal.isPinned 
                      ? 'border-zinc-700 shadow-md shadow-zinc-900/10 bg-[#161619]' 
                      : 'border-zinc-800 bg-[#121214] hover:border-zinc-700'
                  }`}
                >
                  {/* Top bar controls */}
                  <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 pb-2 border-b border-zinc-800">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`w-3.5 h-3.5 rounded-full bg-gradient-to-tr ${metal.color || 'from-[#4b5563] to-[#6b7280]'} shadow`}></span>
                      <input 
                        type="text" 
                        value={metal.name}
                        onChange={(e) => handleUpdateMetalName(index, e.target.value)}
                        className="bg-transparent border-b border-transparent hover:border-zinc-800 focus:border-zinc-500 text-sm font-bold text-zinc-200 px-1.5 focus:outline-none transition-colors uppercase tracking-wider min-w-[120px]"
                      />
                      {metal.isAlloy && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase bg-amber-950/40 text-amber-400 border border-amber-900/45 tracking-wider font-mono">
                          СПЛАВ-ВЛОЖЕНИЕ
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-3">
                      {/* Pinned weight lock */}
                      <label className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-bold uppercase tracking-wider cursor-pointer select-none">
                        <input 
                          type="checkbox" 
                          checked={metal.isPinned}
                          onChange={(e) => handleTogglePinMetal(index, e.target.checked)}
                          className="rounded bg-[#08080a] border-zinc-800 text-zinc-100 focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5 cursor-pointer accent-zinc-200"
                        />
                        <span className="flex items-center gap-1">
                          <Lock className="w-3 h-3 text-zinc-400" /> Фиксировать
                        </span>
                      </label>

                      {/* Remove item */}
                      <button 
                        onClick={() => handleRemoveMetal(index)}
                        className="text-xs text-red-400 hover:text-red-300 transition-colors p-1 cursor-pointer"
                        title="Удалить металл"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Manual lock box */}
                  {metal.isPinned && (
                    <div className="bg-zinc-900/45 border border-zinc-800 p-3.5 rounded flex flex-col gap-3 animate-in slide-in-from-top-1 duration-200">
                      <div className="flex justify-between items-center">
                        <span className="text-[9px] uppercase tracking-widest text-zinc-300 font-bold flex items-center gap-1">
                          <Scale className="w-3.5 h-3.5 text-zinc-400" /> Заданный вес компонента:
                        </span>
                        
                        {/* Unit selector */}
                        <div className="flex gap-1 text-[9px] bg-[#080809] p-0.5 rounded border border-zinc-800 font-bold font-mono">
                          <button 
                            onClick={() => handleSetPinnedInputType(index, 'mb')} 
                            className={`px-2 py-0.5 rounded transition-all cursor-pointer uppercase ${
                              metal.pinnedInputType === 'mb' ? 'bg-zinc-100 text-zinc-950 font-bold' : 'text-zinc-400 hover:text-white'
                            }`}
                          >
                            В мБ
                          </button>
                          <button 
                            onClick={() => handleSetPinnedInputType(index, 'dust')} 
                            className={`px-2 py-0.5 rounded transition-all cursor-pointer uppercase ${
                              metal.pinnedInputType === 'dust' ? 'bg-zinc-100 text-zinc-950 font-bold' : 'text-zinc-400 hover:text-white'
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
                            className="w-full bg-[#18181c] border border-zinc-800 rounded px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-zinc-500 transition-colors font-mono font-bold"
                          />
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
                            {evaluateMathExpression(metal.pinnedVolumeInput || "") !== null && (metal.pinnedVolumeInput || "").match(/[+\-*/()]/) && (
                              <span className="text-[9px] font-mono font-bold text-zinc-300 bg-zinc-800/80 px-1.5 py-0.5 rounded border border-zinc-700">
                                = {Math.round(evaluateMathExpression(metal.pinnedVolumeInput || "")!)}
                              </span>
                            )}
                            <span className="text-[10px] text-zinc-500 font-bold font-mono">мБ</span>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-2">
                          <div className="bg-[#141416] border border-zinc-805 p-1.5 rounded text-center">
                            <span className="text-[8px] uppercase text-zinc-400 font-bold tracking-wider block mb-1">Пыль</span>
                            <div className="flex items-center justify-between gap-1">
                              <button 
                                onClick={() => handleAdjustPinnedDust(index, 'pinnedDustNorm', -1)} 
                                className="w-5 h-5 rounded bg-[#18181c] border border-zinc-800 text-zinc-400 hover:text-white text-[10px] font-bold cursor-pointer hover:border-zinc-500 transition-colors"
                              >
                                -
                              </button>
                              <span className="font-mono font-bold text-white text-xs">{metal.pinnedDustNorm}</span>
                              <button 
                                onClick={() => handleAdjustPinnedDust(index, 'pinnedDustNorm', 1)} 
                                className="w-5 h-5 rounded bg-[#18181c] border border-zinc-800 text-zinc-400 hover:text-white text-[10px] font-bold cursor-pointer hover:border-zinc-500 transition-colors"
                              >
                                +
                              </button>
                            </div>
                          </div>
                          <div className="bg-[#141416] border border-zinc-805 p-1.5 rounded text-center">
                            <span className="text-[8px] uppercase text-zinc-400 font-bold tracking-wider block mb-1">Малая</span>
                            <div className="flex items-center justify-between gap-1">
                              <button 
                                onClick={() => handleAdjustPinnedDust(index, 'pinnedDustSmall', -1)} 
                                className="w-5 h-5 rounded bg-[#18181c] border border-zinc-800 text-zinc-400 hover:text-white text-[10px] font-bold cursor-pointer hover:border-zinc-500 transition-colors"
                              >
                                -
                              </button>
                              <span className="font-mono font-bold text-white text-xs">{metal.pinnedDustSmall}</span>
                              <button 
                                onClick={() => handleAdjustPinnedDust(index, 'pinnedDustSmall', 1)} 
                                className="w-5 h-5 rounded bg-[#18181c] border border-zinc-800 text-zinc-400 hover:text-white text-[10px] font-bold cursor-pointer hover:border-zinc-500 transition-colors"
                              >
                                +
                              </button>
                            </div>
                          </div>
                          <div className="bg-[#141416] border border-zinc-805 p-1.5 rounded text-center">
                            <span className="text-[8px] uppercase text-zinc-400 font-bold tracking-wider block mb-1">Кроха</span>
                            <div className="flex items-center justify-between gap-1">
                              <button 
                                onClick={() => handleAdjustPinnedDust(index, 'pinnedDustTiny', -1)} 
                                className="w-5 h-5 rounded bg-[#18181c] border border-zinc-800 text-zinc-400 hover:text-white text-[10px] font-bold cursor-pointer hover:border-zinc-500 transition-colors"
                              >
                                -
                              </button>
                              <span className="font-mono font-bold text-white text-xs">{metal.pinnedDustTiny}</span>
                              <button 
                                onClick={() => handleAdjustPinnedDust(index, 'pinnedDustTiny', 1)} 
                                className="w-5 h-5 rounded bg-[#18181c] border border-zinc-800 text-zinc-400 hover:text-white text-[10px] font-bold cursor-pointer hover:border-zinc-500 transition-colors"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="text-[10px] text-zinc-400 flex justify-between items-center px-1 font-mono">
                        <span>Эквивалент в жидкости:</span>
                        <span className="font-bold text-zinc-300">{getPinnedMetalEquivalentMb(metal)} мБ</span>
                      </div>
                    </div>
                  )}

                  {/* Percentage configurations */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
                    <div>
                      <label className="block text-[9px] uppercase font-bold tracking-widest text-[#8e9bb8] mb-1">Мин % в сплаве</label>
                      <div className="relative">
                        <input 
                          type="text" 
                          value={metal.minPercentInput ?? metal.minPercent.toString()} 
                          onChange={(e) => handleUpdatePercentBound(index, 'minPercent', e.target.value)}
                          onBlur={() => handleBlurEvaluatePercentBound(index, 'minPercent')}
                          className="w-full bg-[#18181c] border border-zinc-850 rounded px-2.5 py-1 text-xs text-zinc-200 focus:outline-none focus:border-zinc-500 transition-colors font-mono font-bold text-center"
                        />
                        {evaluateMathExpression(metal.minPercentInput || "") !== null && (metal.minPercentInput || "").match(/[+\-*/()]/) && (
                          <div className="absolute left-1/2 -translate-x-1/2 bottom-[-18px] z-10 text-[8px] font-mono font-bold text-zinc-300 bg-[#121214] px-1 py-0.5 rounded border border-zinc-700 whitespace-nowrap">
                            = {Math.round(evaluateMathExpression(metal.minPercentInput || "")!)}%
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-[9px] uppercase font-bold tracking-widest text-[#8e9bb8] mb-1">Макс % в сплаве</label>
                      <div className="relative">
                        <input 
                          type="text" 
                          value={metal.maxPercentInput ?? metal.maxPercent.toString()} 
                          onChange={(e) => handleUpdatePercentBound(index, 'maxPercent', e.target.value)}
                          onBlur={() => handleBlurEvaluatePercentBound(index, 'maxPercent')}
                          className="w-full bg-[#18181c] border border-zinc-850 rounded px-2.5 py-1 text-xs text-zinc-200 focus:outline-none focus:border-zinc-500 transition-colors font-mono font-bold text-center"
                        />
                        {evaluateMathExpression(metal.maxPercentInput || "") !== null && (metal.maxPercentInput || "").match(/[+\-*/()]/) && (
                          <div className="absolute left-1/2 -translate-x-1/2 bottom-[-18px] z-10 text-[8px] font-mono font-bold text-zinc-300 bg-[#121214] px-1 py-0.5 rounded border border-zinc-700 whitespace-nowrap">
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
                          className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-zinc-200"
                        />
                        <input 
                          type="number" 
                          min="0" 
                          max="100" 
                          value={metal.defaultPercent} 
                          onChange={(e) => handleUpdateTargetPercent(index, e.target.value)}
                          className="w-14 bg-[#18181c] border border-zinc-800 rounded text-center px-1 py-0.5 text-xs text-zinc-300 font-bold font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Dust volume custom calibration ratios or Sub-alloy breakdown detail table */}
                  {metal.isAlloy ? (
                    <div className="bg-[#141416] p-4 rounded-lg border border-zinc-805 flex flex-col gap-4 animate-in slide-in-from-top-1 duration-200">
                      {/* Sub-alloy multiplicity config */}
                      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] uppercase font-bold tracking-widest text-[#8e9bb8] flex items-center gap-1.5 matches-zinc">
                            <Layers className="w-3.5 h-3.5 text-zinc-400" /> Кратность сплава:
                          </span>
                          <span className="text-[9px] text-zinc-500 font-mono italic">
                            Округлить объём до кратности
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          <input 
                            type="text" 
                            value={metal.subAlloyMultiplicityInput ?? metal.subAlloyMultiplicity?.toString() ?? "144"}
                            onChange={(e) => handleUpdateSubAlloyMultiplicity(index, e.target.value)}
                            onBlur={() => handleBlurEvaluateSubAlloyMultiplicity(index)}
                            className="bg-[#18181c] border border-zinc-805 rounded px-2.5 py-1 text-xs text-zinc-200 focus:outline-none focus:border-zinc-500 text-center font-bold font-mono w-20"
                          />
                          
                          <div className="flex gap-1 bg-[#1c1c1f] p-0.5 rounded border border-zinc-850 text-[9px] font-bold font-mono">
                            {[1, 100, 144, 2016].map((mv) => (
                              <button
                                key={mv}
                                type="button"
                                onClick={() => {
                                  const updated = currentMetals.map((m, idx) => idx === index ? { ...m, subAlloyMultiplicity: mv, subAlloyMultiplicityInput: mv.toString() } : m);
                                  setCurrentMetals(updated);
                                  setSelectedPerfectMatchIndex(0);
                                }}
                                className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                                  metal.subAlloyMultiplicity === mv ? 'bg-zinc-100 text-zinc-950 font-black shadow-sm' : 'text-zinc-400 hover:text-white'
                                }`}
                              >
                                {mv}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Sub-alloy breakdown list */}
                      <div className="border-t border-zinc-805 pt-3 flex flex-col gap-2.5">
                        {(() => {
                          const subIdealVol = results[index]?.proposedTargetMb ?? Math.round((metal.defaultPercent / 100) * derivedTargetVolume);
                          const subMult = metal.subAlloyMultiplicity || 144;
                          
                          // Run sub-alloy perfect search
                          const subMetalStates = (metal.subAlloyComponents || []).map((subM) => ({
                            id: subM.id,
                            name: subM.name,
                            color: subM.color,
                            minPercent: subM.minPercent,
                            maxPercent: subM.maxPercent,
                            defaultPercent: subM.defaultPercent,
                            dustNorm: subM.dustNorm,
                            dustSmall: subM.dustSmall,
                            dustTiny: subM.dustTiny,
                            isPinned: false,
                            pinnedInputType: 'mb' as const,
                            pinnedVolume: 0,
                            pinnedDustNorm: 1,
                            pinnedDustSmall: 0,
                            pinnedDustTiny: 0
                          }));

                          const subSearchRes = findPerfectPercentCombinations(
                            subMetalStates,
                            subIdealVol,
                            subMult,
                            0, // existingVolume
                            perfectSortBy
                          );

                          const subPerfectOptions = subSearchRes.validCombos;
                          const subReachableLookup = subSearchRes.reachablePerMetal;
                          const hasSubPerfectOptions = subPerfectOptions.length > 0;

                          let subRoundedVol = Math.round(subIdealVol / subMult) * subMult;
                          if (subRoundedVol <= 0 && subIdealVol > 0) {
                            subRoundedVol = subMult;
                          }

                          const activeSubCombo = (metal.perfectSubAlloyMode && hasSubPerfectOptions)
                            ? (subPerfectOptions[metal.selectedPerfectSubAlloyMatchIndex ?? 0] || subPerfectOptions[0])
                            : null;

                          if (activeSubCombo) {
                            subRoundedVol = activeSubCombo.totalVolume;
                          }

                          return (
                            <>
                              {/* Toggle Switch */}
                              <div className="flex items-center justify-between bg-[#19191c] border border-zinc-805/45 px-3 py-2 rounded-lg mb-1">
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-[10px] font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5 select-none text-left">
                                    <Sparkles className="w-3.5 h-3.5" /> Идеальный подбор под-сплава
                                  </span>
                                  <span className="text-[8px] text-zinc-500 font-mono text-left">
                                    Подобрать целый состав кучек под допуски
                                  </span>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer select-none">
                                  <input 
                                    type="checkbox" 
                                    checked={metal.perfectSubAlloyMode || false}
                                    onChange={(e) => handleToggleSubAlloyPerfectMode(index, e.target.checked)}
                                    className="sr-only peer"
                                  />
                                  <div className="w-8 h-4.5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-400 after:border-zinc-350 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-amber-500 peer-checked:after:bg-zinc-950"></div>
                                </label>
                              </div>

                              {/* Selector list for Sub perfect options */}
                              {metal.perfectSubAlloyMode && (
                                <div className="bg-[#18181c] border border-zinc-850 p-2.5 rounded-lg mb-1 flex flex-col gap-2">
                                  <div className="flex justify-between items-center text-[9px] font-bold text-[#8e9bb8] uppercase">
                                    <span>Точные пропорции под-сплава ({subRoundedVol} мБ):</span>
                                    <span className="font-mono text-zinc-500">Вариантов: {subPerfectOptions.length}</span>
                                  </div>
                                  
                                  {!hasSubPerfectOptions ? (
                                    <div className="text-[10px] text-red-400/80 p-2.5 text-center bg-red-950/10 border border-red-900/20 rounded font-mono select-none">
                                      Невозможно подобрать целые горсти под кратные {subMult} мБ. Измените диапазоны % или кратность.
                                    </div>
                                  ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-32 overflow-y-auto pr-1">
                                      {subPerfectOptions.slice(0, 20).map((match, optIdx) => {
                                        const isSelected = optIdx === (metal.selectedPerfectSubAlloyMatchIndex ?? 0);
                                        const pctLabel = match.percentages.map((p: number, i: number) => {
                                          return `${metal.subAlloyComponents?.[i]?.name?.split(' ')[0] || "Металл"}: ${p.toFixed(1)}%`;
                                        }).join(' | ');

                                        return (
                                          <button
                                            key={optIdx}
                                            type="button"
                                            onClick={() => handleSelectSubAlloyPerfectMatchIndex(index, optIdx)}
                                            className={`text-left rounded-lg border transition-all text-[10px] flex flex-col justify-center cursor-pointer p-1.5 ${
                                              isSelected
                                                ? 'bg-amber-500/15 border-amber-500/50 text-amber-300 font-bold shadow-sm'
                                                : 'bg-[#141416] border-zinc-850 hover:border-zinc-700 text-zinc-400 hover:text-white'
                                            }`}
                                          >
                                            <div className="flex justify-between items-center w-full font-mono">
                                              <span>Объём: <strong>{match.totalVolume} мБ</strong></span>
                                              <span>Кучек: {match.totalItems}</span>
                                            </div>
                                            <div className="text-[8px] opacity-75 font-mono mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis">
                                              {pctLabel}
                                            </div>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              )}

                              <div className="flex justify-between items-center text-[10px] uppercase font-bold tracking-widest text-[#8e9bb8]">
                                <span>Раскладка сплава:</span>
                                <span className="font-mono text-zinc-300">
                                  Итого: <strong className="text-amber-400 underline">{subRoundedVol}</strong> мБ (идеально {subIdealVol} мБ)
                                </span>
                              </div>

                              <div className="grid grid-cols-1 gap-3">
                                {(metal.subAlloyComponents || []).map((subM, subIdx) => {
                                  const subTargetMb = activeSubCombo 
                                    ? activeSubCombo.components[subIdx] 
                                    : Math.round((subM.defaultPercent / 100) * subRoundedVol);
                                  
                                  const lookupObj = (activeSubCombo && subReachableLookup[subIdx]) 
                                    ? subReachableLookup[subIdx].lookup[subTargetMb] 
                                    : null;
                                  
                                  const subSol = lookupObj 
                                    ? { n: lookupObj.n, s: lookupObj.s, t: lookupObj.t, totalVal: subTargetMb }
                                    : solveDustForSubAmount(subTargetMb, subM.dustNorm, subM.dustSmall, subM.dustTiny);
                                  
                                  return (
                                    <div key={subM.id} className="bg-[#18181c] border border-zinc-850 p-3 rounded-lg flex flex-col gap-3">
                                      {/* Header row containing name, target ml, and solved dust summary */}
                                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-1.5 border-b border-zinc-900">
                                        <div className="flex items-center gap-2">
                                          <span className={`w-2.5 h-2.5 rounded-full bg-gradient-to-tr ${subM.color || 'from-zinc-400 to-zinc-500'} shadow`}></span>
                                          <span className="text-xs font-bold text-zinc-200 uppercase tracking-wider">{subM.name}</span>
                                        </div>
                                        
                                        <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
                                          <span className="text-xs font-bold text-amber-400/90 font-mono">{subTargetMb} мБ</span>
                                          
                                          <div className="flex gap-1 text-[10px] font-mono shrink-0 select-none">
                                            {subSol.n > 0 && <span className="bg-[#242429] text-zinc-300 px-1.5 py-0.5 rounded border border-zinc-700"> {subSol.n} Пыл </span>}
                                            {subSol.s > 0 && <span className="bg-[#242429] text-zinc-300 px-1.5 py-0.5 rounded border border-zinc-700"> {subSol.s} Мал </span>}
                                            {subSol.t > 0 && <span className="bg-[#242429] text-zinc-300 px-1.5 py-0.5 rounded border border-zinc-700"> {subSol.t} Крх </span>}
                                            {subSol.totalVal === 0 && <span className="text-zinc-600 italic text-[9px]">0 мБ</span>}
                                          </div>
                                        </div>
                                      </div>

                                      {/* Sliders and limits configurations */}
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
                                        {/* Slider & numeric input for Ideal percent of this nested metal */}
                                        <div className="flex flex-col gap-1">
                                          <span className="text-[8px] uppercase font-bold tracking-widest text-[#8e9bb8]">Идеальный / Желаемый %</span>
                                          <div className="flex items-center gap-2">
                                            <input 
                                              type="range" 
                                              min="0" 
                                              max="100" 
                                              step="0.5"
                                              value={subM.defaultPercent} 
                                              onChange={(e) => handleUpdateSubAlloyConstituentPercent(index, subM.id, e.target.value)}
                                              className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                                            />
                                            <input 
                                              type="number" 
                                              min="0" 
                                              max="100" 
                                              step="0.5"
                                              value={subM.defaultPercent} 
                                              onChange={(e) => handleUpdateSubAlloyConstituentPercent(index, subM.id, e.target.value)}
                                              className="w-16 bg-[#141416] border border-zinc-800 rounded text-center px-1 py-0.5 text-xs text-zinc-300 font-bold font-mono"
                                            />
                                          </div>
                                        </div>

                                        {/* Min % and Max % custom settings bounds for nested components */}
                                        <div className="grid grid-cols-2 gap-2">
                                          <div>
                                            <span className="block text-[8px] uppercase font-bold tracking-widest text-[#8e9bb8] mb-0.5">Мин %</span>
                                            <input 
                                              type="number"
                                              min="0"
                                              max="100"
                                              step="0.5"
                                              value={subM.minPercent}
                                              onChange={(e) => handleUpdateSubAlloyPercentBound(index, subM.id, 'minPercent', e.target.value)}
                                              className="w-full bg-[#141416] border border-zinc-800 rounded text-center py-0.5 text-xs text-zinc-300 font-bold font-mono"
                                            />
                                          </div>
                                          <div>
                                            <span className="block text-[8px] uppercase font-bold tracking-widest text-[#8e9bb8] mb-0.5">Макс %</span>
                                            <input 
                                              type="number"
                                              min="0"
                                              max="100"
                                              step="0.5"
                                              value={subM.maxPercent}
                                              onChange={(e) => handleUpdateSubAlloyPercentBound(index, subM.id, 'maxPercent', e.target.value)}
                                              className="w-full bg-[#141416] border border-zinc-800 rounded text-center py-0.5 text-xs text-zinc-300 font-bold font-mono"
                                            />
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-[#141416] p-3 rounded border border-zinc-805 grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[8px] uppercase font-bold tracking-widest text-[#8e9bb8] mb-1">Пыль (1.0)</label>
                        <div className="relative">
                          <input 
                            type="text" 
                            value={metal.dustNormInput ?? metal.dustNorm.toString()} 
                            onChange={(e) => handleUpdateMetalDustCalibration(index, 'dustNorm', e.target.value)}
                            onBlur={() => handleBlurEvaluateMetalDustCalibration(index, 'dustNorm')}
                            className="w-full bg-[#18181c] border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-zinc-500 transition-colors text-center font-bold font-mono"
                          />
                          {evaluateMathExpression(metal.dustNormInput || "") !== null && (metal.dustNormInput || "").match(/[+\-*/()]/) && (
                            <div className="absolute left-1/2 -translate-x-1/2 bottom-[-18px] z-10 text-[8px] font-mono font-bold text-zinc-300 bg-[#121214] px-1 py-0.5 rounded border border-zinc-700 whitespace-nowrap">
                              = {Math.round(evaluateMathExpression(metal.dustNormInput || "")!)}
                            </div>
                          )}
                          <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-zinc-650 font-bold font-mono">
                            {metal.dustNorm === 0 ? "выкл" : "мБ"}
                          </span>
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
                            className="w-full bg-[#18181c] border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-zinc-500 transition-colors text-center font-bold font-mono"
                          />
                          {evaluateMathExpression(metal.dustSmallInput || "") !== null && (metal.dustSmallInput || "").match(/[+\-*/()]/) && (
                            <div className="absolute left-1/2 -translate-x-1/2 bottom-[-18px] z-10 text-[8px] font-mono font-bold text-zinc-300 bg-[#121214] px-1 py-0.5 rounded border border-zinc-700 whitespace-nowrap">
                              = {Math.round(evaluateMathExpression(metal.dustSmallInput || "")!)}
                            </div>
                          )}
                          <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-zinc-650 font-bold font-mono">
                            {metal.dustSmall === 0 ? "выкл" : "мБ"}
                          </span>
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
                            className="w-full bg-[#18181c] border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-zinc-500 transition-colors text-center font-bold font-mono"
                          />
                          {evaluateMathExpression(metal.dustTinyInput || "") !== null && (metal.dustTinyInput || "").match(/[+\-*/()]/) && (
                            <div className="absolute left-1/2 -translate-x-1/2 bottom-[-18px] z-10 text-[8px] font-mono font-bold text-zinc-300 bg-[#121214] px-1 py-0.5 rounded border border-zinc-700 whitespace-nowrap">
                              = {Math.round(evaluateMathExpression(metal.dustTinyInput || "")!)}
                            </div>
                          )}
                          <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-zinc-650 font-bold font-mono">
                            {metal.dustTiny === 0 ? "выкл" : "мБ"}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {currentMetals.length === 0 && (
                <div className="text-center py-8 text-zinc-500 text-xs font-bold uppercase tracking-widest border border-dashed border-zinc-800 bg-[#08080a]/30 rounded">
                  Нет добавленных металлов. Используйте кнопку добавления в заголовке.
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Right Grid: Resulting outputs summaries & manuals sheets */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          
          {/* Active recipe output stats */}
          <section className="bg-[#101012] border border-[#212124] rounded-xl p-5 shadow-xl relative overflow-hidden flex flex-col justify-between min-h-[420px]">
            {/* Ambient decorations blobs */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-zinc-800/10 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-zinc-800/10 rounded-full blur-3xl pointer-events-none"></div>

            <div className="relative z-10">
              <div className="flex justify-between items-center pb-4 border-b border-zinc-800 mb-5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Результаты Расчета</span>
                
                {actualTotalCombined === derivedTargetVolume ? (
                  <span className="px-2.5 py-1 text-[9px] uppercase tracking-wider rounded font-bold bg-[#0d2219] border border-emerald-800/80 text-emerald-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span> Идеально
                  </span>
                ) : (
                  <span className="px-2.5 py-1 text-[9px] uppercase tracking-wider rounded font-bold bg-[#18181c] border border-zinc-700 text-zinc-300 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-pulse"></span> Добор пыли
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

                  return res.metal.isAlloy ? (
                    <div key={idx} className="bg-[#141416] border border-amber-900/35 rounded p-4 flex flex-col gap-3.5 relative overflow-hidden ring-1 ring-amber-500/5">
                      {/* Ambient shine for alloy */}
                      <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-amber-500/5 to-transparent pointer-events-none blur-xl"></div>
                      
                      <div className="flex justify-between items-start gap-2 relative z-10">
                        <div>
                          <h4 className="text-xs font-bold text-amber-300 uppercase tracking-widest flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-gradient-to-tr from-amber-500 to-yellow-500 shadow"></span>
                            {res.metal.name}
                          </h4>
                          <p className="text-[10px] text-zinc-400 mt-1 uppercase tracking-wider block">
                            Доля:{" "}
                            <span className={`font-bold font-mono ${validRatio ? 'text-emerald-400' : 'text-red-400'}`}>
                              {ratioPercent.toFixed(1)}%
                            </span>{" "}
                            <span className="text-zinc-500 text-[9px] tracking-normal font-sans">(Допуск: {res.minPercent}-{res.maxPercent}%)</span>
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-black text-amber-300 font-mono block">
                            Досыпать: +{sol.totalVal} мБ
                          </span>
                          <span className="text-[9px] text-zinc-500 uppercase font-mono font-bold block">
                            цель: {res.targetMb} мБ
                          </span>
                        </div>
                      </div>

                      {/* Sub-alloy inner constituent shopping list */}
                      <div className="bg-[#18181c] border border-zinc-800 p-2.5 rounded-lg flex flex-col gap-2 relative z-10">
                        <div className="text-[9px] font-black uppercase text-zinc-400 tracking-widest mb-1 border-b border-zinc-805/45 pb-1">
                          Компоненты сплава ({sol.totalVal} мБ)
                        </div>
                        
                        <div className="flex flex-col gap-1.5">
                          {(() => {
                            const subMetalStates = (res.metal.subAlloyComponents || []).map((subM) => ({
                              id: subM.id,
                              name: subM.name,
                              color: subM.color,
                              minPercent: subM.minPercent,
                              maxPercent: subM.maxPercent,
                              defaultPercent: subM.defaultPercent,
                              dustNorm: subM.dustNorm,
                              dustSmall: subM.dustSmall,
                              dustTiny: subM.dustTiny,
                              isPinned: false,
                              pinnedInputType: 'mb' as const,
                              pinnedVolume: 0,
                              pinnedDustNorm: 1,
                              pinnedDustSmall: 0,
                              pinnedDustTiny: 0
                            }));

                            const subSearchRes = findPerfectPercentCombinations(
                              subMetalStates,
                              res.proposedTargetMb,
                              res.metal.subAlloyMultiplicity || 144,
                              0,
                              perfectSortBy
                            );

                            const subPerfectOptions = subSearchRes.validCombos;
                            const subReachableLookup = subSearchRes.reachablePerMetal;
                            const hasSubPerfectOptions = subPerfectOptions.length > 0;
                            const activeSubCombo = (res.metal.perfectSubAlloyMode && hasSubPerfectOptions)
                              ? (subPerfectOptions[res.metal.selectedPerfectSubAlloyMatchIndex ?? 0] || subPerfectOptions[0])
                              : null;

                            return (res.metal.subAlloyComponents || []).map((subM, subIdx) => {
                              const subTargetMb = activeSubCombo 
                                ? activeSubCombo.components[subIdx] 
                                : Math.round((subM.defaultPercent / 100) * res.proposedTargetMb);

                              const lookupObj = (activeSubCombo && subReachableLookup[subIdx]) 
                                ? subReachableLookup[subIdx].lookup[subTargetMb] 
                                : null;

                              const subSol = lookupObj 
                                ? { n: lookupObj.n, s: lookupObj.s, t: lookupObj.t }
                                : solveDustForSubAmount(subTargetMb, subM.dustNorm, subM.dustSmall, subM.dustTiny);

                              return (
                                <div key={subM.id} className="flex justify-between items-center text-xs py-1 px-1.5 hover:bg-[#202025]/50 rounded transition-colors last:border-0 font-sans">
                                  <div className="flex items-center gap-2">
                                    <span className={`w-2 h-2 rounded bg-gradient-to-tr ${subM.color || 'from-zinc-400 to-zinc-500'}`}></span>
                                    <span className="text-zinc-200 font-bold uppercase tracking-wider text-[11px]">{subM.name}</span>
                                    <span className="text-[10px] text-zinc-500 font-mono">({subM.defaultPercent}%)</span>
                                  </div>
                                  
                                  <div className="flex items-center gap-3">
                                    <span className="font-mono text-zinc-300 text-[11px] shrink-0 font-bold">{subTargetMb} мБ</span>
                                    <div className="flex gap-1 text-[9px] font-mono select-none shrink-0">
                                      {subSol.n > 0 && <span className="bg-[#242429] text-[#e4e4e7] px-1 py-0.2 rounded border border-zinc-700 font-medium"> {subSol.n} Пыл </span>}
                                      {subSol.s > 0 && <span className="bg-[#242429] text-[#e4e4e7] px-1 py-0.2 rounded border border-zinc-700 font-medium"> {subSol.s} Мал </span>}
                                      {subSol.t > 0 && <span className="bg-[#242429] text-[#e4e4e7] px-1 py-0.2 rounded border border-zinc-700 font-medium"> {subSol.t} Крх </span>}
                                    </div>
                                  </div>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div key={idx} className="bg-[#141416] border border-zinc-805 rounded p-4 flex flex-col gap-3">
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <h4 className="text-xs font-bold text-zinc-200 uppercase tracking-widest flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full bg-gradient-to-tr ${res.metal.color || 'from-[#4b5563] to-[#6b7280]'} shadow`}></span>
                            {res.metal.name}
                          </h4>
                          <p className="text-[10px] text-zinc-400 mt-1 uppercase tracking-wider block">
                            Доля:{" "}
                            <span className={`font-bold font-mono ${validRatio ? 'text-emerald-400' : 'text-red-400'}`}>
                              {ratioPercent.toFixed(1)}%
                            </span>{" "}
                            <span className="text-zinc-500 text-[9px] tracking-normal font-sans">(Допуск: {res.minPercent}-{res.maxPercent}%)</span>
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-extrabold text-zinc-300 font-mono block">
                            Досыпать: +{sol.totalVal} мБ
                          </span>
                          <span className="text-[9px] text-zinc-500 uppercase font-mono font-bold block">
                            цель: {res.targetMb} мБ
                          </span>
                        </div>
                      </div>

                      {/* Dust portions breakdown boxes */}
                      <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono select-none">
                        <div className={`p-2 rounded bg-[#18181c] border border-zinc-800 transition-all ${
                          sol.norm > 0 ? 'opacity-100 ring-1 ring-zinc-500/35 z-10 scale-[1.02]' : 'opacity-35'
                        }`}>
                          <span className={`block text-base font-extrabold ${sol.norm > 0 ? 'text-zinc-200' : 'text-zinc-650'}`}>{sol.norm}</span>
                          <span className="text-[8px] text-zinc-500 uppercase font-semibold">Пыль</span>
                        </div>
                        <div className={`p-2 rounded bg-[#18181c] border border-zinc-800 transition-all ${
                          sol.small > 0 ? 'opacity-100 ring-1 ring-zinc-500/35 z-10 scale-[1.02]' : 'opacity-35'
                        }`}>
                          <span className={`block text-base font-extrabold ${sol.small > 0 ? 'text-zinc-200' : 'text-zinc-650'}`}>{sol.small}</span>
                          <span className="text-[8px] text-zinc-500 uppercase font-semibold">Малая</span>
                        </div>
                        <div className={`p-2 rounded bg-[#18181c] border border-zinc-800 transition-all ${
                          sol.tiny > 0 ? 'opacity-100 ring-1 ring-zinc-500/35 z-10 scale-[1.02]' : 'opacity-35'
                        }`}>
                          <span className={`block text-base font-extrabold ${sol.tiny > 0 ? 'text-zinc-200' : 'text-zinc-650'}`}>{sol.tiny}</span>
                          <span className="text-[8px] text-zinc-500 uppercase font-semibold">Кроха</span>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {currentMetals.length === 0 && (
                  <div className="text-center py-10 text-zinc-500 text-xs font-bold uppercase tracking-widest border border-dashed border-zinc-805 rounded bg-[#141416]">
                    Ожидание входных данных компонентов...
                  </div>
                )}
              </div>
            </div>

            {/* Bottom aggregate metrics info */}
            <div className="mt-6 pt-5 border-t border-zinc-800 relative z-10">
              <div className="grid grid-cols-2 gap-4 select-none">
                <div className="bg-[#141416] p-3 rounded border border-zinc-805 text-center">
                  <span className="block text-[#8e9bb8] text-[9px] uppercase font-bold tracking-widest mb-1">Итоговый объем</span>
                  <span className="text-base font-extrabold text-zinc-200 tracking-tight font-mono">
                    {actualTotalCombined} мБ
                  </span>
                </div>
                <div className="bg-[#141416] p-3 rounded border border-zinc-805 text-center">
                  <span className="block text-[#8e9bb8] text-[9px] uppercase font-bold tracking-widest mb-1">
                    {hasPinned ? "Точность пропорции" : "Точность объема"}
                  </span>
                  <span className={`text-base font-extrabold tracking-tight font-mono ${
                    precisionPercent >= 99.9 ? 'text-emerald-400' : 'text-zinc-300'
                  }`}>
                    {precisionPercent.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Reference guidelines sheet */}
          <section className="bg-[#101012]/80 border border-[#212124] rounded-xl p-5 shadow-lg select-none">
            <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-widest mb-3.5 flex items-center gap-2 border-b border-zinc-800 pb-2.5">
              <BookOpen className="text-zinc-400 w-4 h-4" /> Справочник пропорций сплавов TFC
            </h3>
            <div className="text-xs text-zinc-400 space-y-1.5 font-sans">
              <p className="flex justify-between border-b border-zinc-850 pb-2 hover:bg-zinc-900/35 transition-colors px-1 py-1">
                <span className="font-bold uppercase tracking-wider text-[10px]">Бронза (Bronze):</span>
                <strong className="text-zinc-300 text-[11px] font-mono">Медь 70-80% / Олово 20-30%</strong>
              </p>
              <p className="flex justify-between border-b border-zinc-850 pb-2 hover:bg-zinc-900/35 transition-colors px-1 py-1">
                <span className="font-bold uppercase tracking-wider text-[10px]">Латунь (Brass TFC):</span>
                <strong className="text-zinc-300 text-[11px] font-mono">Медь 70-80% / Цинк 20-30%</strong>
              </p>
              <p className="flex justify-between border-b border-zinc-850 pb-2 hover:bg-zinc-900/35 transition-colors px-1 py-1">
                <span className="font-bold uppercase tracking-wider text-[10px]">Красный сплав (Red):</span>
                <strong className="text-zinc-300 text-[11px] font-mono">Редстоун 75-85% / Медь 15-25%</strong>
              </p>
              <p className="flex justify-between border-b border-zinc-850 pb-2 hover:bg-zinc-900/35 transition-colors px-1 py-1">
                <span className="font-bold uppercase tracking-wider text-[10px]">Оловянный сплав (Tin):</span>
                <strong className="text-zinc-300 text-[11px] font-mono">Олово 45-55% / Чугун 45-55%</strong>
              </p>
              <p className="flex justify-between border-b border-zinc-850 pb-2 hover:bg-zinc-900/35 transition-colors px-1 py-1">
                <span className="font-bold uppercase tracking-wider text-[10px]">Инвар (Invar):</span>
                <strong className="text-zinc-300 text-[11px] font-mono">Никель 30-40% / Чугун 60-70%</strong>
              </p>
              <p className="flex justify-between border-b border-zinc-850 pb-2 hover:bg-zinc-900/35 transition-colors px-1 py-1">
                <span className="font-bold uppercase tracking-wider text-[10px]">Черная бронза:</span>
                <strong className="text-zinc-300 text-[11px] font-mono flex-wrap text-right">Медь 50-70% / Серебро 10-25% / Золото 10-25%</strong>
              </p>
              <p className="flex justify-between border-b border-zinc-850 pb-2 hover:bg-zinc-900/35 transition-colors px-1 py-1">
                <span className="font-bold uppercase tracking-wider text-[10px]">Висмутовая бронза:</span>
                <strong className="text-zinc-300 text-[11px] font-mono flex-wrap text-right">Медь 50-65% / Цинк 20-30% / Висмут 10-20%</strong>
              </p>
              <p className="flex justify-between border-b border-zinc-850 pb-2 hover:bg-zinc-900/35 transition-colors px-1 py-1">
                <span className="font-bold uppercase tracking-wider text-[10px]">Потин (Potin):</span>
                <strong className="text-zinc-300 text-[11px] font-mono">Медь 63-69% / Олово 19-25% / Свинец 8-14%</strong>
              </p>
              <p className="flex justify-between pb-1 hover:bg-zinc-900/35 transition-colors px-1 py-1">
                <span className="font-bold uppercase tracking-wider text-[10px]">Кобальтовая латунь:</span>
                <strong className="text-zinc-300 text-[11px] font-mono flex-wrap text-right">Латунь 74-81% / Кобальт 8-14% / Синт.Глина 8-14%</strong>
              </p>
            </div>
            
            <div className="mt-4 pt-3 border-t border-zinc-800 text-[10px] text-zinc-405 leading-relaxed flex items-start gap-1.5 font-sans">
              <Info className="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-0.5" />
              <span>
                Все пресеты соответствуют официальным рецептам KubeJS и Terrafirmacraft. Значения мБ для каждой пыли можно калибровать прямо во вкладках компонентов.
              </span>
            </div>
          </section>

        </div>

      </main>

      {/* Footer sticky bottom */}
      <footer className="border-t border-zinc-800 bg-[#08080a] py-4 text-center text-[10px] text-zinc-400 px-4 flex flex-col sm:flex-row justify-between items-center max-w-7xl mx-auto w-full gap-2 relative z-10">
        <p>© 2026 Калькулятор металлургии GregTech & TFC. Создано для идеального баланса сплавов.</p>
        <p className="text-[10px] text-zinc-450 font-mono font-bold uppercase tracking-wide">Версия 3.3.0 • Локальное сохранение активно</p>
      </footer>

      {/* Android 16 Installation Guide Popup Modal */}
      {showAndroidInstallGuide && (
        <div className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#101012] border border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
            
            {/* Close Button */}
            <button 
              onClick={() => setShowAndroidInstallGuide(false)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header info */}
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800">
                <Smartphone className="w-6 h-6 text-zinc-300" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-zinc-100">Установка на Android 16</h3>
                <p className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">100% Автономная работа (Offline)</p>
              </div>
            </div>

            {/* Instructions list */}
            <div className="space-y-4 text-xs text-zinc-300">
              <p className="leading-relaxed text-zinc-400">
                Вы можете сохранить этот калькулятор как полноценное Android приложение. Оно будет запускаться напрямую из памяти вашего телефона абсолютно <strong className="text-zinc-100 font-bold">без подключения к интернету</strong>.
              </p>

              <div className="bg-[#141416]/90 border border-zinc-800 p-4 rounded-xl space-y-3.5">
                <div className="flex gap-3">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-zinc-800 text-[10px] font-black text-zinc-300 shrink-0">1</span>
                  <p className="leading-normal">
                    Откройте панель меню вашего браузера (в Google Chrome нажмите на <strong className="text-white font-bold">три точки •••</strong> в верхнем правом углу).
                  </p>
                </div>
                <div className="flex gap-3">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-zinc-800 text-[10px] font-black text-zinc-300 shrink-0">2</span>
                  <p className="leading-normal">
                    Найдите и выберите опцию <strong className="text-white font-bold">«Добавить на главный экран»</strong> (или <strong className="text-white font-bold">«Установить приложение»</strong>).
                  </p>
                </div>
                <div className="flex gap-3">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-zinc-800 text-[10px] font-black text-zinc-300 shrink-0">3</span>
                  <p className="leading-normal">
                    Подтвердите установку. На вашем устройстве появится полноценное приложение <strong className="text-zinc-100 font-bold">ForgeCalc</strong>, работающее независимо от браузера и сети!
                  </p>
                </div>
              </div>

              <div className="text-[10px] text-zinc-450 leading-relaxed flex gap-2 border-t border-zinc-800 pt-4 mt-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>Все рецепты сплавов, калибровка долей, ручные коэффициенты и алгоритмы расчета пыли будут мгновенно доступны прямо в шахте без сети.</span>
              </div>
            </div>

            {/* Close trigger action */}
            <div className="mt-6">
              <button
                onClick={() => setShowAndroidInstallGuide(false)}
                className="w-full bg-zinc-100 hover:bg-white text-zinc-950 font-extrabold text-xs py-3 rounded-lg uppercase tracking-wider transition-all duration-150 cursor-pointer text-center"
              >
                Понятно, продолжить
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
