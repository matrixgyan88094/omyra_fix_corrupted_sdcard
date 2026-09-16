import React, { useState, useCallback } from 'react';
import { Header } from './components/Header';
import { DriveUploader } from './components/DriveUploader';
import { SectorScanProgress } from './components/SectorScanProgress';
import { PartitionDiagnosis } from './components/PartitionDiagnosis';
import { FileRecoveryGallery } from './components/FileRecoveryGallery';
import { HexViewer } from './components/HexViewer';
import { PhysicalDriveGuide } from './components/PhysicalDriveGuide';
import { FailureTriageModal } from './components/FailureTriageModal';
import { PhysicalUsbConnector } from './components/PhysicalUsbConnector';
import { DiskAnalysisResult, PhysicalUsbDeviceInfo } from './types';
import { analyzeDiskImage } from './services/recoveryEngine';
import { HardDrive, ShieldCheck, Cpu } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'studio' | 'devices' | 'hex' | 'scripts' | 'triage'>('studio');
  const [rawBuffer, setRawBuffer] = useState<Uint8Array | null>(null);
  const [diskName, setDiskName] = useState<string>('');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanStage, setScanStage] = useState<string>('');
  const [scanProgress, setScanProgress] = useState<number>(0);
  const [analysis, setAnalysis] = useState<DiskAnalysisResult | null>(null);
  const [targetHexLba, setTargetHexLba] = useState<number>(0);
  const [activePhysicalDevice, setActivePhysicalDevice] = useState<PhysicalUsbDeviceInfo | null>(null);

  const handleLoadDisk = useCallback((buffer: Uint8Array, filename: string, isSample = false) => {
    setRawBuffer(buffer);
    setDiskName(filename);
    setIsScanning(true);
    setScanStage('Initializing memory buffer & reading LBA 0...');
    setScanProgress(5);
    setActiveTab('studio');

    // Run analysis with progress callback
    setTimeout(() => {
      try {
        const result = analyzeDiskImage(buffer, filename, (stage, pct) => {
          setScanStage(stage);
          setScanProgress(pct);
        });

        setTimeout(() => {
          setAnalysis(result);
          setIsScanning(false);
        }, 400);
      } catch (err) {
        console.error('Analysis error:', err);
        setIsScanning(false);
      }
    }, 50);
  }, []);

  const handleReset = useCallback(() => {
    setRawBuffer(null);
    setDiskName('');
    setAnalysis(null);
    setIsScanning(false);
    setActiveTab('studio');
  }, []);

  const handleOpenHex = useCallback((lba: number) => {
    setTargetHexLba(lba);
    setActiveTab('hex');
  }, []);

  const handleOpenScripts = useCallback(() => {
    setActiveTab('scripts');
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Top Header Navigation */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        hasLoadedDisk={!!rawBuffer}
        onReset={handleReset}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* TAB 1: Recovery Studio */}
        {activeTab === 'studio' && (
          <div className="space-y-8">
            {/* If no disk loaded and not scanning */}
            {!rawBuffer && !isScanning && (
              <DriveUploader
                onLoadDisk={handleLoadDisk}
                isLoading={isScanning}
                onOpenScripts={handleOpenScripts}
              />
            )}

            {/* During Sector Scan */}
            {isScanning && (
              <div className="py-12">
                <SectorScanProgress currentStage={scanStage} progressPercent={scanProgress} />
              </div>
            )}

            {/* When Analysis is Ready */}
            {!isScanning && analysis && rawBuffer && (
              <div className="space-y-8">
                {/* 1. Partition Diagnosis & Instant 1-Click Fix */}
                <PartitionDiagnosis
                  analysis={analysis}
                  rawBuffer={rawBuffer}
                  onOpenScripts={handleOpenScripts}
                  onOpenHex={handleOpenHex}
                />

                {/* 2. Deep-Carved File Recovery Gallery */}
                <FileRecoveryGallery files={analysis.carvedFiles} />
              </div>
            )}
          </div>
        )}

        {/* TAB 2: USB / OTG Hardware Manager */}
        {activeTab === 'devices' && (
          <div className="space-y-6">
            <PhysicalUsbConnector
              onLoadSectorBuffer={handleLoadDisk}
              onOpenScripts={handleOpenScripts}
            />
          </div>
        )}

        {/* TAB 3: Hex & Sector Inspector */}
        {activeTab === 'hex' && (
          <div>
            {rawBuffer ? (
              <HexViewer
                rawBuffer={rawBuffer}
                totalSectors={analysis ? analysis.totalSectors : Math.floor(rawBuffer.length / 512)}
                initialLba={targetHexLba}
                discoveredFilesystems={analysis?.discoveredFilesystems}
              />
            ) : (
              <div className="text-center py-16 bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
                <HardDrive className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <h3 className="text-base font-bold text-slate-300">No Disk Image Loaded</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  Load an SD Card or USB disk dump in the Recovery Studio tab to inspect its raw sectors.
                </p>
                <button
                  onClick={() => setActiveTab('studio')}
                  className="mt-4 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold"
                >
                  Go to Recovery Studio
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: Physical Drive Rescue Scripts */}
        {activeTab === 'scripts' && (
          <PhysicalDriveGuide
            analysis={analysis}
            physicalDevice={activePhysicalDevice}
          />
        )}

        {/* TAB 5: Failure Triage & Feasibility */}
        {activeTab === 'triage' && (
          <FailureTriageModal />
        )}
      </main>


      {/* Minimal Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/60 py-6 text-center text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Local Air-Gapped Engine • 100% In-Memory Processing • Zero Cloud Uploads</span>
          </div>
          <div className="text-slate-400">
            Disk &amp; Partition Recovery Studio
          </div>
        </div>
      </footer>
    </div>
  );
}
