// Browser CLI Commands
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { BrowserAutomation, screenshotUrl, scrapeUrl, openBrowser } from './index.js';

/**
 * Handle browser CLI commands
 */
export async function handleBrowserCommand(args) {
  const [command, ...rest] = args;

  switch (command) {
    case 'screenshot':
      return await handleScreenshot(rest);
    case 'scrape':
      return await handleScrape(rest);
    case 'open':
      return await handleOpen(rest);
    case 'help':
      return handleHelp();
    default:
      return `Unknown browser command: ${command}\nType 'sr browser help' for available commands.`;
  }
}

/**
 * Handle screenshot command
 */
async function handleScreenshot(args) {
  const [url, outputPath] = args;
  
  if (!url) {
    return 'Error: URL is required\nUsage: sr browser screenshot <url> [output-path]';
  }

  try {
    console.log(chalk.blue('📸 Taking screenshot...'));
    
    const options = {
      fullPage: true,
      format: 'png'
    };

    const screenshotBuffer = await screenshotUrl(url, options);
    
    // Generate output path if not provided
    const outputFile = outputPath || `screenshot-${Date.now()}.png`;
    const fullPath = path.resolve(outputFile);
    
    // Write screenshot to file
    fs.writeFileSync(fullPath, screenshotBuffer);
    
    return chalk.green(`✅ Screenshot saved to: ${fullPath}\n📊 Size: ${(screenshotBuffer.length / 1024).toFixed(1)}KB`);
  } catch (error) {
    return chalk.red(`❌ Screenshot failed: ${error.message}`);
  }
}

/**
 * Handle scrape command  
 */
async function handleScrape(args) {
  const [url, outputPath] = args;
  
  if (!url) {
    return 'Error: URL is required\nUsage: sr browser scrape <url> [output-path]';
  }

  try {
    console.log(chalk.blue('🔍 Scraping page content...'));
    
    const content = await scrapeUrl(url);
    
    const scrapedData = {
      url: content.url,
      title: content.title,
      scrapedAt: new Date().toISOString(),
      content: {
        text: content.text,
        html: content.html
      }
    };

    if (outputPath) {
      // Save to file
      const fullPath = path.resolve(outputPath);
      const extension = path.extname(outputPath).toLowerCase();
      
      if (extension === '.json') {
        fs.writeFileSync(fullPath, JSON.stringify(scrapedData, null, 2));
      } else if (extension === '.txt') {
        fs.writeFileSync(fullPath, content.text);
      } else if (extension === '.html') {
        fs.writeFileSync(fullPath, content.html);
      } else {
        fs.writeFileSync(fullPath, JSON.stringify(scrapedData, null, 2));
      }
      
      return chalk.green(`✅ Content scraped and saved to: ${fullPath}\n📄 Title: ${content.title}\n📊 Text length: ${content.text.length} characters`);
    } else {
      // Output to console
      console.log(chalk.green('\n📄 Page Content:'));
      console.log(chalk.yellow(`Title: ${content.title}`));
      console.log(chalk.yellow(`URL: ${content.url}`));
      console.log(chalk.cyan('\n--- Text Content ---'));
      console.log(content.text.substring(0, 1000) + (content.text.length > 1000 ? '...' : ''));
      
      return chalk.green(`✅ Content scraped successfully\n📊 Text length: ${content.text.length} characters`);
    }
  } catch (error) {
    return chalk.red(`❌ Scraping failed: ${error.message}`);
  }
}

/**
 * Handle open command
 */
async function handleOpen(args) {
  const [url] = args;
  
  if (!url) {
    return 'Error: URL is required\nUsage: sr browser open <url>';
  }

  try {
    console.log(chalk.blue('🌐 Opening browser...'));
    
    const browser = await openBrowser(url);
    
    console.log(chalk.green(`✅ Browser opened with URL: ${url}`));
    console.log(chalk.yellow('💡 The browser will stay open for manual interaction.'));
    console.log(chalk.yellow('   Close the browser window when done.'));
    
    // Keep the process alive while browser is open
    process.on('SIGINT', async () => {
      console.log(chalk.yellow('\n🔄 Closing browser...'));
      await browser.close();
      process.exit(0);
    });

    // Monitor browser process
    if (browser.chromeProcess) {
      browser.chromeProcess.on('exit', () => {
        console.log(chalk.blue('🔄 Browser closed.'));
        process.exit(0);
      });
    }
    
    return 'Browser session started. Press Ctrl+C to close.';
  } catch (error) {
    return chalk.red(`❌ Failed to open browser: ${error.message}`);
  }
}

/**
 * Display help for browser commands
 */
function handleHelp() {
  return `
${chalk.bold.blue('StaticRebel Browser Automation')}

${chalk.yellow('Usage:')}
  sr browser <command> [options]

${chalk.yellow('Commands:')}
  ${chalk.green('screenshot <url> [output]')}   Take a screenshot of a webpage
  ${chalk.green('scrape <url> [output]')}       Extract text and HTML content from a webpage  
  ${chalk.green('open <url>')}                  Open a webpage in browser for manual interaction
  ${chalk.green('help')}                        Show this help message

${chalk.yellow('Examples:')}
  ${chalk.gray('# Take a screenshot')}
  sr browser screenshot https://example.com
  sr browser screenshot https://example.com screenshot.png

  ${chalk.gray('# Scrape page content')}
  sr browser scrape https://example.com
  sr browser scrape https://example.com content.json
  sr browser scrape https://example.com content.txt

  ${chalk.gray('# Open browser for manual interaction')}
  sr browser open https://example.com

${chalk.yellow('Screenshot Options:')}
  - Automatically captures full page
  - Saves as PNG format
  - Default filename: screenshot-[timestamp].png

${chalk.yellow('Scrape Options:')}
  - Extracts both text and HTML content
  - Output formats: .json, .txt, .html
  - Default: displays in console

${chalk.yellow('Notes:')}
  - Requires Chrome or Chromium to be installed
  - Screenshots are taken in headless mode
  - Browser open command runs in headed mode for interaction
`;
}

/**
 * Browser automation for LLM integration
 */
export class BrowserLLMIntegration {
  constructor() {
    this.activeBrowser = null;
  }

  /**
   * Process natural language browser commands
   */
  async processCommand(message, context = {}) {
    const lowerMessage = message.toLowerCase();
    
    try {
      // Screenshot requests
      if (lowerMessage.includes('screenshot') && (lowerMessage.includes('http') || lowerMessage.includes('www.'))) {
        const url = this.extractUrl(message);
        if (url) {
          return await this.takeScreenshotForLLM(url);
        }
      }

      // Scraping requests  
      if ((lowerMessage.includes('scrape') || lowerMessage.includes('extract') || lowerMessage.includes('get content')) && 
          (lowerMessage.includes('http') || lowerMessage.includes('www.'))) {
        const url = this.extractUrl(message);
        if (url) {
          return await this.scrapeForLLM(url);
        }
      }

      // Pricing extraction
      if (lowerMessage.includes('pricing') && (lowerMessage.includes('http') || lowerMessage.includes('www.'))) {
        const url = this.extractUrl(message);
        if (url) {
          return await this.extractPricing(url);
        }
      }

      // Form filling
      if (lowerMessage.includes('fill') && lowerMessage.includes('form')) {
        return await this.helpWithForm(message, context);
      }

      return null; // Not a browser command
    } catch (error) {
      return {
        error: true,
        message: `Browser automation failed: ${error.message}`
      };
    }
  }

  /**
   * Extract URL from message
   */
  extractUrl(message) {
    const urlRegex = /(https?:\/\/[^\s]+)/i;
    const match = message.match(urlRegex);
    return match ? match[1] : null;
  }

  /**
   * Take screenshot for LLM response
   */
  async takeScreenshotForLLM(url) {
    const screenshotBuffer = await screenshotUrl(url);
    const filename = `screenshot-${Date.now()}.png`;
    const filepath = path.resolve(filename);
    
    fs.writeFileSync(filepath, screenshotBuffer);
    
    return {
      type: 'screenshot',
      url,
      filepath,
      size: `${(screenshotBuffer.length / 1024).toFixed(1)}KB`,
      message: `Screenshot captured from ${url}`
    };
  }

  /**
   * Scrape content for LLM response
   */
  async scrapeForLLM(url) {
    const content = await scrapeUrl(url);
    
    return {
      type: 'scrape',
      url: content.url,
      title: content.title,
      text: content.text.substring(0, 5000), // Limit for LLM context
      textLength: content.text.length,
      message: `Content extracted from ${content.title || url}`
    };
  }

  /**
   * Extract pricing information specifically
   */
  async extractPricing(url) {
    const browser = new BrowserAutomation({ headless: true });
    try {
      await browser.launchChrome();
      await browser.openPage(url);
      
      // Wait for page to load
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Look for pricing elements
      const pricingData = await browser.executeScript(`
        const pricingSelectors = [
          '[class*="price"]', '[class*="cost"]', '[class*="pricing"]',
          '[data-price]', '.price', '.pricing', '.cost', '.fee',
          'span:contains("$")', 'div:contains("$")', 'p:contains("$")',
          'span:contains("€")', 'div:contains("€")', 'p:contains("€")',
          'span:contains("£")', 'div:contains("£")', 'p:contains("£")'
        ];
        
        const priceElements = [];
        pricingSelectors.forEach(selector => {
          try {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
              const text = el.textContent.trim();
              if (text.match(/[$€£¥]\\s?\\d+|\\d+\\s?[$€£¥]/)) {
                priceElements.push({
                  text: text,
                  selector: selector,
                  html: el.outerHTML.substring(0, 200)
                });
              }
            });
          } catch (e) {}
        });
        
        return priceElements;
      `);
      
      const content = await browser.scrapeContent();
      
      return {
        type: 'pricing',
        url: content.url,
        title: content.title,
        pricingElements: pricingData,
        message: `Found ${pricingData.length} potential pricing elements on ${content.title || url}`
      };
      
    } finally {
      await browser.close();
    }
  }

  /**
   * Help with form filling
   */
  async helpWithForm(message, context) {
    return {
      type: 'form_help',
      message: 'To fill forms with StaticRebel browser automation:',
      instructions: [
        '1. First open the page: sr browser open <url>',
        '2. Inspect the form fields to get CSS selectors',
        '3. Use the browser automation programmatically:',
        '   - browser.fill("input[name=\\"email\\"]", "email@example.com")',
        '   - browser.fill("input[name=\\"password\\"]", "password")',
        '   - browser.click("button[type=\\"submit\\"]")'
      ]
    };
  }

  /**
   * Close active browser if any
   */
  async cleanup() {
    if (this.activeBrowser) {
      await this.activeBrowser.close();
      this.activeBrowser = null;
    }
  }
}

export const browserLLM = new BrowserLLMIntegration();