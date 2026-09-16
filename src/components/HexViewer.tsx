import React, { useState, useMemo } from 'react';
import { Terminal, ChevronLeft, ChevronRight, Search, Hash, Bookmark } from 'lucide-react';
import { extractSectorData } from '../services/recoveryEngine';
import { FilesystemMarker } from '../types';

interface HexViewerProps {
  rawBuffer: Uint8Array;
  totalSectors: number;
  initialLba?: number;
  discoveredFilesystems?: FilesystemMarker[];
}

export const HexViewer: React.FC<HexViewerProps> = ({
  rawBuffer,
  totalSectors,
  initialLba = 0,
  discoveredFilesystems = [],
}) => {
  const [currentLba, setCurrentLba] = useState<number>(initialLba);
  const [inputLba, setInputLba] = useState<string>(initialLba.toString());

  const sectorData = useMemo(() => {
    return extractSectorData(rawBuffer, currentLba, 512);
  }, [rawBuffer, currentLba]);

  const handleJump = (target: number) => {
    const clamped = Math.max(0, Math.min(totalSectors - 1, target));
    setCurrentLba(clamped);
    setInputLba(clamped.toString());
  };

  const handleInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(inputLba, 10);
    if (!isNaN(parsed)) {
      handleJump(parsed);
    }
  };

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-5">
      {/* Top Header & Navigation */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-slate-100 flex items-center space-x-2">
            <Terminal className="w-5 h-5 text-cyan-400" />
            <span>Raw Sector &amp; Hex Inspector</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Direct byte-level view of storage sectors (512 Bytes per Sector)
          </p>
        </div>

        {/* LBA Selector & Controls */}
        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => handleJump(currentLba - 1)}
            disabled={currentLba <= 0}
            className="p-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg text-slate-300 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <form onSubmit={handleInputSubmit} className="flex items-center space-x-1.5">
            <span className="text-xs font-mono text-slate-400">LBA:</span>
            <input
              type="text"
              value={inputLba}
              onChange={(e) => setInputLba(e.target.value)}
              className="w-24 px-2 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs font-mono text-cyan-300 text-center focus:outline-none focus:border-cyan-500"
            />
            <button
              type="submit"
              className="px-2.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold"
            >
              Go
            </button>
          </form>

          <button
            type="button"
            onClick={() => handleJump(currentLba + 1)}
            disabled={currentLba >= totalSectors - 1}
            className="p-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg text-slate-300 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Quick Jump Shortcuts */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-1 text-xs">
        <span className="text-slate-400 shrink-0 flex items-center space-x-1">
          <Bookmark className="w-3.5 h-3.5 text-cyan-400" />
          <span>Quick Jumps:</span>
        </span>
        <button
          onClick={() => handleJump(0)}
          className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-colors shrink-0 ${
            currentLba === 0 ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          LBA 0 (MBR)
        </button>

        <button
          onClick={() => handleJump(1)}
          className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-colors shrink-0 ${
            currentLba === 1 ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          LBA 1 (GPT Header)
        </button>

        {discoveredFilesystems.map((fs, idx) => (
          <button
            key={idx}
            onClick={() => handleJump(fs.lba)}
            className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-colors shrink-0 ${
              currentLba === fs.lba ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            LBA {fs.lba} ({fs.type} {fs.isBackupBootSector ? 'Backup' : 'VBR'})
          </button>
        ))}

        {totalSectors > 1 && (
          <button
            onClick={() => handleJump(totalSectors - 1)}
            className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-colors shrink-0 ${
              currentLba === totalSectors - 1 ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            LBA {totalSectors - 1} (Disk Tail)
          </button>
        )}
      </div>

      {/* Sector Metadata Pill */}
      <div className="flex flex-wrap items-center justify-between text-xs font-mono bg-slate-950 p-3 rounded-xl border border-slate-800 text-slate-400">
        <div>
          Sector: <span className="text-cyan-400 font-bold">LBA {currentLba}</span> | Byte Offset:{' '}
          <span className="text-slate-200">0x{(currentLba * 512).toString(16).toUpperCase()}</span>
        </div>
        <div>
          End Signature: [510-511]:{' '}
          <span
            className={`font-bold ${
              sectorData.bytes[510] === 0x55 && sectorData.bytes[511] === 0xaa
                ? 'text-emerald-400'
                : 'text-rose-400'
            }`}
          >
            {sectorData.bytes[510]?.toString(16).padStart(2, '0').toUpperCase()}{' '}
            {sectorData.bytes[511]?.toString(16).padStart(2, '0').toUpperCase()}
            {sectorData.bytes[510] === 0x55 && sectorData.bytes[511] === 0xaa ? ' (VALID 55 AA)' : ' (INVALID / 00)'}
          </span>
        </div>
      </div>

      {/* Hex Grid Table */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 overflow-x-auto font-mono text-[11px] sm:text-xs leading-relaxed select-text">
        <div className="grid grid-cols-[80px_1fr_120px] sm:grid-cols-[100px_1fr_150px] gap-2 sm:gap-4 pb-2 border-b border-slate-800 text-slate-500 text-[10px] uppercase font-bold">
          <div>Offset</div>
          <div>00 01 02 03 04 05 06 07  08 09 0A 0B 0C 0D 0E 0F</div>
          <div>ASCII Text</div>
        </div>

        <div className="divide-y divide-slate-900 pt-1">
          {sectorData.hexRows.map((row, rowIdx) => {
            const rowStartByte = rowIdx * 16;
            // Highlight partition table in LBA 0 (bytes 446 to 509)
            const isPartitionArea = currentLba === 0 && rowStartByte >= 432 && rowStartByte < 512;
            // Highlight boot signature at 510-511 (row 31)
            const isBootSigRow = currentLba === 0 && rowIdx === 31;

            return (
              <div
                key={rowIdx}
                className={`grid grid-cols-[80px_1fr_120px] sm:grid-cols-[100px_1fr_150px] gap-2 sm:gap-4 py-1 hover:bg-slate-900/50 transition-colors ${
                  isBootSigRow ? 'bg-cyan-950/20' : isPartitionArea ? 'bg-purple-950/15' : ''
                }`}
              >
                <div className="text-slate-500">{row.offsetHex}</div>
                <div className="flex flex-wrap gap-x-1.5 text-slate-300">
                  {row.bytesHex.map((byteHex, byteIdx) => {
                    const bytePos = rowStartByte + byteIdx;
                    const isZero = byteHex === '00';
                    const isSigByte = (bytePos === 510 || bytePos === 511);

                    return (
                      <span
                        key={byteIdx}
                        className={`${
                          isSigByte
                            ? 'text-emerald-400 font-bold underline'
                            : isZero
                            ? 'text-slate-600'
                            : 'text-slate-200 font-medium'
                        }`}
                      >
                        {byteHex}
                      </span>
                    );
                  })}
                </div>
                <div className="text-slate-400 font-mono tracking-wider truncate">
                  {row.ascii}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
