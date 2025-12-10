import fs from 'fs';
import path from 'path';
import { createRequire } from "module";
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const pdfLib = require("pdf-parse");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pdfDir = path.join(__dirname, 'src/pdf');
const outputFile = path.join(__dirname, 'pdf_content_dump.txt');

async function extract() {
    try {
        console.log('Type of pdfLib:', typeof pdfLib);
        console.log('pdfLib keys:', Object.keys(pdfLib));

        const files = fs.readdirSync(pdfDir).filter(f => f.endsWith('.pdf'));
        let combinedText = "";

        console.log(`Found ${files.length} PDFs.`);

        // Use the correct function
        const parsePdf = typeof pdfLib === 'function' ? pdfLib : pdfLib.default;

        if (typeof parsePdf !== 'function') {
            console.error("Could not find PDF parse function");
            return;
        }

        for (const file of files) {
            console.log(`Processing ${file}...`);
            const dataBuffer = fs.readFileSync(path.join(pdfDir, file));
            try {
                const data = await parsePdf(dataBuffer);
                combinedText += `\n\n=== FILE: ${file} ===\n\n`;
                combinedText += data.text;
            } catch (e) {
                console.error(`Error parsing ${file}:`, e.message);
            }
        }

        fs.writeFileSync(outputFile, combinedText);
        console.log('Done. Output to pdf_content_dump.txt');
    } catch (err) {
        console.error("Error:", err);
    }
}

extract();
