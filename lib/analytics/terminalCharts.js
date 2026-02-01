/**
 * Terminal Charts and Tables for Analytics
 * ASCII-based visualization utilities
 */

import chalk from 'chalk';

// ============================================================================
// ASCII Chart Functions
// ============================================================================

export function createBarChart(data, options = {}) {
  const {
    title = '',
    width = 50,
    showValues = true,
    colors = ['red', 'yellow', 'green'],
    maxValue = null
  } = options;
  
  if (!data || Object.keys(data).length === 0) {
    return 'No data to display';
  }
  
  const entries = Object.entries(data).sort(([,a], [,b]) => b - a);
  const max = maxValue || Math.max(...entries.map(([,v]) => v));
  
  let output = '';
  
  if (title) {
    output += chalk.cyan.bold(`\n${title}\n`);
    output += chalk.gray('─'.repeat(Math.max(title.length, width)) + '\n');
  }
  
  entries.forEach(([label, value]) => {
    const percentage = max > 0 ? (value / max) : 0;
    const barLength = Math.round(percentage * (width - 20));
    
    // Choose color based on percentage
    let color = chalk.red;
    if (percentage > 0.7) color = chalk.green;
    else if (percentage > 0.4) color = chalk.yellow;
    
    const bar = '█'.repeat(barLength) + '░'.repeat((width - 20) - barLength);
    const displayValue = showValues ? ` ${value}` : '';
    
    output += `${label.padEnd(15)} ${color(bar)}${displayValue}\n`;
  });
  
  return output;
}

export function createLineChart(data, options = {}) {
  const {
    title = '',
    width = 60,
    height = 10,
    showAxis = true
  } = options;
  
  if (!data || data.length === 0) {
    return 'No data to display';
  }
  
  const values = Array.isArray(data) ? data : Object.values(data);
  const labels = Array.isArray(data) ? data.map((_, i) => i.toString()) : Object.keys(data);
  
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  
  let output = '';
  
  if (title) {
    output += chalk.cyan.bold(`\n${title}\n`);
    output += chalk.gray('─'.repeat(Math.max(title.length, width)) + '\n');
  }
  
  // Create the chart grid
  const chart = Array(height).fill().map(() => Array(width).fill(' '));
  
  // Plot the data points
  for (let i = 0; i < values.length && i < width; i++) {
    const normalizedValue = (values[i] - min) / range;
    const y = Math.round((height - 1) * (1 - normalizedValue));
    const x = Math.round((i / (values.length - 1)) * (width - 1));
    
    if (y >= 0 && y < height && x >= 0 && x < width) {
      chart[y][x] = '●';
    }
    
    // Connect points with lines
    if (i > 0) {
      const prevY = Math.round((height - 1) * (1 - ((values[i-1] - min) / range)));
      const prevX = Math.round(((i-1) / (values.length - 1)) * (width - 1));
      
      // Simple line drawing
      const steps = Math.abs(x - prevX);
      for (let step = 0; step < steps; step++) {
        const interpX = prevX + Math.round((step / steps) * (x - prevX));
        const interpY = prevY + Math.round((step / steps) * (y - prevY));
        
        if (interpY >= 0 && interpY < height && interpX >= 0 && interpX < width) {
          if (chart[interpY][interpX] === ' ') {
            chart[interpY][interpX] = '·';
          }
        }
      }
    }
  }
  
  // Render the chart
  for (let y = 0; y < height; y++) {
    if (showAxis) {
      const axisValue = max - (y / (height - 1)) * range;
      output += chalk.gray(`${axisValue.toFixed(1).padStart(6)} │`);
    }
    
    output += chart[y].join('').replace(/●/g, chalk.cyan('●')).replace(/·/g, chalk.blue('·'));
    output += '\n';
  }
  
  if (showAxis) {
    output += chalk.gray('       └' + '─'.repeat(width) + '\n');
    
    // X-axis labels (simplified)
    output += chalk.gray('        ');
    for (let i = 0; i < Math.min(labels.length, 6); i++) {
      const pos = Math.round((i / (Math.min(labels.length, 6) - 1)) * (width - labels[i].length));
      output += ' '.repeat(Math.max(0, pos - output.length + 8)) + labels[i * Math.floor(labels.length / 6)];
    }
    output += '\n';
  }
  
  return output;
}

export function createSparkline(data, options = {}) {
  const { width = 20, min: minValue, max: maxValue } = options;
  
  if (!data || data.length === 0) return '─'.repeat(width);
  
  const values = Array.isArray(data) ? data : Object.values(data);
  const min = minValue !== undefined ? minValue : Math.min(...values);
  const max = maxValue !== undefined ? maxValue : Math.max(...values);
  const range = max - min || 1;
  
  const sparkChars = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  
  let output = '';
  const step = values.length / width;
  
  for (let i = 0; i < width; i++) {
    const index = Math.floor(i * step);
    if (index < values.length) {
      const normalized = (values[index] - min) / range;
      const charIndex = Math.floor(normalized * (sparkChars.length - 1));
      output += sparkChars[Math.max(0, Math.min(charIndex, sparkChars.length - 1))];
    } else {
      output += '▁';
    }
  }
  
  return chalk.cyan(output);
}

// ============================================================================
// Table Functions
// ============================================================================

export function createTable(data, options = {}) {
  const {
    headers = [],
    maxWidth = 80,
    alignment = [],
    colors = {}
  } = options;
  
  if (!data || data.length === 0) {
    return 'No data to display';
  }
  
  // Auto-detect headers if not provided
  const tableHeaders = headers.length > 0 ? headers : Object.keys(data[0]);
  
  // Calculate column widths
  const colWidths = tableHeaders.map(header => {
    const maxContentWidth = Math.max(
      header.length,
      ...data.map(row => String(row[header] || '').length)
    );
    return Math.min(maxContentWidth, Math.floor(maxWidth / tableHeaders.length) - 2);
  });
  
  let output = '';
  
  // Header row
  output += '┌' + colWidths.map(w => '─'.repeat(w + 2)).join('┬') + '┐\n';
  output += '│' + tableHeaders.map((header, i) => {
    const align = alignment[i] || 'left';
    let text = header;
    if (text.length > colWidths[i]) {
      text = text.substring(0, colWidths[i] - 1) + '…';
    }
    
    if (align === 'center') {
      text = text.padStart(Math.ceil((colWidths[i] + text.length) / 2)).padEnd(colWidths[i]);
    } else if (align === 'right') {
      text = text.padStart(colWidths[i]);
    } else {
      text = text.padEnd(colWidths[i]);
    }
    
    return ` ${chalk.bold(text)} `;
  }).join('│') + '│\n';
  
  output += '├' + colWidths.map(w => '─'.repeat(w + 2)).join('┼') + '┤\n';
  
  // Data rows
  data.forEach((row, rowIndex) => {
    output += '│' + tableHeaders.map((header, i) => {
      const align = alignment[i] || 'left';
      let text = String(row[header] || '');
      
      if (text.length > colWidths[i]) {
        text = text.substring(0, colWidths[i] - 1) + '…';
      }
      
      if (align === 'center') {
        text = text.padStart(Math.ceil((colWidths[i] + text.length) / 2)).padEnd(colWidths[i]);
      } else if (align === 'right') {
        text = text.padStart(colWidths[i]);
      } else {
        text = text.padEnd(colWidths[i]);
      }
      
      // Apply colors
      if (colors[header]) {
        text = colors[header](text);
      }
      
      return ` ${text} `;
    }).join('│') + '│\n';
  });
  
  output += '└' + colWidths.map(w => '─'.repeat(w + 2)).join('┴') + '┘\n';
  
  return output;
}

export function createProgressBar(value, total, options = {}) {
  const {
    width = 30,
    showPercentage = true,
    showValues = true,
    color = 'auto'
  } = options;
  
  const percentage = total > 0 ? (value / total) * 100 : 0;
  const filledWidth = Math.round((percentage / 100) * width);
  
  let barColor;
  if (color === 'auto') {
    barColor = percentage >= 100 ? chalk.green : percentage >= 75 ? chalk.yellow : chalk.red;
  } else {
    barColor = chalk[color] || chalk.blue;
  }
  
  const filled = '█'.repeat(filledWidth);
  const empty = '░'.repeat(width - filledWidth);
  const bar = barColor(filled) + chalk.gray(empty);
  
  let output = bar;
  
  if (showPercentage) {
    output += ` ${percentage.toFixed(1)}%`;
  }
  
  if (showValues) {
    output += ` (${value}/${total})`;
  }
  
  return output;
}

// ============================================================================
// Composite Chart Functions
// ============================================================================

export function createDashboard(sections, options = {}) {
  const { title, width = 80 } = options;
  
  let output = '';
  
  if (title) {
    output += chalk.cyan.bold(`\n${'='.repeat(width)}\n`);
    output += chalk.cyan.bold(`${title.toUpperCase().padStart(Math.ceil((width + title.length) / 2))}\n`);
    output += chalk.cyan.bold(`${'='.repeat(width)}\n\n`);
  }
  
  sections.forEach((section, index) => {
    if (index > 0) {
      output += '\n' + chalk.gray('─'.repeat(width)) + '\n\n';
    }
    
    output += section.content;
    
    if (section.footer) {
      output += '\n' + chalk.gray(section.footer) + '\n';
    }
  });
  
  return output;
}

export function createMetricCards(metrics, options = {}) {
  const { cardsPerRow = 3, cardWidth = 20 } = options;
  
  if (!metrics || metrics.length === 0) {
    return 'No metrics to display';
  }
  
  let output = '';
  
  for (let i = 0; i < metrics.length; i += cardsPerRow) {
    const rowMetrics = metrics.slice(i, i + cardsPerRow);
    
    // Top border
    output += rowMetrics.map(() => '┌' + '─'.repeat(cardWidth) + '┐').join('') + '\n';
    
    // Title row
    output += rowMetrics.map(metric => 
      '│' + chalk.bold(metric.title || 'Metric').padEnd(cardWidth) + '│'
    ).join('') + '\n';
    
    // Separator
    output += rowMetrics.map(() => '├' + '─'.repeat(cardWidth) + '┤').join('') + '\n';
    
    // Value row
    output += rowMetrics.map(metric => {
      let valueStr = String(metric.value || '0');
      if (metric.color) {
        valueStr = chalk[metric.color](valueStr);
      }
      return '│' + valueStr.padEnd(cardWidth) + '│';
    }).join('') + '\n';
    
    // Unit row (if provided)
    if (rowMetrics.some(m => m.unit)) {
      output += rowMetrics.map(metric => 
        '│' + chalk.gray(metric.unit || '').padEnd(cardWidth) + '│'
      ).join('') + '\n';
    }
    
    // Bottom border
    output += rowMetrics.map(() => '└' + '─'.repeat(cardWidth) + '┘').join('') + '\n';
    
    if (i + cardsPerRow < metrics.length) {
      output += '\n';
    }
  }
  
  return output;
}

export default {
  createBarChart,
  createLineChart,
  createSparkline,
  createTable,
  createProgressBar,
  createDashboard,
  createMetricCards
};