import axios from "axios";

import { get } from "svelte/store";
import {
    apiVersionHash,
    AnswerMessage,
    AvailabilityStatus,
    CharacterLayerMessage,
    ClientToServerMessage as ClientToServerMessageTsProto,
    EditMapCommandMessage,
    EmoteEventMessage as EmoteEventMessageTsProto,
    ErrorMessage as ErrorMessageTsProto,
    ErrorScreenMessage as ErrorScreenMessageTsProto,
    GroupDeleteMessage as GroupDeleteMessageTsProto,
    GroupUpdateMessage as GroupUpdateMessageTsProto,
    JitsiJwtAnswer,
    JoinBBBMeetingAnswer,
    LeaveMucRoomMessage,
    MoveToPositionMessage as MoveToPositionMessageProto,
    MucRoomDefinitionMessage,
    PlayerDetailsUpdatedMessage as PlayerDetailsUpdatedMessageTsProto,
    PositionMessage as PositionMessageTsProto,
    PositionMessage_Direction,
    ServerToClientMessage as ServerToClientMessageTsProto,
    SetPlayerDetailsMessage as SetPlayerDetailsMessageTsProto,
    SetPlayerVariableMessage_Scope,
    QueryMessage,
    TokenExpiredMessage,
    UserJoinedMessage as UserJoinedMessageTsProto,
    UserLeftMessage as UserLeftMessageTsProto,
    UserMovedMessage as UserMovedMessageTsProto,
    ViewportMessage as ViewportMessageTsProto,
    WebRtcDisconnectMessage as WebRtcDisconnectMessageTsProto,
    WorldConnexionMessage,
    XmppSettingsMessage,
    RefreshRoomMessage,
    AddSpaceFilterMessage,
    UpdateSpaceFilterMessage,
    RemoveSpaceFilterMessage,
    AddSpaceUserMessage,
    UpdateSpaceUserMessage,
    RemoveSpaceUserMessage,
} from "@workadventure/messages";
import { BehaviorSubject, Subject } from "rxjs";
import type { AreaData, AtLeast, EntityData } from "@workadventure/map-editor";
import { selectCharacterSceneVisibleStore } from "../Stores/SelectCharacterStore";
import { gameManager } from "../Phaser/Game/GameManager";
import { SelectCharacterScene, SelectCharacterSceneName } from "../Phaser/Login/SelectCharacterScene";
import { errorScreenStore } from "../Stores/ErrorScreenStore";
import {
    inviteUserActivated,
    mapEditorActivated,
    menuIconVisiblilityStore,
    menuVisiblilityStore,
    warningContainerStore,
} from "../Stores/MenuStore";
import { followRoleStore, followUsersStore } from "../Stores/FollowStore";
import type { BodyResourceDescriptionInterface } from "../Phaser/Entity/PlayerTextures";
import type { UserSimplePeerInterface } from "../WebRtc/SimplePeer";
import { ENABLE_FEATURE_MAP_EDITOR, UPLOADER_URL } from "../Enum/EnvironmentVariable";
import type { SetPlayerVariableEvent } from "../Api/Events/SetPlayerVariableEvent";
import { iframeListener } from "../Api/IframeListener";
import { assertObjectKeys } from "../Utils/CustomTypeGuards";
import { ABSOLUTE_PUSHER_URL } from "../Enum/ComputedConst";
import { localUserStore } from "./LocalUserStore";
import { connectionManager } from "./ConnectionManager";
import { adminMessagesService } from "./AdminMessagesService";
import type {
    GroupCreatedUpdatedMessageInterface,
    GroupUsersUpdateMessageInterface,
    MessageUserJoined,
    PlayGlobalMessageInterface,
    PositionInterface,
    RoomJoinedMessageInterface,
    ViewportInterface,
    WebRtcSignalReceivedMessageInterface,
} from "./ConnexionModels";

// This must be greater than IoSocketController's PING_INTERVAL
const manualPingDelay = 100000;

export class RoomConnection implements RoomConnection {
    private readonly socket: WebSocket;
    private userId: number | null = null;
    private static websocketFactory: null | ((url: string) => any) = null; // eslint-disable-line @typescript-eslint/no-explicit-any
    private closed = false;
    private tags: string[] = [];
    private _userRoomToken: string | undefined;

    private readonly _errorMessageStream = new Subject<ErrorMessageTsProto>();
    public readonly errorMessageStream = this._errorMessageStream.asObservable();

    private readonly _errorScreenMessageStream = new Subject<ErrorScreenMessageTsProto>();
    public readonly errorScreenMessageStream = this._errorScreenMessageStream.asObservable();

    private readonly _roomJoinedMessageStream = new Subject<{
        connection: RoomConnection;
        room: RoomJoinedMessageInterface;
    }>();
    public readonly roomJoinedMessageStream = this._roomJoinedMessageStream.asObservable();

    private readonly _webRtcStartMessageStream = new Subject<UserSimplePeerInterface>();
    public readonly webRtcStartMessageStream = this._webRtcStartMessageStream.asObservable();

    private readonly _webRtcSignalToClientMessageStream = new Subject<WebRtcSignalReceivedMessageInterface>();
    public readonly webRtcSignalToClientMessageStream = this._webRtcSignalToClientMessageStream.asObservable();

    private readonly _webRtcScreenSharingSignalToClientMessageStream =
        new Subject<WebRtcSignalReceivedMessageInterface>();
    public readonly webRtcScreenSharingSignalToClientMessageStream =
        this._webRtcScreenSharingSignalToClientMessageStream.asObservable();

    private readonly _webRtcDisconnectMessageStream = new Subject<WebRtcDisconnectMessageTsProto>();
    public readonly webRtcDisconnectMessageStream = this._webRtcDisconnectMessageStream.asObservable();

    private readonly _teleportMessageMessageStream = new Subject<string>();
    public readonly teleportMessageMessageStream = this._teleportMessageMessageStream.asObservable();

    private readonly _worldFullMessageStream = new Subject<string | null>();
    public readonly worldFullMessageStream = this._worldFullMessageStream.asObservable();

    private readonly _worldConnexionMessageStream = new Subject<WorldConnexionMessage>();
    public readonly worldConnexionMessageStream = this._worldConnexionMessageStream.asObservable();

    private readonly _tokenExpiredMessageStream = new Subject<TokenExpiredMessage>();
    public readonly tokenExpiredMessageStream = this._tokenExpiredMessageStream.asObservable();

    private readonly _userMovedMessageStream = new Subject<UserMovedMessageTsProto>();
    public readonly userMovedMessageStream = this._userMovedMessageStream.asObservable();

    private readonly _groupUpdateMessageStream = new Subject<GroupCreatedUpdatedMessageInterface>();
    public readonly groupUpdateMessageStream = this._groupUpdateMessageStream.asObservable();

    private readonly _groupUsersUpdateMessageStream = new Subject<GroupUsersUpdateMessageInterface>();
    public readonly groupUsersUpdateMessageStream = this._groupUsersUpdateMessageStream.asObservable();

    private readonly _groupDeleteMessageStream = new Subject<GroupDeleteMessageTsProto>();
    public readonly groupDeleteMessageStream = this._groupDeleteMessageStream.asObservable();

    private readonly _userJoinedMessageStream = new Subject<MessageUserJoined>();
    public readonly userJoinedMessageStream = this._userJoinedMessageStream.asObservable();

    private readonly _userLeftMessageStream = new Subject<UserLeftMessageTsProto>();
    public readonly userLeftMessageStream = this._userLeftMessageStream.asObservable();

    private readonly _refreshRoomMessageStream = new Subject<RefreshRoomMessage>();
    public readonly refreshRoomMessageStream = this._refreshRoomMessageStream.asObservable();

    private readonly _itemEventMessageStream = new Subject<{
        itemId: number;
        event: string;
        parameters: unknown;
        state: unknown;
    }>();
    public readonly itemEventMessageStream = this._itemEventMessageStream.asObservable();

    private readonly _emoteEventMessageStream = new Subject<EmoteEventMessageTsProto>();
    public readonly emoteEventMessageStream = this._emoteEventMessageStream.asObservable();

    private readonly _variableMessageStream = new Subject<{ name: string; value: unknown }>();
    public readonly variableMessageStream = this._variableMessageStream.asObservable();

    private readonly _editMapCommandMessageStream = new Subject<EditMapCommandMessage>();
    public readonly editMapCommandMessageStream = this._editMapCommandMessageStream.asObservable();

    private readonly _playerDetailsUpdatedMessageStream = new Subject<PlayerDetailsUpdatedMessageTsProto>();
    public readonly playerDetailsUpdatedMessageStream = this._playerDetailsUpdatedMessageStream.asObservable();

    private readonly _connectionErrorStream = new Subject<CloseEvent>();
    public readonly connectionErrorStream = this._connectionErrorStream.asObservable();
    private readonly _xmppSettingsMessageStream = new BehaviorSubject<XmppSettingsMessage | undefined>(undefined);
    public readonly xmppSettingsMessageStream = this._xmppSettingsMessageStream.asObservable();
    // If this timeout triggers, we consider the connection is lost (no ping received)
    private timeout: ReturnType<typeof setInterval> | undefined = undefined;

    private readonly _moveToPositionMessageStream = new Subject<MoveToPositionMessageProto>();
    public readonly moveToPositionMessageStream = this._moveToPositionMessageStream.asObservable();

    private readonly _joinMucRoomMessageStream = new Subject<MucRoomDefinitionMessage>();
    public readonly joinMucRoomMessageStream = this._joinMucRoomMessageStream.asObservable();

    private readonly _leaveMucRoomMessageStream = new Subject<LeaveMucRoomMessage>();
    public readonly leaveMucRoomMessageStream = this._leaveMucRoomMessageStream.asObservable();
    private readonly _addSpaceUserMessageStream = new Subject<AddSpaceUserMessage>();
    public readonly addSpaceUserMessageStream = this._addSpaceUserMessageStream.asObservable();
    private readonly _updateSpaceUserMessageStream = new Subject<UpdateSpaceUserMessage>();
    public readonly updateSpaceUserMessageStream = this._updateSpaceUserMessageStream.asObservable();
    private readonly _removeSpaceUserMessageStream = new Subject<RemoveSpaceUserMessage>();
    public readonly removeSpaceUserMessageStream = this._removeSpaceUserMessageStream.asObservable();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public static setWebsocketFactory(websocketFactory: (url: string) => any): void {
        RoomConnection.websocketFactory = websocketFactory;
    }

    /**
     *
     * @param token A JWT token containing the email of the user
     * @param roomUrl The URL of the room in the form "https://example.com/_/[instance]/[map_url]" or "https://example.com/@/[org]/[event]/[map]"
     * @param name
     * @param characterLayers
     * @param position
     * @param viewport
     * @param companion
     * @param availabilityStatus
     * @param lastCommandId
     */
    public constructor(
        token: string | null,
        roomUrl: string,
        name: string,
        characterLayers: string[],
        position: PositionInterface,
        viewport: ViewportInterface,
        companion: string | null,
        availabilityStatus: AvailabilityStatus,
        lastCommandId?: string
    ) {
        let url = ABSOLUTE_PUSHER_URL;
        url = url.replace("http://", "ws://").replace("https://", "wss://");
        if (!url.endsWith("/")) {
            url += "/";
        }
        url += "room";
        url += "?roomId=" + encodeURIComponent(roomUrl);
        if (token) {
            url += "&token=" + encodeURIComponent(token);
        }
        url += "&name=" + encodeURIComponent(name);
        for (const layer of characterLayers) {
            url += "&characterLayers=" + encodeURIComponent(layer);
        }
        url += "&x=" + Math.floor(position.x);
        url += "&y=" + Math.floor(position.y);
        url += "&top=" + Math.floor(viewport.top);
        url += "&bottom=" + Math.floor(viewport.bottom);
        url += "&left=" + Math.floor(viewport.left);
        url += "&right=" + Math.floor(viewport.right);
        if (companion) {
            url += "&companion=" + encodeURIComponent(companion);
        }
        url += "&availabilityStatus=" + availabilityStatus;
        if (lastCommandId) {
            url += "&lastCommandId=" + lastCommandId;
        }
        url += "&version=" + apiVersionHash;

        if (RoomConnection.websocketFactory) {
            this.socket = RoomConnection.websocketFactory(url);
        } else {
            this.socket = new WebSocket(url);
        }

        this.socket.binaryType = "arraybuffer";

        this.socket.onopen = () => {
            console.info("Socket has been opened");
            this.resetPingTimeout();
        };

        this.socket.addEventListener("close", (event) => {
            console.info("Socket has been closed", this.userId, this.closed, event);
            if (this.timeout) {
                clearTimeout(this.timeout);
            }

            // If we are not connected yet (if a JoinRoomMessage was not sent), we need to retry.
            if (this.userId === null && !this.closed) {
                this._connectionErrorStream.next(event);
            }
        });

        this.socket.onmessage = (messageEvent) => {
            const arrayBuffer: ArrayBuffer = messageEvent.data;
            const initCharacterLayers = characterLayers;

            const serverToClientMessage = ServerToClientMessageTsProto.decode(new Uint8Array(arrayBuffer));
            //const message = ServerToClientMessage.deserializeBinary(new Uint8Array(arrayBuffer));

            const message = serverToClientMessage.message;
            if (message === undefined) {
                return;
            }

            switch (message.$case) {
                case "batchMessage": {
                    for (const subMessageWrapper of message.batchMessage.payload) {
                        const subMessage = subMessageWrapper.message;
                        if (subMessage === undefined) {
                            return;
                        }
                        switch (subMessage.$case) {
                            case "errorMessage": {
                                this._errorMessageStream.next(subMessage.errorMessage);
                                console.error("An error occurred server side: " + subMessage.errorMessage.message);
                                break;
                            }
                            case "userJoinedMessage": {
                                this._userJoinedMessageStream.next(
                                    this.toMessageUserJoined(subMessage.userJoinedMessage)
                                );
                                break;
                            }
                            case "userLeftMessage": {
                                this._userLeftMessageStream.next(subMessage.userLeftMessage);
                                break;
                            }
                            case "userMovedMessage": {
                                this._userMovedMessageStream.next(subMessage.userMovedMessage);
                                break;
                            }
                            case "groupUpdateMessage": {
                                this._groupUpdateMessageStream.next(
                                    this.toGroupCreatedUpdatedMessage(subMessage.groupUpdateMessage)
                                );
                                break;
                            }
                            case "groupDeleteMessage": {
                                this._groupDeleteMessageStream.next(subMessage.groupDeleteMessage);
                                break;
                            }
                            case "itemEventMessage": {
                                this._itemEventMessageStream.next({
                                    itemId: subMessage.itemEventMessage.itemId,
                                    event: subMessage.itemEventMessage.event,
                                    parameters: JSON.parse(subMessage.itemEventMessage.parametersJson),
                                    state: JSON.parse(subMessage.itemEventMessage.stateJson),
                                });
                                break;
                            }
                            case "emoteEventMessage": {
                                this._emoteEventMessageStream.next(subMessage.emoteEventMessage);
                                break;
                            }
                            case "playerDetailsUpdatedMessage": {
                                this._playerDetailsUpdatedMessageStream.next(subMessage.playerDetailsUpdatedMessage);
                                break;
                            }
                            case "variableMessage": {
                                const name = subMessage.variableMessage.name;
                                const value = RoomConnection.unserializeVariable(subMessage.variableMessage.value);
                                this._variableMessageStream.next({ name, value });
                                break;
                            }
                            case "pingMessage": {
                                this.resetPingTimeout();
                                this.sendPong();
                                break;
                            }
                            case "editMapCommandMessage": {
                                const message = subMessage.editMapCommandMessage;
                                this._editMapCommandMessageStream.next(message);
                                break;
                            }
                            case "joinMucRoomMessage": {
                                console.info("[sendChatMessagePrompt] RoomConnection => joinMucRoomMessage received");
                                this._joinMucRoomMessageStream.next(
                                    subMessage.joinMucRoomMessage.mucRoomDefinitionMessage
                                );
                                break;
                            }
                            case "leaveMucRoomMessage": {
                                console.info("[sendChatMessagePrompt] RoomConnection => leaveMucRoomMessage received");
                                this._leaveMucRoomMessageStream.next(subMessage.leaveMucRoomMessage);
                                break;
                            }
                            case "addSpaceUserMessage": {
                                this._addSpaceUserMessageStream.next(subMessage.addSpaceUserMessage);
                                break;
                            }
                            case "updateSpaceUserMessage": {
                                this._updateSpaceUserMessageStream.next(subMessage.updateSpaceUserMessage);
                                break;
                            }
                            case "removeSpaceUserMessage": {
                                this._removeSpaceUserMessageStream.next(subMessage.removeSpaceUserMessage);
                                break;
                            }
                            default: {
                                // Security check: if we forget a "case", the line below will catch the error at compile-time.
                                //@ts-ignore
                                const _exhaustiveCheck: never = subMessage;
                            }
                        }
                    }
                    break;
                }
                case "roomJoinedMessage": {
                    const roomJoinedMessage = message.roomJoinedMessage;

                    const items: { [itemId: number]: unknown } = {};
                    for (const item of roomJoinedMessage.item) {
                        items[item.itemId] = JSON.parse(item.stateJson);
                    }

                    const variables = new Map<string, unknown>();
                    for (const variable of roomJoinedMessage.variable) {
                        variables.set(variable.name, RoomConnection.unserializeVariable(variable.value));
                    }

                    const playerVariables = new Map<string, unknown>();
                    for (const variable of roomJoinedMessage.playerVariable) {
                        playerVariables.set(variable.name, RoomConnection.unserializeVariable(variable.value));
                    }

                    const editMapCommandsArrayMessage = roomJoinedMessage.editMapCommandsArrayMessage;
                    let commandsToApply: EditMapCommandMessage[] | undefined = undefined;
                    if (editMapCommandsArrayMessage) {
                        commandsToApply = editMapCommandsArrayMessage.editMapCommands;
                    }

                    this.userId = roomJoinedMessage.currentUserId;
                    this.tags = roomJoinedMessage.tag;
                    this._userRoomToken = roomJoinedMessage.userRoomToken;
                    //define if there is invite user option activated
                    inviteUserActivated.set(
                        roomJoinedMessage.activatedInviteUser != undefined
                            ? roomJoinedMessage.activatedInviteUser
                            : true
                    );
                    mapEditorActivated.set(ENABLE_FEATURE_MAP_EDITOR && roomJoinedMessage.canEdit);

                    // If there are scripts from the admin, run it
                    if (roomJoinedMessage.applications != undefined) {
                        for (const script of roomJoinedMessage.applications) {
                            iframeListener.registerScript(script.script).catch((err) => {
                                console.error("roomJoinedMessage => registerScript => err", err);
                            });
                        }
                    }

                    // If one of the URLs sent to us does not exist, let's go to the Woka selection screen.
                    if (
                        roomJoinedMessage.characterLayer.length !== initCharacterLayers.length ||
                        roomJoinedMessage.characterLayer.find((layer) => !layer.url)
                    ) {
                        console.info("Your Woka texture is invalid for this world, got to select Woka scene");
                        this.goToSelectYourWokaScene();
                        this.closed = true;
                    }

                    if (this.closed) {
                        this.closeConnection();
                        break;
                    }

                    const characterLayers = roomJoinedMessage.characterLayer.map(
                        this.mapCharacterLayerToBodyResourceDescription.bind(this)
                    );

                    this._roomJoinedMessageStream.next({
                        connection: this,
                        room: {
                            items,
                            variables,
                            characterLayers,
                            playerVariables,
                            commandsToApply,
                            webrtcUserName: roomJoinedMessage.webrtcUserName,
                            webrtcPassword: roomJoinedMessage.webrtcPassword,
                        } as RoomJoinedMessageInterface,
                    });

                    break;
                }
                case "worldFullMessage": {
                    this._worldFullMessageStream.next(null);
                    this.closed = true;
                    break;
                }
                case "invalidTextureMessage": {
                    console.info(
                        "Your Woka texture is invalid for this world, got to select Woka scene. Message: ",
                        message
                    );
                    this.goToSelectYourWokaScene();

                    this.closed = true;
                    break;
                }
                case "tokenExpiredMessage": {
                    connectionManager.logout().catch((e) => console.error(e));
                    this.closed = true; //technically, this isn't needed since loadOpenIDScreen() will do window.location.assign() but I prefer to leave it for consistency
                    break;
                }
                case "worldConnexionMessage": {
                    this._worldFullMessageStream.next(message.worldConnexionMessage.message);
                    this.closed = true;
                    break;
                }
                case "webRtcSignalToClientMessage": {
                    this._webRtcSignalToClientMessageStream.next({
                        userId: message.webRtcSignalToClientMessage.userId,
                        signal: JSON.parse(message.webRtcSignalToClientMessage.signal),
                        webRtcUser: message.webRtcSignalToClientMessage.webrtcUserName
                            ? message.webRtcSignalToClientMessage.webrtcUserName
                            : undefined,
                        webRtcPassword: message.webRtcSignalToClientMessage.webrtcPassword
                            ? message.webRtcSignalToClientMessage.webrtcPassword
                            : undefined,
                    });
                    break;
                }
                case "webRtcScreenSharingSignalToClientMessage": {
                    this._webRtcScreenSharingSignalToClientMessageStream.next({
                        userId: message.webRtcScreenSharingSignalToClientMessage.userId,
                        signal: JSON.parse(message.webRtcScreenSharingSignalToClientMessage.signal),
                        webRtcUser: message.webRtcScreenSharingSignalToClientMessage.webrtcUserName
                            ? message.webRtcScreenSharingSignalToClientMessage.webrtcUserName
                            : undefined,
                        webRtcPassword: message.webRtcScreenSharingSignalToClientMessage.webrtcPassword
                            ? message.webRtcScreenSharingSignalToClientMessage.webrtcPassword
                            : undefined,
                    });
                    break;
                }
                case "webRtcStartMessage": {
                    this._webRtcStartMessageStream.next({
                        userId: message.webRtcStartMessage.userId,
                        initiator: message.webRtcStartMessage.initiator,
                        webRtcUser: message.webRtcStartMessage.webrtcUserName
                            ? message.webRtcStartMessage.webrtcUserName
                            : undefined,
                        webRtcPassword: message.webRtcStartMessage.webrtcPassword
                            ? message.webRtcStartMessage.webrtcPassword
                            : undefined,
                    });
                    break;
                }
                case "webRtcDisconnectMessage": {
                    this._webRtcDisconnectMessageStream.next(message.webRtcDisconnectMessage);
                    break;
                }
                case "teleportMessageMessage": {
                    // FIXME: WHY IS THIS UNUSED? CAN WE REMOVE THIS???
                    this._teleportMessageMessageStream.next(message.teleportMessageMessage.map);
                    break;
                }
                case "groupUsersUpdateMessage": {
                    this._groupUsersUpdateMessageStream.next(message.groupUsersUpdateMessage);
                    break;
                }
                case "sendUserMessage": {
                    adminMessagesService.onSendusermessage(message.sendUserMessage);
                    break;
                }
                case "banUserMessage": {
                    adminMessagesService.onSendusermessage(message.banUserMessage);
                    break;
                }
                case "worldFullWarningMessage": {
                    warningContainerStore.activateWarningContainer();
                    break;
                }
                case "refreshRoomMessage": {
                    this._refreshRoomMessageStream.next(message.refreshRoomMessage);
                    break;
                }
                case "followRequestMessage": {
                    if (!localUserStore.getIgnoreFollowRequests()) {
                        followUsersStore.addFollowRequest(message.followRequestMessage.leader);
                    }
                    break;
                }
                case "followConfirmationMessage": {
                    followUsersStore.addFollower(message.followConfirmationMessage.follower);
                    break;
                }
                case "followAbortMessage": {
                    if (get(followRoleStore) === "follower") {
                        followUsersStore.stopFollowing();
                    } else {
                        followUsersStore.removeFollower(message.followAbortMessage.follower);
                    }
                    break;
                }
                case "errorMessage": {
                    this._errorMessageStream.next(message.errorMessage);
                    console.error("An error occurred server side: " + message.errorMessage.message);
                    break;
                }
                case "errorScreenMessage": {
                    this._errorScreenMessageStream.next(message.errorScreenMessage);
                    console.error("An error occurred server side: " + JSON.stringify(message.errorScreenMessage));
                    if (message.errorScreenMessage.code !== "retry") {
                        this.closed = true;
                    }
                    if (message.errorScreenMessage.type === "redirect" && message.errorScreenMessage.urlToRedirect) {
                        window.location.assign(message.errorScreenMessage.urlToRedirect);
                    } else {
                        errorScreenStore.setError(message.errorScreenMessage);
                    }
                    break;
                }
                case "moveToPositionMessage": {
                    if (message.moveToPositionMessage && message.moveToPositionMessage.position) {
                        const tileIndex = gameManager
                            .getCurrentGameScene()
                            .getGameMap()
                            .getTileIndexAt(
                                message.moveToPositionMessage.position.x,
                                message.moveToPositionMessage.position.y
                            );
                        gameManager.getCurrentGameScene().moveTo(tileIndex);
                    }
                    this._moveToPositionMessageStream.next(message.moveToPositionMessage);
                    break;
                }
                case "answerMessage": {
                    const queryId = message.answerMessage.id;
                    const query = this.queries.get(queryId);
                    if (query === undefined) {
                        throw new Error("Got an answer to a query we have no track of: " + queryId.toString());
                    }
                    if (message.answerMessage.answer === undefined) {
                        throw new Error("Invalid message received. Answer missing.");
                    }
                    if (message.answerMessage.answer.$case === "error") {
                        query.reject(new Error(message.answerMessage.answer.error.message));
                    } else {
                        query.resolve(message.answerMessage.answer);
                    }
                    this.queries.delete(queryId);
                    break;
                }
                case "xmppSettingsMessage": {
                    this._xmppSettingsMessageStream.next(message.xmppSettingsMessage);
                    break;
                }
                default: {
                    // Security check: if we forget a "case", the line below will catch the error at compile-time.
                    //@ts-ignore
                    const _exhaustiveCheck: never = message;
                }
            }
        };
    }

    private resetPingTimeout(): void {
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = undefined;
        }
        this.timeout = setTimeout(() => {
            console.warn("Timeout detected server-side. Is your connection down? Closing connection.");
            this.socket.close();
        }, manualPingDelay);
    }

    private sendPong(): void {
        this.send({
            message: {
                $case: "pingMessage",
                pingMessage: {},
            },
        });
    }

    /*public emitPlayerDetailsMessage(userName: string, characterLayersSelected: BodyResourceDescriptionInterface[]) {
        const message = new SetPlayerDetailsMessage();
        message.setName(userName);
        message.setCharacterlayersList(characterLayersSelected.map((characterLayer) => characterLayer.name));

        const clientToServerMessage = new ClientToServerMessage();
        clientToServerMessage.setSetplayerdetailsmessage(message);

        this.socket.send(clientToServerMessage.serializeBinary().buffer);
    }*/

    public emitPlayerShowVoiceIndicator(show: boolean): void {
        const message = SetPlayerDetailsMessageTsProto.fromPartial({
            showVoiceIndicator: show,
        });
        this.send({
            message: {
                $case: "setPlayerDetailsMessage",
                setPlayerDetailsMessage: message,
            },
        });
    }

    public emitPlayerStatusChange(availabilityStatus: AvailabilityStatus): void {
        const message = SetPlayerDetailsMessageTsProto.fromPartial({
            availabilityStatus,
        });
        this.send({
            message: {
                $case: "setPlayerDetailsMessage",
                setPlayerDetailsMessage: message,
            },
        });
    }

    public emitPlayerOutlineColor(color: number | null) {
        let message: SetPlayerDetailsMessageTsProto;
        if (color === null) {
            message = SetPlayerDetailsMessageTsProto.fromPartial({
                removeOutlineColor: true,
            });
        } else {
            message = SetPlayerDetailsMessageTsProto.fromPartial({
                outlineColor: color,
            });
        }
        this.send({
            message: {
                $case: "setPlayerDetailsMessage",
                setPlayerDetailsMessage: message,
            },
        });
    }

    public closeConnection(): void {
        this.socket?.close();
        this.closed = true;
    }

    private toPositionMessage(
        x: number,
        y: number,
        direction: PositionMessage_Direction,
        moving: boolean
    ): PositionMessageTsProto {
        return {
            x: Math.floor(x),
            y: Math.floor(y),
            moving,
            direction,
        };
    }

    private toViewportMessage(viewport: ViewportInterface): ViewportMessageTsProto {
        return {
            left: Math.floor(viewport.left),
            right: Math.floor(viewport.right),
            top: Math.floor(viewport.top),
            bottom: Math.floor(viewport.bottom),
        };
    }

    public sharePosition(
        x: number,
        y: number,
        direction: PositionMessage_Direction,
        moving: boolean,
        viewport: ViewportInterface
    ): void {
        if (!this.socket) {
            return;
        }

        const positionMessage = this.toPositionMessage(x, y, direction, moving);

        const viewportMessage = this.toViewportMessage(viewport);

        this.send({
            message: {
                $case: "userMovesMessage",
                userMovesMessage: {
                    position: positionMessage,
                    viewport: viewportMessage,
                },
            },
        });
    }

    public setViewport(viewport: ViewportInterface): void {
        this.send({
            message: {
                $case: "viewportMessage",
                viewportMessage: this.toViewportMessage(viewport),
            },
        });
    }

    /*    public onUserJoins(callback: (message: MessageUserJoined) => void): void {
        this.onMessage(EventMessage.JOIN_ROOM, (message: UserJoinedMessage) => {
            callback(this.toMessageUserJoined(message));
        });
    }*/

    private mapCharacterLayerToBodyResourceDescription(
        characterLayer: CharacterLayerMessage
    ): BodyResourceDescriptionInterface {
        return {
            id: characterLayer.name,
            img: characterLayer.url,
        };
    }

    // TODO: move this to protobuf utils
    private toMessageUserJoined(message: UserJoinedMessageTsProto): MessageUserJoined {
        const position = message.position;
        if (position === undefined) {
            throw new Error("Invalid JOIN_ROOM message");
        }

        const characterLayers = message.characterLayers.map(this.mapCharacterLayerToBodyResourceDescription.bind(this));

        const companion = message.companion;

        const variables = new Map<string, unknown>();
        //console.warn('VARIABLES FOR USER: ', message.variables);
        for (const variable of Object.entries(message.variables)) {
            variables.set(variable[0], RoomConnection.unserializeVariable(variable[1]));
        }

        return {
            userId: message.userId,
            userJid: message.userJid,
            name: message.name,
            characterLayers,
            visitCardUrl: message.visitCardUrl,
            position: position,
            availabilityStatus: message.availabilityStatus,
            companion: companion ? companion.name : null,
            userUuid: message.userUuid,
            outlineColor: message.hasOutline ? message.outlineColor : undefined,
            variables: variables,
        };
    }

    private toGroupCreatedUpdatedMessage(message: GroupUpdateMessageTsProto): GroupCreatedUpdatedMessageInterface {
        const position = message.position;
        if (position === undefined) {
            throw new Error("Missing position in GROUP_CREATE_UPDATE");
        }

        return {
            groupId: message.groupId,
            position: position,
            groupSize: message.groupSize,
            locked: message.locked,
        };
    }

    public onConnectError(callback: (error: Event) => void): void {
        this.socket.addEventListener("error", callback);
    }

    public sendWebrtcSignal(signal: unknown, receiverId: number) {
        this.send({
            message: {
                $case: "webRtcSignalToServerMessage",
                webRtcSignalToServerMessage: {
                    receiverId,
                    signal: JSON.stringify(signal),
                },
            },
        });
    }

    public sendWebrtcScreenSharingSignal(signal: unknown, receiverId: number) {
        this.send({
            message: {
                $case: "webRtcScreenSharingSignalToServerMessage",
                webRtcScreenSharingSignalToServerMessage: {
                    receiverId,
                    signal: JSON.stringify(signal),
                },
            },
        });
    }

    public onServerDisconnected(callback: () => void): void {
        this.socket.addEventListener("close", (event) => {
            // FIXME: technically incorrect: if we call onServerDisconnected several times, we will run several times the code (and we probably want to run only callback() serveral times).
            // FIXME: call to query.reject and this.completeStreams should probably be stored somewhere else.

            // Cleanup queries:
            const error = new Error("Socket closed with code " + event.code + ". Reason: " + event.reason);
            for (const query of this.queries.values()) {
                query.reject(error);
            }

            this.completeStreams();

            if (this.closed === true || connectionManager.unloading) {
                return;
            }
            console.info("Socket closed with code " + event.code + ". Reason: " + event.reason);
            if (event.code === 1000) {
                // Normal closure case
                return;
            }
            callback();
        });
    }

    /**
     * Sends a message to all observers: we are not going to send anything anymore on streams.
     */
    private completeStreams(): void {
        this._errorMessageStream.complete();
        this._errorScreenMessageStream.complete();
        this._roomJoinedMessageStream.complete();
        this._webRtcStartMessageStream.complete();
        this._webRtcSignalToClientMessageStream.complete();
        this._webRtcScreenSharingSignalToClientMessageStream.complete();
        this._webRtcDisconnectMessageStream.complete();
        this._teleportMessageMessageStream.complete();
        this._worldFullMessageStream.complete();
        this._worldConnexionMessageStream.complete();
        this._tokenExpiredMessageStream.complete();
        this._userMovedMessageStream.complete();
        this._groupUpdateMessageStream.complete();
        this._groupUsersUpdateMessageStream.complete();
        this._groupDeleteMessageStream.complete();
        this._userJoinedMessageStream.complete();
        this._userLeftMessageStream.complete();
        this._refreshRoomMessageStream.complete();
        this._itemEventMessageStream.complete();
        this._emoteEventMessageStream.complete();
        this._variableMessageStream.complete();
        this._playerDetailsUpdatedMessageStream.complete();
        this._connectionErrorStream.complete();
        this._moveToPositionMessageStream.complete();
    }

    public getUserId(): number {
        if (this.userId === null) throw new Error("UserId cannot be null!");
        return this.userId;
    }

    emitActionableEvent(itemId: number, event: string, state: unknown, parameters: unknown): void {
        this.send({
            message: {
                $case: "itemEventMessage",
                itemEventMessage: {
                    itemId,
                    event,
                    stateJson: JSON.stringify(state),
                    parametersJson: JSON.stringify(parameters),
                },
            },
        });
    }

    emitSetVariableEvent(name: string, value: unknown): void {
        this.send({
            message: {
                $case: "variableMessage",
                variableMessage: {
                    name,
                    value: JSON.stringify(value),
                },
            },
        });
    }

    public uploadAudio(file: FormData) {
        return axios
            .post<unknown>(`${UPLOADER_URL}/upload-audio-message`, file)
            .then((res: { data: unknown }) => {
                return res.data;
            })
            .catch((err) => {
                console.error(err);
                throw err;
            });
    }

    public emitGlobalMessage(message: PlayGlobalMessageInterface): void {
        this.send({
            message: {
                $case: "playGlobalMessage",
                playGlobalMessage: {
                    type: message.type,
                    content: message.content,
                    broadcastToWorld: message.broadcastToWorld,
                },
            },
        });
    }

    public emitReportPlayerMessage(reportedUserUuid: string, reportComment: string): void {
        this.send({
            message: {
                $case: "reportPlayerMessage",
                reportPlayerMessage: {
                    reportedUserUuid,
                    reportComment,
                },
            },
        });
    }

    public hasTag(tag: string): boolean {
        return this.tags.includes(tag);
    }

    public isAdmin(): boolean {
        return this.hasTag("admin");
    }

    public emitEmoteEvent(emoteName: string): void {
        this.send({
            message: {
                $case: "emotePromptMessage",
                emotePromptMessage: {
                    emote: emoteName,
                },
            },
        });
    }

    public emitFollowRequest(): void {
        if (!this.userId) {
            return;
        }

        this.send({
            message: {
                $case: "followRequestMessage",
                followRequestMessage: {
                    leader: this.userId,
                },
            },
        });
    }

    public emitFollowConfirmation(): void {
        if (!this.userId) {
            return;
        }

        this.send({
            message: {
                $case: "followConfirmationMessage",
                followConfirmationMessage: {
                    leader: get(followUsersStore)[0],
                    follower: this.userId,
                },
            },
        });
    }

    public emitFollowAbort(): void {
        const isLeader = get(followRoleStore) === "leader";
        if (!this.userId) {
            return;
        }

        this.send({
            message: {
                $case: "followAbortMessage",
                followAbortMessage: {
                    leader: isLeader ? this.userId : get(followUsersStore)[0],
                    follower: isLeader ? 0 : this.userId,
                },
            },
        });
    }

    public emitLockGroup(lock = true): void {
        this.send({
            message: {
                $case: "lockGroupPromptMessage",
                lockGroupPromptMessage: {
                    lock,
                },
            },
        });
    }

    public emitMapEditorModifyArea(commandId: string, config: AreaData): void {
        this.send({
            message: {
                $case: "editMapCommandMessage",
                editMapCommandMessage: {
                    id: commandId,
                    editMapMessage: {
                        message: {
                            $case: "modifyAreaMessage",
                            modifyAreaMessage: config,
                        },
                    },
                },
            },
        });
    }

    public emitMapEditorDeleteArea(commandId: string, id: string): void {
        this.send({
            message: {
                $case: "editMapCommandMessage",
                editMapCommandMessage: {
                    id: commandId,
                    editMapMessage: {
                        message: {
                            $case: "deleteAreaMessage",
                            deleteAreaMessage: {
                                id,
                            },
                        },
                    },
                },
            },
        });
    }

    public emitMapEditorCreateArea(commandId: string, config: AreaData): void {
        this.send({
            message: {
                $case: "editMapCommandMessage",
                editMapCommandMessage: {
                    id: commandId,
                    editMapMessage: {
                        message: {
                            $case: "createAreaMessage",
                            createAreaMessage: config,
                        },
                    },
                },
            },
        });
    }

    public emitMapEditorModifyEntity(commandId: string, config: AtLeast<EntityData, "id">): void {
        if (config.properties) {
            for (const key of assertObjectKeys(config.properties)) {
                if (config.properties[key] === undefined) {
                    config.properties[key] = null;
                }
            }
        }
        this.send({
            message: {
                $case: "editMapCommandMessage",
                editMapCommandMessage: {
                    id: commandId,
                    editMapMessage: {
                        message: {
                            $case: "modifyEntityMessage",
                            modifyEntityMessage: {
                                ...config,
                                // We need to declare properties due to the protobuf limitations - make new custom type to use optional flag?
                                properties: config.properties ?? {},
                            },
                        },
                    },
                },
            },
        });
    }

    public emitMapEditorCreateEntity(commandId: string, config: EntityData): void {
        this.send({
            message: {
                $case: "editMapCommandMessage",
                editMapCommandMessage: {
                    id: commandId,
                    editMapMessage: {
                        message: {
                            $case: "createEntityMessage",
                            createEntityMessage: {
                                id: config.id,
                                x: config.x,
                                y: config.y,
                                collectionName: config.prefab.collectionName,
                                prefabId: config.prefab.id,
                                properties: config.properties ?? {},
                            },
                        },
                    },
                },
            },
        });
    }

    public emitMapEditorDeleteEntity(commandId: string, id: string): void {
        this.send({
            message: {
                $case: "editMapCommandMessage",
                editMapCommandMessage: {
                    id: commandId,
                    editMapMessage: {
                        message: {
                            $case: "deleteEntityMessage",
                            deleteEntityMessage: {
                                id,
                            },
                        },
                    },
                },
            },
        });
    }

    public getAllTags(): string[] {
        return this.tags;
    }

    public get userRoomToken(): string | undefined {
        return this._userRoomToken;
    }

    private goToSelectYourWokaScene(): void {
        menuVisiblilityStore.set(false);
        menuIconVisiblilityStore.set(false);
        selectCharacterSceneVisibleStore.set(true);
        gameManager.leaveGame(SelectCharacterSceneName, new SelectCharacterScene());
    }

    private send(message: ClientToServerMessageTsProto): void {
        const bytes = ClientToServerMessageTsProto.encode(message).finish();

        if (this.socket.readyState === WebSocket.CLOSING || this.socket.readyState === WebSocket.CLOSED) {
            console.warn("Trying to send a message to the server, but the connection is closed. Message: ", message);
            return;
        }

        this.socket.send(bytes);
    }

    public emitAskPosition(uuid: string, playUri: string) {
        const bytes = ClientToServerMessageTsProto.encode({
            message: {
                $case: "askPositionMessage",
                askPositionMessage: {
                    userIdentifier: uuid,
                    playUri,
                },
            },
        }).finish();

        this.socket.send(bytes);
    }

    public emitAddSpaceFilter(filter: AddSpaceFilterMessage) {
        const bytes = ClientToServerMessageTsProto.encode({
            message: {
                $case: "addSpaceFilterMessage",
                addSpaceFilterMessage: filter,
            },
        }).finish();

        this.socket.send(bytes);
    }

    public emitUpdateSpaceFilter(filter: UpdateSpaceFilterMessage) {
        const bytes = ClientToServerMessageTsProto.encode({
            message: {
                $case: "updateSpaceFilterMessage",
                updateSpaceFilterMessage: filter,
            },
        }).finish();

        this.socket.send(bytes);
    }

    public emitRemoveSpaceFilter(filter: RemoveSpaceFilterMessage) {
        const bytes = ClientToServerMessageTsProto.encode({
            message: {
                $case: "removeSpaceFilterMessage",
                removeSpaceFilterMessage: filter,
            },
        }).finish();

        this.socket.send(bytes);
    }

    private queries = new Map<
        number,
        {
            answerType: string;
            resolve: (message: Required<AnswerMessage>["answer"]) => void;
            reject: (e: unknown) => void;
        }
    >();
    private lastQueryId = 0;

    private query<T extends Required<QueryMessage>["query"]>(message: T): Promise<Required<AnswerMessage>["answer"]> {
        return new Promise<Required<AnswerMessage>["answer"]>((resolve, reject) => {
            if (!message.$case.endsWith("Query")) {
                throw new Error("Query types are supposed to be suffixed with Query");
            }
            const answerType = message.$case.substring(0, message.$case.length - 5) + "Answer";

            this.queries.set(this.lastQueryId, {
                answerType,
                resolve,
                reject,
            });

            this.send({
                message: {
                    $case: "queryMessage",
                    queryMessage: {
                        id: this.lastQueryId,
                        query: message,
                    },
                },
            });

            this.lastQueryId++;
        });
    }

    public async queryJitsiJwtToken(jitsiRoom: string): Promise<JitsiJwtAnswer> {
        const answer = await this.query({
            $case: "jitsiJwtQuery",
            jitsiJwtQuery: {
                jitsiRoom,
            },
        });
        if (answer.$case !== "jitsiJwtAnswer") {
            throw new Error("Unexpected answer");
        }
        return answer.jitsiJwtAnswer;
    }

    public async queryBBBMeetingUrl(
        meetingId: string,
        props: Map<string, string | number | boolean>
    ): Promise<JoinBBBMeetingAnswer> {
        const meetingName = props.get("meetingName") as string;
        const localMeetingId = props.get("bbbMeeting") as string;

        const answer = await this.query({
            $case: "joinBBBMeetingQuery",
            joinBBBMeetingQuery: {
                meetingId,
                localMeetingId,
                meetingName,
            },
        });
        if (answer.$case !== "joinBBBMeetingAnswer") {
            throw new Error("Unexpected answer");
        }
        return answer.joinBBBMeetingAnswer;
    }

    public emitPlayerSetVariable(event: SetPlayerVariableEvent): void {
        let scope: SetPlayerVariableMessage_Scope;
        switch (event.scope) {
            case "room": {
                scope = SetPlayerVariableMessage_Scope.ROOM;
                break;
            }
            case "world": {
                scope = SetPlayerVariableMessage_Scope.WORLD;
                break;
            }
            default: {
                const _exhaustiveCheck: never = event.scope;
                return;
            }
        }

        this.send({
            message: {
                $case: "setPlayerDetailsMessage",
                setPlayerDetailsMessage: SetPlayerDetailsMessageTsProto.fromPartial({
                    setVariable: {
                        name: event.key,
                        value: JSON.stringify(event.value),
                        public: event.public,
                        ttl: event.ttl,
                        scope,
                        persist: event.persist,
                    },
                }),
            },
        });
    }

    /**
     * Unserializes a string received from the server.
     * If the value cannot be unserialized, returns undefined and outputs a console error.
     */
    public static unserializeVariable(serializedValue: string): unknown {
        let value: unknown = undefined;
        if (serializedValue) {
            try {
                value = JSON.parse(serializedValue);
            } catch (e) {
                console.error(
                    "Unable to unserialize value received from server for a variable. " +
                        'Value received: "' +
                        serializedValue +
                        '". Error: ',
                    e
                );
            }
        }
        return value;
    }
}
