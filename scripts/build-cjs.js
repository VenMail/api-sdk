#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const esmPath = join(__dirname, '../dist/index.js');
const cjsPath = join(__dirname, '../dist/index.cjs');

let content = readFileSync(esmPath, 'utf8');

// Convert ESM to CommonJS
content = content
  .replace(/export\s+const/g, 'const')
  .replace(/export\s+function/g, 'const')
  .replace(/export\s+{/g, 'const {')
  .replace(/export\s+type/g, '// export type')
  .replace(/import\s+.*from\s+['"][^'"]*['"];?/g, '')
  .replace(/import\s+type\s+.*from\s+['"][^'"]*['"];?/g, '')
  .replace(/export\s+\*\s+from\s+['"][^'"]*['"];?/g, '// export * from')
  .replace(/export\s+{[^}]+}\s+from\s+['"][^'"]*['"];?/g, '// export {} from')
  .replace(/export\s+default/g, 'module.exports =')
  .replace(/export\s+{([^}]+)}/g, (match, exports) => {
    const exportList = exports.split(',').map(e => e.trim());
    const assignments = exportList.map(exp => {
      const [name, as] = exp.split(' as ').map(s => s.trim());
      return `module.exports.${as || name} = ${name};`;
    }).join('\n');
    return assignments;
  });

// Add CommonJS require for crypto and express
content = `const crypto = require('crypto');\n` + content;

writeFileSync(cjsPath, content);
console.log('CommonJS build completed');
