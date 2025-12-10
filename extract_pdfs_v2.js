import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pdfDir = path.join(__dirname, 'src/pdf');
const outputFile = path.join(__dirname, 'pdf_content_dump.txt');

async function extract() {
    try {
        const files = fs.readdirSync(pdfDir).filter(f => f.endsWith('.pdf'));
        let combinedText = "";
        console.log(`Found ${files.length} PDFs`);

        for (const file of files) {
            console.log(`Processing ${file}...`);
            const data = new Uint8Array(fs.readFileSync(path.join(pdfDir, file)));

            // Set up fake worker
            // pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/legacy/build/pdf.worker.mjs'; // Might not work in node without worker_threads setup properly or matching file.
            // Actually, in legacy node, we usually don't need workerSrc if we rely on main thread or it falls back? 
            // Let's just try.

            const loadingTask = pdfjsLib.getDocument(data);
            const doc = await loadingTask.promise;

            let fileText = "";
            for (let i = 1; i <= doc.numPages; i++) {
                const page = await doc.getPage(i);
                const content = await page.getTextContent();
                const strings = content.items.map(function (item) {
                    return item.str;
                });
                fileText += strings.join(' ') + "\n";
            }
            combinedText += `\n\n=== FILE: ${file} ===\n\n${fileText}`;
        }
        fs.writeFileSync(outputFile, combinedText);
        console.log("Done");
    } catch (e) {
        console.error(e);
    }
}
extract();
