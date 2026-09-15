declare module 'qrcode-generator' {
  interface QRCode {
    addData(data: string, mode?: string): void;
    make(): void;
    getModuleCount(): number;
    isDark(row: number, col: number): boolean;
    createDataURL(cellSize?: number, margin?: number): string;
    createImgTag(cellSize?: number, margin?: number, alt?: string): string;
    createSvgTag(cellSize?: number, margin?: number): string;
    createSvgTag(opts?: { scalable?: boolean; cellSize?: number; margin?: number; alt?: string }): string;
    renderTo2dContext(context: CanvasRenderingContext2D, cellSize?: number): void;
  }

  type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

  export default function qrcode(typeNumber: number, errorCorrectionLevel: ErrorCorrectionLevel): QRCode;
}
