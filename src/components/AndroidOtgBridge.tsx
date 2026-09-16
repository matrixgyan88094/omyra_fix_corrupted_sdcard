import React, { useState, useRef } from 'react';
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
  HelpCircle,
  Zap,
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
  const dirHandleRef = useRef<any>(null);
  const [isLoadingDir, setIsLoadingDir] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showExplanation, setShowExplanation] = useState<boolean>(false);

  // Hidden file inputs for direct Android storage triggers
  const storageInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const otgCommands = generateAndroidOtgCommands(0);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  /**
   * Universal OTG folder picker with multi-tier fallback:
   * 1. Direct File System Access API (with spec-compliant startIn)
   * 2. Native HTML5 Android DocumentsUI folder picker
   */
  const handlePickOtgFolder = async () => {
    setIsLoadingDir(true);
    setErrorMessage(null);

    // Try File System Access API first
    if (typeof (window as any).showDirectoryPicker === 'function') {
      try {
        const result = await pickOtgDirectory();
        dirHandleRef.current = result.dirHandle;
        setSelectedDirectory(result.name);
        setDirEntries(result.entries);
        setIsLoadingDir(false);
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') {
          setIsLoadingDir(false);
          return;
        }
        console.warn('showDirectoryPicker failed or restricted, falling back to Android Document Drawer:', err);
      }
    }

    // Fallback: trigger HTML5 Android Document Drawer
    setIsLoadingDir(false);
    if (folderInputRef.current) {
      folderInputRef.current.click();
    }
  };

  /**
   * Direct load of a file entry from the selected directory
   */
  const handleLoadEntryFile = async (entryName: string) => {
    if (!dirHandleRef.current) return;
    try {
      setErrorMessage(null);
      const fileHandle = await dirHandleRef.current.getFileHandle(entryName);
      const file = await fileHandle.getFile();
      const arrayBuffer = await file.arrayBuffer();
      onLoadBuffer(new Uint8Array(arrayBuffer), file.name);
    } catch (err: any) {
      setErrorMessage(`Failed to read file ${entryName}: ${err.message}`);
    }
  };

  /**
   * Direct volume/file picker with multi-tier fallback
   */
  const handlePickDirectVolume = async () => {
    setErrorMessage(null);
    if (typeof (window as any).showOpenFilePicker === 'function') {
      try {
        const { file, buffer } = await pickRawVolumeFile();
        onLoadBuffer(buffer, file.name || 'OTG Volume Dump');
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        console.warn('showOpenFilePicker failed, falling back to storage input:', err);
      }
    }

    // Fallback: trigger system file input
    if (storageInputRef.current) {
      storageInputRef.current.click();
    }
  };

  const handleFallbackFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      const file = files[0];
      const arrayBuffer = await file.arrayBuffer();
      onLoadBuffer(new Uint8Array(arrayBuffer), file.name);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error reading selected file');
    }
  };

  const handleFallbackFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setSelectedDirectory('Selected Android OTG Directory');
    const entries: { name: string; kind: string; size?: number }[] = [];
    for (let i = 0; i < Math.min(files.length, 50); i++) {
      entries.push({
        name: files[i].webkitRelativePath || files[i].name,
        kind: 'file',
        size: files[i].size,
      });
    }
    setDirEntries(entries);
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-6 shadow-xl">
      {/* Hidden Fallback File Inputs for Android System Selectors */}
      <input
        type="file"
        ref={storageInputRef}
        onChange={handleFallbackFileSelect}
        className="hidden"
        accept="*/*,.img,.raw,.bin,.dd,.iso,.dmg,.dat"
      />
      <input
        type="file"
        ref={folderInputRef}
        // @ts-ignore
        webkitdirectory="true"
        directory="true"
        onChange={handleFallbackFolderSelect}
        className="hidden"
      />

      {/* Header */}
      <div className="border-b border-slate-800 pb-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-100 flex items-center space-x-2">
                <span>Android Smartphone OTG Direct Storage Access</span>
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800">
                  Native SAF &amp; Block Direct
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Bypasses Google Chrome&apos;s WebUSB Mass-Storage blocklist using Android&apos;s native storage drawer and direct Linux block device bridging.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowExplanation(!showExplanation)}
            className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center space-x-1"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Why APK vs Browser?</span>
          </button>
        </div>

        {showExplanation && (
          <div className="mt-4 p-4 rounded-xl bg-slate-950 border border-cyan-500/30 text-xs text-slate-300 space-y-2">
            <div className="font-bold text-cyan-300 flex items-center space-x-1.5">
              <Info className="w-4 h-4 text-cyan-400" />
              <span>Technical Fact: Android Kernel vs Chrome WebUSB</span>
            </div>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              <b>Play Store APKs</b> use Java <code className="text-cyan-300">android.hardware.usb.UsbManager</code> with native OS permissions to read <code className="text-cyan-300">/dev/bus/usb/</code> directly.
              In contrast, <b>Google Chrome</b> has a built-in security blocklist (<code className="text-cyan-300">usb_blocklist.cc</code>) that hides USB Class 0x08 (Mass Storage) devices so websites cannot bypass OS permissions.
              The two buttons below let you access your OTG drive through Android&apos;s official Storage Access Framework (DocumentsUI) or dump raw sectors in 5 seconds.
            </p>
          </div>
        )}
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
              <span className="font-bold text-sm">Method 1: Android System Storage Drawer (SAF)</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Opens Android&apos;s system storage selector. In the left slide-out menu (tap the ☰ icon), tap your <b>OTG USB Drive</b> to grant Recovery Studio direct access.
            </p>

            {selectedDirectory && (
              <div className="p-3.5 bg-slate-900 rounded-xl border border-slate-800 text-xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-cyan-300 flex items-center space-x-1.5">
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>Mounted: {selectedDirectory}</span>
                  </div>
                  <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
                    {dirEntries.length} items
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Android mounted your pendrive as a root folder. If you see files below, tap &quot;Load &amp; Inspect&quot; to scan them in Recovery Studio:
                </p>

                {dirEntries.length > 0 && (
                  <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                    {dirEntries.slice(0, 15).map((entry, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800 text-[11px]"
                      >
                        <div className="flex items-center space-x-2 truncate max-w-[200px] sm:max-w-xs">
                          {entry.kind === 'directory' ? (
                            <FolderTree className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          ) : (
                            <FileCode className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                          )}
                          <span className="truncate text-slate-200">{entry.name}</span>
                        </div>

                        {entry.kind === 'file' && dirHandleRef.current && (
                          <button
                            type="button"
                            onClick={() => handleLoadEntryFile(entry.name)}
                            className="px-2 py-1 bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-300 rounded text-[10px] font-semibold transition-colors shrink-0"
                          >
                            Load &amp; Inspect
                          </button>
                        )}
                      </div>
                    ))}
                    {dirEntries.length > 15 && (
                      <div className="text-[10px] text-slate-500 text-center py-1">
                        + {dirEntries.length - 15} more items in pendrive root
                      </div>
                    )}
                  </div>
                )}
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
