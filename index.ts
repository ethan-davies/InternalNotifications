import definePlugin, { OptionType } from "@utils/types";
import { Devs } from "@utils/constants";
import { showNotification } from "./notifications/Notifications";
import { definePluginSettings } from "@api/Settings";
import { ChannelStore, UserStore, SelectedChannelStore, NavigationRouter, RelationshipStore } from "@webpack/common";
import { Channel, Message, User } from "discord-types/general";
import { RelationshipType } from "plugins/relationshipNotifier/types";

let notifyFor: string[] = [];
let ignoredUsers: string[] = [];

function switchChannels(guildId: string | null, channelId: string) {
    if (!ChannelStore.hasChannel(channelId)) return;
    NavigationRouter.transitionTo(`/channels/${guildId ?? "@me"}/${channelId}/`);
}

const settings = definePluginSettings({
    logMessages: {
        description: "Choose if you want to log all messages to the Vencord notification log",
        type: OptionType.BOOLEAN,
        default: false,
    },
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
        onChange: () => { notifyFor = stringToList(settings.store.receiveNotificationsFromChannels); },
        default: "",
    },
    ignoreUsers: {
        description: "Create a list of user ids to ignore all their notifications from (separate with commas)",
        type: OptionType.STRING,
        onChange: () => { ignoredUsers = stringToList(settings.store.ignoreUsers); console.log("ignoredUsers: " + ignoredUsers); },
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
            if (ignoredUsers.includes(message.author.id))
                return;

            await receiveMessage(message, channelId);
        },

        async RELATIONSHIP_ADD({ relationship }) {
            if (ignoredUsers.includes(relationship.user.id))
                return;

            await relationshipAdd(relationship.user, relationship.type);
        }
    },
    settings,

    start() {
        ignoredUsers = stringToList(settings.store.ignoreUsers);
        notifyFor = stringToList(settings.store.receiveNotificationsFromChannels);
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
    const groupNoti = settings.store.receiveNotificationsFromGroups;
    const dmNoti = settings.store.receiveDirectMessageNotifications;

    if (!shouldNotify(channel, message.author.id)) {
        return;
    }

    if (channel.id === SelectedChannelStore.getChannelId() || message.author.id === UserStore.getCurrentUser()?.id) {
        return;
    }

    if (!dmNoti && channel.isDM() || !groupNoti && channel.isGroupDM()) {
        return;
    }

    const body = getMessageBody(message);
    const user: User = UserStore.getUser(message.author.id);

    await showNotification({
        icon: user.getAvatarURL(),
        title: `${message.author.username}`,
        body: body,
        onClick: () => switchChannels(channel.guild_id, channel.id),
        noPersist: !settings.store.logMessages,
    });
}

function shouldNotify(channel: Channel, authorId: string): boolean {
    const all = notifyFor.includes(channel.id);
    const friend = settings.store.receiveServerNotificationsFromFriends && RelationshipStore.isFriend(authorId);

    return channel.isDM() || channel.isGroupDM() || all || friend;
}

function getMessageBody(message: Message): string {
    const content = message.content;
    const attachments = message.attachments;
    const stickers = message.stickers;

    if (content.length > 30) {
        return content.slice(0, 30) + "...";
    }

    if (content.length === 0) {

        if (attachments.length > 0) {

            return "Sent an attachment";

        } else if (stickers.length > 0) {

            return "Sent a sticker";

        }

    }

    return content;
}
