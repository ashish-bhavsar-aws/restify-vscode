/**
 * Thin wrapper around FontAwesomeIcon.
 * Renders inline SVGs — no font files needed, safe under VS Code's strict CSP.
 */
import React from 'react';
import styled from 'styled-components';
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
  faKey,
  faClock,
  faArrowsRotate,
  faShieldHalved,
} from '@fortawesome/free-solid-svg-icons';
import type { IconProp } from '@fortawesome/fontawesome-svg-core';

library.add(
  faMagnifyingGlass, faXmark, faPen, faFileExport, faFileImport, faCopy,
  faGripVertical, faFolder, faAnglesDown, faAnglesUp, faFloppyDisk,
  faPaperPlane, faTerminal, faClipboardList, faList, faLink, faFileCode,
  faDownload, faTriangleExclamation, faCode, faPlus, faChevronRight,
  faTrash, faChevronDown, faUpload, faArrowUp, faBars, faEye, faEyeSlash,
  faKey, faClock, faArrowsRotate, faShieldHalved
);

export type { IconProp };
export {
  FontAwesomeIcon,
  faEye,
  faEyeSlash,
  faCode,
  faTrash,
  faChevronDown,
  faUpload,
  faArrowUp,
  faBars,
  faKey,
  faClock,
  faArrowsRotate,
  faShieldHalved,
  faList,
  faLink,
  faTerminal,
  faFileCode,
};

const IconWrapper = styled.span<{ $size?: number }>`
  display: inline-flex;
  align-items: center;
  font-size: ${({ $size = 14 }) => $size}px;
  vertical-align: middle;
`;

/** Convenience alias with sensible size default */
export const Icon: React.FC<{
  icon: IconProp;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  fixedWidth?: boolean;
}> = ({ icon, size = 14, className, style, fixedWidth }) => (
  <IconWrapper $size={size} className={className} style={style}>
    <FontAwesomeIcon icon={icon} fixedWidth={fixedWidth ?? true} />
  </IconWrapper>
);

export default Icon;
