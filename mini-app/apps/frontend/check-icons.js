const fs = require('fs');
const path = require('path');
const lucide = require('lucide-react');

function walkDir(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(walkDir(file));
        } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
            results.push(file);
        }
    });
    return results;
}

const srcDir = path.join(process.cwd(), 'src');
const files = walkDir(srcDir);
const imports = new Set();

files.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    const importRegex = /import\s+\{([^}]+)\}\s+from\s+['"]lucide-react['"]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
        match[1].split(',').forEach(item => {
            const name = item.trim().split(/\s+as\s+/)[0].trim();
            if (name && !name.startsWith('type ')) {
                imports.add(name);
            }
        });
    }
});

const missing = Array.from(imports).filter(name => !lucide[name]);
console.log('Missing icons:', missing);
