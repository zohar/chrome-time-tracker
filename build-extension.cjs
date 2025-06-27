#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Build directory for the clean extension
const buildDir = 'extension-build';
const sourceDir = '.';

// Files and directories to include in the extension package
const extensionFiles = [
  'manifest.json',
  'background.js',
  'popup.html',
  'popup.js',
  'popup.css',
  'options.html',
  'options.js',
  'options.css'
];

// Icon files to include (from icons directory)
const iconFiles = [
  'icon-16.png',
  'icon-32.png',
  'icon-48.png',
  'icon-128.png',
  'logo.png',
  'help.svg',
  'play.svg'
];

function copyFile(src, dest) {
  const destDir = path.dirname(dest);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  fs.copyFileSync(src, dest);
  console.log(`Copied: ${src} -> ${dest}`);
}

function buildExtension() {
  console.log('🔨 Building Chrome Extension Package...\n');

  // Clean and create build directory
  if (fs.existsSync(buildDir)) {
    fs.rmSync(buildDir, { recursive: true });
  }
  fs.mkdirSync(buildDir);

  // Copy main extension files
  console.log('📋 Copying main extension files:');
  extensionFiles.forEach(file => {
    const srcPath = path.join(sourceDir, file);
    const destPath = path.join(buildDir, file);
    
    if (fs.existsSync(srcPath)) {
      copyFile(srcPath, destPath);
    } else {
      console.warn(`⚠️  Warning: ${file} not found`);
    }
  });

  // Copy icon files
  console.log('\n🎨 Copying icon files:');
  const iconsDir = path.join(buildDir, 'icons');
  fs.mkdirSync(iconsDir);
  
  iconFiles.forEach(iconFile => {
    const srcPath = path.join(sourceDir, 'icons', iconFile);
    const destPath = path.join(iconsDir, iconFile);
    
    if (fs.existsSync(srcPath)) {
      copyFile(srcPath, destPath);
    } else {
      console.warn(`⚠️  Warning: icons/${iconFile} not found`);
    }
  });

  // Calculate and display size information
  console.log('\n📊 Package Size Analysis:');
  const getDirectorySize = (dirPath) => {
    let totalSize = 0;
    const files = fs.readdirSync(dirPath);
    
    files.forEach(file => {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);
      
      if (stats.isDirectory()) {
        totalSize += getDirectorySize(filePath);
      } else {
        totalSize += stats.size;
      }
    });
    
    return totalSize;
  };

  const buildSize = getDirectorySize(buildDir);
  const buildSizeKB = Math.round(buildSize / 1024);
  const buildSizeMB = (buildSize / (1024 * 1024)).toFixed(2);

  console.log(`📦 Extension package size: ${buildSizeKB} KB (${buildSizeMB} MB)`);
  console.log(`📂 Package location: ${path.resolve(buildDir)}`);
  
  console.log('\n✅ Extension package built successfully!');
  console.log(`\n🚀 To install:`);
  console.log(`1. Open Chrome and go to chrome://extensions/`);
  console.log(`2. Enable "Developer mode"`);
  console.log(`3. Click "Load unpacked" and select the "${buildDir}" folder`);
}

// Run the build
try {
  buildExtension();
} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
}