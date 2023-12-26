import definePlugin, { OptionType } from "@utils/types";
import { Devs } from "@utils/constants";
import { showNotification } from "./notifications/Notifications";
import { definePluginSettings } from "@api/Settings";
import { ChannelStore, UserStore, SelectedChannelStore, NavigationRouter } from "@webpack/common";
import { Channel, Message, User } from "discord-types/general";
import { RelationshipType } from "plugins/relationshipNotifier/types";

let ignoredUsers: string[] = [];

function switchChannels(guildId: string | null, channelId: string, messageId?: string) {
    if (!ChannelStore.hasChannel(channelId)) return;
    NavigationRouter.transitionTo(`/channels/${guildId ?? "@me"}/${channelId}`);
}

const settings = definePluginSettings({
    receiveDirectMessageNotifications: {
        description: "Choose whether to receive notifications for received messages",
        type: OptionType.BOOLEAN,
        default: false,
    },
    receiveNotificationsFromGroups: {
        description: "Choose whether to receive notifications from groups",
        type: OptionType.BOOLEAN,
        default: false,
    },
    receiveFriendRequestNotifications: {
        description: "Choose whether to receive notifications for new friend requests",
        type: OptionType.BOOLEAN,
        default: false,
    },
    ignoreUsers: {
        description: "Create a list of user ids to ignore all their notifications from (separate with commas)",
        type: OptionType.STRING,
        onChange: () => { setIgnoredUsers(); },
        default: "",
    }
});

interface IMessageCreate {
    channelId: string;
    message: Message;
}

function setIgnoredUsers(): void {
    if (settings.store.ignoreUsers !== "") {
        const newIgnoredUsers: string[] = [];
        const ignoredUsersString = settings.store.ignoreUsers.replace(/\s/g, '');
        const ignoredUsersArray = ignoredUsersString.split(",");
        ignoredUsersArray.forEach((id) => {
            newIgnoredUsers.push(id);
        });

        ignoredUsers = newIgnoredUsers;
        return;
    }

    ignoredUsers = [];
}

export default definePlugin({
    name: "InternalNotifications",
    description: "Receive notifications for internal events",
    authors: [{
        name: "Ethan",
        id: 721717126523781240n
        },
    ],
    flux: {
        async MESSAGE_CREATE({ message, channelId }: IMessageCreate) {
            if (ignoredUsers.includes(message.author.id)) return;
            await receiveMessage(message, channelId);
        },

        async RELATIONSHIP_ADD({ relationship }) {
            if (ignoredUsers.includes(relationship.user.id)) return;
            await relationshipAdd(relationship.user, relationship.type);
        }
    },
    settings,

    start() {
        setIgnoredUsers();
    }
});

async function relationshipAdd(user: User, type: Number) {
    user = UserStore.getUser(user.id);
    if (!settings.store.receiveFriendRequestNotifications) return;

    if (type === RelationshipType.FRIEND) {
        await showNotification({
            icon: user.getAvatarURL(),
            title: `${user.username} is now your friend`,
            body: "You can now message them directly.",
            onClick: () => switchChannels(null, user.id),
        });
    } else if (type === RelationshipType.INCOMING_REQUEST) {
        await showNotification({
            icon: user.getAvatarURL(),
            title: `${user.username} sent you a friend request`,
            body: "You can accept or decline it in the Friends tab.",
            onClick: () => switchChannels(null, ""),
        });
    }
}

async function receiveMessage(message: Message, channelId: string) {
    const channel: Channel = await ChannelStore.getChannel(channelId);

    if (!(channel.isDM() || channel.isGroupDM())) return; // Filter out non-DMs and non-GroupDMs
    if (channel.id === SelectedChannelStore.getChannelId()) return; // Prevent notifications from showing when the user is in the channel
    if (message.author.id === UserStore.getCurrentUser()?.id) return;

    if (!settings.store.receiveNotificationsFromGroups && channel.isGroupDM()) return;
    if (!settings.store.receiveDirectMessageNotifications && channel.isDM()) return;

    const length = message.content.length ?? 0;
    let body: string = message.content;
    if (length > 30) {
        body = body.slice(0, 30) + "...";
    }

    if (body.length === 0) {
        if (message.attachments.length > 0) {
            body = "Sent an attachment";
        } else if (message.stickers.length > 0) {
            body = "Sent a sticker";
        }
    }

    const author = message.author.id;
    const user: User = UserStore.getUser(author);

    await showNotification({
        icon: user.getAvatarURL(),
        title: `${message.author.username}`,
        body: body,
        onClick: () => switchChannels(channel.guild_id, channel.id, message.id),
    });
}
