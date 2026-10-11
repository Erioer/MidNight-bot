import { Events } from "discord.js";
import { logger, startupLog } from "../utils/logger.js";
import config from "../config/application.js";
import { reconcileReactionRoleMessages } from "../services/reactionRoleService.js";
import { reconcileTicketPanels, reconcileVerificationPanels, reconcileReactionRolePanelHealth } from "../services/panelHealthService.js";
import { reconcileLevelRoles } from "../services/leveling/levelRoleSyncService.js";
import { initRiffyAfterReady } from "../services/music/riffySetup.js";
import { applyStoredFilter } from "../services/music/musicActions.js";
import { scheduleSessionRecovery } from "../services/music/musicSessionService.js";
import { resumeMusicSummaries } from "../services/music/playerHandler.js";
import { sweepExpiredRestoreVotes } from "../services/countingGame/countingVoteLifecycle.js";

// ✅ when clean, ⚠️ when anything needs attention — scannable at a glance,
// with the full numbers kept behind the mark for greppability.
function healthMark(errors = 0, missing = 0) {
  return errors > 0 || missing > 0 ? "⚠️" : "✅";
}

export default {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    try {
      client.user.setPresence(config.bot.presence);

      startupLog(`Ready! Logged in as ${client.user.tag}`);
      startupLog(`Serving ${client.guilds.cache.size} guild(s)`);
      startupLog(`Loaded ${client.commands.size} commands`);

      if (client.config?.features?.music) {
        initRiffyAfterReady(client);
        scheduleSessionRecovery(client, { applyFilter: applyStoredFilter });
        // Clean up summary cards orphaned by the previous process (their
        // in-memory TTL timers died with it) instead of leaving stale cards.
        resumeMusicSummaries(client)
          .then((outcome) => {
            if (outcome.cleared > 0 || outcome.resumed > 0) {
              startupLog(`Music summaries: cleared ${outcome.cleared} stale, resumed ${outcome.resumed} live`);
            }
          })
          .catch(() => null);
      }

      const reconciliationSummary = await reconcileReactionRoleMessages(client);
      startupLog(
        `${healthMark(reconciliationSummary.errors)} Reaction role reconciliation: scanned ${reconciliationSummary.scannedMessages}, removed ${reconciliationSummary.removedMessages}, errors ${reconciliationSummary.errors}`
      );

      const ticketPanelSummary = await reconcileTicketPanels(client);
      startupLog(
        `${healthMark(ticketPanelSummary.errors, ticketPanelSummary.missingChannels)} Ticket panel health: scanned ${ticketPanelSummary.scannedGuilds} guilds, healthy ${ticketPanelSummary.healthyPanels}, deleted ${ticketPanelSummary.deletedPanels}, missing channel ${ticketPanelSummary.missingChannels}, recovered ${ticketPanelSummary.recoveredIds}, errors ${ticketPanelSummary.errors}`
      );

      const verificationPanelSummary = await reconcileVerificationPanels(client);
      startupLog(
        `${healthMark(verificationPanelSummary.errors, verificationPanelSummary.missingChannels)} Verification panel health: scanned ${verificationPanelSummary.scannedGuilds} guilds, healthy ${verificationPanelSummary.healthyPanels}, deleted ${verificationPanelSummary.deletedPanels}, missing channel ${verificationPanelSummary.missingChannels}, recovered ${verificationPanelSummary.recoveredIds}, errors ${verificationPanelSummary.errors}`
      );

      const reactionRolePanelSummary = await reconcileReactionRolePanelHealth(client);
      startupLog(
        `${healthMark(reactionRolePanelSummary.errors, reactionRolePanelSummary.missingChannels)} Reaction role panel health: scanned ${reactionRolePanelSummary.scannedPanels} panels, healthy ${reactionRolePanelSummary.healthyPanels}, deleted ${reactionRolePanelSummary.deletedPanels}, missing channel ${reactionRolePanelSummary.missingChannels}, recovered ${reactionRolePanelSummary.recoveredIds}, errors ${reactionRolePanelSummary.errors}`
      );

      const levelRoleSummary = await reconcileLevelRoles(client);
      startupLog(
        `${healthMark(levelRoleSummary.errors)} Level role sync: scanned ${levelRoleSummary.scannedGuilds} guilds, pruned ${levelRoleSummary.prunedRewardEntries} stale rewards, re-awarded ${levelRoleSummary.rolesReAwarded} roles, errors ${levelRoleSummary.errors}`
      );

      const voteSweepSummary = await sweepExpiredRestoreVotes(client);
      // Closed and re-armed votes are routine rotation, never a warning.
      startupLog(
        `✅ Counting restore votes: scanned ${voteSweepSummary.scanned} guilds, closed ${voteSweepSummary.closed}, re-armed ${voteSweepSummary.rearmed}`
      );
    } catch (error) {
      logger.error("Error in ready event:", error);
    }
  },
};