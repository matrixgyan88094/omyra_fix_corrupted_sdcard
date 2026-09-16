import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Wrench,
  Download,
  Terminal,
  Layers,
  ArrowRight,
  ShieldAlert,
  FileCheck,
  Check,
} from 'lucide-react';
import {
  DiskAnalysisResult,
  PartitionTableEntry,
  FilesystemMarker,
} from '../types';
import {
  formatBytes,
  buildRepairedMbrSector,
  applyRepairedMbrToDisk,
  bytesToHex,
} from '../services/recoveryEngine';

interface PartitionDiagnosisProps {
  analysis: DiskAnalysisResult;
  rawBuffer: Uint8Array;
  onOpenScripts: () => void;
  onOpenHex: (targetLba: number) => void;
}

export const PartitionDiagnosis: React.FC<PartitionDiagnosisProps> = ({
  analysis,
  rawBuffer,
  onOpenScripts,
  onOpenHex,
}) => {
  const [repairedBuffer, setRepairedBuffer] = useState<Uint8Array | null>(null);
  const [hasRepaired, setHasRepaired] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  const { mbr, gpt, discoveredFilesystems, diagnostics } = analysis;

  const handlePerformRepair = () => {
    if (discoveredFilesystems.length === 0) return;

    // Use primary discovered filesystem
    const primaryFs = discoveredFilesystems[0];
    const newMbrSector = buildRepairedMbrSector(primaryFs, analysis.totalSectors);
    const fixedDisk = applyRepairedMbrToDisk(rawBuffer, newMbrSector);

    setRepairedBuffer(fixedDisk);
    setHasRepaired(true);

    // Auto trigger download of repaired disk image
    const blob = new Blob([fixedDisk], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `REPAIRED_${analysis.diskName.replace(/\.[^/.]+$/, '')}.img`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 6000);
  };

  return (
    <div className="space-y-6">
      {/* Top Diagnostic Banner */}
      <div
        className={`rounded-2xl p-6 border transition-all ${
          diagnostics.status === 'critical'
            ? 'bg-rose-950/30 border-rose-800/60 shadow-lg shadow-rose-950/20'
            : diagnostics.status === 'warning'
            ? 'bg-amber-950/30 border-amber-800/60'
            : 'bg-emerald-950/30 border-emerald-800/60'
        }`}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start space-x-3.5">
            <div
              className={`p-3 rounded-xl shrink-0 mt-0.5 ${
                diagnostics.status === 'critical'
                  ? 'bg-rose-500/20 text-rose-400'
                  : diagnostics.status === 'warning'
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'bg-emerald-500/20 text-emerald-400'
              }`}
            >
              {diagnostics.status === 'critical' ? (
                <ShieldAlert className="w-6 h-6" />
              ) : diagnostics.status === 'warning' ? (
                <AlertTriangle className="w-6 h-6" />
              ) : (
                <CheckCircle2 className="w-6 h-6" />
              )}
            </div>

            <div>
              <div className="flex items-center space-x-2">
                <span
                  className={`text-[11px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full ${
                    diagnostics.status === 'critical'
                      ? 'bg-rose-500/20 text-rose-300'
                      : 'bg-emerald-500/20 text-emerald-300'
                  }`}
                >
                  {diagnostics.status.toUpperCase()} CORRUPTION
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  {formatBytes(analysis.totalBytes)} • {analysis.totalSectors.toLocaleString()} Sectors
                </span>
              </div>

              <h3 className="text-xl font-bold text-slate-100 mt-1">
                {diagnostics.headline}
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 mt-1.5 leading-relaxed max-w-2xl">
                {diagnostics.description}
              </p>
            </div>
          </div>

          {/* Direct Fix CTA */}
          {diagnostics.canAutoRepairPartitionTable && (
            <div className="w-full sm:w-auto shrink-0 flex flex-col gap-2">
              <button
                type="button"
                id="btn-rebuild-partition"
                onClick={handlePerformRepair}
                className="w-full sm:w-auto px-5 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs sm:text-sm rounded-xl shadow-lg shadow-emerald-950/50 flex items-center justify-center space-x-2 transition-transform hover:scale-[1.02]"
              >
                <Wrench className="w-4 h-4" />
                <span>Fix & Download Repaired Disk</span>
              </button>

              <button
                type="button"
                id="btn-goto-scripts"
                onClick={onOpenScripts}
                className="w-full sm:w-auto px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold rounded-xl flex items-center justify-center space-x-1.5 transition-colors"
              >
                <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                <span>Physical Drive Restore Script</span>
              </button>
            </div>
          )}
        </div>

        {downloadSuccess && (
          <div className="mt-4 p-3 bg-emerald-900/50 border border-emerald-500/50 rounded-xl text-xs text-emerald-200 flex items-center space-x-2">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              <b>Repaired Disk Image Created!</b> The corrected 512-byte MBR partition table has been written.
              Your browser downloaded <code className="font-mono bg-emerald-950 px-1 py-0.5 rounded">REPAIRED_{analysis.diskName.replace(/\.[^/.]+$/, '')}.img</code>.
            </span>
          </div>
        )}
      </div>

      {/* Identified Issues & Recommended Action */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span>Identified Sector Anomalies ({diagnostics.identifiedIssues.length})</span>
          </h4>
          <ul className="space-y-2">
            {diagnostics.identifiedIssues.map((issue, idx) => (
              <li
                key={idx}
                className="text-xs text-slate-300 flex items-start space-x-2 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/60"
              >
                <span className="text-rose-400 font-bold shrink-0">•</span>
                <span>{issue}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center space-x-2">
              <FileCheck className="w-4 h-4 text-cyan-400" />
              <span>Recommended Recovery Path</span>
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-3 rounded-lg border border-slate-800/60">
              {diagnostics.recommendedAction}
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>Inspection Jump:</span>
            <button
              onClick={() => onOpenHex(0)}
              className="text-cyan-400 hover:text-cyan-300 font-medium hover:underline flex items-center space-x-1"
            >
              <span>Inspect LBA 0 in Hex Viewer</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Discovered Filesystems & Boot Sectors */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              <span>Discovered Filesystems &amp; Boot Sectors ({discoveredFilesystems.length})</span>
            </h4>
            <p className="text-xs text-slate-400 mt-0.5">
              These are authentic filesystem headers located deep inside the drive that standard OS formatting tools miss.
            </p>
          </div>
        </div>

        {discoveredFilesystems.length === 0 ? (
          <div className="text-center py-6 text-xs text-slate-500 bg-slate-950/50 rounded-xl border border-slate-800/50">
            No recognizable filesystem boot records found. File carving will be required to extract individual raw documents and photos.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                  <th className="pb-2">Filesystem</th>
                  <th className="pb-2">Location (LBA)</th>
                  <th className="pb-2">Byte Offset</th>
                  <th className="pb-2">Cluster Size</th>
                  <th className="pb-2">Sector Type</th>
                  <th className="pb-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {discoveredFilesystems.map((fs, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/30">
                    <td className="py-3 font-bold text-cyan-300 font-sans flex items-center space-x-2">
                      <span className="w-2 h-2 rounded-full bg-cyan-400" />
                      <span>{fs.type}</span>
                    </td>
                    <td className="py-3 text-slate-300">LBA {fs.lba}</td>
                    <td className="py-3 text-slate-400">0x{fs.byteOffset.toString(16).toUpperCase()}</td>
                    <td className="py-3 text-slate-300">
                      {fs.sectorsPerCluster ? `${fs.sectorsPerCluster * 512} Bytes` : '512 Bytes'}
                    </td>
                    <td className="py-3">
                      {fs.isBackupBootSector ? (
                        <span className="px-2 py-0.5 rounded text-[10px] bg-blue-950 text-blue-300 border border-blue-800">
                          Backup Boot Sector
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800">
                          Primary Volume Boot Record
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => onOpenHex(fs.lba)}
                        className="text-xs text-cyan-400 hover:text-cyan-300 font-sans hover:underline"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Existing Partition Table Slots (MBR / GPT) */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5">
        <h4 className="text-sm font-bold text-slate-100 mb-1">
          LBA 0 Partition Table Entries (Current State)
        </h4>
        <p className="text-xs text-slate-400 mb-4">
          Shows what the BIOS/Operating System currently sees when attempting to mount this drive.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300 font-mono">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-[11px]">
                <th className="pb-2">Slot</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Type</th>
                <th className="pb-2">Start LBA</th>
                <th className="pb-2">Sectors</th>
                <th className="pb-2 text-right">Size</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {mbr.partitions.map((part) => (
                <tr key={part.index} className="hover:bg-slate-800/30">
                  <td className="py-3 text-slate-400">Partition #{part.index}</td>
                  <td className="py-3">
                    {part.status === 'valid' ? (
                      <span className="text-emerald-400 font-sans font-medium">Valid</span>
                    ) : part.status === 'corrupted' ? (
                      <span className="text-rose-400 font-sans font-medium">Corrupted</span>
                    ) : (
                      <span className="text-slate-500 font-sans">Unallocated (0x00)</span>
                    )}
                  </td>
                  <td className="py-3 text-slate-300 font-sans">{part.typeName}</td>
                  <td className="py-3 text-slate-400">{part.startLBA}</td>
                  <td className="py-3 text-slate-400">{part.totalSectors.toLocaleString()}</td>
                  <td className="py-3 text-right text-slate-300 font-sans">
                    {formatBytes(part.sizeBytes)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
