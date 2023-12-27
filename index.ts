import definePlugin, { OptionType } from "@utils/types";
import { Devs } from "@utils/constants";
import { showNotification } from "./notifications/Notifications";
import { definePluginSettings } from "@api/Settings";
import { ChannelStore, UserStore, SelectedChannelStore, NavigationRouter, RelationshipStore } from "@webpack/common";
import { Channel, Message, User } from "discord-types/general";
import { RelationshipType } from "plugins/relationshipNotifier/types";

let channelsToReceiveNotificationsFrom: string[] = [];
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
    receiveServerNotificationsFromFriends: {
        description: "Choose whether to receive notifications for new messages in servers from friends",
        type: OptionType.BOOLEAN,
        default: false,
    },
    receiveNotificationsFromChannels: {
        description: "List of channel ids to receive all notifications from (separate with commas)",
        type: OptionType.STRING,
        onChange: () => { channelsToReceiveNotificationsFrom = stringToList(settings.store.receiveNotificationsFromChannels); },
        default: "",
    },
    ignoreUsers: {
        description: "Create a list of user ids to ignore all their notifications from (separate with commas)",
        type: OptionType.STRING,
        onChange: () => { ignoredUsers = stringToList(settings.store.ignoreUsers); },
        default: "",
    },
});

interface IMessageCreate {
    channelId: string;
    message: Message;
}

function stringToList(str: string): string[] {
    if (str !== "") {
        const array: string[] = [];
        const string = str.replace(/\s/g, '');
        const splitArray = string.split(",");
        splitArray.forEach((id) => {
            array.push(id);
        });

        return array;
    }
    return [];
}

export default definePlugin({
    name: "InternalNotifications",
    description: "Receive notifications for internal events",
    authors: [Devs.Ethan],
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
        ignoredUsers = stringToList(settings.store.ignoreUsers);
        channelsToReceiveNotificationsFrom = stringToList(settings.store.receiveNotificationsFromChannels);
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

    if (!(channel.isDM() || channel.isGroupDM())) {
        if (!channelsToReceiveNotificationsFrom.includes(channelId)) {
            if (!settings.store.receiveServerNotificationsFromFriends) {
                return;
            } else {
                if (!RelationshipStore.isFriend(message.author.id)) {
                    return;
                }
            }
        }
    }

    if (channel.id === SelectedChannelStore.getChannelId()) return; // Prevent notifications from showing when the user is in the channel
    if (message.author.id === UserStore.getCurrentUser()?.id) return; // Prevent notifications from showing when the user sent the message

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