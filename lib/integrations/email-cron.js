/**
 * Email Cron Job Handler
 * Executes scheduled email tasks
 */

import { getEmailService } from './email.js';
import { getDB } from '../db.js';

// Generate sample data for emails - in a real implementation, this would fetch actual user data
function generateSampleData(type, userContext = {}) {
  const today = new Date();
  
  switch (type) {
    case 'daily-summary':
      return {
        summary: userContext.summary || "You had a productive day! You worked on 3 goals, completed 5 tasks, and maintained your daily habits. Keep up the great momentum!",
        goalsWorked: userContext.goalsWorked || 3,
        tasksCompleted: userContext.tasksCompleted || 5,
        activeTime: userContext.activeTime || "3h 45m",
        streaks: userContext.streaks || "💧 Water: 15 days • 📚 Reading: 8 days • 💪 Exercise: 23 days",
        tomorrowFocus: userContext.tomorrowFocus || "Focus on completing the project proposal and maintain your exercise routine.",
        milestoneReached: userContext.milestoneReached || null
      };
      
    case 'weekly-digest':
      return {
        weekSummary: userContext.weekSummary || "This week you made excellent progress on your goals! You maintained consistency in your habits and completed several important tasks.",
        totalGoals: userContext.totalGoals || 5,
        completedTasks: userContext.completedTasks || 28,
        activeDays: userContext.activeDays || 7,
        totalTime: userContext.totalTime || "24h 30m",
        goalsProgress: userContext.goalsProgress || "• Fitness Goal: 85% complete\n• Learning Goal: 72% complete\n• Project Goal: 90% complete",
        overallProgress: userContext.overallProgress || 82,
        achievements: userContext.achievements || ["7-day streak", "Goal milestone", "Perfect week"],
        nextWeekFocus: userContext.nextWeekFocus || "Continue building on your momentum. Focus on completing your project goal and maintaining your streaks."
      };
      
    default:
      return {};
  }
}

// Get user data from database or generate sample data
async function getUserData(emailType, userEmail) {
  const db = getDB();
  
  try {
    // Try to get real user data from database
    // This is a simplified version - in practice, you'd have more sophisticated data retrieval
    const userData = db.prepare(`
      SELECT * FROM user_stats 
      WHERE email = ? 
      AND date > date('now', '-7 days')
      ORDER BY date DESC
      LIMIT 1
    `).get(userEmail);
    
    if (userData) {
      return {
        summary: userData.daily_summary,
        goalsWorked: userData.goals_worked,
        tasksCompleted: userData.tasks_completed,
        activeTime: userData.active_time,
        streaks: userData.current_streaks
      };
    }
  } catch (error) {
    // Database might not have the table yet, that's OK
    console.log('No user data found, using sample data');
  }
  
  // Return sample data if no real data available
  return generateSampleData(emailType);
}

export async function executeEmailJob(job) {
  console.log(`Executing email job: ${job.name} (${job.data?.action})`);
  
  try {
    const emailService = await getEmailService();
    
    if (!emailService.isConfigured()) {
      throw new Error('Email not configured');
    }
    
    const { action, userEmail } = job.data;
    const userData = await getUserData(action, userEmail);
    
    let success = false;
    
    switch (action) {
      case 'daily-summary':
        success = await emailService.sendDailySummary(userEmail, userData);
        break;
        
      case 'weekly-digest':
        success = await emailService.sendWeeklyDigest(userEmail, userData);
        break;
        
      default:
        throw new Error(`Unknown email action: ${action}`);
    }
    
    if (success) {
      console.log(`✅ Email sent successfully: ${action} to ${userEmail}`);
      await emailService.logEmailSent(action, userEmail, true);
    } else {
      console.error(`❌ Failed to send email: ${action} to ${userEmail}`);
      await emailService.logEmailSent(action, userEmail, false);
    }
    
    return success;
    
  } catch (error) {
    console.error(`Failed to execute email job:`, error.message);
    
    // Try to log the error if possible
    try {
      const emailService = await getEmailService();
      await emailService.logEmailSent(job.data?.action || 'unknown', job.data?.userEmail || 'unknown', false);
    } catch (logError) {
      // Ignore logging errors
    }
    
    return false;
  }
}

// Handle streak milestone notifications (called from goal/streak systems)
export async function handleStreakMilestone(userEmail, streakData) {
  try {
    const emailService = await getEmailService();
    
    if (!emailService.isConfigured()) return false;
    
    const config = emailService.config;
    if (!config.notifications?.streakMilestones) return false;
    
    const success = await emailService.sendStreakMilestone(userEmail, {
      milestone: streakData.milestone,
      streakType: streakData.type,
      percentage: streakData.percentage || 100,
      totalDays: streakData.totalDays || streakData.milestone,
      nextDay: streakData.milestone + 1
    });
    
    await emailService.logEmailSent('streak-milestone', userEmail, success);
    return success;
    
  } catch (error) {
    console.error('Failed to send streak milestone email:', error.message);
    return false;
  }
}

// Handle goal completion notifications (called from goal system)
export async function handleGoalCompletion(userEmail, goalData) {
  try {
    const emailService = await getEmailService();
    
    if (!emailService.isConfigured()) return false;
    
    const config = emailService.config;
    if (!config.notifications?.goalCompletion) return false;
    
    const success = await emailService.sendGoalCompletion(userEmail, {
      goalName: goalData.name,
      daysToComplete: goalData.daysToComplete || 'N/A',
      tasksCompleted: goalData.tasksCompleted || 'N/A',
      totalProgress: goalData.totalProgress || '100%',
      timeline: goalData.timeline || null
    });
    
    await emailService.logEmailSent('goal-completion', userEmail, success);
    return success;
    
  } catch (error) {
    console.error('Failed to send goal completion email:', error.message);
    return false;
  }
}