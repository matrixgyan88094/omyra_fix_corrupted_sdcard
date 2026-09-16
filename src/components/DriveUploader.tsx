import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  FileCode2,
  Sparkles,
  AlertTriangle,
  FileQuestion,
  HelpCircle,
  FolderOpen,
} from 'lucide-react';
import { generateTestCorruptedDiskImage } from '../services/recoveryEngine';
import { PhysicalUsbConnector } from './PhysicalUsbConnector';
import { PhysicalUsbDeviceInfo } from '../types';

interface DriveUploaderProps {
  onLoadDisk: (buffer: Uint8Array, filename: string, isSample?: boolean) => void;
  isLoading: boolean;
  onOpenScripts?: () => void;
}

export const DriveUploader: React.FC<DriveUploaderProps> = ({
  onLoadDisk,
  isLoading,
  onOpenScripts,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [showDirectHelp, setShowDirectHelp] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (!file) return;

    if (file.size > 2000 * 1024 * 1024) {
      console.info(`File size: ${Math.round(file.size / (1024 * 1024))} MB`);
    }

    setLoadingMsg(`Reading ${file.name} into forensic buffer...`);
    const reader = new FileReader();
    reader.onload = (e) => {
      const arrayBuffer = e.target?.result as ArrayBuffer;
      if (arrayBuffer) {
        const uint8 = new Uint8Array(arrayBuffer);
        onLoadDisk(uint8, file.name, false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleLoadSample = () => {
    setLoadingMsg('Generating authentic 2 MB corrupted raw disk image...');
    setTimeout(() => {
      const sample = generateTestCorruptedDiskImage();
      onLoadDisk(sample.buffer, sample.filename, true);
    }, 100);
  };

  const handleDirectSectorBuffer = (buffer: Uint8Array, deviceName: string) => {
    onLoadDisk(buffer, deviceName, false);
  };

  return (
    <div className="space-y-8">
      {/* Hero Introduction */}
      <div className="text-center max-w-3xl mx-auto pt-4 pb-2">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-semibold uppercase tracking-wider mb-4">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Non-Destructive • Sector-Level Recovery Engine</span>
        </div>
        <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-100 tracking-tight leading-tight">
          Fix Corrupted Partition Tables &amp; Recover Files
        </h2>
        <p className="mt-3 text-sm sm:text-base text-slate-400 leading-relaxed">
          Specialized forensic recovery engine for SD cards, USB flash drives, OTG storage, and hard drives suffering from
          <span className="text-slate-200 font-medium"> wiped MBR/GPT partition tables</span>,
          <span className="text-slate-200 font-medium"> damaged boot sectors (VBR)</span>, or
          <span className="text-slate-200 font-medium"> RAW format errors</span>.
        </p>
      </div>

      {/* METHOD 1: Direct Physical USB & OTG Hardware Connection */}
      <PhysicalUsbConnector
        onLoadSectorBuffer={handleDirectSectorBuffer}
        onOpenScripts={onOpenScripts}
      />

      {/* Visual Separator */}
      <div className="relative flex py-2 items-center">
        <div className="flex-grow border-t border-slate-800"></div>
        <span className="flex-shrink mx-4 text-xs font-bold uppercase tracking-widest text-slate-500">
          Or Load Disk Image / Raw Volume Dump
        </span>
        <div className="flex-grow border-t border-slate-800"></div>
      </div>

      {/* METHOD 2: Main Upload Dropzone */}
      <div
        id="disk-dropzone"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center cursor-pointer transition-all duration-200 group ${
          isDragging
            ? 'border-cyan-400 bg-cyan-950/20 scale-[1.01]'
            : 'border-slate-700/80 bg-slate-900/50 hover:border-cyan-500/50 hover:bg-slate-900/80'
        }`}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={(e) => e.target.files && handleFile(e.target.files[0])}
          className="hidden"
          accept=".img,.raw,.bin,.dd,.iso,.dmg,.dat,image/*,*/*"
        />

        <div className="w-16 h-16 mx-auto rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 group-hover:scale-110 transition-transform mb-4 shadow-lg shadow-cyan-950/40">
          <UploadCloud className="w-8 h-8" />
        </div>

        <h3 className="text-lg font-bold text-slate-100">
          Select or Drop Corrupted Disk Image
        </h3>
        <p className="text-sm text-slate-400 mt-1 max-w-md mx-auto">
          Drop any raw disk dump, image, or partition dump (
          <code className="text-cyan-300 font-mono text-xs">.img</code>,{' '}
          <code className="text-cyan-300 font-mono text-xs">.raw</code>,{' '}
          <code className="text-cyan-300 font-mono text-xs">.bin</code>,{' '}
          <code className="text-cyan-300 font-mono text-xs">.dd</code>,{' '}
          <code className="text-cyan-300 font-mono text-xs">.iso</code>)
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            id="btn-choose-file"
            className="px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold text-xs sm:text-sm rounded-xl shadow-lg shadow-cyan-900/30 transition-all flex items-center space-x-2"
          >
            <FolderOpen className="w-4 h-4" />
            <span>Browse Disk File</span>
          </button>
        </div>

        {loadingMsg && (
          <div className="mt-4 text-xs text-cyan-400 animate-pulse font-medium">
            {loadingMsg}
          </div>
        )}
      </div>


      {/* Quick Option: Generate Real Corrupted Test Disk */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-start space-x-3 text-left">
          <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 shrink-0">
            <FileCode2 className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-200">
              Don&apos;t have a disk image file ready right now?
            </h4>
            <p className="text-xs text-slate-400 mt-0.5">
              Load an authentic 2 MB synthetic disk with real photos & docs, real NTFS filesystem, and an intentionally wiped MBR to test the recovery engine end-to-end.
            </p>
          </div>
        </div>

        <button
          type="button"
          id="btn-load-sample"
          onClick={handleLoadSample}
          disabled={isLoading}
          className="w-full sm:w-auto shrink-0 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-purple-300 hover:text-purple-200 border border-purple-500/30 font-semibold text-xs rounded-xl transition-colors flex items-center justify-center space-x-2"
        >
          <Sparkles className="w-4 h-4 text-purple-400" />
          <span>Load Test Corrupted Drive (2 MB)</span>
        </button>
      </div>

      {/* Helper accordion for physical SD card / USB pen drive creation */}
      <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-4">
        <button
          type="button"
          id="btn-toggle-help"
          onClick={() => setShowDirectHelp(!showDirectHelp)}
          className="w-full flex items-center justify-between text-left text-xs font-semibold text-slate-300 hover:text-cyan-400 transition-colors"
        >
          <span className="flex items-center space-x-2">
            <HelpCircle className="w-4 h-4 text-cyan-400" />
            <span>How to create a raw 1:1 image from a physical SD Card or USB drive?</span>
          </span>
          <span className="text-slate-500">{showDirectHelp ? 'Hide instructions' : 'Show 1-minute instructions'}</span>
        </button>

        {showDirectHelp && (
          <div className="mt-4 pt-4 border-t border-slate-800 text-xs text-slate-400 space-y-3">
            <p>
              To safely recover an unreadable or RAW physical device without risking further damage, create a 1:1 raw byte clone:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 font-mono">
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <div className="font-bold text-cyan-400 mb-1">Windows</div>
                <p className="text-[11px] text-slate-300 font-sans mb-1">
                  Use free portable <b>Win32DiskImager</b>:
                </p>
                <code className="text-[10px] text-slate-400 block bg-slate-900 p-1.5 rounded">
                  Select Device [E:] → File: dump.raw → Click &quot;Read&quot;
                </code>
              </div>

              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <div className="font-bold text-cyan-400 mb-1">macOS Terminal</div>
                <p className="text-[11px] text-slate-300 font-sans mb-1">
                  Run diskutil list to find disk number:
                </p>
                <code className="text-[10px] text-slate-400 block bg-slate-900 p-1.5 rounded">
                  sudo dd if=/dev/rdisk2 of=drive.raw bs=4m status=progress
                </code>
              </div>

              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <div className="font-bold text-cyan-400 mb-1">Linux Terminal</div>
                <p className="text-[11px] text-slate-300 font-sans mb-1">
                  Use dd or ddrescue for dying cards:
                </p>
                <code className="text-[10px] text-slate-400 block bg-slate-900 p-1.5 rounded">
                  sudo dd if=/dev/sdb of=drive.raw bs=4M status=progress
                </code>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
