/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { NotificationData, requestPermission, shouldBeNative, getRoot, NotificationQueue } from "@api/Notifications/Notifications";
import NotificationComponent from "./NotificationComponent";
import { persistNotification } from "@api/Notifications/notificationLog";

let id = 42;

function _showNotification(notification: NotificationData, id: number) {
    const root = getRoot();
    return new Promise<void>(resolve => {
        root.render(
            <NotificationComponent key={id} {...notification} onClose={() => {
                notification.onClose?.();
                root.render(null);
                resolve();
            }} />,
        );
    });
}

export async function showNotification(data: NotificationData) {
    persistNotification(data);

    if (shouldBeNative() && await requestPermission()) {
        const { title, body, icon, image, onClick = null, onClose = null } = data;
        const n = new Notification(title, {
            body,
            icon,
            image
        });
        n.onclick = onClick;
        n.onclose = onClose;
    } else {
        NotificationQueue.push(() => _showNotification(data, id++));
    }
}
