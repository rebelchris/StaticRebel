// Marketplace CLI Commands
import {
  initMarketplace,
  searchPackages,
  installPackage,
  uninstallPackage,
  listInstalled,
  updateRegistry,
  publishPackage,
  createManifest,
  getMarketplaceStats,
  validateManifest
} from './index.js';
import fs from 'fs';
import path from 'path';

/**
 * Handle marketplace CLI commands
 */
export async function handleMarketplaceCommand(args) {
  const [command, ...rest] = args;

  // Initialize marketplace on first use
  initMarketplace();

  switch (command) {
    case 'install':
      return await handleInstall(rest);
    case 'uninstall':
    case 'remove':
      return await handleUninstall(rest);
    case 'search':
      return await handleSearch(rest);
    case 'list':
      return await handleList(rest);
    case 'update':
      return await handleUpdate(rest);
    case 'publish':
      return await handlePublish(rest);
    case 'init':
      return await handleInit(rest);
    case 'validate':
      return await handleValidate(rest);
    case 'stats':
      return await handleStats(rest);
    case 'help':
      return handleHelp();
    default:
      return `Unknown marketplace command: ${command}\nType 'sr marketplace help' for available commands.`;
  }
}

/**
 * Install a skill pack
 */
async function handleInstall(args) {
  if (args.length === 0) {
    return 'Usage: sr install <package-name> [--force]';
  }

  const packageName = args[0];
  const options = {
    force: args.includes('--force')
  };

  console.log(`Installing ${packageName}...`);
  
  try {
    const result = await installPackage(packageName, options);
    
    if (result.success) {
      return `✅ Successfully installed ${result.name} v${result.version}
📦 Installed ${result.skillsInstalled} skills: ${result.skills.join(', ')}
🎯 Skills are now available for use!`;
    } else {
      return `❌ Installation failed: ${result.error}`;
    }
  } catch (error) {
    return `❌ Installation failed: ${error.message}`;
  }
}

/**
 * Uninstall a skill pack
 */
async function handleUninstall(args) {
  if (args.length === 0) {
    return 'Usage: sr uninstall <package-name>';
  }

  const packageName = args[0];
  
  console.log(`Uninstalling ${packageName}...`);
  
  try {
    const result = await uninstallPackage(packageName);
    
    if (result.success) {
      return `✅ Successfully uninstalled ${result.name}
🗑️ Removed ${result.skillsRemoved} skills`;
    } else {
      return `❌ Uninstallation failed: ${result.error}`;
    }
  } catch (error) {
    return `❌ Uninstallation failed: ${error.message}`;
  }
}

/**
 * Search for skill packs
 */
async function handleSearch(args) {
  if (args.length === 0) {
    return 'Usage: sr search <query>';
  }

  const query = args.join(' ');
  
  try {
    const results = await searchPackages(query, { limit: 10 });
    
    if (results.length === 0) {
      return `No packages found for "${query}"
Try 'sr update' to refresh the registry.`;
    }

    let output = `🔍 Found ${results.length} packages for "${query}":\n\n`;
    
    for (const pkg of results) {
      output += `📦 ${pkg.name} (${pkg.version || 'latest'})\n`;
      output += `   ${pkg.description || 'No description'}\n`;
      if (pkg.keywords && pkg.keywords.length > 0) {
        output += `   🏷️ ${pkg.keywords.join(', ')}\n`;
      }
      output += `   💾 Install: sr install ${pkg.name}\n\n`;
    }
    
    return output.trim();
    
  } catch (error) {
    return `❌ Search failed: ${error.message}`;
  }
}

/**
 * List installed packages or available packages
 */
async function handleList(args) {
  const showAll = args.includes('--all') || args.includes('-a');
  
  if (showAll) {
    // Show all available packages (would need registry)
    return 'Listing all available packages not yet implemented.\nUse "sr search" to find packages.';
  }
  
  try {
    const installed = listInstalled();
    
    if (installed.length === 0) {
      return '📦 No skill packs installed\nTry "sr search" to find packages to install.';
    }

    let output = `📦 Installed skill packs (${installed.length}):\n\n`;
    
    for (const pkg of installed) {
      output += `📦 ${pkg.name} v${pkg.version}\n`;
      if (pkg.manifest.description) {
        output += `   ${pkg.manifest.description}\n`;
      }
      if (pkg.skills && pkg.skills.length > 0) {
        output += `   🧩 Skills: ${pkg.skills.join(', ')}\n`;
      }
      output += `   📅 Installed: ${new Date(pkg.installedAt).toLocaleDateString()}\n\n`;
    }
    
    return output.trim();
    
  } catch (error) {
    return `❌ Failed to list packages: ${error.message}`;
  }
}

/**
 * Update registry from remote sources
 */
async function handleUpdate(args) {
  console.log('🔄 Updating package registry...');
  
  try {
    const result = await updateRegistry();
    
    if (result.success) {
      return `✅ Registry updated successfully
📦 ${result.packagesCount} packages available`;
    } else {
      return '⚠️ No updates found or all sources failed';
    }
    
  } catch (error) {
    return `❌ Update failed: ${error.message}`;
  }
}

/**
 * Publish a skill pack
 */
async function handlePublish(args) {
  const manifestPath = args.length > 0 ? args[0] : './staticrebel.json';
  
  if (!fs.existsSync(manifestPath)) {
    return `❌ Manifest not found: ${manifestPath}
Create one with 'sr init' or specify path: sr publish path/to/staticrebel.json`;
  }
  
  try {
    const result = await publishPackage(manifestPath);
    
    if (result.success) {
      return `✅ ${result.message}`;
    } else {
      return `❌ Publish failed: ${result.error}`;
    }
    
  } catch (error) {
    return `❌ Publish failed: ${error.message}`;
  }
}

/**
 * Initialize a new skill pack
 */
async function handleInit(args) {
  const interactive = !args.includes('--no-interactive');
  
  if (interactive) {
    return await handleInteractiveInit();
  } else {
    // Non-interactive mode with defaults
    const manifest = createManifest(
      'my-skill-pack',
      'Your Name',
      'A new StaticRebel skill pack'
    );
    
    fs.writeFileSync('./staticrebel.json', JSON.stringify(manifest, null, 2));
    
    return `✅ Created staticrebel.json
📝 Edit the manifest and add your skills, then run 'sr validate'`;
  }
}

/**
 * Interactive initialization
 */
async function handleInteractiveInit() {
  // This would use readline for interactive prompts
  // For now, create a template
  const manifest = createManifest(
    'my-skill-pack',
    'Your Name <your.email@example.com>',
    'A new StaticRebel skill pack',
    {
      keywords: ['skills', 'productivity'],
      skills: [
        {
          name: 'example-skill',
          path: 'skills/example',
          description: 'An example skill'
        }
      ]
    }
  );
  
  fs.writeFileSync('./staticrebel.json', JSON.stringify(manifest, null, 2));
  
  // Create example skill directory
  if (!fs.existsSync('./skills')) {
    fs.mkdirSync('./skills', { recursive: true });
  }
  
  if (!fs.existsSync('./skills/example')) {
    fs.mkdirSync('./skills/example', { recursive: true });
    
    // Create example skill files
    fs.writeFileSync('./skills/example/SKILL.md', `# Example Skill

This is an example skill for your skill pack.

## Usage
Describe how to use this skill.
`);
    
    fs.writeFileSync('./skills/example/TRIGGERS.md', `- trigger: "example"
  response: "Hello from example skill!"

- trigger: "test pack"
  response: "Your skill pack is working!"
`);
    
    fs.writeFileSync('./skills/example/PROMPTS.md', `- name: "Example Prompt"
  content: "You are an example skill. Be helpful and friendly."
`);
  }
  
  return `✅ Created new skill pack structure:
📄 staticrebel.json - Package manifest
📁 skills/example/ - Example skill
  ├── SKILL.md - Skill documentation  
  ├── TRIGGERS.md - Trigger definitions
  └── PROMPTS.md - Prompt templates

📝 Next steps:
1. Edit staticrebel.json with your details
2. Customize the example skill or create new ones
3. Run 'sr validate' to check your pack
4. Test with 'sr install .' (install from current directory)`;
}

/**
 * Validate a skill pack manifest
 */
async function handleValidate(args) {
  const manifestPath = args.length > 0 ? args[0] : './staticrebel.json';
  
  if (!fs.existsSync(manifestPath)) {
    return `❌ Manifest not found: ${manifestPath}`;
  }
  
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const validation = validateManifest(manifest);
    
    if (validation.valid) {
      // Additional file validation
      const manifestDir = path.dirname(manifestPath);
      const warnings = [];
      
      for (const skill of manifest.skills || []) {
        const skillPath = path.join(manifestDir, skill.path);
        if (!fs.existsSync(skillPath)) {
          warnings.push(`Skill path not found: ${skill.path}`);
        } else {
          // Check for required skill files
          const requiredFiles = ['SKILL.md'];
          for (const file of requiredFiles) {
            if (!fs.existsSync(path.join(skillPath, file))) {
              warnings.push(`Missing ${file} in skill: ${skill.name}`);
            }
          }
        }
      }
      
      let output = `✅ Manifest is valid!
📦 ${manifest.name} v${manifest.version}
🧩 ${manifest.skills?.length || 0} skills defined`;

      if (warnings.length > 0) {
        output += `\n\n⚠️ Warnings:`;
        warnings.forEach(warning => {
          output += `\n  • ${warning}`;
        });
      }
      
      return output;
      
    } else {
      return `❌ Manifest validation failed:
${validation.errors.map(e => `  • ${e}`).join('\n')}`;
    }
    
  } catch (error) {
    return `❌ Validation failed: ${error.message}`;
  }
}

/**
 * Show marketplace statistics
 */
async function handleStats(args) {
  try {
    const stats = getMarketplaceStats();
    
    return `📊 Marketplace Statistics:
📦 Available packages: ${stats.totalPackages}
💾 Installed packages: ${stats.installedPackages}
🌐 Active registries: ${stats.registries}
🔄 Last updated: ${stats.lastUpdated ? new Date(stats.lastUpdated).toLocaleString() : 'Never'}

💡 Run 'sr update' to refresh the registry`;
    
  } catch (error) {
    return `❌ Failed to get stats: ${error.message}`;
  }
}

/**
 * Show help information
 */
function handleHelp() {
  return `🛒 StaticRebel Marketplace Commands:

📦 Package Management:
  sr install <package>     Install a skill pack
  sr uninstall <package>   Remove a skill pack  
  sr search <query>        Search for packages
  sr list                  List installed packages
  sr update                Update package registry

🔧 Development:
  sr init                  Create new skill pack
  sr validate [manifest]   Validate skill pack
  sr publish [manifest]    Publish skill pack

📊 Information:
  sr stats                 Show marketplace stats
  sr help                  Show this help

🌟 Examples:
  sr search fitness        # Find fitness-related skill packs
  sr install fitness-pack  # Install the fitness pack
  sr list                  # See what's installed
  sr init                  # Start creating your own pack

💡 Learn more: https://github.com/static-rebel/skill-packs`;
}

/**
 * Main marketplace command router
 */
export async function marketplaceCommand(args) {
  if (args.length === 0) {
    return handleHelp();
  }
  
  return await handleMarketplaceCommand(args);
}