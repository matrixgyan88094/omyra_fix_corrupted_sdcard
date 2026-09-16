/**
 * Low-level Raw USB / OTG Bulk Block Device Reader
 * When WebUSB grants interface connection to a Mass Storage Device, this service executes
 * standard SCSI-2/SPC commands over USB Bulk-Only Transport (BOT).
 */

export interface RawBlockDeviceInfo {
  vendorId: number;
  productId: number;
  manufacturer: string;
  product: string;
  serialNumber: string;
  blockSize: number;
  totalBlocks: number;
  totalBytes: number;
  claimedInterfaceIndex?: number;
}

/**
 * SCSI Operation Codes for Mass Storage
 */
export const SCSI = {
  TEST_UNIT_READY: 0x00,
  REQUEST_SENSE: 0x03,
  INQUIRY: 0x12,
  READ_CAPACITY_10: 0x25,
  READ_10: 0x28,
  WRITE_10: 0x2a,
};

/**
 * Creates a Command Block Wrapper (CBW) buffer according to USB Mass Storage Class BOT specification
 */
export function createCommandBlockWrapper(
  tag: number,
  dataTransferLength: number,
  directionIn: boolean,
  lun: number,
  cdb: number[]
): Uint8Array {
  const cbw = new Uint8Array(31);
  const view = new DataView(cbw.buffer);

  // 'USBC' in little-endian = 0x43425355
  view.setUint32(0, 0x43425355, true);
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
 * Attempts to read raw blocks (e.g. LBA 0 to LBA 64) directly over USB Bulk endpoints.
 */
export async function readRawBlocksOverUsb(
  device: any,
  endpointIn: number,
  endpointOut: number,
  lbaStart: number,
  blockCount: number,
  blockSize: number = 512
): Promise<Uint8Array> {
  const transferLength = blockCount * blockSize;
  const tag = 0x10203040;

  // Build SCSI READ(10) CDB
  const cdb = [
    SCSI.READ_10,
    0x00, // flags
    (lbaStart >> 24) & 0xff,
    (lbaStart >> 16) & 0xff,
    (lbaStart >> 8) & 0xff,
    lbaStart & 0xff,
    0x00, // group
    (blockCount >> 8) & 0xff,
    blockCount & 0xff,
    0x00, // control
  ];

  const cbw = createCommandBlockWrapper(tag, transferLength, true, 0, cdb);

  // 1. Send CBW to OUT endpoint
  await device.transferOut(endpointOut, cbw);

  // 2. Read raw sectors from IN endpoint
  const dataResult = await device.transferIn(endpointIn, transferLength);
  if (!dataResult.data || dataResult.data.byteLength === 0) {
    throw new Error('No data received from USB bulk endpoint');
  }

  const rawBuffer = new Uint8Array(dataResult.data.buffer);

  // 3. Read Command Status Wrapper (CSW - 13 bytes)
  try {
    await device.transferIn(endpointIn, 13);
  } catch (err) {
    console.warn('CSW read warning:', err);
  }

  return rawBuffer;
}
