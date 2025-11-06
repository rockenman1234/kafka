#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Directories to scan
const VIDS_DIR = path.join(__dirname, 'vids');
const BACKGROUND_DIR = path.join(__dirname, 'background');
const OUTPUT_FILE = path.join(__dirname, 'media-manifest.json');

// Supported file extensions
const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.ogg', '.mov'];
const IMAGE_EXTENSIONS = ['.gif', '.png', '.jpg', '.jpeg'];

/**
 * Get all files from a directory that match the given extensions
 */
function getFilesFromDirectory(dir, extensions) {
    if (!fs.existsSync(dir)) {
        console.warn(`Warning: Directory ${dir} does not exist`);
        return [];
    }

    const files = fs.readdirSync(dir);
    return files
        .filter(file => {
            const ext = path.extname(file).toLowerCase();
            return extensions.includes(ext);
        })
        .map(file => path.join(path.basename(dir), file).replace(/\\/g, '/')) // Normalize path separators
        .sort(); // Sort for consistent ordering
}

/**
 * Generate the manifest file
 */
function generateManifest() {
    const manifest = {
        generatedAt: new Date().toISOString(),
        videos: getFilesFromDirectory(VIDS_DIR, VIDEO_EXTENSIONS),
        backgrounds: getFilesFromDirectory(BACKGROUND_DIR, IMAGE_EXTENSIONS)
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(manifest, null, 2));
    
    console.log('✓ Media manifest generated successfully!');
    console.log(`  - Videos found: ${manifest.videos.length}`);
    console.log(`  - Backgrounds found: ${manifest.backgrounds.length}`);
    console.log(`  - Output file: ${OUTPUT_FILE}`);
    
    return manifest;
}

// Run if called directly
if (require.main === module) {
    generateManifest();
}

module.exports = { generateManifest };
