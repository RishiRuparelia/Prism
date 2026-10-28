import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { prismNavigation } from './prism-navigation.mjs';
const svg=readFileSync('public/favicon.svg');
const png=await sharp(svg).resize(32,32).png().toBuffer();
writeFileSync('public/favicon.png',png);
const ico=Buffer.alloc(22);ico.writeUInt16LE(1,2);ico.writeUInt16LE(1,4);ico[6]=32;ico[7]=32;ico.writeUInt16LE(1,10);ico.writeUInt16LE(32,12);ico.writeUInt32LE(png.length,14);ico.writeUInt32LE(22,18);
writeFileSync('public/favicon.ico',Buffer.concat([ico,png]));
await sharp(svg).resize(180,180).png().toFile('public/apple-touch-icon.png');
const icons='<link rel="alternate icon" href="/favicon.ico?v=2" sizes="any"><link rel="icon" type="image/svg+xml" href="/favicon.svg?v=2"><link rel="apple-touch-icon" href="/apple-touch-icon.png">';
const chatSvg=readFileSync('public/chat-icon.svg');
const chatPng=await sharp(chatSvg).resize(32,32).png().toBuffer();
const chatIco=Buffer.from(ico);chatIco.writeUInt32LE(chatPng.length,14);
writeFileSync('public/chat-icon.ico',Buffer.concat([chatIco,chatPng]));
const chatIcons='<link rel="alternate icon" href="/chat-icon.ico?v=3" sizes="any"><link rel="icon" type="image/svg+xml" href="/chat-icon.svg?v=3">';
for(const name of readdirSync('public/prism').filter(n=>n.endsWith('.html'))){
 const file=path.join('public/prism',name);let html=readFileSync(file,'utf8');
 html=html.replace(/<link\b(?=[^>]*\brel=["'](?:icon|shortcut icon|alternate icon|apple-touch-icon)["'])[^>]*>/gi,'');
 html=html.replace('</head>',(name==='chat.html'?chatIcons:icons)+'</head>');
 html=prismNavigation(html);
 writeFileSync(file,html);
}
console.log('Shared Prism SVG/ICO/PNG icons applied to every page.');
