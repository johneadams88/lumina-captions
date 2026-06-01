/**
 * @license
 * SPDX-License-Identifier: MIT
 */

export interface Caption {
  id: string;
  start: number;
  end: number;
  text: string;
  words?: { text: string; start: number; end: number }[];
}

export interface CaptionStyle {
  fontSize: number;
  fontFamily: string;
  color: string;
  backgroundColor: string;
  position: 'top' | 'middle' | 'bottom';
  uppercase: boolean;
  bold: boolean;
  displayMode: 'sentence' | 'word';
  highlightColor: string;
  borderRadius: number;
}

export const FONT_OPTIONS = [
  { label: 'Sans (Inter)', value: 'Inter, sans-serif' },
  { label: 'Mono (JetBrains)', value: '"JetBrains Mono", monospace' },
  { label: 'Display (Grotesk)', value: '"Space Grotesk", sans-serif' },
  { label: 'Serif (Playfair)', value: '"Playfair Display", serif' },
  { label: 'Display (Oswald)', value: '"Oswald", sans-serif' },
  { label: 'Marker', value: '"Permanent Marker", cursive' },
  { label: 'Russo', value: '"Russo One", sans-serif' },
];

export const PRESETS: Record<string, CaptionStyle> = {
  modern: {
    fontSize: 65,
    fontFamily: 'Inter, sans-serif',
    color: '#ffffff',
    backgroundColor: 'rgba(0,0,0,0.5)',
    position: 'bottom',
    uppercase: true,
    bold: true,
    displayMode: 'sentence',
    highlightColor: '#ffff00',
    borderRadius: 16,
  },
  minimal: {
    fontSize: 54,
    fontFamily: 'Inter, sans-serif',
    color: '#ffffff',
    backgroundColor: 'transparent',
    position: 'bottom',
    uppercase: false,
    bold: false,
    displayMode: 'sentence',
    highlightColor: '',
    borderRadius: 8,
  },
  karaoke: {
    fontSize: 72,
    fontFamily: '"Space Grotesk", sans-serif',
    color: 'rgba(255,255,255,0.4)',
    backgroundColor: 'transparent',
    position: 'middle',
    uppercase: true,
    bold: true,
    displayMode: 'sentence',
    highlightColor: '#ffff00',
    borderRadius: 8,
  },
  flash: {
    fontSize: 60,
    fontFamily: '"Space Grotesk", sans-serif',
    color: '#ffffff',
    backgroundColor: 'rgba(0,0,0,1)',
    position: 'middle',
    uppercase: true,
    bold: true,
    displayMode: 'word',
    highlightColor: '',
    borderRadius: 24,
  },
  bold: {
    fontSize: 60,
    fontFamily: '"Space Grotesk", sans-serif',
    color: '#ffff00',
    backgroundColor: 'rgba(0,0,0,1)',
    position: 'top',
    uppercase: true,
    bold: true,
    displayMode: 'sentence',
    highlightColor: '',
    borderRadius: 12,
  },
};
