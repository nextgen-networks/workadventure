import type { AxiosResponse } from "axios";
import axios from "axios";
import type { WokaList } from "@workadventure/messages";
import { wokaList } from "@workadventure/messages";
import { ADMIN_API_TOKEN, ADMIN_API_URL } from "../enums/EnvironmentVariable";
import type { WokaServiceInterface } from "./WokaServiceInterface";
import type { AdminCapabilities } from "./adminApi/AdminCapabilities";
import { AdminCapability } from "./adminApi/AdminCapabilities";

class AdminWokaService implements WokaServiceInterface {
    /**
     * Returns the list of all available Wokas for the current user.
     */
    getWokaList(roomUrl: string, token: string): Promise<WokaList | undefined> {
        /**
         * @openapi
         * /api/woka/list:
         *   get:
         *     tags: ["AdminAPI"]
         *     description: Get all the woka from the world specified
         *     security:
         *      - Bearer: []
         *     produces:
         *      - "application/json"
         *     parameters:
         *      - name: "roomUrl"
         *        in: "query"
         *        description: "The slug of the room"
         *        type: "string"
         *        required: true
         *        example: "/@/teamSlug/worldSlug/roomSlug"
         *      - name: "uuid"
         *        in: "query"
         *        description: "The uuid of the user \n It can be an uuid or an email"
         *        type: "string"
         *        required: true
         *        example: "998ce839-3dea-4698-8b41-ebbdf7688ad8"
         *     responses:
         *       200:
         *         description: The list of the woka
         *         schema:
         *             type: array
         *             items:
         *                 $ref: '#/definitions/WokaList'
         *       404:
         *         description: Error while retrieving the data
         *         schema:
         *             $ref: '#/definitions/ErrorApiErrorData'
         */
        return axios
            .get<unknown, AxiosResponse<unknown>>(`${ADMIN_API_URL}/api/woka/list`, {
                headers: { Authorization: `${ADMIN_API_TOKEN}` },
                params: {
                    roomUrl,
                    uuid: token,
                },
            })
            .then((res) => {
                return wokaList.parse(res.data);
            })
            .catch((err) => {
                console.error(`Cannot get woka list from admin API with token: ${token}`, err);
                return undefined;
            });
    }

    isEnabled(capabilities: AdminCapabilities): boolean {
        return capabilities.has(AdminCapability.WokaList);
    }
}

export const adminWokaService = new AdminWokaService();
