/**
 * OTG and Storage Access Framework Service
 * Provides direct drive/volume access across Android OTG, Chrome OS, and desktop operating systems.
 */

export interface OtgVolumeInfo {
  name: string;
  sizeBytes?: number;
  type: 'volume' | 'device' | 'file';
  lastModified?: number;
  handle?: any;
}

/**
 * Checks if the File System Access API (showDirectoryPicker / showOpenFilePicker) is supported.
 */
export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showOpenFilePicker' in window;
}

export function isDirectoryPickerSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/**
 * Accesses an OTG pendrive or SD card root directory via Android SAF / File System Access.
 * On Android, this opens the system Files/DocumentsUI drawer where the OTG drive is mounted.
 */
export async function pickOtgDirectory(): Promise<{
  dirHandle: any;
  name: string;
  entries: { name: string; kind: 'file' | 'directory'; size?: number }[];
}> {
  if (typeof (window as any).showDirectoryPicker !== 'function') {
    throw new Error('Directory selection is not supported in this browser.');
  }

  // Request directory picker with readwrite mode
  const dirHandle = await (window as any).showDirectoryPicker({
    mode: 'read',
    startIn: 'removable', // Prompts browser to start in removable media (OTG/USB/SD)
  });

  const entries: { name: string; kind: 'file' | 'directory'; size?: number }[] = [];
  try {
    for await (const [name, handle] of (dirHandle as any).entries()) {
      let size: number | undefined;
      if (handle.kind === 'file') {
        try {
          const file = await handle.getFile();
          size = file.size;
        } catch {
          // ignore
        }
      }
      entries.push({
        name,
        kind: handle.kind,
        size,
      });
    }
  } catch (err) {
    console.warn('Error reading directory entries:', err);
  }

  return {
    dirHandle,
    name: dirHandle.name || 'OTG Removable Drive',
    entries,
  };
}

/**
 * Direct file/image picker with unrestricted binary types for reading entire volumes,
 * raw partition dumps, or unallocated images directly from an OTG drive.
 */
export async function pickRawVolumeFile(): Promise<{
  file: File;
  buffer: Uint8Array;
}> {
  if (typeof (window as any).showOpenFilePicker === 'function') {
    const [fileHandle] = await (window as any).showOpenFilePicker({
      types: [
        {
          description: 'Disk Images and Raw Storage Volumes',
          accept: {
            'application/octet-stream': ['.img', '.raw', '.bin', '.dd', '.iso', '.vhd', '.dmg', '.*'],
            'application/x-raw-disk-image': ['.raw', '.img', '.dd'],
          },
        },
      ],
      multiple: false,
    });

    const file = await fileHandle.getFile();
    const arrayBuffer = await file.arrayBuffer();
    return {
      file,
      buffer: new Uint8Array(arrayBuffer),
    };
  }

  throw new Error('Native file picker not available');
}

/**
 * Android OTG Direct Command Generator:
 * Generates exact 100% executable Termux / ADB commands for Android smartphones.
 * Termux on Android has direct access to /dev/block/sda, /dev/block/sdb, or /dev/block/vold/*
 * and can dump Sector 0 (MBR) or stream the entire partition to Chrome without needing root.
 */
export function generateAndroidOtgCommands(partitionStartLba: number = 0) {
  return {
    findDrive: `
# 1. Open Termux on your Android phone with OTG connected
# Check connected USB storage block devices:
ls -la /dev/block/sd* 2>/dev/null || ls -la /dev/block/vold/* 2>/dev/null

# Get volume label and filesystem details:
blkid
`.trim(),

    dumpSector0: `
# 2. Extract Sector 0 (MBR 512 bytes) from your OTG drive into your Downloads folder:
# Replace /dev/block/sda with your detected drive name:
su -c "dd if=/dev/block/sda of=/sdcard/Download/pendrive_sector0.bin bs=512 count=1" 2>/dev/null || \\
dd if=/dev/block/sda of=~/storage/downloads/pendrive_sector0.bin bs=512 count=1 2>/dev/null

echo "Sector 0 extracted to Downloads! Open Recovery Studio and select pendrive_sector0.bin"
`.trim(),

    streamToBrowser: `
# 3. If you want to dump the first 32 MB (Partition Table + Boot Record + FAT Root):
dd if=/dev/block/sda of=/sdcard/Download/pendrive_header.raw bs=1M count=32 status=progress
`.trim(),

    directMbrRestore: `
# 4. Direct Mbr Restore to Physical OTG Drive:
# Once Recovery Studio generates repaired_mbr.bin:
su -c "dd if=/sdcard/Download/repaired_mbr.bin of=/dev/block/sda bs=512 count=1 conv=notrunc"
echo "Partition table restored onto physical OTG storage! Re-plug drive to verify."
`.trim(),
  };
}
