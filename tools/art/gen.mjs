// Gemini paveikslėlio generavimas su nuorodų paveikslėliais (personažų nuoseklumui).
// node --env-file=<kelias į .env.local su GEMINI_API_KEY> tools/art/gen.mjs <out.png> "<prompt>" [aspect=1:1] [ref1.png ref2.png ...]
// Raktas tik iš aplinkos (niekada į kodą/git). Žali rezultatai -> tools/art/raw/ (ignoruojama git).
import fs from 'fs';
const [out, prompt, aspect = '1:1', ...refs] = process.argv.slice(2);
const key = process.env.GEMINI_API_KEY;
if (!key) { console.error('nėra GEMINI_API_KEY (naudok --env-file)'); process.exit(1); }
const model = process.env.MODEL || 'gemini-3-pro-image';
const mime = f => f.endsWith('.webp') ? 'image/webp' : f.endsWith('.jpg') ? 'image/jpeg' : 'image/png';
const parts = [...refs.map(f => ({ inlineData: { mimeType: mime(f), data: fs.readFileSync(f).toString('base64') } })), { text: prompt }];
const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
  body: JSON.stringify({ contents: [{ parts }],
    generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: aspect, imageSize: process.env.SIZE || '2K' } } })
});
const j = await r.json();
const img = j.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
if (!img) { console.error(r.status, JSON.stringify(j).slice(0, 600)); process.exit(1); }
fs.writeFileSync(out, Buffer.from(img.inlineData.data, 'base64'));
console.log('ok', out, j.usageMetadata ? JSON.stringify(j.usageMetadata) : '');
