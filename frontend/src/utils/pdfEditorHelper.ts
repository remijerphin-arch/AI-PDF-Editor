import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist';

// Set up PDF.js worker using CDN to avoid Next.js bundling issues
// The version should match what was installed. 
// We will set the worker source dynamically in page load, or use cdnjs:
const PDFJS_VERSION = '4.2.87'; // fallback standard version
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.370/pdf.worker.min.mjs`;

export interface PDFMetadata {
  title: string;
  author: string;
  pages: number;
}

export interface DetailedTextElement {
  text: string;
  bbox: [number, number, number, number]; // [x0, y0, x1, y1] (relative to top-left)
  font: string;
  size: number;
  color: number;
}

export interface PageLayoutData {
  page: number;
  width: number;
  height: number;
  elements: DetailedTextElement[];
}

export class ClientPDFEditor {
  /**
   * Load and parse a PDF file on the client side using pdfjs-dist.
   * Returns metadata and layout text structure.
   */
  static async parsePDF(file: File): Promise<{ metadata: PDFMetadata; pages: PageLayoutData[] }> {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    
    const numPages = pdf.numPages;
    const pages: PageLayoutData[] = [];
    
    // Extract metadata
    const metadataInfo = await pdf.getMetadata();
    const title = (metadataInfo.info as any)?.Title || file.name;
    const author = (metadataInfo.info as any)?.Author || 'Unknown';
    
    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.0 });
      const textContent = await page.getTextContent();
      
      const elements: DetailedTextElement[] = textContent.items.map((item: any) => {
        // pdf.js text positions are [scaleX, skewY, skewX, scaleY, transformX, transformY]
        // Transform coordinates to be relative to top-left origin (standard HTML Canvas)
        const tx = item.transform;
        const width = item.width;
        const height = item.height;
        
        const x0 = tx[4];
        const y0 = viewport.height - tx[5] - height;
        const x1 = x0 + width;
        const y1 = y0 + height;
        
        return {
          text: item.str,
          bbox: [x0, y0, x1, y1],
          font: item.fontName || 'Helvetica',
          size: item.height || 10,
          color: 0,
        };
      });
      
      pages.push({
        page: i,
        width: viewport.width,
        height: viewport.height,
        elements,
      });
    }
    
    return {
      metadata: { title, author, pages: numPages },
      pages,
    };
  }

  /**
   * Apply page structural operations (rotate, delete, duplicate) completely client-side.
   */
  static async applyPageOperations(
    arrayBuffer: ArrayBuffer,
    operations: { type: string; page: number; angle?: number; newOrder?: number[] }[]
  ): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    
    // We process page modifications
    // Create a new document to map pages
    const newPdfDoc = await PDFDocument.create();
    const originalPages = pdfDoc.getPages();
    const pageCount = originalPages.length;
    
    let targetIndices: number[] = Array.from({ length: pageCount }, (_, i) => i);
    
    // Process reorders first if any
    const reorderOp = operations.find(o => o.type === 'reorder');
    if (reorderOp && reorderOp.newOrder) {
      targetIndices = reorderOp.newOrder.map(p => p - 1);
    }
    
    // Process duplicates and deletes
    const tempIndices: number[] = [...targetIndices];
    for (const op of operations) {
      if (op.type === 'delete') {
        const idx = op.page - 1;
        const pos = tempIndices.indexOf(idx);
        if (pos > -1) {
          tempIndices.splice(pos, 1);
        }
      } else if (op.type === 'duplicate') {
        const idx = op.page - 1;
        const pos = tempIndices.indexOf(idx);
        if (pos > -1) {
          tempIndices.splice(pos + 1, 0, idx);
        }
      }
    }
    
    // Copy pages to new document
    const copiedPages = await newPdfDoc.copyPages(pdfDoc, tempIndices);
    copiedPages.forEach(page => newPdfDoc.addPage(page));
    
    // Apply rotations on new document pages
    const finalPages = newPdfDoc.getPages();
    for (const op of operations) {
      if (op.type === 'rotate' && op.angle) {
        // Map original 1-indexed page index to the position in final pages
        // For simplicity, apply to the page currently at 1-indexed index
        const pIdx = op.page - 1;
        if (pIdx >= 0 && pIdx < finalPages.length) {
          const page = finalPages[pIdx];
          const currRotation = page.getRotation().angle;
          page.setRotation(degrees((currRotation + op.angle) % 360));
        }
      }
    }
    
    return await newPdfDoc.save();
  }

  /**
   * Apply text edits (find & replace) by covering original text with a white rectangle
   * and drawing new text on top.
   */
  static async applyTextReplacements(
    arrayBuffer: ArrayBuffer,
    replacements: { page: number; find: string; replace: string; bbox?: [number, number, number, number] }[],
    layoutData: PageLayoutData[]
  ): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    const pages = pdfDoc.getPages();
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    
    for (const rep of replacements) {
      const pIdx = rep.page - 1;
      if (pIdx < 0 || pIdx >= pages.length) continue;
      
      const page = pages[pIdx];
      const pageHeight = page.getHeight();
      
      // If we have bounding boxes provided by the backend / frontend search
      let bbox = rep.bbox;
      
      if (!bbox) {
        // Find coordinates of target text in our client-side parsed layout data
        const pageLayout = layoutData.find(l => l.page === rep.page);
        if (pageLayout) {
          const element = pageLayout.elements.find(
            e => e.text.toLowerCase().includes(rep.find.toLowerCase())
          );
          if (element) {
            bbox = element.bbox;
          }
        }
      }
      
      if (bbox) {
        const [x0, y0, x1, y1] = bbox;
        const width = x1 - x0;
        const height = y1 - y0;
        
        // pdf-lib origin is bottom-left, while our layout data is top-left
        const pdfY = pageHeight - y1;
        
        // Draw white rectangle to redact original text
        page.drawRectangle({
          x: x0,
          y: pdfY,
          width: width + 2,
          height: height + 2,
          color: rgb(1, 1, 1), // White
        });
        
        // Draw replacement text on top
        page.drawText(rep.replace, {
          x: x0,
          y: pdfY + (height * 0.15), // Adjust baseline offset
          size: height * 0.75, // Adjust size
          font: helveticaFont,
          color: rgb(0, 0, 0), // Black
        });
      }
    }
    
    return await pdfDoc.save();
  }

  /**
   * Burn fabric.js canvas text overlay layers and drawing overlays back onto the PDF.
   */
  static async compileCanvasOverlays(
    arrayBuffer: ArrayBuffer,
    canvasDataByPage: Record<number, any[]> // 1-indexed page mapped to list of fabric object details
  ): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    const pages = pdfDoc.getPages();
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    
    for (const pageStr of Object.keys(canvasDataByPage)) {
      const pageNum = parseInt(pageStr);
      const pIdx = pageNum - 1;
      if (pIdx < 0 || pIdx >= pages.length) continue;
      
      const page = pages[pIdx];
      const pageHeight = page.getHeight();
      const objects = canvasDataByPage[pageNum];
      
      for (const obj of objects) {
        // Convert canvas coordinates (top-left origin) to PDF coordinates (bottom-left origin)
        if (obj.type === 'textbox' || obj.type === 'text' || obj.type === 'i-text') {
          const pdfY = pageHeight - obj.top - obj.height;
          page.drawText(obj.text, {
            x: obj.left,
            y: pdfY + (obj.height * 0.15),
            size: obj.fontSize || 16,
            font: helveticaFont,
            color: this.hexToRgb(obj.fill || '#000000'),
            opacity: obj.opacity || 1,
          });
        } else if (obj.type === 'rect') {
          const pdfY = pageHeight - obj.top - obj.height;
          page.drawRectangle({
            x: obj.left,
            y: pdfY,
            width: obj.width * (obj.scaleX || 1),
            height: obj.height * (obj.scaleY || 1),
            color: this.hexToRgb(obj.fill || '#000000'),
            opacity: obj.opacity || 1,
            borderColor: this.hexToRgb(obj.stroke || '#000000'),
            borderWidth: obj.strokeWidth || 0,
          });
        } else if (obj.type === 'circle') {
          const radius = obj.radius * (obj.scaleX || 1);
          // center of circle
          const pdfY = pageHeight - obj.top - radius;
          page.drawCircle({
            x: obj.left + radius,
            y: pdfY,
            size: radius,
            color: this.hexToRgb(obj.fill || '#000000'),
            opacity: obj.opacity || 1,
          });
        }
      }
    }
    
    return await pdfDoc.save();
  }

  private static hexToRgb(hex: string) {
    // Normalizes shorthand hex e.g. #333 to #333333
    let shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    let fullHex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
    
    let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
    if (result) {
      return rgb(
        parseInt(result[1], 16) / 255,
        parseInt(result[2], 16) / 255,
        parseInt(result[3], 16) / 255
      );
    }
    return rgb(0, 0, 0);
  }
}
