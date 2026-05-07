/**
 * Thin wrapper around FontAwesomeIcon.
 * Renders inline SVGs — no font files needed, safe under VS Code's strict CSP.
 */
import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { library } from '@fortawesome/fontawesome-svg-core';
import {
  faMagnifyingGlass,
  faXmark,
  faPen,
  faFileExport,
  faFileImport,
  faCopy,
  faGripVertical,
  faFolder,
  faAnglesDown,
  faAnglesUp,
  faFloppyDisk,
  faPaperPlane,
  faTerminal,
  faClipboardList,
  faList,
  faLink,
  faFileCode,
  faDownload,
  faTriangleExclamation,
  faCode,
  faPlus,
  faChevronRight,
  faTrash,
  faChevronDown,
  faUpload,
  faArrowUp,
  faBars,
  faEye,
  faEyeSlash,
} from '@fortawesome/free-solid-svg-icons';
import type { IconProp } from '@fortawesome/fontawesome-svg-core';

library.add(
  faMagnifyingGlass, faXmark, faPen, faFileExport, faFileImport, faCopy,
  faGripVertical, faFolder, faAnglesDown, faAnglesUp, faFloppyDisk,
  faPaperPlane, faTerminal, faClipboardList, faList, faLink, faFileCode,
  faDownload, faTriangleExclamation, faCode, faPlus, faChevronRight,
  faTrash, faChevronDown, faUpload, faArrowUp, faBars, faEye, faEyeSlash
);

export type { IconProp };
export { FontAwesomeIcon, faEye, faEyeSlash };

/** Convenience alias with sensible size default */
export const Icon: React.FC<{
  icon: IconProp;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  fixedWidth?: boolean;
}> = ({ icon, size = 14, className, style, fixedWidth }) => (
  <FontAwesomeIcon
    icon={icon}
    fixedWidth={fixedWidth ?? true}
    style={{ fontSize: size, verticalAlign: 'middle', ...style }}
    className={className}
  />
);

export default Icon;
