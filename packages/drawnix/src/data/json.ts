import { PlaitBoard } from '@plait/core';
import { MIME_TYPES, VERSIONS } from '../constants';
import { fileOpen, fileSave, type FileSystemHandle } from './filesystem';
import { DrawnixExportedData, DrawnixExportedType } from './types';
import { loadFromBlob, normalizeFile } from './blob';

export type DrawnixFileHandle = FileSystemHandle | null;

type FileWithHandle = File & {
  handle?: FileSystemHandle;
};

export const getDefaultName = () => {
  const time = new Date().getTime();
  return time.toString();
};

export const saveAsJSON = async (
  board: PlaitBoard,
  name: string = getDefaultName(),
  serialized?: string
) => {
  return saveJSON(board, null, name, serialized);
};

export const saveJSON = async (
  board: PlaitBoard,
  existingFileHandle: DrawnixFileHandle = null,
  name: string = getDefaultName(),
  serialized?: string
) => {
  // Keep serialization lazy so the native save picker can open immediately.
  // Large boards can take a noticeable amount of time to stringify.
  let serializedForSave = serialized;
  const blob = Promise.resolve().then(() => {
    serializedForSave = serializedForSave ?? serializeAsJSON(board);
    return new Blob([serializedForSave], {
      type: MIME_TYPES.drawnix,
    });
  });

  const fileHandle = await fileSave(blob, {
    name,
    extension: 'drawnix',
    description: 'Drawnix file',
    fileHandle: existingFileHandle,
  });
  return { fileHandle, serialized: serializedForSave };
};

export const loadFromJSON = async (board: PlaitBoard) => {
  const file = await fileOpen({
    description: 'Drawnix files',
    // ToDo: Be over-permissive until https://bugs.webkit.org/show_bug.cgi?id=34442
    // gets resolved. Else, iOS users cannot open `.drawnix` files.
    // extensions: ["json", "drawnix", "png", "svg"],
  });
  const fileHandle = (file as FileWithHandle).handle || null;
  const data = await loadFromBlob(board, await normalizeFile(file));
  return { data, fileHandle };
};

export const isValidDrawnixData = (data?: any): data is DrawnixExportedData => {
  return (
    data &&
    data.type === DrawnixExportedType.drawnix &&
    Array.isArray(data.elements) &&
    typeof data.viewport === 'object'
  );
};

export const serializeAsJSON = (board: PlaitBoard): string => {
  const data = {
    type: DrawnixExportedType.drawnix,
    version: VERSIONS.drawnix,
    source: 'web',
    elements: board.children,
    viewport: board.viewport,
    theme: board.theme,
  };

  return JSON.stringify(data, null, 2);
};
