/**
 * Semantic Snapshots for Browser
 * Text-based accessibility tree (ARIA) snapshots instead of screenshots
 * 
 * Benefits:
 * - 50KB vs 5MB per page
 * - Fraction of the token cost vs image processing
 * - Text-based representation of page structure
 */

/**
 * Extract semantic snapshot from page (for use with Puppeteer/Playwright)
 * Returns ARIA-based text representation
 */
export async function extractSemanticSnapshot(page) {
  const snapshot = await page.evaluate(() => {
    function buildAccessibilityTree(element, depth = 0) {
      const indent = '  '.repeat(depth);
      const lines = [];
      
      // Skip hidden elements
      const style = window.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') {
        return [];
      }
      
      // Get ARIA role and label
      const role = element.getAttribute('role') || getImplicitRole(element);
      const ariaLabel = element.getAttribute('aria-label');
      const ariaLabelledBy = element.getAttribute('aria-labelledby');
      const labelledText = ariaLabelledBy 
        ? document.getElementById(ariaLabelledBy)?.textContent 
        : null;
      
      // Get text content
      const text = element.textContent?.trim();
      
      // Build node description
      const parts = [];
      if (role) parts.push(`[${role}]`);
      if (ariaLabel || labelledText) parts.push(`"${ariaLabel || labelledText}"`);
      
      // Add element-specific info
      const tagName = element.tagName.toLowerCase();
      
      // Handle interactive elements
      if (isInteractive(element)) {
        const name = getAccessibleName(element);
        const state = getElementState(element);
        
        if (name) {
          parts.push(`${tagName}: "${name}"${state}`);
        }
      } else if (text && text.length < 200 && element.children.length === 0) {
        // Leaf text node
        parts.push(`"${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`);
      }
      
      if (parts.length > 0) {
        lines.push(indent + parts.join(' '));
      }
      
      // Process children
      for (const child of element.children) {
        lines.push(...buildAccessibilityTree(child, depth + 1));
      }
      
      return lines;
    }
    
    function getImplicitRole(element) {
      const tagName = element.tagName.toLowerCase();
      const type = element.getAttribute('type');
      
      const implicitRoles = {
        'a': element.href ? 'link' : null,
        'button': 'button',
        'input': {
          'text': 'textbox',
          'search': 'searchbox',
          'checkbox': 'checkbox',
          'radio': 'radio',
          'submit': 'button',
          'button': 'button',
        }[type] || 'textbox',
        'textarea': 'textbox',
        'select': 'combobox',
        'nav': 'navigation',
        'main': 'main',
        'article': 'article',
        'aside': 'complementary',
        'header': 'banner',
        'footer': 'contentinfo',
        'h1': 'heading',
        'h2': 'heading',
        'h3': 'heading',
        'h4': 'heading',
        'h5': 'heading',
        'h6': 'heading',
        'ul': 'list',
        'ol': 'list',
        'li': 'listitem',
        'table': 'table',
        'form': 'form',
        'img': 'img',
      };
      
      return implicitRoles[tagName] || null;
    }
    
    function isInteractive(element) {
      const interactive = ['a', 'button', 'input', 'select', 'textarea'];
      return interactive.includes(element.tagName.toLowerCase()) ||
             element.getAttribute('role') === 'button' ||
             element.onclick !== null;
    }
    
    function getAccessibleName(element) {
      const ariaLabel = element.getAttribute('aria-label');
      if (ariaLabel) return ariaLabel;
      
      const labelledBy = element.getAttribute('aria-labelledby');
      if (labelledBy) {
        const label = document.getElementById(labelledBy);
        if (label) return label.textContent.trim();
      }
      
      if (element.id) {
        const label = document.querySelector(`label[for="${element.id}"]`);
        if (label) return label.textContent.trim();
      }
      
      const parentLabel = element.closest('label');
      if (parentLabel) {
        const text = parentLabel.textContent.trim();
        const childText = element.textContent.trim();
        return text.replace(childText, '').trim();
      }
      
      const placeholder = element.getAttribute('placeholder');
      if (placeholder) return placeholder;
      
      if (element.value) return element.value;
      
      return element.textContent?.trim();
    }
    
    function getElementState(element) {
      const states = [];
      if (element.disabled) states.push('disabled');
      if (element.checked) states.push('checked');
      if (element.selected) states.push('selected');
      if (element.getAttribute('aria-expanded') === 'true') states.push('expanded');
      if (element.getAttribute('aria-pressed') === 'true') states.push('pressed');
      if (element.getAttribute('aria-selected') === 'true') states.push('selected');
      
      return states.length > 0 ? ` (${states.join(', ')})` : '';
    }
    
    const body = document.body;
    const tree = buildAccessibilityTree(body);
    
    return {
      url: window.location.href,
      title: document.title,
      timestamp: new Date().toISOString(),
      tree: tree.join('\n'),
      stats: {
        totalElements: document.querySelectorAll('*').length,
        interactiveElements: document.querySelectorAll('a, button, input, select, textarea').length,
        headings: document.querySelectorAll('h1, h2, h3, h4, h5, h6').length,
        links: document.querySelectorAll('a[href]').length,
        images: document.querySelectorAll('img').length,
        forms: document.querySelectorAll('form').length,
      },
    };
  });
  
  return snapshot;
}

/**
 * Format semantic snapshot for LLM context
 */
export function formatSnapshotForLLM(snapshot) {
  return `
=== Page Snapshot ===
URL: ${snapshot.url}
Title: ${snapshot.title}
Timestamp: ${snapshot.timestamp}

Structure:
${snapshot.tree}

Stats:
- Total elements: ${snapshot.stats.totalElements}
- Interactive elements: ${snapshot.stats.interactiveElements}
- Headings: ${snapshot.stats.headings}
- Links: ${snapshot.stats.links}
- Images: ${snapshot.stats.images}
- Forms: ${snapshot.stats.forms}
=== End Snapshot ===
`;
}

/**
 * Extract form fields from snapshot
 */
export function extractFormFields(snapshot) {
  const fields = [];
  const lines = snapshot.tree.split('\n');
  
  for (const line of lines) {
    const match = line.match(/\[\w+\].*(?:input|select|textarea|checkbox|radio).*"([^"]+)"/i);
    if (match) {
      fields.push({
        label: match[1],
        line: line.trim(),
      });
    }
  }
  
  return fields;
}

/**
 * Extract links from snapshot
 */
export function extractLinks(snapshot) {
  const links = [];
  const lines = snapshot.tree.split('\n');
  
  for (const line of lines) {
    if (line.includes('[link]')) {
      const match = line.match(/"([^"]+)"/);
      if (match) {
        links.push({
          text: match[1],
          line: line.trim(),
        });
      }
    }
  }
  
  return links;
}

/**
 * Find element by accessible name in snapshot
 */
export function findInSnapshot(snapshot, name) {
  const lines = snapshot.tree.split('\n');
  const matches = [];
  
  for (const line of lines) {
    if (line.toLowerCase().includes(name.toLowerCase())) {
      matches.push(line.trim());
    }
  }
  
  return matches;
}

/**
 * Semantic Snapshot Manager
 */
export class SemanticSnapshotManager {
  constructor() {
    this.snapshots = new Map();
  }

  async capture(page, pageId = 'default') {
    const snapshot = await extractSemanticSnapshot(page);
    this.snapshots.set(pageId, {
      ...snapshot,
      capturedAt: Date.now(),
    });
    return snapshot;
  }

  getSnapshot(pageId = 'default') {
    return this.snapshots.get(pageId);
  }

  getFormattedSnapshot(pageId = 'default') {
    const snapshot = this.snapshots.get(pageId);
    if (!snapshot) return null;
    return formatSnapshotForLLM(snapshot);
  }

  findAcrossSnapshots(name) {
    const results = [];
    
    for (const [pageId, snapshot] of this.snapshots) {
      const matches = findInSnapshot(snapshot, name);
      if (matches.length > 0) {
        results.push({
          pageId,
          url: snapshot.url,
          matches,
        });
      }
    }
    
    return results;
  }

  clear(pageId = null) {
    if (pageId) {
      this.snapshots.delete(pageId);
    } else {
      this.snapshots.clear();
    }
  }

  getStats() {
    return {
      totalSnapshots: this.snapshots.size,
      pages: Array.from(this.snapshots.keys()),
    };
  }
}

export function createSnapshotManager() {
  return new SemanticSnapshotManager();
}

export default SemanticSnapshotManager;
