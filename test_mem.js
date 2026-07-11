import fs from 'fs';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';

function printMem(label) {
  const mem = process.memoryUsage();
  console.log(`${label}: RSS=${Math.round(mem.rss/1024/1024)}MB Heap=${Math.round(mem.heapUsed/1024/1024)}MB`);
}

async function run() {
  printMem('Start');
  const buffer = fs.readFileSync('/Users/francium/Desktop/HPARC-software-development-agreement-2.pdf');
  const data = new Uint8Array(buffer);
  
  printMem('After read');
  
  const loadingTask = pdfjsLib.getDocument({ data });
  const pdf = await loadingTask.promise;
  const pageCount = pdf.numPages;
  printMem(`After pdfjs load (${pageCount} pages)`);
  
  let canvas = null;
  let ctx = null;
  const scale = 300 / 72; // DPI 150
  let images = [];
  
  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    if (!canvas) {
      canvas = createCanvas(viewport.width, viewport.height);
      ctx = canvas.getContext('2d');
    } else {
      canvas.width = viewport.width;
      canvas.height = viewport.height;
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, viewport.width, viewport.height);
    await page.render({ canvasContext: ctx, viewport, background: '#ffffff' }).promise;
    
    images.push(canvas.toBuffer('image/jpeg', { quality: 0.8 }).toString('base64'));
    page.cleanup();
    printMem(`After page ${i}`);
  }
  
  pdf.destroy?.();
  printMem('Done');
}

run();
