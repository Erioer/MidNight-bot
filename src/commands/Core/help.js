import {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from "discord.js";
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { NO_PINGS, container, divider, text, v2Flags } from "../../utils/componentsV2.js";
import { failureContainer } from "../../services/economy/economyViews.js";
import { createSelectMenu } from "../../utils/components.js";
import { getCategoryIcon, formatCategoryName } from "../../config/commands/commandCategories.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CATEGORY_SELECT_ID = "help-category-select";
const ALL_COMMANDS_ID = "help-all-commands";
const BUG_REPORT_BUTTON_ID = "help-bug-report";
const HELP_MENU_TIMEOUT_MS = 5 * 60 * 1000;

export async function createInitialHelpMenu(client) {
    const commandsPath = path.join(__dirname, "../../commands");
    const categoryDirs = (
        await fs.readdir(commandsPath, { withFileTypes: true })
    )
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name)
        .sort();

    const options = [
        {
            label: "📋 All Commands",
            description: "Browse every available command in a single list",
            value: ALL_COMMANDS_ID,
        },
        ...categoryDirs.map((category) => {
            const categoryName = formatCategoryName(category);
            const icon = getCategoryIcon(category);
            return {
                label: `${icon} ${categoryName}`.slice(0, 100),
                description: `View commands in the ${categoryName} category`.slice(0, 100),
                value: category,
            };
        }),
    ];

    const botName = client?.user?.username || "Bot";
    const menuContainer = container({
        parts: [
            text(`### 📖 ${botName} Help`),
            text('Set up your server, pick what to enable, then browse commands below.'),
            divider(),
            text(
                [
                    '**Getting Started**',
                    '**1. Launch setup** — Run `/configwizard` to configure prefix, mod role, and logs.',
                    '**2. Enable systems** — Use `/commands dashboard` to turn categories on or off.',
                    '**3. Browse commands** — Use the menu below to view categories and commands.',
                    '',
                    '**How It Works**',
                    '• Dashboard commands manage each feature visually',
                    '• Settings are saved per server',
                    '• Slash commands and prefixes both work once enabled',
                    '',
                    `-# ${botName} is [open source](https://github.com/Erioer/MidNight-bot)`,
                ].join('\n'),
            ),
            divider(),
            text('-# Made with love'),
        ],
    });

    const bugReportButton = new ButtonBuilder()
        .setCustomId(BUG_REPORT_BUTTON_ID)
        .setLabel("Report Bug")
        .setStyle(ButtonStyle.Danger);

    const supportButton = new ButtonBuilder()
        .setLabel("Support Server")
        .setURL("https://discord.gg/mMMr46zywH")
        .setStyle(ButtonStyle.Link);

    const selectRow = createSelectMenu(
        CATEGORY_SELECT_ID,
        "Select to view the commands",
        options,
    );

    const buttonRow = new ActionRowBuilder().addComponents([
        bugReportButton,
        supportButton,
    ]);

    return {
        components: [menuContainer, selectRow, buttonRow],
        flags: v2Flags(),
    };
}

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("Displays the help menu with all available commands"),

    async execute(interaction, guildConfig, client) {
        
        const { MessageFlags } = await import('discord.js');
        await InteractionHelper.safeDefer(interaction);

        const { components } = await createInitialHelpMenu(client);

        await InteractionHelper.safeEditReply(interaction, {
            components,
            flags: v2Flags(),
            allowedMentions: NO_PINGS,
        });

        setTimeout(async () => {
            try {
                if (!InteractionHelper.isInteractionValid(interaction)) {
                    return;
                }

                await InteractionHelper.safeEditReply(interaction, {
                    components: [
                        failureContainer({
                            title: 'Help menu closed',
                            body: 'Help menu has been closed, use /help again.',
                        }),
                    ],
                    flags: v2Flags(),
                    allowedMentions: NO_PINGS,
                });
            } catch (error) {
                logger.debug('Help menu close edit failed (interaction may have expired):', error?.message);
            }
        }, HELP_MENU_TIMEOUT_MS);
    },
};