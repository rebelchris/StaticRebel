// Marketplace - Plugin Registry for StaticRebel
import fs from 'fs';
import path from 'path';
import https from 'https';
import { spawn } from 'child_process';
import { loadConfig, resolvePath } from '../configManager.js';
import { installSkill, uninstallSkill, listSkills, loadSkill } from '../skillsManager.js';

const MARKETPLACE_DIR = resolvePath('~/.static-rebel/marketplace');
const CACHE_DIR = path.join(MARKETPLACE_DIR, 'cache');
const REGISTRY_FILE = path.join(MARKETPLACE_DIR, 'registry.json');
const INSTALLED_FILE = path.join(MARKETPLACE_DIR, 'installed.json');

// Default registry URLs
const DEFAULT_REGISTRIES = [
  {
    name: 'official',
    url: 'https://raw.githubusercontent.com/static-rebel/skill-registry/main/registry.json',
    enabled: true
  },
  {
    name: 'github-releases',
    url: 'https://api.github.com/repos/static-rebel/skill-packs/releases',
    type: 'github',
    enabled: true
  }
];

/**
 * StaticRebel.json Manifest Schema
 */
export const MANIFEST_SCHEMA = {
  name: 'string', // required
  version: 'string', // required, semver
  description: 'string', // required
  author: 'string', // required
  license: 'string', // optional
  keywords: 'array', // optional
  homepage: 'string', // optional
  repository: 'string', // optional
  dependencies: 'object', // optional, other skill packs
  engines: 'object', // optional, StaticRebel version constraints
  skills: 'array', // required, list of skills in this pack
  triggers: 'object', // optional, global triggers
  prompts: 'object', // optional, global prompts
  config: 'object', // optional, configuration schema
  scripts: 'object', // optional, lifecycle scripts
  files: 'array' // optional, files to include
};

/**
 * Initialize marketplace system
 */
export function initMarketplace() {
  if (!fs.existsSync(MARKETPLACE_DIR)) {
    fs.mkdirSync(MARKETPLACE_DIR, { recursive: true });
  }
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
  if (!fs.existsSync(REGISTRY_FILE)) {
    saveRegistry({ registries: DEFAULT_REGISTRIES, packages: {} });
  }
  if (!fs.existsSync(INSTALLED_FILE)) {
    saveInstalled({});
  }
}

/**
 * Load local registry cache
 */
export function loadRegistry() {
  try {
    return JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf-8'));
  } catch {
    return { registries: DEFAULT_REGISTRIES, packages: {} };
  }
}

/**
 * Save local registry cache
 */
export function saveRegistry(registry) {
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2));
}

/**
 * Load installed packages info
 */
export function loadInstalled() {
  try {
    return JSON.parse(fs.readFileSync(INSTALLED_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

/**
 * Save installed packages info
 */
export function saveInstalled(installed) {
  fs.writeFileSync(INSTALLED_FILE, JSON.stringify(installed, null, 2));
}

/**
 * Validate staticrebel.json manifest
 */
export function validateManifest(manifest) {
  const errors = [];
  
  // Required fields
  if (!manifest.name || typeof manifest.name !== 'string') {
    errors.push('Missing or invalid "name" field');
  }
  if (!manifest.version || typeof manifest.version !== 'string') {
    errors.push('Missing or invalid "version" field');
  }
  if (!manifest.description || typeof manifest.description !== 'string') {
    errors.push('Missing or invalid "description" field');
  }
  if (!manifest.author || typeof manifest.author !== 'string') {
    errors.push('Missing or invalid "author" field');
  }
  if (!manifest.skills || !Array.isArray(manifest.skills)) {
    errors.push('Missing or invalid "skills" field (must be array)');
  }

  // Validate version format (simple semver check)
  if (manifest.version && !/^\d+\.\d+\.\d+/.test(manifest.version)) {
    errors.push('Invalid version format (expected semver: x.y.z)');
  }

  // Validate skills array
  if (manifest.skills) {
    manifest.skills.forEach((skill, index) => {
      if (typeof skill !== 'object') {
        errors.push(`Invalid skill at index ${index} (must be object)`);
      } else {
        if (!skill.name) errors.push(`Skill at index ${index} missing "name"`);
        if (!skill.path) errors.push(`Skill at index ${index} missing "path"`);
      }
    });
  }

  // Validate dependencies
  if (manifest.dependencies && typeof manifest.dependencies !== 'object') {
    errors.push('Invalid "dependencies" field (must be object)');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Search for packages in registry
 */
export async function searchPackages(query, options = {}) {
  const registry = loadRegistry();
  const results = [];
  
  const searchTerms = query.toLowerCase().split(' ');
  
  Object.entries(registry.packages).forEach(([name, pkg]) => {
    const searchText = [
      name,
      pkg.description || '',
      ...(pkg.keywords || [])
    ].join(' ').toLowerCase();
    
    const relevance = searchTerms.reduce((score, term) => {
      if (searchText.includes(term)) {
        // Higher score for name matches
        if (name.toLowerCase().includes(term)) score += 10;
        else score += 1;
      }
      return score;
    }, 0);
    
    if (relevance > 0) {
      results.push({ ...pkg, name, relevance });
    }
  });
  
  // Sort by relevance, then by name
  results.sort((a, b) => b.relevance - a.relevance || a.name.localeCompare(b.name));
  
  if (options.limit) {
    return results.slice(0, options.limit);
  }
  
  return results;
}

/**
 * Install a skill pack
 */
export async function installPackage(packageName, options = {}) {
  const registry = loadRegistry();
  const installed = loadInstalled();
  
  // Check if already installed
  if (installed[packageName] && !options.force) {
    return {
      success: false,
      error: `Package "${packageName}" is already installed. Use --force to reinstall.`
    };
  }
  
  // Find package in registry
  const pkg = registry.packages[packageName];
  if (!pkg) {
    return {
      success: false,
      error: `Package "${packageName}" not found in registry. Try "sr search ${packageName}"`
    };
  }
  
  try {
    // Download and extract package
    const downloadResult = await downloadPackage(pkg, packageName);
    if (!downloadResult.success) {
      return downloadResult;
    }
    
    const extractPath = downloadResult.path;
    
    // Load and validate manifest
    const manifestPath = path.join(extractPath, 'staticrebel.json');
    if (!fs.existsSync(manifestPath)) {
      return {
        success: false,
        error: `Package "${packageName}" is missing staticrebel.json manifest`
      };
    }
    
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const validation = validateManifest(manifest);
    if (!validation.valid) {
      return {
        success: false,
        error: `Invalid manifest: ${validation.errors.join(', ')}`
      };
    }
    
    // Check dependencies
    const depResult = await resolveDependencies(manifest.dependencies || {});
    if (!depResult.success) {
      return depResult;
    }
    
    // Install individual skills
    const skillResults = [];
    for (const skill of manifest.skills) {
      const skillPath = path.join(extractPath, skill.path);
      if (!fs.existsSync(skillPath)) {
        return {
          success: false,
          error: `Skill "${skill.name}" not found at path "${skill.path}"`
        };
      }
      
      const result = installSkill(skillPath, skill.name);
      if (!result.success) {
        return {
          success: false,
          error: `Failed to install skill "${skill.name}": ${result.error}`
        };
      }
      skillResults.push(result);
    }
    
    // Update installed registry
    installed[packageName] = {
      name: packageName,
      version: manifest.version,
      manifest,
      installedAt: new Date().toISOString(),
      skills: skillResults.map(r => r.name)
    };
    saveInstalled(installed);
    
    return {
      success: true,
      name: packageName,
      version: manifest.version,
      skillsInstalled: skillResults.length,
      skills: skillResults.map(r => r.name)
    };
    
  } catch (error) {
    return {
      success: false,
      error: `Installation failed: ${error.message}`
    };
  }
}

/**
 * Resolve and install dependencies
 */
async function resolveDependencies(dependencies) {
  const installed = loadInstalled();
  const toInstall = [];
  
  for (const [depName, depVersion] of Object.entries(dependencies)) {
    const installedDep = installed[depName];
    
    if (!installedDep) {
      toInstall.push(depName);
    } else {
      // Simple version check (in real implementation, use semver)
      const installed_version = installedDep.version;
      if (!satisfiesVersion(installed_version, depVersion)) {
        return {
          success: false,
          error: `Dependency conflict: ${depName} requires ${depVersion} but ${installed_version} is installed`
        };
      }
    }
  }
  
  // Install missing dependencies
  for (const depName of toInstall) {
    console.log(`Installing dependency: ${depName}`);
    const result = await installPackage(depName);
    if (!result.success) {
      return {
        success: false,
        error: `Failed to install dependency "${depName}": ${result.error}`
      };
    }
  }
  
  return { success: true };
}

/**
 * Simple version satisfaction check (placeholder for proper semver)
 */
function satisfiesVersion(installed, required) {
  // For now, just do exact match. In real implementation, use semver library
  return installed === required || required === '*';
}

/**
 * Download package from registry
 */
async function downloadPackage(pkg, packageName) {
  const cacheDir = path.join(CACHE_DIR, packageName);
  
  try {
    // For GitHub releases, use git clone or download zip
    if (pkg.repository && pkg.repository.includes('github.com')) {
      return await downloadFromGitHub(pkg, cacheDir);
    }
    
    // For direct URLs, download and extract
    if (pkg.tarball || pkg.zipball) {
      return await downloadFromUrl(pkg.tarball || pkg.zipball, cacheDir);
    }
    
    return {
      success: false,
      error: 'No download URL found for package'
    };
    
  } catch (error) {
    return {
      success: false,
      error: `Download failed: ${error.message}`
    };
  }
}

/**
 * Download from GitHub repository
 */
async function downloadFromGitHub(pkg, cacheDir) {
  return new Promise((resolve, reject) => {
    // Clean cache directory
    if (fs.existsSync(cacheDir)) {
      fs.rmSync(cacheDir, { recursive: true, force: true });
    }
    
    // Clone repository
    const gitUrl = pkg.repository.replace('github.com', 'github.com');
    if (!gitUrl.endsWith('.git')) {
      gitUrl += '.git';
    }
    
    const git = spawn('git', ['clone', gitUrl, cacheDir], {
      stdio: 'inherit'
    });
    
    git.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, path: cacheDir });
      } else {
        reject(new Error(`Git clone failed with code ${code}`));
      }
    });
    
    git.on('error', reject);
  });
}

/**
 * Download from URL (placeholder implementation)
 */
async function downloadFromUrl(url, cacheDir) {
  // This would implement ZIP/TAR download and extraction
  return {
    success: false,
    error: 'URL downloads not yet implemented'
  };
}

/**
 * Uninstall a package
 */
export async function uninstallPackage(packageName) {
  const installed = loadInstalled();
  
  if (!installed[packageName]) {
    return {
      success: false,
      error: `Package "${packageName}" is not installed`
    };
  }
  
  try {
    const pkg = installed[packageName];
    
    // Uninstall individual skills
    for (const skillName of pkg.skills || []) {
      const result = uninstallSkill(skillName);
      if (!result.success) {
        console.warn(`Failed to uninstall skill "${skillName}": ${result.error}`);
      }
    }
    
    // Remove from installed registry
    delete installed[packageName];
    saveInstalled(installed);
    
    // Clean cache
    const cacheDir = path.join(CACHE_DIR, packageName);
    if (fs.existsSync(cacheDir)) {
      fs.rmSync(cacheDir, { recursive: true, force: true });
    }
    
    return {
      success: true,
      name: packageName,
      skillsRemoved: pkg.skills?.length || 0
    };
    
  } catch (error) {
    return {
      success: false,
      error: `Uninstallation failed: ${error.message}`
    };
  }
}

/**
 * List installed packages
 */
export function listInstalled() {
  const installed = loadInstalled();
  return Object.values(installed);
}

/**
 * Update registry from remote sources
 */
export async function updateRegistry() {
  const registry = loadRegistry();
  let updated = false;
  
  for (const source of registry.registries) {
    if (!source.enabled) continue;
    
    try {
      console.log(`Updating from ${source.name}...`);
      
      if (source.type === 'github') {
        // Fetch GitHub releases
        const releases = await fetchGitHubReleases(source.url);
        for (const release of releases) {
          if (release.name) {
            registry.packages[release.name] = release;
            updated = true;
          }
        }
      } else {
        // Fetch standard registry JSON
        const remoteRegistry = await fetchJsonRegistry(source.url);
        Object.assign(registry.packages, remoteRegistry.packages || {});
        updated = true;
      }
      
    } catch (error) {
      console.warn(`Failed to update from ${source.name}: ${error.message}`);
    }
  }
  
  if (updated) {
    registry.lastUpdated = new Date().toISOString();
    saveRegistry(registry);
  }
  
  return { success: updated, packagesCount: Object.keys(registry.packages).length };
}

/**
 * Fetch registry from JSON URL
 */
async function fetchJsonRegistry(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Invalid JSON: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Fetch GitHub releases
 */
async function fetchGitHubReleases(url) {
  const releases = await fetchJsonRegistry(url);
  return releases.map(release => ({
    name: release.name,
    version: release.tag_name,
    description: release.body,
    published_at: release.published_at,
    repository: release.html_url.replace('/releases/tag/' + release.tag_name, ''),
    tarball: release.tarball_url,
    zipball: release.zipball_url
  }));
}

/**
 * Publish package (placeholder)
 */
export async function publishPackage(manifestPath, options = {}) {
  // This would implement package publishing to registry
  // For now, just validate the manifest
  
  if (!fs.existsSync(manifestPath)) {
    return {
      success: false,
      error: 'staticrebel.json not found'
    };
  }
  
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const validation = validateManifest(manifest);
    
    if (!validation.valid) {
      return {
        success: false,
        error: `Invalid manifest: ${validation.errors.join(', ')}`
      };
    }
    
    console.log('✓ Manifest is valid');
    console.log('📦 Publishing not yet implemented');
    console.log('   For now, create a GitHub release with your skill pack');
    
    return {
      success: true,
      message: 'Validation successful. Publishing coming soon!'
    };
    
  } catch (error) {
    return {
      success: false,
      error: `Failed to read manifest: ${error.message}`
    };
  }
}

/**
 * Create a skill pack manifest template
 */
export function createManifest(name, author, description, options = {}) {
  const manifest = {
    name,
    version: '1.0.0',
    description,
    author,
    license: options.license || 'MIT',
    keywords: options.keywords || [],
    skills: options.skills || [],
    engines: {
      'static-rebel': '>=2.0.0'
    }
  };
  
  if (options.homepage) manifest.homepage = options.homepage;
  if (options.repository) manifest.repository = options.repository;
  if (options.dependencies) manifest.dependencies = options.dependencies;
  
  return manifest;
}

/**
 * Get marketplace stats
 */
export function getMarketplaceStats() {
  const registry = loadRegistry();
  const installed = loadInstalled();
  
  return {
    totalPackages: Object.keys(registry.packages).length,
    installedPackages: Object.keys(installed).length,
    lastUpdated: registry.lastUpdated,
    registries: registry.registries.filter(r => r.enabled).length
  };
}