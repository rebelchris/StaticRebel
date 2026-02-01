import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import os from 'os';

const SOCIAL_DIR = path.join(os.homedir(), '.static-rebel', 'social');
const CHALLENGES_FILE = path.join(SOCIAL_DIR, 'challenges.json');
const SETTINGS_FILE = path.join(SOCIAL_DIR, 'settings.json');

// Default privacy settings
const DEFAULT_SETTINGS = {
  shareStreaks: true,
  shareGoals: true,
  shareAchievements: true,
  allowAnonymous: true,
  defaultAnonymous: false,
  publicProfile: false
};

/**
 * Social Tracking Manager
 * Handles collaborative features, challenges, and sharing for StaticRebel
 */
class SocialManager {
  constructor() {
    this._initialized = false;
  }

  async ensureDir() {
    if (this._initialized) return;
    try {
      await fs.access(SOCIAL_DIR);
    } catch {
      await fs.mkdir(SOCIAL_DIR, { recursive: true });
    }
    this._initialized = true;
  }

  async readJsonFile(filePath, defaultValue = null) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (e) {
      return defaultValue;
    }
  }

  async writeJsonFile(filePath, data) {
    const tempPath = `${filePath}.${process.pid}.tmp`;
    try {
      await fs.writeFile(tempPath, JSON.stringify(data, null, 2));
      await fs.rename(tempPath, filePath);
      return true;
    } catch (e) {
      console.error(`Failed to write ${filePath}:`, e.message);
      try {
        await fs.unlink(tempPath);
      } catch {}
      return false;
    }
  }

  // ============================================================================
  // Privacy Settings
  // ============================================================================

  async getSettings() {
    await this.ensureDir();
    const settings = await this.readJsonFile(SETTINGS_FILE, DEFAULT_SETTINGS);
    return { ...DEFAULT_SETTINGS, ...settings };
  }

  async updateSettings(updates) {
    await this.ensureDir();
    const current = await this.getSettings();
    const newSettings = { ...current, ...updates };
    await this.writeJsonFile(SETTINGS_FILE, newSettings);
    return newSettings;
  }

  // ============================================================================
  // Challenge System
  // ============================================================================

  async loadChallenges() {
    await this.ensureDir();
    const data = await this.readJsonFile(CHALLENGES_FILE, { challenges: [] });
    return data;
  }

  async saveChallenges(data) {
    await this.ensureDir();
    return this.writeJsonFile(CHALLENGES_FILE, data);
  }

  /**
   * Create a new challenge
   * @param {Object} challenge - Challenge configuration
   * @returns {Object} Created challenge with ID
   */
  async createChallenge(challenge) {
    const data = await this.loadChallenges();
    
    const newChallenge = {
      id: this.generateId(),
      name: challenge.name || 'Untitled Challenge',
      description: challenge.description || '',
      type: challenge.type || 'streak', // 'streak', 'goal', 'total'
      trackerId: challenge.trackerId,
      trackerName: challenge.trackerName || challenge.trackerId,
      duration: challenge.duration || 7, // days
      target: challenge.target || null, // specific target for goal-based challenges
      participants: challenge.participants || [],
      createdBy: challenge.createdBy || 'local-user',
      createdAt: new Date().toISOString(),
      startDate: challenge.startDate || new Date().toISOString(),
      endDate: challenge.endDate || new Date(Date.now() + (challenge.duration * 24 * 60 * 60 * 1000)).toISOString(),
      status: 'active',
      leaderboard: [],
      shareCode: this.generateShareCode()
    };

    data.challenges.push(newChallenge);
    await this.saveChallenges(data);
    return newChallenge;
  }

  /**
   * Join an existing challenge
   * @param {string} challengeId - Challenge ID or share code
   * @param {string} participantName - Name of participant
   * @param {boolean} anonymous - Join anonymously
   * @returns {Object} Updated challenge
   */
  async joinChallenge(challengeId, participantName = 'Anonymous', anonymous = false) {
    const data = await this.loadChallenges();
    let challenge = data.challenges.find(c => c.id === challengeId || c.shareCode === challengeId);
    
    if (!challenge) {
      throw new Error('Challenge not found');
    }

    const participant = {
      id: this.generateId(),
      name: anonymous ? `Anonymous_${this.generateId(4)}` : participantName,
      joinedAt: new Date().toISOString(),
      anonymous,
      score: 0,
      entries: []
    };

    challenge.participants.push(participant);
    await this.saveChallenges(data);
    return challenge;
  }

  /**
   * Update challenge progress for a participant
   * @param {string} challengeId - Challenge ID
   * @param {string} participantId - Participant ID
   * @param {Object} entry - Progress entry
   * @returns {Object} Updated challenge
   */
  async updateChallengeProgress(challengeId, participantId, entry) {
    const data = await this.loadChallenges();
    const challenge = data.challenges.find(c => c.id === challengeId);
    
    if (!challenge) {
      throw new Error('Challenge not found');
    }

    const participant = challenge.participants.find(p => p.id === participantId);
    if (!participant) {
      throw new Error('Participant not found');
    }

    const progressEntry = {
      timestamp: new Date().toISOString(),
      value: entry.value,
      note: entry.note || ''
    };

    participant.entries.push(progressEntry);
    participant.score = this.calculateScore(challenge, participant);

    // Update leaderboard
    challenge.leaderboard = this.calculateLeaderboard(challenge);

    await this.saveChallenges(data);
    return challenge;
  }

  /**
   * Get all active challenges
   * @returns {Array} List of active challenges
   */
  async getActiveChallenges() {
    const data = await this.loadChallenges();
    const now = new Date();
    return data.challenges.filter(c => 
      c.status === 'active' && 
      new Date(c.endDate) > now
    );
  }

  /**
   * Get challenge by ID or share code
   * @param {string} identifier - Challenge ID or share code
   * @returns {Object|null} Challenge object or null if not found
   */
  async getChallenge(identifier) {
    const data = await this.loadChallenges();
    return data.challenges.find(c => c.id === identifier || c.shareCode === identifier) || null;
  }

  /**
   * End a challenge and calculate final results
   * @param {string} challengeId - Challenge ID
   * @returns {Object} Final challenge results
   */
  async endChallenge(challengeId) {
    const data = await this.loadChallenges();
    const challenge = data.challenges.find(c => c.id === challengeId);
    
    if (!challenge) {
      throw new Error('Challenge not found');
    }

    challenge.status = 'completed';
    challenge.completedAt = new Date().toISOString();
    challenge.leaderboard = this.calculateLeaderboard(challenge);
    
    await this.saveChallenges(data);
    return challenge;
  }

  // ============================================================================
  // Sharing & Export Functions
  // ============================================================================

  /**
   * Generate a shareable link for achievements or streaks
   * @param {Object} data - Data to share (streak, achievement, etc.)
   * @param {boolean} anonymous - Share anonymously
   * @returns {Object} Shareable link data
   */
  async generateShareableLink(data, anonymous = false) {
    const settings = await this.getSettings();
    
    if (!this.canShare(data.type, settings)) {
      throw new Error(`Sharing ${data.type} is disabled in privacy settings`);
    }

    const shareData = {
      id: this.generateId(),
      type: data.type, // 'streak', 'achievement', 'goal'
      content: anonymous && settings.allowAnonymous ? this.anonymizeData(data) : data,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)).toISOString(), // 7 days
      anonymous: anonymous && settings.allowAnonymous
    };

    // For a real implementation, this would upload to a service
    // For local-first, we create a JSON file that can be shared
    const shareFile = path.join(SOCIAL_DIR, `share-${shareData.id}.json`);
    await this.writeJsonFile(shareFile, shareData);

    return {
      shareId: shareData.id,
      url: `staticrebel://share/${shareData.id}`,
      qrCode: this.generateQRCode(shareData.id),
      file: shareFile,
      expiresAt: shareData.expiresAt
    };
  }

  /**
   * Export streak or goal graphics
   * @param {Object} data - Data to visualize
   * @param {string} format - 'ascii', 'svg', 'json'
   * @returns {string} Generated graphic
   */
  async exportGraphic(data, format = 'ascii') {
    switch (format) {
      case 'ascii':
        return this.generateASCIIGraphic(data);
      case 'svg':
        return this.generateSVGGraphic(data);
      case 'json':
        return JSON.stringify(data, null, 2);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  // ============================================================================
  // Utility Functions
  // ============================================================================

  generateId(length = 8) {
    return crypto.randomBytes(length).toString('hex').substring(0, length);
  }

  generateShareCode() {
    const adjectives = ['Swift', 'Strong', 'Brave', 'Calm', 'Bright', 'Noble', 'Quick', 'Wild'];
    const nouns = ['Tiger', 'Eagle', 'Wolf', 'Bear', 'Lion', 'Hawk', 'Fox', 'Deer'];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const num = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${adj}${noun}${num}`;
  }

  canShare(type, settings) {
    switch (type) {
      case 'streak':
      case 'streaks':
        return settings.shareStreaks;
      case 'goal':
      case 'goals':
        return settings.shareGoals;
      case 'achievement':
      case 'achievements':
        return settings.shareAchievements;
      default:
        return false;
    }
  }

  anonymizeData(data) {
    const anonymized = { ...data };
    delete anonymized.userId;
    delete anonymized.userName;
    delete anonymized.email;
    
    if (anonymized.name) {
      anonymized.name = `Anonymous User`;
    }
    
    return anonymized;
  }

  calculateScore(challenge, participant) {
    switch (challenge.type) {
      case 'streak':
        return this.calculateStreakScore(participant.entries);
      case 'goal':
        return this.calculateGoalScore(participant.entries, challenge.target);
      case 'total':
        return this.calculateTotalScore(participant.entries);
      default:
        return 0;
    }
  }

  calculateStreakScore(entries) {
    if (entries.length === 0) return 0;
    
    // Calculate current streak
    let streak = 0;
    const sortedEntries = entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    let currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);
    
    for (const entry of sortedEntries) {
      const entryDate = new Date(entry.timestamp);
      entryDate.setHours(0, 0, 0, 0);
      
      if (entryDate.getTime() === currentDate.getTime()) {
        streak++;
        currentDate.setDate(currentDate.getDate() - 1);
      } else {
        break;
      }
    }
    
    return streak;
  }

  calculateGoalScore(entries, target) {
    const total = entries.reduce((sum, entry) => sum + (entry.value || 0), 0);
    return target ? Math.min(100, (total / target) * 100) : total;
  }

  calculateTotalScore(entries) {
    return entries.reduce((sum, entry) => sum + (entry.value || 0), 0);
  }

  calculateLeaderboard(challenge) {
    return challenge.participants
      .map(p => ({
        id: p.id,
        name: p.name,
        score: p.score,
        entries: p.entries.length,
        anonymous: p.anonymous
      }))
      .sort((a, b) => b.score - a.score);
  }

  generateASCIIGraphic(data) {
    const width = 50;
    const height = 10;
    
    if (data.type === 'streak') {
      return this.generateStreakASCII(data, width, height);
    } else if (data.type === 'goal') {
      return this.generateGoalASCII(data, width, height);
    }
    
    return 'No graphic available for this data type.';
  }

  generateStreakASCII(data, width, height) {
    const streakDays = data.streak || 0;
    const maxStreak = Math.max(streakDays, 30); // Show at least 30 days scale
    
    let graphic = `🔥 Streak Visualization - ${streakDays} days\n`;
    graphic += '═'.repeat(width) + '\n';
    
    // Create a simple bar chart
    const filledWidth = Math.floor((streakDays / maxStreak) * (width - 10));
    const bar = '█'.repeat(filledWidth) + '░'.repeat((width - 10) - filledWidth);
    
    graphic += `│ ${bar} │ ${streakDays}/${maxStreak}\n`;
    graphic += '═'.repeat(width) + '\n';
    
    // Add recent activity (last 7 days)
    graphic += 'Last 7 days: ';
    for (let i = 6; i >= 0; i--) {
      const date = new Date(Date.now() - (i * 24 * 60 * 60 * 1000));
      const hasEntry = data.recentActivity && data.recentActivity[date.toDateString()];
      graphic += hasEntry ? '✅ ' : '❌ ';
    }
    
    return graphic;
  }

  generateGoalASCII(data, width, height) {
    const current = data.current || 0;
    const target = data.target || 100;
    const percentage = Math.min(100, (current / target) * 100);
    
    let graphic = `🎯 Goal Progress - ${current}/${target} (${percentage.toFixed(1)}%)\n`;
    graphic += '═'.repeat(width) + '\n';
    
    const filledWidth = Math.floor((percentage / 100) * (width - 10));
    const bar = '█'.repeat(filledWidth) + '░'.repeat((width - 10) - filledWidth);
    
    graphic += `│ ${bar} │ ${percentage.toFixed(1)}%\n`;
    graphic += '═'.repeat(width) + '\n';
    
    return graphic;
  }

  generateSVGGraphic(data) {
    // Basic SVG generation - could be expanded with more sophisticated charting
    const width = 400;
    const height = 200;
    
    let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
    svg += `<rect width="${width}" height="${height}" fill="#f0f0f0" stroke="#333" stroke-width="2"/>`;
    
    if (data.type === 'streak') {
      const streakDays = data.streak || 0;
      svg += `<text x="20" y="40" font-family="Arial, sans-serif" font-size="24" fill="#333">🔥 ${streakDays} Day Streak</text>`;
      
      // Simple bar for streak
      const barWidth = Math.min(300, streakDays * 10);
      svg += `<rect x="20" y="60" width="${barWidth}" height="30" fill="#ff6b35"/>`;
      svg += `<text x="20" y="110" font-family="Arial, sans-serif" font-size="16" fill="#666">Keep it up!</text>`;
    }
    
    svg += '</svg>';
    return svg;
  }

  generateQRCode(shareId) {
    // Placeholder for QR code generation
    // In a real implementation, you'd use a QR code library
    return `QR:staticrebel://share/${shareId}`;
  }
}

// ============================================================================
// Export Management Functions
// ============================================================================

/**
 * Export challenge data for sharing
 * @param {string} challengeId - Challenge to export
 * @param {boolean} includePersonalData - Include personal participant data
 * @returns {Object} Exportable challenge data
 */
export async function exportChallenge(challengeId, includePersonalData = false) {
  const social = new SocialManager();
  const challenge = await social.getChallenge(challengeId);
  
  if (!challenge) {
    throw new Error('Challenge not found');
  }

  const exportData = {
    ...challenge,
    exportedAt: new Date().toISOString(),
    version: '1.0'
  };

  if (!includePersonalData) {
    exportData.participants = challenge.participants.map(p => ({
      name: p.anonymous ? p.name : 'Anonymous',
      score: p.score,
      entries: p.entries.length,
      joinedAt: p.joinedAt
    }));
  }

  return exportData;
}

/**
 * Import challenge data from export
 * @param {Object} challengeData - Exported challenge data
 * @returns {Object} Imported challenge
 */
export async function importChallenge(challengeData) {
  const social = new SocialManager();
  
  const challenge = {
    ...challengeData,
    id: social.generateId(), // Generate new ID to avoid conflicts
    shareCode: social.generateShareCode(),
    importedAt: new Date().toISOString(),
    status: 'active' // Reset status for imported challenges
  };

  // Clean up participant data for imported challenges
  challenge.participants = challenge.participants.map(p => ({
    ...p,
    id: social.generateId(),
    imported: true
  }));

  const data = await social.loadChallenges();
  data.challenges.push(challenge);
  await social.saveChallenges(data);

  return challenge;
}

// ============================================================================
// Quick Access Functions
// ============================================================================

export async function createWaterChallenge(participantName, duration = 7, target = null) {
  const social = new SocialManager();
  return social.createChallenge({
    name: '💧 Water Challenge',
    description: `Drink water daily for ${duration} days!`,
    type: target ? 'goal' : 'streak',
    trackerId: 'water',
    trackerName: 'Water Intake',
    duration,
    target,
    participants: [{
      id: social.generateId(),
      name: participantName,
      joinedAt: new Date().toISOString(),
      anonymous: false,
      score: 0,
      entries: []
    }]
  });
}

export async function shareWaterStreak(streakData, anonymous = false) {
  const social = new SocialManager();
  return social.generateShareableLink({
    type: 'streak',
    ...streakData
  }, anonymous);
}

// Export the main class
export default SocialManager;