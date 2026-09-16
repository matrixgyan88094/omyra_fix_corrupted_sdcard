import React, { useState, useEffect } from 'react';
import {
  Usb,
  Smartphone,
  HardDrive,
  CheckCircle2,
  AlertCircle,
  ShieldAlert,
  ArrowRight,
  RefreshCw,
  Cpu,
  Layers,
  Terminal,
  Activity,
  Zap,
} from 'lucide-react';
import { PhysicalUsbDeviceInfo } from '../types';
import {
  isWebUsbSupported,
  isMobileOrAndroid,
  getPairedUsbDevices,
  requestUsbDevice,
  queryPhysicalDriveScsi,
} from '../services/webUsbStorage';
import { AndroidOtgBridge } from './AndroidOtgBridge';

interface PhysicalUsbConnectorProps {
  onLoadSectorBuffer?: (buffer: Uint8Array, deviceName: string) => void;
  onOpenScripts?: () => void;
}

export const PhysicalUsbConnector: React.FC<PhysicalUsbConnectorProps> = ({
  onLoadSectorBuffer,
  onOpenScripts,
}) => {
  const [supported, setSupported] = useState<boolean>(true);
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [connectedDevices, setConnectedDevices] = useState<PhysicalUsbDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<PhysicalUsbDeviceInfo | null>(null);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [directSector0, setDirectSector0] = useState<Uint8Array | null>(null);

  useEffect(() => {
    const isSupported = isWebUsbSupported();
    setSupported(isSupported);
    setIsMobile(isMobileOrAndroid());

    if (isSupported) {
      // Check already paired devices
      getPairedUsbDevices().then((devices) => {
        setConnectedDevices(devices);
        if (devices.length > 0 && !selectedDevice) {
          setSelectedDevice(devices[0]);
        }
      });

      // Listen for USB connection / removal events
      const handleConnect = (e: any) => {
        console.log('USB device physically connected:', e.device);
        getPairedUsbDevices().then((devs) => {
          setConnectedDevices(devs);
          if (devs.length > 0) setSelectedDevice(devs[devs.length - 1]);
        });
      };

      const handleDisconnect = (e: any) => {
        console.log('USB device physically removed:', e.device);
        getPairedUsbDevices().then((devs) => {
          setConnectedDevices(devs);
          if (selectedDevice && selectedDevice.id.includes(e.device.serialNumber || '')) {
            setSelectedDevice(devs.length > 0 ? devs[0] : null);
          }
        });
      };

      (navigator as any).usb?.addEventListener('connect', handleConnect);
      (navigator as any).usb?.addEventListener('disconnect', handleDisconnect);

      return () => {
        (navigator as any).usb?.removeEventListener('connect', handleConnect);
        (navigator as any).usb?.removeEventListener('disconnect', handleDisconnect);
      };
    }
  }, []);

  const handleConnectNewDevice = async (mode: 'open' | 'extended' = 'open') => {
    setIsConnecting(true);
    setActionError(null);
    try {
      const { device, info } = await requestUsbDevice(mode);

      // Attempt SCSI BOT query & sector 0 read
      const queryResult = await queryPhysicalDriveScsi(device);
      const updatedInfo = queryResult.info;

      setSelectedDevice(updatedInfo);
      setConnectedDevices((prev) => {
        const filtered = prev.filter((d) => d.id !== updatedInfo.id);
        return [updatedInfo, ...filtered];
      });

      if (queryResult.sector0) {
        setDirectSector0(queryResult.sector0);
      }
    } catch (err: any) {
      if (err.name !== 'NotFoundError') {
        // NotFoundError means user closed the prompt
        setActionError(err.message || 'Failed to connect to USB device');
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const handleAnalyzeDirectSector0 = () => {
    if (directSector0 && onLoadSectorBuffer && selectedDevice) {
      onLoadSectorBuffer(directSector0, `${selectedDevice.productName} (Direct Sector 0)`);
    }
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-6 shadow-xl shadow-cyan-950/20">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Usb className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-100 flex items-center space-x-2">
                <span>Direct Physical USB &amp; OTG Hardware Detection</span>
                <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Live WebUSB
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Detect SD card readers, USB pen drives, and OTG external drives connected to your PC or smartphone.
              </p>
            </div>
          </div>
        </div>

        {/* Platform Indicator */}
        <div className="flex items-center space-x-2 text-xs">
          <span className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-300">
            {isMobile ? (
              <>
                <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
                <span>OTG Mobile Mode</span>
              </>
            ) : (
              <>
                <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
                <span>Desktop Host Mode</span>
              </>
            )}
          </span>
        </div>
      </div>

      {/* WebUSB Support Alert */}
      {!supported && (
        <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-800/50 text-xs text-amber-200 flex items-start space-x-3">
          <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-bold">WebUSB API Not Supported in this Browser</div>
            <p className="text-amber-300/90 leading-relaxed">
              Direct physical USB/OTG communication requires <b>Google Chrome</b>, <b>Microsoft Edge</b>, <b>Opera</b>, or <b>Chrome on Android</b>. If you are using Safari or Firefox, you can still load raw disk images directly via the dropzone below.
            </p>
          </div>
        </div>
      )}

      {/* Main Action Bar */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <button
            type="button"
            id="btn-connect-physical-usb"
            onClick={() => handleConnectNewDevice('open')}
            disabled={!supported || isConnecting}
            className="flex-1 px-5 py-3.5 bg-gradient-to-r from-cyan-600 via-teal-600 to-blue-600 hover:from-cyan-500 hover:via-teal-500 hover:to-blue-500 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-lg shadow-cyan-900/30 transition-all flex items-center justify-center space-x-2.5 group"
          >
            {isConnecting ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : (
              <Zap className="w-5 h-5 text-yellow-300 group-hover:scale-110 transition-transform" />
            )}
            <span>
              {isConnecting
                ? 'Opening Browser Selector...'
                : 'Connect Physical USB Drive (Direct)'}
            </span>
          </button>

          <button
            type="button"
            id="btn-connect-otg-extended"
            onClick={() => handleConnectNewDevice('extended')}
            disabled={!supported || isConnecting}
            className="px-5 py-3.5 bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-cyan-500/40 hover:border-cyan-400 font-bold text-sm rounded-xl shadow-md transition-all flex items-center justify-center space-x-2"
          >
            <Smartphone className="w-4 h-4 text-cyan-400" />
            <span>OTG / Flash Controller Bypass Filter</span>
          </button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-400 bg-slate-950/80 p-3 rounded-xl border border-slate-800">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400" />
            <span>
              <b>Direct Mode</b> asks Chrome to list all plugged devices. <b>Bypass Filter</b> targets SanDisk, Kingston, Realtek, SMI, and Alcor OTG controllers.
            </span>
          </div>
          <span className="font-mono text-cyan-300 shrink-0">
            {connectedDevices.length} Hardware Device(s) Paired
          </span>
        </div>
      </div>

      {actionError && (
        <div className="p-3 bg-rose-950/30 border border-rose-800/50 rounded-xl text-xs text-rose-300 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Connected Devices List & Details */}
      {connectedDevices.length > 0 ? (
        <div className="space-y-4 pt-2">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Detected Hardware Devices:
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Devices list column */}
            <div className="space-y-2">
              {connectedDevices.map((dev) => {
                const isSelected = selectedDevice?.id === dev.id;
                return (
                  <button
                    key={dev.id}
                    onClick={() => setSelectedDevice(dev)}
                    className={`w-full text-left p-3.5 rounded-xl border text-xs transition-all flex items-start justify-between gap-2 ${
                      isSelected
                        ? 'bg-cyan-950/40 border-cyan-500/60 text-slate-100 shadow-md shadow-cyan-950/50'
                        : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                    }`}
                  >
                    <div className="space-y-1 overflow-hidden">
                      <div className="font-bold text-slate-200 truncate flex items-center space-x-1.5">
                        <HardDrive className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        <span className="truncate">{dev.productName}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        VID: {dev.vendorIdHex} • PID: {dev.productIdHex}
                      </div>
                    </div>

                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase shrink-0 ${
                        dev.status === 'claimed'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : dev.status === 'access_restricted'
                          ? 'bg-amber-950 text-amber-300 border border-amber-800'
                          : 'bg-blue-950 text-blue-300 border border-blue-800'
                      }`}
                    >
                      {dev.status === 'claimed'
                        ? 'SCSI Active'
                        : dev.status === 'access_restricted'
                        ? 'OS Locked'
                        : 'USB Ready'}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Device detail card */}
            {selectedDevice && (
              <div className="md:col-span-2 bg-slate-950 p-5 rounded-xl border border-slate-800 space-y-4">
                <div className="flex items-start justify-between border-b border-slate-800 pb-3">
                  <div>
                    <h4 className="font-bold text-slate-100 text-sm flex items-center space-x-2">
                      <span>{selectedDevice.productName}</span>
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Manufacturer: {selectedDevice.manufacturerName} • Serial: {selectedDevice.serialNumber}
                    </p>
                  </div>

                  <div className="text-right font-mono text-xs">
                    <span className="text-cyan-400 font-semibold">USB {selectedDevice.usbVersionMajor}.{selectedDevice.usbVersionMinor}</span>
                  </div>
                </div>

                {/* Specs Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                  <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800/80">
                    <div className="text-slate-500 text-[10px] uppercase font-sans">Vendor ID</div>
                    <div className="text-cyan-300 font-bold mt-0.5">{selectedDevice.vendorIdHex}</div>
                  </div>
                  <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800/80">
                    <div className="text-slate-500 text-[10px] uppercase font-sans">Product ID</div>
                    <div className="text-cyan-300 font-bold mt-0.5">{selectedDevice.productIdHex}</div>
                  </div>
                  <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800/80">
                    <div className="text-slate-500 text-[10px] uppercase font-sans">USB Class</div>
                    <div className="text-slate-300 font-bold mt-0.5">
                      {selectedDevice.interfaces.some((i) => i.interfaceClass === 8)
                        ? '0x08 Mass Storage'
                        : 'USB Composite'}
                    </div>
                  </div>
                  <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800/80">
                    <div className="text-slate-500 text-[10px] uppercase font-sans">Capacity</div>
                    <div className="text-slate-300 font-bold mt-0.5">
                      {selectedDevice.scsiCapacity
                        ? `${Math.round(selectedDevice.scsiCapacity.totalSizeBytes / (1024 * 1024 * 1024))} GB`
                        : 'Query via OS'}
                    </div>
                  </div>
                </div>

                {/* Status Explanation */}
                <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 text-xs text-slate-300 space-y-2">
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="font-semibold text-emerald-300">
                      Physical Device Successfully Identified by WebUSB
                    </span>
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    {selectedDevice.statusMessage}
                  </p>
                </div>

                {/* Actions available */}
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  {directSector0 && (
                    <button
                      type="button"
                      onClick={handleAnalyzeDirectSector0}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-lg transition-colors flex items-center space-x-1.5 shadow-md shadow-emerald-950/50"
                    >
                      <span>Analyze Extracted LBA 0 (MBR)</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {onOpenScripts && (
                    <button
                      type="button"
                      onClick={onOpenScripts}
                      className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 font-semibold text-xs rounded-lg transition-colors flex items-center space-x-1.5"
                    >
                      <Terminal className="w-3.5 h-3.5" />
                      <span>Generate Hardware Patch Script for this Drive</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 text-xs text-slate-400 flex items-start space-x-3">
          <Smartphone className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-bold text-slate-200">
              Ready for Any Storage Media (SD Card, Pen Drive, OTG Flash, External HDD)
            </div>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              Plug your USB drive or insert your SD card into your PC reader or Android phone via OTG. Click <b>&quot;Connect Physical USB Drive&quot;</b> or <b>&quot;OTG / Flash Controller Bypass Filter&quot;</b> above to grant browser access.
            </p>
          </div>
        </div>
      )}

      {/* Android Smartphone OTG Direct Bridge */}
      <AndroidOtgBridge
        onLoadBuffer={(buf, name) => {
          if (onLoadSectorBuffer) {
            onLoadSectorBuffer(buf, name);
          }
        }}
        onOpenScripts={onOpenScripts}
      />
    </div>
  );
};
