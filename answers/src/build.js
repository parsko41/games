// Builds answers/index.html from index.src.html + clues.txt + finals.txt. Run: node answers/src/build.js
const fs = require('fs'), d = __dirname;
const data = fs.readFileSync(d + '/clues.txt', 'utf8') + fs.readFileSync(d + '/finals.txt', 'utf8');
if (/`/.test(data)) throw new Error('backtick in clue data');
const s = fs.readFileSync(d + '/index.src.html', 'utf8')
  .replace('/*CLUES*/', () => fs.readFileSync(d + '/clues.txt', 'utf8').trim())
  .replace('/*FINALS*/', () => fs.readFileSync(d + '/finals.txt', 'utf8').trim());
fs.writeFileSync(d + '/../index.html', s);
console.log('answers/index.html built');
