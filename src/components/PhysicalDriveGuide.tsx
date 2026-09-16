import React, { useState } from 'react';
import { Terminal, Copy, Check, ShieldAlert, Cpu, HardDrive, Laptop, Usb } from 'lucide-react';
import { DiskAnalysisResult, PhysicalUsbDeviceInfo } from '../types';
import {
  buildRepairedMbrSector,
  generateRescueScripts,
} from '../services/recoveryEngine';

interface PhysicalDriveGuideProps {
  analysis?: DiskAnalysisResult | null;
  physicalDevice?: PhysicalUsbDeviceInfo | null;
}

export const PhysicalDriveGuide: React.FC<PhysicalDriveGuideProps> = ({
  analysis,
  physicalDevice,
}) => {
  const [activeOs, setActiveOs] = useState<'powershell' | 'bash' | 'python'>('powershell');
  const [copied, setCopied] = useState<string | null>(null);

  // Generate scripts if we have an analysis and discovered filesystems
  let scripts = {
    powershell: `# No disk loaded yet. Load a disk image or sample to generate custom scripts.`,
    bash: `# No disk loaded yet. Load a disk image or sample to generate custom scripts.`,
    python: `# No disk loaded yet. Load a disk image or sample to generate custom scripts.`,
  };

  if (analysis && analysis.discoveredFilesystems.length > 0) {
    const primaryFs = analysis.discoveredFilesystems[0];
    const newMbr = buildRepairedMbrSector(primaryFs, analysis.totalSectors);
    scripts = generateRescueScripts(newMbr, 0);
  }

  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 3000);
  };

  return (
    <div className="space-y-6">
      {/* If a physical USB/OTG device is connected */}
      {physicalDevice && (
        <div className="bg-slate-900/90 border border-cyan-500/30 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg shadow-cyan-950/30">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Usb className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-slate-200">
                  Target Physical Hardware: {physicalDevice.productName}
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                  {physicalDevice.vendorIdHex}:{physicalDevice.productIdHex}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Manufacturer: {physicalDevice.manufacturerName} • Serial: {physicalDevice.serialNumber}
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-950/60 text-emerald-300 border border-emerald-800/60 shrink-0">
            Physical Device Paired
          </span>
        </div>
      )}

      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6">

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-100 flex items-center space-x-2">
              <Terminal className="w-5 h-5 text-cyan-400" />
              <span>Physical Drive Rescue &amp; Direct Patch Scripts</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Exact executable scripts generated to restore partition tables directly onto physical SD cards, USBs, and hard drives.
            </p>
          </div>

          <div className="flex items-center space-x-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveOs('powershell')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeOs === 'powershell'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Windows (PowerShell)
            </button>
            <button
              onClick={() => setActiveOs('bash')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeOs === 'bash'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Linux / macOS (Bash)
            </button>
            <button
              onClick={() => setActiveOs('python')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeOs === 'python'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Python (Cross-Platform)
            </button>
          </div>
        </div>

        {/* Safety Warning */}
        <div className="mt-5 p-4 rounded-xl bg-amber-950/30 border border-amber-800/40 text-xs text-amber-200 flex items-start space-x-3">
          <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-bold">Critical Safety Requirement:</div>
            <p className="text-amber-300/90 leading-relaxed">
              Writing directly to raw physical disk sectors requires <b>Administrator privileges (Windows)</b> or <b>root / sudo (Linux/macOS)</b>.
              Always verify your target disk number with <code className="bg-amber-900/60 px-1 py-0.5 rounded font-mono">Get-Disk</code> or <code className="bg-amber-900/60 px-1 py-0.5 rounded font-mono">lsblk</code> to prevent accidentally modifying the wrong drive.
            </p>
          </div>
        </div>

        {/* Script Display */}
        <div className="mt-5 relative">
          <div className="flex items-center justify-between px-4 py-2 bg-slate-950 border-t border-x border-slate-800 rounded-t-xl text-xs text-slate-400 font-mono">
            <span>
              {activeOs === 'powershell'
                ? 'restore_partition.ps1'
                : activeOs === 'bash'
                ? 'restore_partition.sh'
                : 'restore_partition.py'}
            </span>

            <button
              type="button"
              id="btn-copy-script"
              onClick={() => handleCopy(scripts[activeOs], activeOs)}
              className="flex items-center space-x-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs transition-colors"
            >
              {copied === activeOs ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-semibold">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Script</span>
                </>
              )}
            </button>
          </div>

          <pre className="p-4 bg-slate-950 border border-slate-800 rounded-b-xl overflow-x-auto text-xs font-mono text-cyan-300 leading-relaxed max-h-[380px]">
            {scripts[activeOs]}
          </pre>
        </div>
      </div>

      {/* 3-Step Physical Drive Imaging Guide */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
        <h4 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
          <HardDrive className="w-4 h-4 text-cyan-400" />
          <span>How to Safely Image a Physical Storage Device</span>
        </h4>
        <p className="text-xs text-slate-400">
          When dealing with dying or physically unstable SD cards and pen drives, never perform repairs on the physical media directly without first creating a raw sector copy.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-sans text-xs">
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
            <div className="font-bold text-slate-200 flex items-center space-x-2">
              <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center text-xs">1</span>
              <span>Windows Method</span>
            </div>
            <p className="text-slate-400">
              Download portable <b>Win32DiskImager</b> or <b>FTK Imager Lite</b>.
            </p>
            <div className="font-mono text-[11px] bg-slate-900 p-2 rounded text-slate-300">
              1. Insert SD/USB<br />
              2. Select Drive Letter<br />
              3. Set filename: mydisk.raw<br />
              4. Click &apos;Read&apos;
            </div>
          </div>

          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
            <div className="font-bold text-slate-200 flex items-center space-x-2">
              <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center text-xs">2</span>
              <span>macOS Method</span>
            </div>
            <p className="text-slate-400">
              Use terminal raw disk device (`rdisk`) for 10x faster reading:
            </p>
            <div className="font-mono text-[11px] bg-slate-900 p-2 rounded text-cyan-300 overflow-x-auto">
              diskutil list<br />
              sudo dd if=/dev/rdisk2 of=backup.raw bs=4m status=progress
            </div>
          </div>

          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
            <div className="font-bold text-slate-200 flex items-center space-x-2">
              <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center text-xs">3</span>
              <span>Linux (Dying Drive)</span>
            </div>
            <p className="text-slate-400">
              Use `ddrescue` to safely scrape healthy sectors before bad blocks:
            </p>
            <div className="font-mono text-[11px] bg-slate-900 p-2 rounded text-cyan-300 overflow-x-auto">
              sudo ddrescue -d /dev/sdb drive.raw drive.map
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
