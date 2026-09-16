import React, { useState } from 'react';
import {
  Smartphone,
  FolderTree,
  Terminal,
  Copy,
  Check,
  HardDrive,
  ShieldCheck,
  ArrowRight,
  FileCode,
  FolderOpen,
  Info,
  Layers,
} from 'lucide-react';
import {
  pickOtgDirectory,
  pickRawVolumeFile,
  generateAndroidOtgCommands,
  isDirectoryPickerSupported,
} from '../services/otgStorageBridge';

interface AndroidOtgBridgeProps {
  onLoadBuffer: (buffer: Uint8Array, name: string) => void;
  onOpenScripts?: () => void;
}

export const AndroidOtgBridge: React.FC<AndroidOtgBridgeProps> = ({
  onLoadBuffer,
  onOpenScripts,
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [selectedDirectory, setSelectedDirectory] = useState<string | null>(null);
  const [dirEntries, setDirEntries] = useState<{ name: string; kind: string; size?: number }[]>([]);
  const [isLoadingDir, setIsLoadingDir] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const otgCommands = generateAndroidOtgCommands(0);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const handlePickOtgFolder = async () => {
    setIsLoadingDir(true);
    setErrorMessage(null);
    try {
      const result = await pickOtgDirectory();
      setSelectedDirectory(result.name);
      setDirEntries(result.entries);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setErrorMessage(err.message || 'Could not access OTG storage drawer.');
      }
    } finally {
      setIsLoadingDir(false);
    }
  };

  const handlePickDirectVolume = async () => {
    setErrorMessage(null);
    try {
      const { file, buffer } = await pickRawVolumeFile();
      onLoadBuffer(buffer, file.name || 'OTG Volume Dump');
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setErrorMessage(err.message || 'Could not read OTG volume file.');
      }
    }
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-6 shadow-xl">
      {/* Header */}
      <div className="border-b border-slate-800 pb-5">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-100 flex items-center space-x-2">
              <span>Android Smartphone OTG Direct Storage Access</span>
              <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800">
                SAF &amp; Block Device
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Why third-party Play Store APKs see your drive: Android restricts Chrome’s WebUSB Mass-Storage, but grants direct access through Android SAF (Storage Access Framework) and Termux raw block nodes.
            </p>
          </div>
        </div>
      </div>

      {errorMessage && (
        <div className="p-3 bg-rose-950/30 border border-rose-800/50 rounded-xl text-xs text-rose-300">
          {errorMessage}
        </div>
      )}

      {/* Two Direct Android Methods */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Method 1: Android SAF System Drawer */}
        <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center space-x-2 text-slate-200">
              <FolderTree className="w-4 h-4 text-cyan-400" />
              <span className="font-bold text-sm">Method 1: Android SAF Storage Drawer</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Opens Android&apos;s system storage selector. In the left slide-out menu, tap your <b>OTG USB Drive</b> or <b>SD Card</b> to grant Recovery Studio direct volume access.
            </p>

            {selectedDirectory && (
              <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 text-xs">
                <div className="font-semibold text-cyan-300 flex items-center space-x-1.5">
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>Mounted: {selectedDirectory}</span>
                </div>
                <div className="text-slate-400 mt-1">
                  Found {dirEntries.length} root items accessible on OTG media.
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2 pt-2">
            <button
              type="button"
              id="btn-pick-otg-saf"
              onClick={handlePickOtgFolder}
              disabled={isLoadingDir}
              className="w-full py-2.5 px-4 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-md transition-colors flex items-center justify-center space-x-2"
            >
              <FolderOpen className="w-4 h-4" />
              <span>{isLoadingDir ? 'Opening Android Drawer...' : 'Open Android OTG Storage Drawer'}</span>
            </button>

            <button
              type="button"
              id="btn-pick-otg-raw-vol"
              onClick={handlePickDirectVolume}
              className="w-full py-2 px-4 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 font-semibold text-xs rounded-xl transition-colors flex items-center justify-center space-x-2"
            >
              <FileCode className="w-4 h-4 text-cyan-400" />
              <span>Select Raw Dump / Volume Image (.img, .raw, .dd)</span>
            </button>
          </div>
        </div>

        {/* Method 2: Termux / Direct Block Device Bridge */}
        <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center space-x-2 text-slate-200">
              <Terminal className="w-4 h-4 text-cyan-400" />
              <span className="font-bold text-sm">Method 2: 1-Click OTG Termux Sector Dump</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              If your corrupted pendrive has broken partition tables and Android pops up &quot;Issue with USB Drive&quot;, dump the raw Sector 0 directly using this terminal command:
            </p>

            <div className="relative">
              <div className="p-3 bg-slate-900 rounded-lg border border-slate-800/80 font-mono text-[11px] text-cyan-300 overflow-x-auto max-h-[110px] leading-relaxed">
                {otgCommands.dumpSector0}
              </div>
              <button
                type="button"
                onClick={() => handleCopy(otgCommands.dumpSector0, 'dump')}
                className="absolute top-2 right-2 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-sans flex items-center space-x-1"
              >
                {copiedKey === 'dump' ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span className="text-emerald-400">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/60 flex items-center justify-between">
            <span>Dumps 512 bytes instantly to /sdcard/Download</span>
            <span className="text-cyan-400 font-semibold">100% Non-destructive</span>
          </div>
        </div>
      </div>

      {/* Direct MBR Restoration via OTG */}
      <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-xs font-bold text-slate-200">
            <HardDrive className="w-4 h-4 text-emerald-400" />
            <span>Restoring Fixed Partition Table to Physical OTG Drive on Smartphone:</span>
          </div>
          <button
            type="button"
            onClick={() => handleCopy(otgCommands.directMbrRestore, 'restore')}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs flex items-center space-x-1 font-mono"
          >
            {copiedKey === 'restore' ? (
              <span className="text-emerald-400 font-bold">Copied!</span>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span>Copy Restore Command</span>
              </>
            )}
          </button>
        </div>

        <pre className="p-3 bg-slate-900 rounded-lg border border-slate-800 font-mono text-[11px] text-emerald-300 overflow-x-auto">
          {otgCommands.directMbrRestore}
        </pre>
      </div>
    </div>
  );
};
