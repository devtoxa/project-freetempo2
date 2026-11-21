import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..'
);

const sourceDir = path.join(
    projectRoot,
    'node_modules',
    '@spotify',
    'basic-pitch',
    'model'
);
const targetDir = path.join(projectRoot, 'public', 'model');

if (!existsSync(sourceDir)) {
    console.error(
        '[basic-pitch] model assets not found. Run "npm install" first.'
    );
    process.exit(1);
}

mkdirSync(targetDir, { recursive: true });
cpSync(sourceDir, targetDir, { recursive: true });

console.log(`[basic-pitch] model assets copied to ${targetDir}`);
