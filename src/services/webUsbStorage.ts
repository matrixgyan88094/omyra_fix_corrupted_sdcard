import { PhysicalUsbDeviceInfo } from '../types';

// USB BOT Constants
const CBW_SIGNATURE = 0x43425355; // "USBC" in little endian
const CSW_SIGNATURE = 0x53425355; // "USBS" in little endian

let tagCounter = 1;

/**
 * Checks if the current browser environment supports the WebUSB API.
 */
export function isWebUsbSupported(): boolean {
  return typeof navigator !== 'undefined' && 'usb' in navigator;
}

/**
 * Checks if the browser is running on Android or mobile (where OTG is common)
 */
export function isMobileOrAndroid(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

/**
 * Parse USBDevice interfaces and endpoints into a clean representation
 */
export function parseDeviceInterfaces(device: any) {
  const result: PhysicalUsbDeviceInfo['interfaces'] = [];
  if (!device.configurations || device.configurations.length === 0) return result;

  const config = device.configurations[0];
  for (const iface of config.interfaces) {
    for (const alt of iface.alternates) {
      const endpoints = (alt.endpoints || []).map((ep: any) => ({
        endpointNumber: ep.endpointNumber,
        direction: ep.direction as 'in' | 'out',
        type: ep.type,
        packetSize: ep.packetSize,
      }));

      result.push({
        interfaceNumber: iface.interfaceNumber,
        alternateSetting: alt.alternateSetting,
        interfaceClass: alt.interfaceClass,
        interfaceSubclass: alt.interfaceSubclass,
        interfaceProtocol: alt.interfaceProtocol,
        endpoints,
      });
    }
  }
  return result;
}

/**
 * Converts a raw USBDevice into a rich PhysicalUsbDeviceInfo structure
 */
export function formatUsbDeviceInfo(device: any, statusMessage = ''): PhysicalUsbDeviceInfo {
  const vendorIdHex = '0x' + (device.vendorId || 0).toString(16).padStart(4, '0').toUpperCase();
  const productIdHex = '0x' + (device.productId || 0).toString(16).padStart(4, '0').toUpperCase();
  const interfaces = parseDeviceInterfaces(device);

  const isMassStorage = interfaces.some(
    (i) => i.interfaceClass === 8 || device.deviceClass === 8
  );

  return {
    id: `${device.vendorId}-${device.productId}-${device.serialNumber || 'generic'}`,
    vendorId: device.vendorId,
    productId: device.productId,
    vendorIdHex,
    productIdHex,
    productName: device.productName || (isMassStorage ? 'USB Mass Storage Device' : 'Connected USB Device'),
    manufacturerName: device.manufacturerName || 'Generic USB',
    serialNumber: device.serialNumber || 'N/A',
    usbVersionMajor: device.usbVersionMajor || 2,
    usbVersionMinor: device.usbVersionMinor || 0,
    usbVersionSubminor: device.usbVersionSubminor || 0,
    deviceClass: device.deviceClass || 0,
    deviceSubclass: device.deviceSubclass || 0,
    deviceProtocol: device.deviceProtocol || 0,
    opened: device.opened || false,
    status: 'connected',
    statusMessage: statusMessage || (isMassStorage ? 'USB Mass Storage (SD/Flash/Drive) ready' : 'Connected USB hardware'),
    interfaces,
  };
}

/**
 * Lists all already-paired USB devices
 */
export async function getPairedUsbDevices(): Promise<PhysicalUsbDeviceInfo[]> {
  if (!isWebUsbSupported()) return [];
  try {
    const devices = await (navigator as any).usb.getDevices();
    return devices.map((d: any) => formatUsbDeviceInfo(d));
  } catch (err) {
    console.warn('Error fetching paired USB devices:', err);
    return [];
  }
}

/**
 * Triggers the browser's native hardware picker to select a connected USB or OTG device
 */
export async function requestUsbDevice(): Promise<{
  device: any;
  info: PhysicalUsbDeviceInfo;
}> {
  if (!isWebUsbSupported()) {
    throw new Error(
      'WebUSB is not supported in this browser. Please use Google Chrome, Microsoft Edge, or Chrome on Android with OTG.'
    );
  }

  // Request device without vendor filters so users can pick ANY connected SD card reader, pendrive, or USB disk
  const device = await (navigator as any).usb.requestDevice({ filters: [] });
  const info = formatUsbDeviceInfo(device);

  return { device, info };
}

/**
 * Builds a 31-byte USB Bulk-Only Transport (BOT) Command Block Wrapper (CBW)
 */
function buildCbw(
  tag: number,
  dataTransferLength: number,
  directionIn: boolean,
  lun: number,
  cdb: number[]
): Uint8Array {
  const cbw = new Uint8Array(31);
  const view = new DataView(cbw.buffer);

  view.setUint32(0, CBW_SIGNATURE, true);
  view.setUint32(4, tag, true);
  view.setUint32(8, dataTransferLength, true);
  cbw[12] = directionIn ? 0x80 : 0x00;
  cbw[13] = lun & 0x0f;
  cbw[14] = Math.min(cdb.length, 16);

  for (let i = 0; i < cdb.length && i < 16; i++) {
    cbw[15 + i] = cdb[i];
  }

  return cbw;
}

/**
 * Attempts direct SCSI Communication with the USB Mass Storage device using BOT protocol.
 * This runs when the OS does not lock the interface (e.g. Android OTG, Linux with permissions, or WinUSB).
 */
export async function queryPhysicalDriveScsi(device: any): Promise<{
  info: PhysicalUsbDeviceInfo;
  sector0?: Uint8Array;
}> {
  const info = formatUsbDeviceInfo(device);

  try {
    if (!device.opened) {
      await device.open();
    }

    if (device.configuration === null) {
      await device.selectConfiguration(1);
    }

    // Find Mass Storage interface (Class 8, Subclass 6 = SCSI transparent command set, Protocol 0x50 = BOT)
    let targetInterfaceNumber = 0;
    let inEndpointNumber = 0;
    let outEndpointNumber = 0;

    for (const iface of device.configuration.interfaces) {
      for (const alt of iface.alternates) {
        if (alt.interfaceClass === 8 || alt.interfaceClass === 0) {
          targetInterfaceNumber = iface.interfaceNumber;
          for (const ep of alt.endpoints) {
            if (ep.direction === 'in') inEndpointNumber = ep.endpointNumber;
            if (ep.direction === 'out') outEndpointNumber = ep.endpointNumber;
          }
          break;
        }
      }
    }

    // Attempt interface claim
    await device.claimInterface(targetInterfaceNumber);
    info.opened = true;
    info.claimedInterface = targetInterfaceNumber;
    info.status = 'claimed';
    info.statusMessage = 'Interface successfully claimed! Performing direct SCSI BOT inspection...';

    // 1. Send SCSI INQUIRY (Opcode 0x12)
    const inquiryTag = tagCounter++;
    const inquiryCdb = [0x12, 0x00, 0x00, 0x00, 36, 0x00];
    const inquiryCbw = buildCbw(inquiryTag, 36, true, 0, inquiryCdb);

    await device.transferOut(outEndpointNumber, inquiryCbw);
    const inquiryResult = await device.transferIn(inEndpointNumber, 36);

    // Read CSW
    await device.transferIn(inEndpointNumber, 13);

    if (inquiryResult && inquiryResult.data && inquiryResult.data.byteLength >= 36) {
      const data = new Uint8Array(inquiryResult.data.buffer);
      const decoder = new TextDecoder('ascii');
      const vendor = decoder.decode(data.slice(8, 16)).trim();
      const product = decoder.decode(data.slice(16, 32)).trim();
      const revision = decoder.decode(data.slice(32, 36)).trim();
      const removable = (data[1] & 0x80) !== 0;

      info.scsiInquiry = { vendor, product, revision, removable };
      if (product) info.productName = `${vendor} ${product}`.trim();
    }

    // 2. Send SCSI READ CAPACITY 10 (Opcode 0x25)
    const capTag = tagCounter++;
    const capCdb = [0x25, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
    const capCbw = buildCbw(capTag, 8, true, 0, capCdb);

    await device.transferOut(outEndpointNumber, capCbw);
    const capResult = await device.transferIn(inEndpointNumber, 8);
    await device.transferIn(inEndpointNumber, 13);

    if (capResult && capResult.data && capResult.data.byteLength >= 8) {
      const view = new DataView(capResult.data.buffer);
      const lastLba = view.getUint32(0, false);
      const blockSize = view.getUint32(4, false);
      const totalSectors = lastLba + 1;
      const totalSizeBytes = totalSectors * blockSize;

      info.scsiCapacity = {
        totalSectors,
        blockSize,
        totalSizeBytes,
      };
    }

    // 3. Send SCSI READ 10 for Sector 0 (LBA 0 - MBR)
    const readTag = tagCounter++;
    const readCdb = [0x28, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00];
    const readCbw = buildCbw(readTag, 512, true, 0, readCdb);

    await device.transferOut(outEndpointNumber, readCbw);
    const readResult = await device.transferIn(inEndpointNumber, 512);
    await device.transferIn(inEndpointNumber, 13);

    let sector0: Uint8Array | undefined;
    if (readResult && readResult.data && readResult.data.byteLength === 512) {
      sector0 = new Uint8Array(readResult.data.buffer);
      info.sector0Buffer = sector0;
      info.statusMessage = 'Direct SCSI read complete! LBA 0 MBR extracted directly via USB OTG.';
    }

    return { info, sector0 };
  } catch (err: any) {
    console.info('Direct SCSI claim note:', err.message);

    // If claimInterface failed because the OS kernel (Windows usbstor / macOS disk arbitration)
    // already locked the mass storage interface:
    if (
      err.name === 'SecurityError' ||
      err.name === 'NetworkError' ||
      err.message?.includes('claim') ||
      err.message?.includes('protected')
    ) {
      info.status = 'access_restricted';
      info.statusMessage =
        'Connected & Identified! Operating System kernel has active storage lock on this drive.';
    } else {
      info.status = 'error';
      info.statusMessage = `Hardware detected: ${err.message || 'Communication paused'}`;
    }

    return { info };
  }
}
