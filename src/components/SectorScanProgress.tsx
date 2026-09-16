import React from 'react';
import { Cpu, Search, CheckCircle2, AlertCircle } from 'lucide-react';

interface SectorScanProgressProps {
  currentStage: string;
  progressPercent: number;
}

export const SectorScanProgress: React.FC<SectorScanProgressProps> = ({
  currentStage,
  progressPercent,
}) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl max-w-xl mx-auto text-center space-y-5">
      <div className="w-12 h-12 mx-auto rounded-full bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 animate-pulse">
        <Cpu className="w-6 h-6" />
      </div>

      <div>
        <h3 className="text-lg font-bold text-slate-100">
          Forensic Sector Analysis in Progress
        </h3>
        <p className="text-xs text-slate-400 mt-1 font-mono">{currentStage}</p>
      </div>

      {/* Progress Bar */}
      <div className="space-y-1.5">
        <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden p-0.5 border border-slate-700/50">
          <div
            className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full rounded-full transition-all duration-300 shadow-sm"
            style={{ width: `${Math.max(5, progressPercent)}%` }}
          />
        </div>
        <div className="flex justify-between text-[11px] font-mono text-slate-400">
          <span>Scanning LBAs</span>
          <span className="font-semibold text-cyan-400">{progressPercent}%</span>
        </div>
      </div>

      {/* Visual Sector Grid representation */}
      <div className="pt-2 border-t border-slate-800/80">
        <div className="text-[11px] text-slate-400 mb-2 font-mono flex items-center justify-between">
          <span>Sector Density Grid (512B blocks)</span>
          <span className="text-slate-500">Heuristic Engine</span>
        </div>
        <div className="grid grid-cols-16 gap-1 p-2 bg-slate-950 rounded-lg border border-slate-800/80">
          {Array.from({ length: 32 }).map((_, idx) => {
            const isScanned = (idx / 32) * 100 <= progressPercent;
            const isSpecial = idx === 0 || idx === 1 || idx === 8 || idx === 31;
            return (
              <div
                key={idx}
                className={`h-2.5 rounded-xs transition-colors duration-200 ${
                  !isScanned
                    ? 'bg-slate-800/50'
                    : isSpecial
                    ? 'bg-cyan-400 animate-pulse'
                    : 'bg-emerald-500/70'
                }`}
                title={`Sector block ~${idx * 64}`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};
