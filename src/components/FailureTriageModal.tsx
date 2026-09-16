import React, { useState } from 'react';
import {
  HelpCircle,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowRight,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react';

interface SymptomOption {
  id: string;
  title: string;
  category: string;
  fixable: 'yes' | 'partial' | 'no';
  shortAnswer: string;
  whatHappened: string;
  howToSolve: string;
}

const COMMON_SYMPTOMS: SymptomOption[] = [
  {
    id: 'raw-fs',
    title: 'Drive shows as "RAW" or asks to format before use',
    category: 'Logical File System',
    fixable: 'yes',
    shortAnswer: '100% Recoverable & Fixable in Software',
    whatHappened:
      'The partition table at LBA 0 or the Volume Boot Record was corrupted during a sudden disconnect, power loss, or malware. Your files are still physically untouched inside the clusters.',
    howToSolve:
      'Do NOT click "Format"! Run the Deep Diagnostic Scan in this tool. It will locate the intact backup boot sector or calculate the partition boundaries, write a fresh MBR, and restore the drive instantly.',
  },
  {
    id: 'write-protected',
    title: '"The disk is write-protected" or Windows unable to format',
    category: 'Flash Controller Lock',
    fixable: 'partial',
    shortAnswer: 'Files: 100% Recoverable. Drive: Cannot be written to again.',
    whatHappened:
      'Flash memory cells reached their maximum write endurance, or the controller ran out of spare blocks. To protect your existing data from permanent loss, the flash controller microchip activated a permanent silicon-level read-only lock.',
    howToSolve:
      'No software or CMD command can remove a hardware silicon lock. However, you CAN use this tool to deep-carve and extract 100% of your photos and documents to your computer before recycling the drive!',
  },
  {
    id: 'wiped-mbr',
    title: 'Unallocated space / Missing partition after crash',
    category: 'Partition Table Damage',
    fixable: 'yes',
    shortAnswer: '100% Fixable in Software',
    whatHappened:
      'Only the first 512 bytes (LBA 0) were cleared. The operating system believes the disk is completely empty, even though all gigabytes of files still exist right after sector 2048.',
    howToSolve:
      'Load the drive into this tool. The heuristic engine will detect the starting sector of your filesystem and rebuild the 512-byte MBR partition table with exact CHS/LBA values.',
  },
  {
    id: 'zero-mb',
    title: 'Drive shows "0 Bytes" or "No Media" in Disk Management',
    category: 'Controller Firmware',
    fixable: 'no',
    shortAnswer: 'Requires Factory Mass-Production (MPTool) or Chip-Off',
    whatHappened:
      'The NAND flash controller lost its microcode firmware. The computer sees the USB bridge chip, but the bridge chip cannot communicate with the flash memory.',
    howToSolve:
      'Standard OS and partition tools cannot reach the sectors. For USB drives (not monolithic SD cards), specialized factory MPTools (Phison, SMI, Alcor) can reflash controller firmware.',
  },
  {
    id: 'clicking-hdd',
    title: 'Hard Drive makes repetitive clicking, beeping, or scratching noises',
    category: 'Mechanical / Physical',
    fixable: 'no',
    shortAnswer: 'Physical Failure - Power Off Immediately',
    whatHappened:
      'Mechanical read/write heads have crashed or the spindle motor is stuck. Continuing to power on the drive will physically grind magnetic media off the platters, permanently destroying data.',
    howToSolve:
      'Power off the drive immediately. Do not attempt software recovery. Data can only be salvaged inside an ISO Class 5 Cleanroom by replacing the head stack assembly with a matching donor drive.',
  },
];

export const FailureTriageModal: React.FC = () => {
  const [selectedSymptom, setSelectedSymptom] = useState<SymptomOption>(COMMON_SYMPTOMS[0]);

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-6">
      <div>
        <div className="flex items-center space-x-2">
          <h3 className="text-lg font-bold text-slate-100 flex items-center space-x-2">
            <HelpCircle className="w-5 h-5 text-cyan-400" />
            <span>Storage Failure Diagnosis &amp; Feasibility Guide</span>
          </h3>
          <span className="text-xs bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 px-2 py-0.5 rounded-full font-medium">
            Forensic Expert Rules
          </span>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Understand why command prompt fails, what is 100% fixable by software, and the exact physical limits of flash memory and magnetic disks.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Symptoms list */}
        <div className="space-y-2">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
            Select Your Drive Symptom:
          </div>
          {COMMON_SYMPTOMS.map((symptom) => {
            const isSelected = selectedSymptom.id === symptom.id;
            return (
              <button
                key={symptom.id}
                onClick={() => setSelectedSymptom(symptom)}
                className={`w-full text-left p-3 rounded-xl border text-xs transition-all flex items-start justify-between gap-2 ${
                  isSelected
                    ? 'bg-cyan-950/30 border-cyan-500/50 text-slate-100 shadow-sm'
                    : 'bg-slate-950/60 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <div>
                  <div className="font-semibold">{symptom.title}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{symptom.category}</div>
                </div>

                <span
                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase shrink-0 ${
                    symptom.fixable === 'yes'
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      : symptom.fixable === 'partial'
                      ? 'bg-amber-950 text-amber-300 border border-amber-800'
                      : 'bg-rose-950 text-rose-300 border border-rose-800'
                  }`}
                >
                  {symptom.fixable === 'yes'
                    ? 'Fixable'
                    : symptom.fixable === 'partial'
                    ? 'Extract Only'
                    : 'Hardware'}
                </span>
              </button>
            );
          })}
        </div>

        {/* Right: Detailed Analysis & Explanation */}
        <div className="lg:col-span-2 bg-slate-950/90 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between space-y-6">
          <div className="space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-cyan-400">
                  {selectedSymptom.category}
                </span>
                <h4 className="text-base font-bold text-slate-100 mt-0.5">
                  {selectedSymptom.title}
                </h4>
              </div>

              <div
                className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center space-x-1.5 ${
                  selectedSymptom.fixable === 'yes'
                    ? 'bg-emerald-950/60 border-emerald-600/50 text-emerald-300'
                    : selectedSymptom.fixable === 'partial'
                    ? 'bg-amber-950/60 border-amber-600/50 text-amber-300'
                    : 'bg-rose-950/60 border-rose-600/50 text-rose-300'
                }`}
              >
                {selectedSymptom.fixable === 'yes' ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : selectedSymptom.fixable === 'partial' ? (
                  <AlertTriangle className="w-3.5 h-3.5" />
                ) : (
                  <XCircle className="w-3.5 h-3.5" />
                )}
                <span>{selectedSymptom.shortAnswer}</span>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
                <div className="font-bold text-slate-300 mb-1">What Actually Happened:</div>
                <p className="text-slate-400 leading-relaxed">{selectedSymptom.whatHappened}</p>
              </div>

              <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
                <div className="font-bold text-cyan-300 mb-1">How This Tool Solves It:</div>
                <p className="text-slate-400 leading-relaxed">{selectedSymptom.howToSolve}</p>
              </div>
            </div>
          </div>

          <div className="p-3 bg-cyan-950/20 border border-cyan-500/20 rounded-xl text-xs text-cyan-300 flex items-center justify-between">
            <span>Ready to test your drive image with our forensic engine?</span>
            <span className="font-semibold flex items-center space-x-1 text-cyan-400">
              <span>Go to Recovery Studio</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
