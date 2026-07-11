import fs from 'fs';
import { convertPdfToImages } from './src/services/pdf.service.js';

async function test() {
  console.log('Reading PDF...');
  const buffer = fs.readFileSync('/Users/francium/Desktop/HPARC-software-development-agreement-2.pdf');
  console.log(`Buffer size: ${buffer.length} bytes`);
  console.log('Converting...');
  const start = Date.now();
  try {
    const { images, pageCount } = await convertPdfToImages(buffer);
    console.log(`Done! Took ${Date.now() - start} ms`);
    console.log(`Pages: ${pageCount}, Images size: ${images.length}`);
  } catch (err) {
    console.error('Error:', err);
  }
}

test();
