import type { Subscription } from "rxjs";
import AnimatedTiles from "phaser-animated-tiles";
import { Queue } from "queue-typescript";
import type { Unsubscriber } from "svelte/store";
import { get } from "svelte/store";
import { throttle } from "throttle-debounce";
import { MapStore } from "@workadventure/store-utils";
import CancelablePromise from "cancelable-promise";
import { Deferred } from "ts-deferred";
import {
    availabilityStatusToJSON,
    AvailabilityStatus,
    ErrorScreenMessage,
    PositionMessage_Direction,
} from "@workadventure/messages";
import { z } from "zod";
import { ITiledMap, ITiledMapLayer, ITiledMapObject, ITiledMapTileset } from "@workadventure/tiled-map-type-guard";
import { GameMap, GameMapProperties, WAMFileFormat } from "@workadventure/map-editor";
import { userMessageManager } from "../../Administration/UserMessageManager";
import { connectionManager } from "../../Connexion/ConnectionManager";
import { coWebsiteManager } from "../../WebRtc/CoWebsiteManager";
import { urlManager } from "../../Url/UrlManager";
import { mediaManager } from "../../WebRtc/MediaManager";
import { UserInputManager } from "../UserInput/UserInputManager";
import { touchScreenManager } from "../../Touch/TouchScreenManager";
import { PinchManager } from "../UserInput/PinchManager";
import { waScaleManager } from "../Services/WaScaleManager";
import { lazyLoadPlayerCharacterTextures } from "../Entity/PlayerTexturesLoadingManager";
import { CompanionTexturesLoadingManager } from "../Companion/CompanionTexturesLoadingManager";
import { iframeListener } from "../../Api/IframeListener";
import { DEBUG_MODE, ENABLE_FEATURE_MAP_EDITOR, MAX_PER_GROUP, POSITION_DELAY } from "../../Enum/EnvironmentVariable";
import { Room } from "../../Connexion/Room";
import { jitsiFactory } from "../../WebRtc/JitsiFactory";
import { TextureError } from "../../Exception/TextureError";
import { localUserStore } from "../../Connexion/LocalUserStore";
import { HtmlUtils } from "../../WebRtc/HtmlUtils";
import { SimplePeer } from "../../WebRtc/SimplePeer";
import { Loader } from "../Components/Loader";
import { RemotePlayer, RemotePlayerEvent } from "../Entity/RemotePlayer";
import { SelectCharacterScene, SelectCharacterSceneName } from "../Login/SelectCharacterScene";
import { hasMovedEventName, Player, requestEmoteEventName } from "../Player/Player";
import { ErrorSceneName } from "../Reconnecting/ErrorScene";
import { ReconnectingSceneName } from "../Reconnecting/ReconnectingScene";
import { TextUtils } from "../Components/TextUtils";
import { joystickBaseImg, joystickBaseKey, joystickThumbImg, joystickThumbKey } from "../Components/MobileJoystick";
import { PropertyUtils } from "../Map/PropertyUtils";
import { analyticsClient } from "../../Administration/AnalyticsClient";
import { PathfindingManager } from "../../Utils/PathfindingManager";
import type {
    GroupCreatedUpdatedMessageInterface,
    MessageUserJoined,
    MessageUserMovedInterface,
    OnConnectInterface,
    PositionInterface,
    RoomJoinedMessageInterface,
} from "../../Connexion/ConnexionModels";
import type { RoomConnection } from "../../Connexion/RoomConnection";
import type { ActionableItem } from "../Items/ActionableItem";
import type { ItemFactoryInterface } from "../Items/ItemFactoryInterface";
import { peerStore } from "../../Stores/PeerStore";
import { biggestAvailableAreaStore } from "../../Stores/BiggestAvailableAreaStore";
import { layoutManagerActionStore } from "../../Stores/LayoutManagerStore";
import { playersStore } from "../../Stores/PlayersStore";
import { emoteMenuStore, emoteStore } from "../../Stores/EmoteStore";
import {
    jitsiParticipantsCountStore,
    userIsAdminStore,
    userIsEditorStore,
    userIsJitsiDominantSpeakerStore,
} from "../../Stores/GameStore";
import type { MenuItem, TranslatedMenu } from "../../Stores/MenuStore";
import {
    activeSubMenuStore,
    contactPageStore,
    menuVisiblilityStore,
    SubMenusInterface,
    subMenusStore,
} from "../../Stores/MenuStore";
import type { WasCameraUpdatedEvent } from "../../Api/Events/WasCameraUpdatedEvent";
import { audioManagerFileStore } from "../../Stores/AudioManagerStore";
import { currentPlayerGroupLockStateStore } from "../../Stores/CurrentPlayerGroupStore";
import { errorScreenStore } from "../../Stores/ErrorScreenStore";
import { SuperLoaderPlugin } from "../Services/SuperLoaderPlugin";
import type { CoWebsite } from "../../WebRtc/CoWebsite/CoWesbite";
import { SimpleCoWebsite } from "../../WebRtc/CoWebsite/SimpleCoWebsite";
import type { JitsiCoWebsite } from "../../WebRtc/CoWebsite/JitsiCoWebsite";
import { startLayerNamesStore } from "../../Stores/StartLayerNamesStore";
import { StringUtils } from "../../Utils/StringUtils";
import { hideConnectionIssueMessage, showConnectionIssueMessage } from "../../Connexion/AxiosUtils";
import {
    availabilityStatusStore,
    localVolumeStore,
    requestedCameraState,
    requestedMicrophoneState,
} from "../../Stores/MediaStore";
import { LL, locale } from "../../../i18n/i18n-svelte";
import { GameSceneUserInputHandler } from "../UserInput/GameSceneUserInputHandler";
import { followUsersColorStore, followUsersStore } from "../../Stores/FollowStore";
import { embedScreenLayoutStore, highlightedEmbedScreen } from "../../Stores/EmbedScreensStore";
import type { AddPlayerEvent } from "../../Api/Events/AddPlayerEvent";
import type { AskPositionEvent } from "../../Api/Events/AskPositionEvent";
import {
    chatVisibilityStore,
    _newChatMessageSubject,
    _newChatMessageWritingStatusSubject,
} from "../../Stores/ChatStore";
import type { HasPlayerMovedInterface } from "../../Api/Events/HasPlayerMovedInterface";
import { gameSceneIsLoadedStore } from "../../Stores/GameSceneStore";
import { myCameraBlockedStore, myMicrophoneBlockedStore } from "../../Stores/MyMediaStore";
import type { GameStateEvent } from "../../Api/Events/GameStateEvent";
import { modalVisibilityStore } from "../../Stores/ModalStore";
import { currentPlayerWokaStore } from "../../Stores/CurrentPlayerWokaStore";
import { mapEditorModeStore } from "../../Stores/MapEditorStore";
import { refreshPromptStore } from "../../Stores/RefreshPromptStore";
import { debugAddPlayer, debugRemovePlayer } from "../../Utils/Debuggers";
import { checkCoturnServer } from "../../Components/Video/utils";
import { GameMapFrontWrapper } from "./GameMap/GameMapFrontWrapper";
import { gameManager } from "./GameManager";
import { EmoteManager } from "./EmoteManager";
import { soundManager } from "./SoundManager";
import { SharedVariablesManager } from "./SharedVariablesManager";
import { EmbeddedWebsiteManager } from "./EmbeddedWebsiteManager";
import { DynamicAreaManager } from "./DynamicAreaManager";

import { PlayerMovement } from "./PlayerMovement";
import { PlayersPositionInterpolator } from "./PlayersPositionInterpolator";
import { DirtyScene } from "./DirtyScene";
import { StartPositionCalculator } from "./StartPositionCalculator";
import { GameMapPropertiesListener } from "./GameMapPropertiesListener";
import { ActivatablesManager } from "./ActivatablesManager";
import type { AddPlayerInterface } from "./AddPlayerInterface";
import type { CameraManagerEventCameraUpdateData } from "./CameraManager";
import { CameraManager, CameraManagerEvent } from "./CameraManager";

import { MapEditorModeManager } from "./MapEditor/MapEditorModeManager";
import { RemotePlayersRepository } from "./RemotePlayersRepository";
import type { PlayerDetailsUpdate } from "./RemotePlayersRepository";
import { IframeEventDispatcher } from "./IframeEventDispatcher";
import { PlayerVariablesManager } from "./PlayerVariablesManager";
import { uiWebsiteManager } from "./UI/UIWebsiteManager";
import { EntitiesCollectionsManager } from "./MapEditor/EntitiesCollectionsManager";
import { DEPTH_BUBBLE_CHAT_SPRITE } from "./DepthIndexes";
import { faviconManager } from "./../../WebRtc/FaviconManager";
import EVENT_TYPE = Phaser.Scenes.Events;
import Texture = Phaser.Textures.Texture;
import Sprite = Phaser.GameObjects.Sprite;
import CanvasTexture = Phaser.Textures.CanvasTexture;
import GameObject = Phaser.GameObjects.GameObject;
import DOMElement = Phaser.GameObjects.DOMElement;
import Tileset = Phaser.Tilemaps.Tileset;
import SpriteSheetFile = Phaser.Loader.FileTypes.SpriteSheetFile;
import FILE_LOAD_ERROR = Phaser.Loader.Events.FILE_LOAD_ERROR;

export interface GameSceneInitInterface {
    reconnecting: boolean;
    initPosition?: PositionInterface;
}

interface GroupCreatedUpdatedEventInterface {
    type: "GroupCreatedUpdatedEvent";
    event: GroupCreatedUpdatedMessageInterface;
}

interface DeleteGroupEventInterface {
    type: "DeleteGroupEvent";
    groupId: number;
}

export class GameScene extends DirtyScene {
    Terrains: Array<Phaser.Tilemaps.Tileset>;
    CurrentPlayer!: Player;
    MapPlayersByKey: MapStore<number, RemotePlayer> = new MapStore<number, RemotePlayer>();
    Map!: Phaser.Tilemaps.Tilemap;
    Objects!: Array<Phaser.Physics.Arcade.Sprite>;
    mapFile!: ITiledMap;
    wamFile!: WAMFileFormat;
    animatedTiles!: AnimatedTiles;
    groups: Map<number, Sprite>;
    circleTexture!: CanvasTexture;
    circleRedTexture!: CanvasTexture;
    pendingEvents = new Queue<GroupCreatedUpdatedEventInterface | DeleteGroupEventInterface>();
    private initPosition?: PositionInterface;
    private playersPositionInterpolator = new PlayersPositionInterpolator();
    public connection: RoomConnection | undefined;
    private simplePeer!: SimplePeer;
    private connectionAnswerPromiseDeferred: Deferred<RoomJoinedMessageInterface>;
    // A promise that will resolve when the "create" method is called (signaling loading is ended)
    private createPromiseDeferred: Deferred<void>;
    private iframeSubscriptionList!: Array<Subscription>;
    private gameMapChangedSubscription!: Subscription;
    private messageSubscription: Subscription | null = null;

    private peerStoreUnsubscriber!: Unsubscriber;
    private emoteUnsubscriber!: Unsubscriber;
    private emoteMenuUnsubscriber!: Unsubscriber;

    private localVolumeStoreUnsubscriber: Unsubscriber | undefined;
    private followUsersColorStoreUnsubscriber!: Unsubscriber;
    private userIsJitsiDominantSpeakerStoreUnsubscriber!: Unsubscriber;
    private jitsiParticipantsCountStoreUnsubscriber!: Unsubscriber;
    private highlightedEmbedScreenUnsubscriber!: Unsubscriber;
    private embedScreenLayoutStoreUnsubscriber!: Unsubscriber;
    private availabilityStatusStoreUnsubscriber!: Unsubscriber;
    private mapEditorModeStoreUnsubscriber!: Unsubscriber;
    private refreshPromptStoreStoreUnsubscriber!: Unsubscriber;

    private modalVisibilityStoreUnsubscriber!: Unsubscriber;

    mapUrlFile!: string;
    wamUrlFile?: string;
    roomUrl: string;

    currentTick!: number;
    lastSentTick!: number; // The last tick at which a position was sent.
    lastMoveEventSent: HasPlayerMovedInterface = {
        direction: PositionMessage_Direction.DOWN,
        moving: false,
        x: -1000,
        y: -1000,
        oldX: -1000,
        oldY: -1000,
    };

    private gameMapFrontWrapper!: GameMapFrontWrapper;
    private actionableItems: Map<number, ActionableItem> = new Map<number, ActionableItem>();
    public userInputManager!: UserInputManager;
    private isReconnecting: boolean | undefined = undefined;
    private playerName!: string;
    private characterLayers!: string[];
    private companion!: string | null;
    private popUpElements: Map<number, DOMElement> = new Map<number, Phaser.GameObjects.DOMElement>();
    private originalMapUrl: string | undefined;
    private pinchManager: PinchManager | undefined;
    private mapTransitioning = false; //used to prevent transitions happening at the same time.
    private emoteManager!: EmoteManager;
    private cameraManager!: CameraManager;
    private mapEditorModeManager!: MapEditorModeManager;
    private entitiesCollectionsManager!: EntitiesCollectionsManager;
    private pathfindingManager!: PathfindingManager;
    private activatablesManager!: ActivatablesManager;
    private preloading = true;
    private startPositionCalculator!: StartPositionCalculator;
    private sharedVariablesManager!: SharedVariablesManager;
    private playerVariablesManager!: PlayerVariablesManager;
    private objectsByType = new Map<string, ITiledMapObject[]>();
    private embeddedWebsiteManager!: EmbeddedWebsiteManager;
    private areaManager!: DynamicAreaManager;
    private loader: Loader;
    private lastCameraEvent: WasCameraUpdatedEvent | undefined;
    private firstCameraUpdateSent = false;
    private currentPlayerGroupId?: number;
    private showVoiceIndicatorChangeMessageSent = false;
    private jitsiDominantSpeaker = false;
    private jitsiParticipantsCount = 0;
    private cleanupDone = false;
    public readonly superLoad: SuperLoaderPlugin;
    private playersEventDispatcher = new IframeEventDispatcher();
    private playersMovementEventDispatcher = new IframeEventDispatcher();
    private remotePlayersRepository = new RemotePlayersRepository();
    private companionLoadingManager: CompanionTexturesLoadingManager | undefined;
    private throttledSendViewportToServer!: () => void;
    private playersDebugLogAlreadyDisplayed = false;

    constructor(private room: Room, customKey?: string | undefined) {
        super({
            key: customKey ?? room.key,
        });
        this.Terrains = [];
        this.groups = new Map<number, Sprite>();

        // TODO: How to get mapUrl from WAM here?
        if (room.mapUrl) {
            this.mapUrlFile = room.mapUrl;
        } else if (room.wamUrl) {
            this.wamUrlFile = room.wamUrl;
        }
        this.roomUrl = room.key;

        this.entitiesCollectionsManager = new EntitiesCollectionsManager();

        if (this.room.entityCollectionsUrls) {
            for (const url of this.room.entityCollectionsUrls) {
                this.entitiesCollectionsManager.loadCollections(url).catch((reason) => {
                    console.warn(reason);
                });
            }
        }

        this.createPromiseDeferred = new Deferred<void>();
        this.connectionAnswerPromiseDeferred = new Deferred<RoomJoinedMessageInterface>();
        this.loader = new Loader(this);
        this.superLoad = new SuperLoaderPlugin(this);
    }

    //hook preload scene
    preload(): void {
        this.companionLoadingManager = new CompanionTexturesLoadingManager(this.superLoad, this.load);
        //initialize frame event of scripting API
        this.listenToIframeEvents();

        this.load.image("iconTalk", "/resources/icons/icon_talking.png");
        this.load.image("iconStatusIndicatorInside", "/resources/icons/icon_status_indicator_inside.png");
        this.load.image("iconStatusIndicatorOutline", "/resources/icons/icon_status_indicator_outline.png");

        if (touchScreenManager.supportTouchScreen) {
            this.load.image(joystickBaseKey, joystickBaseImg);
            this.load.image(joystickThumbKey, joystickThumbImg);
        }
        this.load.audio("audio-webrtc-in", "/resources/objects/webrtc-in.mp3");
        this.load.audio("audio-webrtc-out", "/resources/objects/webrtc-out.mp3");
        this.load.audio("audio-report-message", "/resources/objects/report-message.mp3");
        this.sound.pauseOnBlur = false;

        this.load.on(FILE_LOAD_ERROR, (file: { src: string }) => {
            // If we happen to be in HTTP and we are trying to load a URL in HTTPS only... (this happens only in dev environments)
            if (
                window.location.protocol === "http:" &&
                file.src === this.mapUrlFile &&
                file.src.startsWith("http:") &&
                this.originalMapUrl === undefined
            ) {
                this.originalMapUrl = this.mapUrlFile;
                this.mapUrlFile = this.mapUrlFile.replace("http://", "https://");
                this.load.tilemapTiledJSON(this.mapUrlFile, this.mapUrlFile);
                this.load.on(
                    "filecomplete-tilemapJSON-" + this.mapUrlFile,
                    (key: string, type: string, data: unknown) => {
                        this.onMapLoad(data).catch((e) => console.error(e));
                    }
                );
                return;
            }
            // 127.0.0.1, localhost and *.localhost are considered secure, even on HTTP.
            // So if we are in https, we can still try to load a HTTP local resource (can be useful for testing purposes)
            // See https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts#when_is_a_context_considered_secure
            const base = new URL(window.location.href);
            base.pathname = "";
            const url = new URL(file.src, base.toString());
            const host = url.host.split(":")[0];
            if (
                window.location.protocol === "https:" &&
                file.src === this.mapUrlFile &&
                (host === "127.0.0.1" || host === "localhost" || host.endsWith(".localhost")) &&
                this.originalMapUrl === undefined
            ) {
                this.originalMapUrl = this.mapUrlFile;
                this.mapUrlFile = this.mapUrlFile.replace("https://", "http://");
                this.load.tilemapTiledJSON(this.mapUrlFile, this.mapUrlFile);
                this.load.on(
                    "filecomplete-tilemapJSON-" + this.mapUrlFile,
                    (key: string, type: string, data: unknown) => {
                        this.onMapLoad(data).catch((e) => console.error(e));
                    }
                );
                // If the map has already been loaded as part of another GameScene, the "on load" event will not be triggered.
                // In this case, we check in the cache to see if the map is here and trigger the event manually.
                if (this.cache.tilemap.exists(this.mapUrlFile)) {
                    const data = this.cache.tilemap.get(this.mapUrlFile);
                    this.onMapLoad(data).catch((e) => console.error(e));
                }
                return;
            }

            //once preloading is over, we don't want loading errors to crash the game, so we need to disable this behavior after preloading.
            //if SpriteSheetFile (WOKA file) don't display error and give an access for user
            if (this.preloading && !(file instanceof SpriteSheetFile)) {
                //remove loader in progress
                this.loader.removeLoader();

                errorScreenStore.setError(
                    ErrorScreenMessage.fromPartial({
                        type: "error",
                        code: "NETWORK_ERROR",
                        title: "Network error",
                        subtitle: "An error occurred while loading a resource",
                        details: 'Cannot load "' + (this.originalMapUrl ?? file.src) + '"',
                    })
                );
                this.cleanupClosingScene();

                this.scene.stop(this.scene.key);
                this.scene.remove(this.scene.key);
            }
        });

        this.load.scenePlugin("AnimatedTiles", AnimatedTiles, "animatedTiles", "animatedTiles");

        if (this.wamUrlFile) {
            this.superLoad
                .json(
                    this.wamUrlFile,
                    this.wamUrlFile,
                    undefined,
                    undefined,
                    (key: string, type: string, wamFile: unknown) => {
                        this.wamFile = WAMFileFormat.parse(wamFile);
                        this.mapUrlFile = new URL(this.wamFile.mapUrl, this.wamUrlFile).toString();
                        this.doLoadTMJFile(this.mapUrlFile);
                    }
                )
                .catch((e) => {
                    console.error(e);
                });
        } else {
            this.doLoadTMJFile(this.mapUrlFile);
        }

        //eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this.load as any).rexWebFont({
            custom: {
                families: ["Press Start 2P"],
                testString: "abcdefg",
            },
        });

        //this function must stay at the end of preload function
        this.loader.addLoader();
    }

    private doLoadTMJFile(mapUrlFile: string): void {
        this.load.on("filecomplete-tilemapJSON-" + mapUrlFile, (key: string, type: string, data: unknown) => {
            this.onMapLoad(data).catch((e) => console.error(e));
        });
        this.load.tilemapTiledJSON(mapUrlFile, mapUrlFile);
        // If the map has already been loaded as part of another GameScene, the "on load" event will not be triggered.
        // In this case, we check in the cache to see if the map is here and trigger the event manually.
        if (this.cache.tilemap.exists(mapUrlFile)) {
            const data = this.cache.tilemap.get(mapUrlFile);
            this.onMapLoad(data).catch((e) => console.error(e));
        }
    }

    // FIXME: we need to put a "unknown" instead of a "any" and validate the structure of the JSON we are receiving.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private async onMapLoad(data: any): Promise<void> {
        // Triggered when the map is loaded
        // Load tiles attached to the map recursively
        // The map file can be modified by the scripting API and we don't want to tamper the Phaser cache (in case we come back on the map after visiting other maps)
        // So we are doing a deep copy

        console.log(data.data);

        this.mapFile = structuredClone(data.data);

        // Safe parse can take up to 600ms on a 17MB map.
        // TODO: move safeParse to a "map" page and display details of what is going wrong there.
        /*const parseResult = ITiledMap.safeParse(this.mapFile);
        if (!parseResult.success) {
            console.warn("Your map file seems to be invalid. Errors: ", parseResult.error);
        }*/

        const url = this.mapUrlFile.substring(0, this.mapUrlFile.lastIndexOf("/"));
        this.mapFile.tilesets.forEach((tileset) => {
            if ("source" in tileset) {
                throw new Error(
                    `Tilesets must be embedded in a map. The tileset "${tileset.source}" must be embedded in the Tiled map "${this.mapUrlFile}".`
                );
            }
            if (typeof tileset.name === "undefined" || typeof tileset.image === "undefined") {
                console.warn("Don't know how to handle tileset ", tileset);
                return;
            }
            //TODO strategy to add access token
            if (tileset.image.includes(".svg")) {
                this.load.svg(`${url}/${tileset.image}`, `${url}/${tileset.image}`, {
                    width: tileset.imagewidth,
                    height: tileset.imageheight,
                });
            } else {
                this.load.image(`${url}/${tileset.image}`, `${url}/${tileset.image}`);
            }
        });

        // Scan the object layers for objects to load and load them.
        this.objectsByType = new Map<string, ITiledMapObject[]>();

        for (const layer of this.mapFile.layers) {
            if (layer.type === "objectgroup") {
                for (const object of layer.objects) {
                    let objectsOfType: ITiledMapObject[] | undefined;
                    if (object.class) {
                        if (!this.objectsByType.has(object.class)) {
                            objectsOfType = new Array<ITiledMapObject>();
                        } else {
                            objectsOfType = this.objectsByType.get(object.class);
                            if (objectsOfType === undefined) {
                                throw new Error("Unexpected object type not found");
                            }
                        }
                        objectsOfType.push(object);
                        this.objectsByType.set(object.class, objectsOfType);
                    }
                }
            }
        }

        for (const [itemType, objectsOfType] of this.objectsByType) {
            // FIXME: we would ideally need for the loader to WAIT for the import to be performed, which means writing our own loader plugin.

            let itemFactory: ItemFactoryInterface;

            switch (itemType) {
                case "computer": {
                    const module = await import("../Items/Computer/computer");
                    itemFactory = module.default;
                    break;
                }
                default:
                    continue;
                //throw new Error('Unsupported object type: "'+ itemType +'"');
            }

            itemFactory.preload(this.load);
            this.load.start(); // Let's manually start the loader because the import might be over AFTER the loading ends.

            this.load.on("complete", () => {
                // FIXME: the factory might fail because the resources might not be loaded yet...
                // We would need to add a loader ended event in addition to the createPromise
                this.createPromiseDeferred.promise
                    .then(async () => {
                        itemFactory.create(this);

                        const roomJoinedAnswer = await this.connectionAnswerPromiseDeferred.promise;

                        for (const object of objectsOfType) {
                            // TODO: we should pass here a factory to create sprites (maybe?)

                            // Do we have a state for this object?
                            const state = roomJoinedAnswer.items[object.id];

                            const actionableItem = itemFactory.factory(this, object, state);
                            this.actionableItems.set(actionableItem.getId(), actionableItem);
                        }
                    })
                    .catch((e) => console.error(e));
            });
        }
    }

    //hook initialisation
    init(initData: GameSceneInitInterface) {
        if (initData.initPosition !== undefined) {
            this.initPosition = initData.initPosition; //todo: still used?
        }
        if (initData.initPosition !== undefined) {
            this.isReconnecting = initData.reconnecting;
        }
    }

    //hook create scene
    create(): void {
        this.preloading = false;
        this.cleanupDone = false;

        this.bindSceneEventHandlers();

        this.trackDirtyAnims();

        gameManager.gameSceneIsCreated(this);
        urlManager.pushRoomIdToUrl(this.room);
        analyticsClient.enteredRoom(this.room.id, this.room.group);
        contactPageStore.set(this.room.contactPage);

        if (touchScreenManager.supportTouchScreen) {
            this.pinchManager = new PinchManager(this);
        }

        const playerName = gameManager.getPlayerName();
        if (!playerName) {
            throw new Error("playerName is not set");
        }
        this.playerName = playerName;
        this.characterLayers = gameManager.getCharacterLayers();
        this.companion = gameManager.getCompanion();

        this.Map = this.add.tilemap(this.mapUrlFile);
        const mapDirUrl = this.mapUrlFile.substring(0, this.mapUrlFile.lastIndexOf("/"));
        this.mapFile.tilesets.forEach((tileset: ITiledMapTileset) => {
            if ("source" in tileset) {
                throw new Error(
                    `Tilesets must be embedded in a map. The tileset "${tileset.source}" must be embedded in the Tiled map "${this.mapUrlFile}".`
                );
            }
            this.Terrains.push(
                this.Map.addTilesetImage(
                    tileset.name,
                    `${mapDirUrl}/${tileset.image}`,
                    tileset.tilewidth,
                    tileset.tileheight,
                    tileset.margin,
                    tileset.spacing /*, tileset.firstgid*/
                )
            );
        });

        this.throttledSendViewportToServer = throttle(200, () => {
            this.sendViewportToServer();
        });

        //permit to set bound collision
        this.physics.world.setBounds(0, 0, this.Map.widthInPixels, this.Map.heightInPixels);

        this.embeddedWebsiteManager = new EmbeddedWebsiteManager(this);

        //add layer on map
        this.gameMapFrontWrapper = new GameMapFrontWrapper(
            this,
            new GameMap(this.mapFile, this.wamFile),
            this.Map,
            this.Terrains
        );
        for (const layer of this.gameMapFrontWrapper.getFlatLayers()) {
            if (layer.type === "tilelayer") {
                const exitSceneUrl = this.getExitSceneUrl(layer);
                if (exitSceneUrl !== undefined) {
                    this.loadNextGame(
                        Room.getRoomPathFromExitSceneUrl(exitSceneUrl, window.location.toString(), this.mapUrlFile)
                    ).catch((e) => console.error(e));
                }
                const exitUrl = this.getExitUrl(layer);
                if (exitUrl !== undefined) {
                    this.loadNextGameFromExitUrl(exitUrl).catch((e) => console.error(e));
                }
            }
            if (layer.type === "objectgroup") {
                for (const object of layer.objects) {
                    if (object.text) {
                        TextUtils.createTextFromITiledMapObject(this, object);
                    }
                    if (object.class === "website") {
                        // Let's load iframes in the map
                        const url = PropertyUtils.mustFindStringProperty(
                            GameMapProperties.URL,
                            object.properties,
                            'in the "' + object.name + '" object of type "website"'
                        );
                        const allowApi = PropertyUtils.findBooleanProperty(
                            GameMapProperties.ALLOW_API,
                            object.properties
                        );
                        const policy = PropertyUtils.findStringProperty(GameMapProperties.POLICY, object.properties);

                        this.embeddedWebsiteManager.createEmbeddedWebsite(
                            object.name,
                            url,
                            object.x,
                            object.y,
                            object.width ?? 0,
                            object.height ?? 0,
                            object.visible,
                            allowApi ?? false,
                            policy ?? "",
                            "map",
                            1
                        );
                    }
                }
            }
        }

        this.gameMapFrontWrapper.getExitUrls().forEach((exitUrl) => {
            this.loadNextGameFromExitUrl(exitUrl).catch((e) => console.error(e));
        });

        // TODO: Dynamic areas should be exclusively managed on the front side
        this.areaManager = new DynamicAreaManager(this.gameMapFrontWrapper);

        this.startPositionCalculator = new StartPositionCalculator(
            this.gameMapFrontWrapper,
            this.mapFile,
            this.initPosition,
            urlManager.getStartPositionNameFromUrl()
        );

        startLayerNamesStore.set(this.startPositionCalculator.getStartPositionNames());

        //add entities
        this.Objects = new Array<Phaser.Physics.Arcade.Sprite>();

        //create input to move
        this.userInputManager = new UserInputManager(this, new GameSceneUserInputHandler(this));
        mediaManager.setUserInputManager(this.userInputManager);

        if (localUserStore.getFullscreen()) {
            document
                .querySelector("body")
                ?.requestFullscreen()
                .catch((e) => console.error(e));
        }

        this.pathfindingManager = new PathfindingManager(
            this,
            this.gameMapFrontWrapper.getCollisionGrid(),
            this.gameMapFrontWrapper.getTileDimensions()
        );

        this.subscribeToGameMapChanged();
        this.subscribeToEntitiesManagerObservables();

        //notify game manager can to create currentUser in map
        this.createCurrentPlayer();
        this.removeAllRemotePlayers(); //cleanup the list  of remote players in case the scene was rebooted

        this.tryMovePlayerWithMoveToParameter();

        this.cameraManager = new CameraManager(
            this,
            { x: this.Map.widthInPixels, y: this.Map.heightInPixels },
            waScaleManager
        );

        this.activatablesManager = new ActivatablesManager(this.CurrentPlayer);

        biggestAvailableAreaStore.recompute();
        this.cameraManager.startFollowPlayer(this.CurrentPlayer);
        if (ENABLE_FEATURE_MAP_EDITOR) {
            this.mapEditorModeManager = new MapEditorModeManager(this);
        }

        this.animatedTiles.init(this.Map);
        this.events.on("tileanimationupdate", () => (this.dirty = true));

        this.initCirclesCanvas();

        // Let's pause the scene if the connection is not established yet
        if (!this.room.isDisconnected()) {
            if (this.isReconnecting) {
                setTimeout(() => {
                    if (this.connection === undefined) {
                        try {
                            this.hide();
                        } catch (err) {
                            console.error("Scene sleep error: ", err);
                        }
                        if (get(errorScreenStore)) {
                            // If an error message is already displayed, don't display the "connection lost" message.
                            console.error(
                                "Error message store already displayed for CONNECTION_LOST",
                                get(errorScreenStore)
                            );
                            return;
                        }
                        errorScreenStore.setError(
                            ErrorScreenMessage.fromPartial({
                                type: "reconnecting",
                                code: "CONNECTION_LOST",
                                title: get(LL).warning.connectionLostTitle(),
                                details: get(LL).warning.connectionLostSubtitle(),
                            })
                        );
                    }
                }, 0);
            } else if (this.connection === undefined) {
                // Let's wait 1 second before printing the "connecting" screen to avoid blinking
                setTimeout(() => {
                    console.log("this.room", this.room);
                    if (this.connection === undefined) {
                        try {
                            this.hide();
                        } catch (err) {
                            console.error("Scene sleep error: ", err);
                        }
                        if (get(errorScreenStore)) {
                            // If an error message is already displayed, don't display the "connection lost" message.
                            console.error(
                                "Error message store already displayed for CONNECTION_PENDING: ",
                                get(errorScreenStore)
                            );
                            return;
                        }
                        /*
                         * @fixme
                         * The error awaiting connection appears while the connection is in progress.
                         * In certain cases like the invalid character layer, the connection is close and this error is displayed after selecting Woka scene.
                         * TODO: create connection status with invalid layer case and not display this error.
                         **/
                        /*errorScreenStore.setError(
                            ErrorScreenMessage.fromPartial({
                                type: "reconnecting",
                                code: "CONNECTION_PENDING",
                                title: get(LL).warning.waitingConnectionTitle(),
                                details: get(LL).warning.waitingConnectionSubtitle(),
                            })
                        );*/
                    }
                }, 1000);
            }
        }

        this.createPromiseDeferred.resolve();
        // Now, let's load the script, if any
        const scripts = this.getScriptUrls(this.mapFile);
        const disableModuleMode = PropertyUtils.findBooleanProperty(
            GameMapProperties.SCRIPT_DISABLE_MODULE_SUPPORT,
            this.mapFile.properties
        );
        const scriptPromises = [];
        for (const script of scripts) {
            scriptPromises.push(iframeListener.registerScript(script, !disableModuleMode));
        }

        this.reposition();

        new GameMapPropertiesListener(this, this.gameMapFrontWrapper).register();

        if (!this.room.isDisconnected()) {
            try {
                this.hide();
            } catch (err) {
                console.error("Scene sleep error: ", err);
            }
            this.connect();
        }

        Promise.all([
            this.connectionAnswerPromiseDeferred.promise as Promise<unknown>,
            ...scriptPromises,
            this.CurrentPlayer.getTextureLoadedPromise() as Promise<unknown>,
        ])
            .then(() => {
                this.hide(false);
            })
            .catch((e) =>
                console.error(
                    "Some scripts failed to load ot the connection failed to establish to WorkAdventure server",
                    e
                )
            );

        if (gameManager.currentStartedRoom.backgroundColor != undefined) {
            this.cameras.main.setBackgroundColor(gameManager.currentStartedRoom.backgroundColor);
        }
    }

    private hide(hide = true): void {
        this.scene.setVisible(!hide);
        iframeListener?.hideIFrames(hide);
    }

    /**
     * Initializes the connection to Pusher.
     */
    private connect(): void {
        const camera = this.cameraManager.getCamera();

        connectionManager
            .connectToRoomSocket(
                this.roomUrl,
                this.playerName,
                this.characterLayers,
                {
                    ...this.startPositionCalculator.startPosition,
                },
                {
                    left: camera.scrollX,
                    top: camera.scrollY,
                    right: camera.scrollX + camera.width,
                    bottom: camera.scrollY + camera.height,
                },
                this.companion,
                get(availabilityStatusStore),
                this.getGameMap().getLastCommandId()
            )
            .then((onConnect: OnConnectInterface) => {
                this.connection = onConnect.connection;
                this.mapEditorModeManager?.subscribeToRoomConnection(this.connection);
                const commandsToApply = onConnect.room.commandsToApply;
                if (commandsToApply) {
                    this.mapEditorModeManager?.updateMapToNewest(commandsToApply);
                }

                this.subscribeToStores();

                lazyLoadPlayerCharacterTextures(this.superLoad, onConnect.room.characterLayers)
                    .then((layers) => {
                        this.currentPlayerTexturesResolve(layers);
                    })
                    .catch((e) => {
                        this.currentPlayerTexturesReject(e);
                    });

                playersStore.connectToRoomConnection(this.connection);
                userIsAdminStore.set(this.connection.hasTag("admin"));
                userIsEditorStore.set(this.connection.hasTag("editor"));

                this.connection.userJoinedMessageStream.subscribe((message) => {
                    this.remotePlayersRepository.addPlayer(message);

                    this.playersEventDispatcher.postMessage({
                        type: "addRemotePlayer",
                        data: {
                            playerId: message.userId,
                            name: message.name,
                            userUuid: message.userUuid,
                            outlineColor: message.outlineColor,
                            availabilityStatus: availabilityStatusToJSON(message.availabilityStatus),
                            position: message.position,
                            variables: message.variables,
                        },
                    });
                });

                this.connection.userMovedMessageStream.subscribe((message) => {
                    this.remotePlayersRepository.movePlayer(message);
                    const position = message.position;
                    if (position === undefined) {
                        throw new Error("Position missing from UserMovedMessage");
                    }

                    const messageUserMoved: MessageUserMovedInterface = {
                        userId: message.userId,
                        position: position,
                    };

                    this.updatePlayerPosition(messageUserMoved);
                });

                this.connection.userLeftMessageStream.subscribe((message) => {
                    this.remotePlayersRepository.removePlayer(message.userId);
                    this.playersEventDispatcher.postMessage({
                        type: "removeRemotePlayer",
                        data: message.userId,
                    });
                });

                this.connection.refreshRoomMessageStream.subscribe((message) => {
                    if (message.comment) {
                        refreshPromptStore.set({
                            comment: message.comment,
                            timeToRefresh: message.timeToRefresh,
                        });
                    } else {
                        window.location.reload();
                    }
                });

                this.connection.playerDetailsUpdatedMessageStream.subscribe((message) => {
                    // Is this message for me (exceptionally, we can use this stream to send messages to users
                    // who share the same UUID as us)
                    if (message.userId === this.connection?.getUserId() && message.details?.setVariable) {
                        this.playerVariablesManager.updateVariable(message.details?.setVariable);
                        return;
                    }

                    this.remotePlayersRepository.updatePlayer(message);
                });

                this.connection.groupUpdateMessageStream.subscribe(
                    (groupPositionMessage: GroupCreatedUpdatedMessageInterface) => {
                        this.shareGroupPosition(groupPositionMessage);
                    }
                );

                this.connection.groupDeleteMessageStream.subscribe((message) => {
                    try {
                        this.deleteGroup(message.groupId);
                    } catch (e) {
                        console.error(e);
                    }
                });

                this.connection.onServerDisconnected(() => {
                    showConnectionIssueMessage();
                    console.log("Player disconnected from server. Reloading scene.");
                    this.cleanupClosingScene();
                    this.createSuccessorGameScene(true, true);
                });
                hideConnectionIssueMessage();

                this.connection.itemEventMessageStream.subscribe((message) => {
                    const item = this.actionableItems.get(message.itemId);
                    if (item === undefined) {
                        console.warn(
                            'Received an event about object "' +
                                message.itemId +
                                '" but cannot find this item on the map.'
                        );
                        return;
                    }
                    item.fire(message.event, message.state, message.parameters);
                });

                this.connection.groupUsersUpdateMessageStream.subscribe((message) => {
                    this.currentPlayerGroupId = message.groupId;
                });

                this.connection.groupUsersUpdateMessageStream.subscribe((message) => {
                    this.currentPlayerGroupId = message.groupId;
                });

                this.connection.joinMucRoomMessageStream.subscribe((mucRoomDefinitionMessage) => {
                    iframeListener.sendJoinMucEventToChatIframe(
                        mucRoomDefinitionMessage.url,
                        mucRoomDefinitionMessage.name,
                        mucRoomDefinitionMessage.type,
                        mucRoomDefinitionMessage.subscribe
                    );
                });
                this.connection.leaveMucRoomMessageStream.subscribe((leaveMucRoomMessage) => {
                    iframeListener.sendLeaveMucEventToChatIframe(leaveMucRoomMessage.url);
                });

                this.messageSubscription = this.connection.worldFullMessageStream.subscribe((message) => {
                    this.showWorldFullError(message);
                });

                // When connection is performed, let's connect SimplePeer
                //eslint-disable-next-line @typescript-eslint/no-this-alias
                const me = this;
                this.events.once("render", () => {
                    if (me.connection) {
                        this.simplePeer = new SimplePeer(me.connection);
                    } else {
                        console.warn("Connection to peers not started!");
                    }
                });

                userMessageManager.setReceiveBanListener(this.bannedUser.bind(this));

                this.CurrentPlayer.on(hasMovedEventName, (event: HasPlayerMovedInterface) => {
                    this.handleCurrentPlayerHasMovedEvent(event);
                });

                // Set up variables manager
                this.sharedVariablesManager = new SharedVariablesManager(
                    this.connection,
                    this.gameMapFrontWrapper,
                    onConnect.room.variables
                );
                const playerVariables: Map<string, unknown> = onConnect.room.playerVariables;
                // If the user is not logged, we initialize the variables with variables from the local storage
                if (!localUserStore.isLogged()) {
                    if (this.room.group) {
                        for (const [key, { isPublic, value }] of localUserStore
                            .getAllUserProperties(this.room.group)
                            .entries()) {
                            if (isPublic) {
                                this.connection?.emitPlayerSetVariable({
                                    key,
                                    value,
                                    persist: false,
                                    public: true,
                                    scope: "world",
                                });
                            }
                            playerVariables.set(key, value);
                        }
                    }

                    for (const [key, { isPublic, value }] of localUserStore
                        .getAllUserProperties(this.room.id)
                        .entries()) {
                        if (isPublic) {
                            this.connection?.emitPlayerSetVariable({
                                key,
                                value,
                                persist: false,
                                public: true,
                                scope: "room",
                            });
                        }
                        playerVariables.set(key, value);
                    }
                }
                this.playerVariablesManager = new PlayerVariablesManager(
                    this.connection,
                    this.playersEventDispatcher,
                    playerVariables,
                    this.room.id,
                    this.room.group ?? undefined
                );

                this.connection.xmppSettingsMessageStream.subscribe((xmppSettingsMessage) => {
                    if (xmppSettingsMessage) {
                        iframeListener.sendXmppSettingsToChatIframe(xmppSettingsMessage);
                    }
                });

                this.connectionAnswerPromiseDeferred.resolve(onConnect.room);
                // Analyze tags to find if we are admin. If yes, show console.

                const error = get(errorScreenStore);
                if (error && error?.type === "reconnecting") errorScreenStore.delete();
                //this.scene.stop(ReconnectingSceneName);

                //init user position and play trigger to check layers properties
                this.gameMapFrontWrapper.setPosition(this.CurrentPlayer.x, this.CurrentPlayer.y);

                // Init layer change listener
                this.gameMapFrontWrapper.onEnterLayer((layers) => {
                    layers.forEach((layer) => {
                        iframeListener.sendEnterLayerEvent(layer.name);
                    });
                });

                this.gameMapFrontWrapper.onLeaveLayer((layers) => {
                    layers.forEach((layer) => {
                        iframeListener.sendLeaveLayerEvent(layer.name);
                    });
                });

                // NOTE: Leaving events names as "enterArea" and "leaveArea" to not introduce any breaking changes.
                //       We are only looking through dynamic areas when handling those events.
                this.gameMapFrontWrapper.onEnterDynamicArea((areas) => {
                    areas.forEach((area) => {
                        iframeListener.sendEnterAreaEvent(area.name);
                    });
                });

                this.gameMapFrontWrapper.onLeaveDynamicArea((areas) => {
                    areas.forEach((area) => {
                        iframeListener.sendLeaveAreaEvent(area.name);
                    });
                });

                this.emoteManager = new EmoteManager(this, this.connection);

                // Check WebRtc connection
                if (onConnect.room.webrtcUserName && onConnect.room.webrtcPassword) {
                    try {
                        checkCoturnServer({
                            userId: onConnect.connection.getUserId(),
                            webRtcUser: onConnect.room.webrtcUserName,
                            webRtcPassword: onConnect.room.webrtcPassword,
                        });
                    } catch (err) {
                        console.error("Check coturn server exception: ", err);
                    }
                }

                // Get position from UUID only after the connection to the pusher is established
                this.tryMovePlayerWithMoveToUserParameter();
                gameSceneIsLoadedStore.set(true);
            })
            .catch((e) => console.error(e));
    }

    private subscribeToStores(): void {
        if (
            this.userIsJitsiDominantSpeakerStoreUnsubscriber != undefined ||
            this.jitsiParticipantsCountStoreUnsubscriber != undefined ||
            this.availabilityStatusStoreUnsubscriber != undefined ||
            this.emoteUnsubscriber != undefined ||
            this.emoteMenuUnsubscriber != undefined ||
            this.followUsersColorStoreUnsubscriber != undefined ||
            this.peerStoreUnsubscriber != undefined ||
            this.mapEditorModeStoreUnsubscriber != undefined ||
            this.refreshPromptStoreStoreUnsubscriber != undefined
        ) {
            console.error(
                "subscribeToStores => Check all subscriber undefined ",
                this.userIsJitsiDominantSpeakerStoreUnsubscriber,
                this.jitsiParticipantsCountStoreUnsubscriber,
                this.availabilityStatusStoreUnsubscriber,
                this.emoteUnsubscriber,
                this.emoteMenuUnsubscriber,
                this.followUsersColorStoreUnsubscriber,
                this.peerStoreUnsubscriber,
                this.mapEditorModeStoreUnsubscriber,
                this.refreshPromptStoreStoreUnsubscriber
            );

            throw new Error("One store is already subscribed.");
        }

        this.userIsJitsiDominantSpeakerStoreUnsubscriber = userIsJitsiDominantSpeakerStore.subscribe(
            (dominantSpeaker) => {
                this.jitsiDominantSpeaker = dominantSpeaker;
                this.tryChangeShowVoiceIndicatorState(this.jitsiDominantSpeaker && this.jitsiParticipantsCount > 1);
            }
        );

        this.jitsiParticipantsCountStoreUnsubscriber = jitsiParticipantsCountStore.subscribe((participantsCount) => {
            this.jitsiParticipantsCount = participantsCount;
            this.tryChangeShowVoiceIndicatorState(this.jitsiDominantSpeaker && this.jitsiParticipantsCount > 1);
        });

        this.availabilityStatusStoreUnsubscriber = availabilityStatusStore.subscribe((availabilityStatus) => {
            this.connection?.emitPlayerStatusChange(availabilityStatus);
            this.CurrentPlayer.setAvailabilityStatus(availabilityStatus);
            if (availabilityStatus === AvailabilityStatus.SILENT) {
                this.CurrentPlayer.showTalkIcon(false, true);
            }
        });

        this.emoteUnsubscriber = emoteStore.subscribe((emote) => {
            if (emote) {
                this.CurrentPlayer?.playEmote(emote.emoji);
                this.connection?.emitEmoteEvent(emote.emoji);
                emoteStore.set(null);
            }
        });

        this.emoteMenuUnsubscriber = emoteMenuStore.subscribe((emoteMenu) => {
            if (emoteMenu) {
                this.userInputManager.disableControls();
            } else {
                this.userInputManager.restoreControls();
            }
        });

        this.modalVisibilityStoreUnsubscriber = modalVisibilityStore.subscribe((visibility) => {
            if (!visibility && !this.userInputManager.isControlsEnabled) {
                this.userInputManager.restoreControls();
            }
        });

        this.followUsersColorStoreUnsubscriber = followUsersColorStore.subscribe((color) => {
            if (color !== undefined) {
                this.CurrentPlayer.setFollowOutlineColor(color);
                this.connection?.emitPlayerOutlineColor(color);
            } else {
                this.CurrentPlayer.removeFollowOutlineColor();
                this.connection?.emitPlayerOutlineColor(null);
            }
        });

        this.highlightedEmbedScreenUnsubscriber = highlightedEmbedScreen.subscribe((value) => {
            //this.reposition();
        });

        this.embedScreenLayoutStoreUnsubscriber = embedScreenLayoutStore.subscribe((layout) => {
            //this.reposition();
        });

        const talkIconVolumeTreshold = 10;
        let oldPeersNumber = 0;
        let oldUsers = new Map<number, MessageUserJoined>();
        this.peerStoreUnsubscriber = peerStore.subscribe((peers) => {
            const newPeerNumber = peers.size;
            const newUsers = new Map<number, MessageUserJoined>();
            const players = this.remotePlayersRepository.getPlayers();

            for (const playerId of peers.keys()) {
                const currentPlayer = players.get(playerId);
                if (currentPlayer) {
                    newUsers.set(playerId, currentPlayer);
                }
            }

            // Join
            if (oldPeersNumber === 0 && newPeerNumber > oldPeersNumber) {
                iframeListener.sendJoinProximityMeetingEvent(Array.from(newUsers.values()));
            }

            // Left
            if (newPeerNumber === 0 && newPeerNumber < oldPeersNumber) {
                iframeListener.sendLeaveProximityMeetingEvent();
            }

            // Participant Join
            if (oldPeersNumber > 0 && oldPeersNumber < newPeerNumber) {
                const newUser = Array.from(newUsers.values()).find((player) => !oldUsers.get(player.userId));

                if (newUser) {
                    iframeListener.sendParticipantJoinProximityMeetingEvent(newUser);
                }
            }

            // Participant Left
            if (newPeerNumber > 0 && newPeerNumber < oldPeersNumber) {
                const oldUser = Array.from(oldUsers.values()).find((player) => !newUsers.get(player.userId));

                if (oldUser) {
                    iframeListener.sendParticipantLeaveProximityMeetingEvent(oldUser);
                }
            }

            if (newPeerNumber > oldPeersNumber) {
                this.playSound("audio-webrtc-in");
                faviconManager.pushNotificationFavicon();
            } else if (newPeerNumber < oldPeersNumber) {
                this.playSound("audio-webrtc-out");
                faviconManager.pushOriginalFavicon();
            }

            if (newPeerNumber > 0) {
                if (!this.localVolumeStoreUnsubscriber) {
                    this.localVolumeStoreUnsubscriber = localVolumeStore.subscribe((spectrum) => {
                        if (spectrum === undefined) {
                            this.CurrentPlayer.showTalkIcon(false, true);
                            return;
                        }
                        const volume = spectrum.reduce((a, b) => a + b, 0);
                        this.tryChangeShowVoiceIndicatorState(volume > talkIconVolumeTreshold);
                    });
                }
                //this.reposition();
            } else {
                this.CurrentPlayer.showTalkIcon(false, true);
                this.connection?.emitPlayerShowVoiceIndicator(false);
                this.showVoiceIndicatorChangeMessageSent = false;
                this.MapPlayersByKey.forEach((remotePlayer) => remotePlayer.showTalkIcon(false, true));
                if (this.localVolumeStoreUnsubscriber) {
                    this.localVolumeStoreUnsubscriber();
                    this.localVolumeStoreUnsubscriber = undefined;
                }

                //this.reposition();
            }

            oldUsers = newUsers;
            oldPeersNumber = newPeerNumber;
        });

        this.mapEditorModeStoreUnsubscriber = mapEditorModeStore.subscribe((isOn) => {
            if (isOn) {
                this.activatablesManager.deactivateSelectedObject();
                this.activatablesManager.handlePointerOutActivatableObject();
                this.activatablesManager.disableSelectingByDistance();
            } else {
                this.activatablesManager.enableSelectingByDistance();
                // make sure all entities are non-interactive
                this.gameMapFrontWrapper.getEntitiesManager().makeAllEntitiesNonInteractive();
                // add interactions back only for activatables
                this.gameMapFrontWrapper.getEntitiesManager().makeAllEntitiesInteractive(true);
            }
            this.markDirty();
        });

        this.refreshPromptStoreStoreUnsubscriber = refreshPromptStore.subscribe((comment) => {
            if (comment) {
                this.userInputManager.disableControls();
            } else {
                this.userInputManager.restoreControls();
            }
        });
    }

    //todo: into dedicated classes
    private initCirclesCanvas(): void {
        // Let's generate the circle for the group delimiter
        let circleElement = Object.values(this.textures.list).find(
            (object: Texture) => object.key === "circleSprite-white"
        );
        if (circleElement) {
            this.textures.remove("circleSprite-white");
        }

        circleElement = Object.values(this.textures.list).find((object: Texture) => object.key === "circleSprite-red");
        if (circleElement) {
            this.textures.remove("circleSprite-red");
        }

        //create white circle canvas use to create sprite
        this.circleTexture = this.textures.createCanvas("circleSprite-white", 96, 96);
        const context = this.circleTexture.context;
        context.beginPath();
        context.arc(48, 48, 48, 0, 2 * Math.PI, false);
        // context.lineWidth = 5;
        context.strokeStyle = "#ffffff";
        context.fillStyle = "#ffffff44";
        context.stroke();
        context.fill();
        this.circleTexture.refresh();

        //create red circle canvas use to create sprite
        this.circleRedTexture = this.textures.createCanvas("circleSprite-red", 96, 96);
        const contextRed = this.circleRedTexture.context;
        contextRed.beginPath();
        contextRed.arc(48, 48, 48, 0, 2 * Math.PI, false);
        //context.lineWidth = 5;
        contextRed.strokeStyle = "#ff0000";
        contextRed.fillStyle = "#ff000044";
        contextRed.stroke();
        contextRed.fill();
        this.circleRedTexture.refresh();
    }

    private safeParseJSONstring(jsonString: string | undefined, propertyName: string) {
        try {
            return jsonString ? JSON.parse(jsonString) : {};
        } catch (e) {
            console.warn('Invalid JSON found in property "' + propertyName + '" of the map:' + jsonString, e);
            return {};
        }
    }

    private listenToIframeEvents(): void {
        this.iframeSubscriptionList = [];
        this.iframeSubscriptionList.push(
            iframeListener.openPopupStream.subscribe((openPopupEvent) => {
                let objectLayerSquare: ITiledMapObject;
                const targetObjectData = this.getObjectLayerData(openPopupEvent.targetObject);
                if (targetObjectData !== undefined) {
                    objectLayerSquare = targetObjectData;
                } else {
                    console.error(
                        "Error while opening a popup. Cannot find an object on the map with name '" +
                            openPopupEvent.targetObject +
                            "'. The first parameter of WA.openPopup() must be the name of a rectangle object in your map."
                    );
                    return;
                }
                const escapedMessage = HtmlUtils.escapeHtml(openPopupEvent.message);
                let html = '<div id="container" hidden>';
                if (escapedMessage) {
                    html += `<div class="with-title is-centered">
${escapedMessage}
 </div> `;
                }

                const buttonContainer = '<div class="buttonContainer"</div>';
                html += buttonContainer;
                let id = 0;
                for (const button of openPopupEvent.buttons) {
                    html += `<button type="button" class="is-${HtmlUtils.escapeHtml(
                        button.className ?? ""
                    )}" id="popup-${openPopupEvent.popupId}-${id}">${HtmlUtils.escapeHtml(button.label)}</button>`;
                    id++;
                }
                html += "</div>";
                const domElement = this.add.dom(objectLayerSquare.x, objectLayerSquare.y).createFromHTML(html);

                const container = z.instanceof(HTMLDivElement).parse(domElement.getChildByID("container"));
                container.style.width = objectLayerSquare.width + "px";
                domElement.scale = 0;
                domElement.setClassName("popUpElement");

                setTimeout(() => {
                    container.hidden = false;
                }, 100);

                id = 0;
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                for (const button of openPopupEvent.buttons) {
                    const button = HtmlUtils.getElementByIdOrFail<HTMLButtonElement>(
                        `popup-${openPopupEvent.popupId}-${id}`
                    );
                    const btnId = id;
                    button.onclick = () => {
                        iframeListener.sendButtonClickedEvent(openPopupEvent.popupId, btnId);
                        // Disable for a short amount of time to let time to the script to remove the popup
                        button.disabled = true;
                        setTimeout(() => {
                            button.disabled = false;
                        }, 100);
                    };
                    id++;
                }
                this.tweens.add({
                    targets: domElement,
                    scale: 1,
                    ease: "EaseOut",
                    duration: 400,
                });

                this.popUpElements.set(openPopupEvent.popupId, domElement);
            })
        );

        this.iframeSubscriptionList.push(
            iframeListener.closePopupStream.subscribe((closePopupEvent) => {
                const popUpElement = this.popUpElements.get(closePopupEvent.popupId);
                if (popUpElement === undefined) {
                    console.error(
                        "Could not close popup with ID ",
                        closePopupEvent.popupId,
                        ". Maybe it has already been closed?"
                    );
                }

                this.tweens.add({
                    targets: popUpElement,
                    scale: 0,
                    ease: "EaseOut",
                    duration: 400,
                    onComplete: () => {
                        popUpElement?.destroy();
                        this.popUpElements.delete(closePopupEvent.popupId);
                    },
                });
            })
        );

        this.iframeSubscriptionList.push(
            iframeListener.openChatStream.subscribe(() => {
                chatVisibilityStore.set(true);
            })
        );

        this.iframeSubscriptionList.push(
            iframeListener.closeChatStream.subscribe(() => {
                chatVisibilityStore.set(false);
            })
        );

        this.iframeSubscriptionList.push(
            iframeListener.turnOffMicrophoneStream.subscribe(() => {
                requestedMicrophoneState.disableMicrophone();
            })
        );

        this.iframeSubscriptionList.push(
            iframeListener.turnOffWebcamStream.subscribe(() => {
                requestedCameraState.disableWebcam();
            })
        );

        this.iframeSubscriptionList.push(
            iframeListener.disableMicrophoneStream.subscribe(() => {
                myMicrophoneBlockedStore.set(true);
                mediaManager.disableMyMicrophone();
            })
        );

        this.iframeSubscriptionList.push(
            iframeListener.restoreMicrophoneStream.subscribe(() => {
                myMicrophoneBlockedStore.set(false);
                mediaManager.enableMyMicrophone();
            })
        );

        this.iframeSubscriptionList.push(
            iframeListener.disableWebcamStream.subscribe(() => {
                myCameraBlockedStore.set(true);
                mediaManager.disableMyCamera();
            })
        );

        this.iframeSubscriptionList.push(
            iframeListener.restoreWebcamStream.subscribe(() => {
                myCameraBlockedStore.set(false);
                mediaManager.enableMyCamera();
            })
        );

        this.iframeSubscriptionList.push(
            iframeListener.addPersonnalMessageStream.subscribe((text) => {
                iframeListener.sendUserInputChat(text);
                _newChatMessageSubject.next(text);
            })
        );

        this.iframeSubscriptionList.push(
            iframeListener.newChatMessageWritingStatusStream.subscribe((status) => {
                _newChatMessageWritingStatusSubject.next(status);
            })
        );

        this.iframeSubscriptionList.push(
            iframeListener.disablePlayerControlStream.subscribe(() => {
                this.userInputManager.disableControls();
            })
        );

        this.iframeSubscriptionList.push(
            iframeListener.enablePlayerControlStream.subscribe(() => {
                this.userInputManager.restoreControls();
            })
        );

        this.iframeSubscriptionList.push(
            iframeListener.disablePlayerProximityMeetingStream.subscribe(() => {
                mediaManager.disableProximityMeeting();
            })
        );

        this.iframeSubscriptionList.push(
            iframeListener.enablePlayerProximityMeetingStream.subscribe(() => {
                mediaManager.enableProximityMeeting();
            })
        );

        this.iframeSubscriptionList.push(
            iframeListener.cameraSetStream.subscribe((cameraSetEvent) => {
                const duration = cameraSetEvent.smooth ? 1000 : 0;
                cameraSetEvent.lock
                    ? this.cameraManager.enterFocusMode({ ...cameraSetEvent }, undefined, duration)
                    : this.cameraManager.setPosition({ ...cameraSetEvent }, duration);
            })
        );

        this.iframeSubscriptionList.push(
            iframeListener.cameraFollowPlayerStream.subscribe((cameraFollowPlayerEvent) => {
                this.cameraManager.leaveFocusMode(this.CurrentPlayer, cameraFollowPlayerEvent.smooth ? 1000 : 0);
            })
        );

        this.iframeSubscriptionList.push(
            iframeListener.playSoundStream.subscribe((playSoundEvent) => {
                const url = new URL(playSoundEvent.url, this.mapUrlFile);
                soundManager
                    .playSound(this.load, this.sound, url.toString(), playSoundEvent.config)
                    .catch((e) => console.error(e));
            })
        );

        this.iframeSubscriptionList.push(
            iframeListener.stopSoundStream.subscribe((stopSoundEvent) => {
                const url = new URL(stopSoundEvent.url, this.mapUrlFile);
                soundManager.stopSound(this.sound, url.toString());
            })
        );

        this.iframeSubscriptionList.push(
            iframeListener.askPositionStream.subscribe((event: AskPositionEvent) => {
                this.connection?.emitAskPosition(event.uuid, event.playUri);
            })
        );

        this.iframeSubscriptionList.push(
            iframeListener.openInviteMenuStream.subscribe(() => {
                const indexInviteMenu = get(subMenusStore).findIndex(
                    (menu: MenuItem) => (menu as TranslatedMenu).key === SubMenusInterface.invite
                );
                if (indexInviteMenu === -1) {
                    console.error(
                        `Menu key: ${SubMenusInterface.invite} was not founded in subMenusStore: `,
                        get(subMenusStore)
                    );
                    return;
                }
                if (get(menuVisiblilityStore) && get(activeSubMenuStore) === indexInviteMenu) {
                    menuVisiblilityStore.set(false);
                    activeSubMenuStore.set(0);
                    return;
                }
                activeSubMenuStore.set(indexInviteMenu);
                menuVisiblilityStore.set(true);
            })
        );

        this.iframeSubscriptionList.push(
            iframeListener.addActionsMenuKeyToRemotePlayerStream.subscribe((data) => {
                this.MapPlayersByKey.get(data.id)?.registerActionsMenuAction({
                    actionName: data.actionKey,
                    callback: () => {
                        iframeListener.sendActionsMenuActionClickedEvent({ actionName: data.actionKey, id: data.id });
                    },
                });
            })
        );

        this.iframeSubscriptionList.push(
            iframeListener.removeActionsMenuKeyFromRemotePlayerEvent.subscribe((data) => {
                this.MapPlayersByKey.get(data.id)?.unregisterActionsMenuAction(data.actionKey);
            })
        );

        this.iframeSubscriptionList.push(
            iframeListener.trackCameraUpdateStream.subscribe(() => {
                if (!this.firstCameraUpdateSent) {
                    this.cameraManager.on(
                        CameraManagerEvent.CameraUpdate,
                        (data: CameraManagerEventCameraUpdateData) => {
                            const cameraEvent: WasCameraUpdatedEvent = {
                                x: data.x,
                                y: data.y,
                                width: data.width,
                                height: data.height,
                                zoom: data.zoom,
                            };
                            if (
                                this.lastCameraEvent?.x == cameraEvent.x &&
                                this.lastCameraEvent?.y == cameraEvent.y &&
                                this.lastCameraEvent?.width == cameraEvent.width &&
                                this.lastCameraEvent?.height == cameraEvent.height &&
                                this.lastCameraEvent?.zoom == cameraEvent.zoom
                            ) {
                                return;
                            }

                            this.lastCameraEvent = cameraEvent;
                            iframeListener.sendCameraUpdated(cameraEvent);
                            this.firstCameraUpdateSent = true;
                        }
                    );
                }
            })
        );

        this.iframeSubscriptionList.push(
            iframeListener.loadSoundStream.subscribe((loadSoundEvent) => {
                const url = new URL(loadSoundEvent.url, this.mapUrlFile);
                soundManager.loadSound(this.load, this.sound, url.toString()).catch((e) => console.error(e));
            })
        );

        this.iframeSubscriptionList.push(
            iframeListener.loadPageStream.subscribe((url: string) => {
                this.loadNextGameFromExitUrl(url)
                    .then(() => {
                        this.events.once(EVENT_TYPE.POST_UPDATE, () => {
                            this.onMapExit(Room.getRoomPathFromExitUrl(url, window.location.toString())).catch((e) =>
                                console.error(e)
                            );
                        });
                    })
                    .catch((e) => console.error(e));
            })
        );
        let scriptedBubbleSprite: Sprite;
        this.iframeSubscriptionList.push(
            iframeListener.displayBubbleStream.subscribe(() => {
                scriptedBubbleSprite = new Sprite(
                    this,
                    this.CurrentPlayer.x + 25,
                    this.CurrentPlayer.y,
                    "circleSprite-white"
                );
                scriptedBubbleSprite.setDisplayOrigin(48, 48).setDepth(DEPTH_BUBBLE_CHAT_SPRITE);
                this.add.existing(scriptedBubbleSprite);
            })
        );

        this.iframeSubscriptionList.push(
            iframeListener.removeBubbleStream.subscribe(() => {
                scriptedBubbleSprite.destroy();
            })
        );

        this.iframeSubscriptionList.push(
            iframeListener.showLayerStream.subscribe((layerEvent) => {
                this.gameMapFrontWrapper.setLayerVisibility(layerEvent.name, true);
            })
        );

        this.iframeSubscriptionList.push(
            iframeListener.hideLayerStream.subscribe((layerEvent) => {
                this.gameMapFrontWrapper.setLayerVisibility(layerEvent.name, false);
            })
        );

        this.iframeSubscriptionList.push(
            iframeListener.setPropertyStream.subscribe((setProperty) => {
                this.setPropertyLayer(setProperty.layerName, setProperty.propertyName, setProperty.propertyValue);
            })
        );

        this.iframeSubscriptionList.push(
            iframeListener.setAreaPropertyStream.subscribe((setProperty) => {
                this.setAreaProperty(setProperty.areaName, setProperty.propertyName, setProperty.propertyValue);
            })
        );

        iframeListener.registerAnswerer("openCoWebsite", async (openCoWebsite, source) => {
            if (!source) {
                throw new Error("Unknown query source");
            }

            const coWebsite: SimpleCoWebsite = new SimpleCoWebsite(
                new URL(openCoWebsite.url, iframeListener.getBaseUrlFromSource(source)),
                openCoWebsite.allowApi,
                openCoWebsite.allowPolicy,
                openCoWebsite.widthPercent,
                openCoWebsite.closable
            );

            coWebsiteManager.addCoWebsiteToStore(coWebsite, openCoWebsite.position);

            if (openCoWebsite.lazy === undefined || !openCoWebsite.lazy) {
                await coWebsiteManager.loadCoWebsite(coWebsite);
            }

            return {
                id: coWebsite.getId(),
            };
        });

        iframeListener.registerAnswerer("getCoWebsites", () => {
            const coWebsites = coWebsiteManager.getCoWebsites();

            return coWebsites.map((coWebsite: CoWebsite) => {
                return {
                    id: coWebsite.getId(),
                };
            });
        });

        iframeListener.registerAnswerer("closeCoWebsite", (coWebsiteId) => {
            const coWebsite = coWebsiteManager.getCoWebsiteById(coWebsiteId);

            if (!coWebsite) {
                throw new Error("Unknown co-website");
            }

            return coWebsiteManager.closeCoWebsite(coWebsite);
        });

        iframeListener.registerAnswerer("closeCoWebsites", () => {
            return coWebsiteManager.closeCoWebsites();
        });

        iframeListener.registerAnswerer("openUIWebsite", (websiteConfig) => {
            return uiWebsiteManager.open(websiteConfig);
        });

        iframeListener.registerAnswerer("getUIWebsites", () => {
            return uiWebsiteManager.getAll();
        });

        iframeListener.registerAnswerer("getUIWebsiteById", (websiteId) => {
            const website = uiWebsiteManager.getById(websiteId);
            if (!website) {
                throw new Error("Unknown ui-website");
            }
            return website;
        });

        iframeListener.registerAnswerer("closeUIWebsite", (websiteId) => {
            return uiWebsiteManager.close(websiteId);
        });

        iframeListener.registerAnswerer("getMapData", () => {
            return {
                data: this.gameMapFrontWrapper.getMap(),
            };
        });

        iframeListener.registerAnswerer("getState", async (query, source): Promise<GameStateEvent> => {
            // The sharedVariablesManager is not instantiated before the connection is established. So we need to wait
            // for the connection to send back the answer.
            await this.connectionAnswerPromiseDeferred.promise;
            return {
                mapUrl: this.mapUrlFile,
                startLayerName: this.startPositionCalculator.getStartPositionName() ?? undefined,
                uuid: localUserStore.getLocalUser()?.uuid,
                nickname: this.playerName,
                language: get(locale),
                roomId: this.roomUrl,
                tags: this.connection ? this.connection.getAllTags() : [],
                variables: this.sharedVariablesManager.variables,
                //playerVariables: localUserStore.getAllUserProperties(),
                playerVariables: this.playerVariablesManager.variables,
                userRoomToken: this.connection ? this.connection.userRoomToken : "",
                metadata: this.room.metadata,
                iframeId: source ? iframeListener.getUIWebsiteIframeIdFromSource(source) : undefined,
                isLogged: localUserStore.isLogged(),
            };
        });
        this.iframeSubscriptionList.push(
            iframeListener.setTilesStream.subscribe((eventTiles) => {
                for (const eventTile of eventTiles) {
                    this.gameMapFrontWrapper.putTile(eventTile.tile, eventTile.x, eventTile.y, eventTile.layer);
                    this.animatedTiles.updateAnimatedTiles(eventTile.x, eventTile.y);
                }
            })
        );
        iframeListener.registerAnswerer("enablePlayersTracking", (enablePlayersTrackingEvent, source) => {
            if (source === null) {
                throw new Error('Missing source in "enablePlayersTracking" query. This should never happen.');
            }

            if (enablePlayersTrackingEvent.movement === true && enablePlayersTrackingEvent.players === false) {
                throw new Error("Cannot enable movement without enabling players first");
            }

            let sendPlayers = false;

            if (enablePlayersTrackingEvent.players) {
                sendPlayers = this.playersEventDispatcher.addIframe(source);
            } else {
                this.playersEventDispatcher.removeIframe(source);
            }
            if (enablePlayersTrackingEvent.movement) {
                this.playersMovementEventDispatcher.addIframe(source);
            } else {
                this.playersMovementEventDispatcher.removeIframe(source);
            }

            const addPlayerEvents: AddPlayerEvent[] = [];
            if (sendPlayers) {
                if (enablePlayersTrackingEvent.players) {
                    for (const player of this.remotePlayersRepository.getPlayers().values()) {
                        addPlayerEvents.push(RemotePlayersRepository.toIframeAddPlayerEvent(player));
                    }
                }
            }
            return addPlayerEvents;
        });
        iframeListener.registerAnswerer("loadTileset", (eventTileset) => {
            return this.connectionAnswerPromiseDeferred.promise.then(() => {
                const jsonTilesetDir = eventTileset.url.substring(0, eventTileset.url.lastIndexOf("/"));
                //Initialise the firstgid to 1 because if there is no tileset in the tilemap, the firstgid will be 1
                let newFirstgid = 1;
                const lastTileset = this.mapFile.tilesets[this.mapFile.tilesets.length - 1];
                if (
                    lastTileset &&
                    lastTileset.firstgid !== undefined &&
                    "tilecount" in lastTileset &&
                    lastTileset.tilecount !== undefined
                ) {
                    //If there is at least one tileset in the tilemap then calculate the firstgid of the new tileset
                    newFirstgid = lastTileset.firstgid + lastTileset.tilecount;
                }
                return new Promise((resolve, reject) => {
                    this.load.on("filecomplete-json-" + eventTileset.url, () => {
                        let jsonTileset = this.cache.json.get(eventTileset.url);
                        const imageUrl = jsonTilesetDir + "/" + jsonTileset.image;

                        this.load.image(imageUrl, imageUrl);
                        this.load.on("filecomplete-image-" + imageUrl, () => {
                            //Add the firstgid of the tileset to the json file
                            jsonTileset = { ...jsonTileset, firstgid: newFirstgid };
                            this.mapFile.tilesets.push(jsonTileset);
                            this.Map.tilesets.push(
                                new Tileset(
                                    jsonTileset.name,
                                    jsonTileset.firstgid,
                                    jsonTileset.tileWidth,
                                    jsonTileset.tileHeight,
                                    jsonTileset.margin,
                                    jsonTileset.spacing,
                                    jsonTileset.tiles
                                )
                            );
                            this.Terrains.push(
                                this.Map.addTilesetImage(
                                    jsonTileset.name,
                                    imageUrl,
                                    jsonTileset.tilewidth,
                                    jsonTileset.tileheight,
                                    jsonTileset.margin,
                                    jsonTileset.spacing
                                )
                            );
                            //destroy the tilemapayer because they are unique and we need to reuse their key and layerdData
                            for (const layer of this.Map.layers) {
                                layer.tilemapLayer.destroy(false);
                            }
                            //Create a new GameMap with the changed file
                            this.gameMapFrontWrapper = new GameMapFrontWrapper(
                                this,
                                new GameMap(this.mapFile, this.wamFile),
                                this.Map,
                                this.Terrains
                            );
                            // Unsubscribe if needed and subscribe to GameMapChanged event again
                            this.subscribeToGameMapChanged();
                            this.subscribeToEntitiesManagerObservables();
                            //Destroy the colliders of the old tilemapLayer
                            this.physics.add.world.colliders.destroy();
                            //Create new colliders with the new GameMap
                            this.createCollisionWithPlayer();
                            //Create new trigger with the new GameMap
                            new GameMapPropertiesListener(this, this.gameMapFrontWrapper).register();
                            resolve(newFirstgid);
                        });
                    });
                    this.load.on("loaderror", () => {
                        console.error("Error while loading " + eventTileset.url + ".");
                        reject(-1);
                    });

                    this.load.json(eventTileset.url, eventTileset.url);
                    this.load.start();
                });
            });
        });

        iframeListener.registerAnswerer("triggerActionMessage", (message) =>
            layoutManagerActionStore.addAction({
                uuid: message.uuid,
                type: "message",
                message: message.message,
                callback: () => {
                    layoutManagerActionStore.removeAction(message.uuid);
                    iframeListener.sendActionMessageTriggered(message.uuid);
                },
                userInputManager: this.userInputManager,
            })
        );

        iframeListener.registerAnswerer("setVariable", (event, source) => {
            // TODO: "setVariable" message has a useless "target"
            // TODO: "setVariable" message has a useless "target"
            // TODO: "setVariable" message has a useless "target"
            // TODO: design another message when sending from iframeAPI to front

            this.sharedVariablesManager.setVariable(event, source);
            /*switch (event.target) {
                case "global": {
                    break;
                }
                case "player": {
                    localUserStore.setUserProperty(event.key, event.value);
                    break;
                }
                case "sharedPlayer": {
                    this.connection?.emitPlayerSetVariable(event.key, event.value);
                    // const clientToServerMessage = new ClientToServerMessage();
                    // clientToServerMessage.setSetplayerdetailsmessage(message);
                    // this.socket.send(clientToServerMessage.serializeBinary().buffer);
                    break;
                }
                default: {
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    const _exhaustiveCheck: never = event.target;
                }
            }*/
        });

        iframeListener.registerAnswerer("removeActionMessage", (message) => {
            layoutManagerActionStore.removeAction(message.uuid);
        });

        iframeListener.registerAnswerer("setPlayerOutline", (message) => {
            const normalizeColor = (color: number) => Math.min(Math.max(0, Math.round(color)), 255);
            const red = normalizeColor(message.red);
            const green = normalizeColor(message.green);
            const blue = normalizeColor(message.blue);
            const color = (red << 16) | (green << 8) | blue;
            this.CurrentPlayer.setApiOutlineColor(color);
            this.connection?.emitPlayerOutlineColor(color);
        });

        iframeListener.registerAnswerer("removePlayerOutline", () => {
            this.CurrentPlayer.removeApiOutlineColor();
            this.connection?.emitPlayerOutlineColor(null);
        });

        iframeListener.registerAnswerer("getPlayerPosition", () => {
            return {
                x: this.CurrentPlayer.x,
                y: this.CurrentPlayer.y,
            };
        });

        iframeListener.registerAnswerer("movePlayerTo", async (message) => {
            const startTileIndex = this.getGameMap().getTileIndexAt(this.CurrentPlayer.x, this.CurrentPlayer.y);
            const destinationTileIndex = this.getGameMap().getTileIndexAt(message.x, message.y);
            const path = await this.getPathfindingManager().findPath(startTileIndex, destinationTileIndex, true, true);
            path.shift();
            if (path.length === 0) {
                throw new Error("no path available");
            }
            return this.CurrentPlayer.setPathToFollow(path, message.speed);
        });

        iframeListener.registerAnswerer("getWoka", () => {
            return new Promise((res, rej) => {
                const woka = get(currentPlayerWokaStore);
                if (woka) {
                    res(woka);
                    return;
                }

                // If we could not get the Woka right away (because it is not available yet), let's subscribe to the update
                // and resolve as soon as we have a value
                let unsubscribe: (() => void) | undefined;
                //eslint-disable-next-line prefer-const
                unsubscribe = currentPlayerWokaStore.subscribe((woka) => {
                    if (woka !== undefined) {
                        if (unsubscribe) {
                            unsubscribe();
                        }
                        res(woka);
                    }
                });
            });
        });
    }

    private setPropertyLayer(
        layerName: string,
        propertyName: string,
        propertyValue: string | number | boolean | undefined
    ): void {
        if (propertyName === GameMapProperties.EXIT_URL && typeof propertyValue === "string") {
            this.loadNextGameFromExitUrl(propertyValue).catch((e) => console.error(e));
        }
        this.gameMapFrontWrapper.setLayerProperty(layerName, propertyName, propertyValue);
    }

    private setAreaProperty(areaName: string, propertyName: string, propertyValue: unknown): void {
        this.gameMapFrontWrapper.setDynamicAreaProperty(areaName, propertyName, propertyValue);
    }

    public getMapDirUrl(): string {
        return this.mapUrlFile.substring(0, this.mapUrlFile.lastIndexOf("/"));
    }

    public async onMapExit(roomUrl: URL) {
        if (this.mapTransitioning) return;
        this.mapTransitioning = true;

        this.gameMapFrontWrapper.triggerExitCallbacks();

        let targetRoom: Room;
        try {
            targetRoom = await Room.createRoom(roomUrl);
        } catch (e /*: unknown*/) {
            console.error('Error while fetching new room "' + roomUrl.toString() + '"', e);

            //show information room access denied
            layoutManagerActionStore.addAction({
                uuid: "roomAccessDenied",
                type: "warning",
                message: get(LL).warning.accessDenied.room(),
                callback: () => {
                    layoutManagerActionStore.removeAction("roomAccessDenied");
                },
                userInputManager: this.userInputManager,
            });

            this.mapTransitioning = false;
            return;
        }

        if (roomUrl.hash) {
            urlManager.pushStartLayerNameToUrl(roomUrl.hash);
        }

        if (!targetRoom.isEqual(this.room)) {
            if (this.scene.get(targetRoom.key) === null) {
                console.error("next room not loaded", targetRoom.key);
                // Try to load next game room from exit URL
                // The policy of room can to be updated during a session and not load before
                await this.loadNextGameFromExitUrl(targetRoom.key);
            }
            this.cleanupClosingScene();
            this.scene.stop();
            this.scene.start(targetRoom.key);
            this.scene.remove(this.scene.key);
        } else {
            //if the exit points to the current map, we simply teleport the user back to the startLayer
            this.startPositionCalculator.initStartXAndStartY(roomUrl.hash);
            this.CurrentPlayer.x = this.startPositionCalculator.startPosition.x;
            this.CurrentPlayer.y = this.startPositionCalculator.startPosition.y;
            this.CurrentPlayer.finishFollowingPath(true);
            // clear properties in case we are moved on the same layer / area in order to trigger them
            this.gameMapFrontWrapper.clearCurrentProperties();
            this.gameMapFrontWrapper.setPosition(this.CurrentPlayer.x, this.CurrentPlayer.y);
            setTimeout(() => (this.mapTransitioning = false), 500);
        }
    }

    public playSound(sound: string) {
        this.sound.play(sound, {
            volume: 0.2,
        });
    }

    public getSimplePeer() {
        return this.simplePeer;
    }

    public cleanupClosingScene(): void {
        // make sure we restart own medias
        mediaManager.disableMyCamera();
        mediaManager.disableMyMicrophone();
        // stop playing audio, close any open website, stop any open Jitsi, unsubscribe
        coWebsiteManager.cleanup();
        // Stop the script, if any
        if (this.mapFile) {
            const scripts = this.getScriptUrls(this.mapFile);
            for (const script of scripts) {
                iframeListener.unregisterScript(script);
            }
        }

        iframeListener.cleanup();
        uiWebsiteManager.closeAll();
        followUsersStore.stopFollowing();

        audioManagerFileStore.unloadAudio();
        layoutManagerActionStore.clearActions();

        // We are completely destroying the current scene to avoid using a half-backed instance when coming back to the same map.
        this.connection?.closeConnection();
        this.simplePeer?.closeAllConnections();
        this.simplePeer?.unregister();
        this.userInputManager?.destroy();
        this.pinchManager?.destroy();
        this.emoteManager?.destroy();
        this.cameraManager?.destroy();
        this.mapEditorModeManager?.destroy();
        this.peerStoreUnsubscriber?.();
        this.mapEditorModeStoreUnsubscriber?.();
        this.refreshPromptStoreStoreUnsubscriber?.();
        this.emoteUnsubscriber?.();
        this.emoteMenuUnsubscriber?.();
        this.followUsersColorStoreUnsubscriber?.();
        this.highlightedEmbedScreenUnsubscriber?.();
        this.embedScreenLayoutStoreUnsubscriber?.();
        this.userIsJitsiDominantSpeakerStoreUnsubscriber?.();
        this.jitsiParticipantsCountStoreUnsubscriber?.();
        this.availabilityStatusStoreUnsubscriber?.();
        iframeListener.unregisterAnswerer("getState");
        iframeListener.unregisterAnswerer("loadTileset");
        iframeListener.unregisterAnswerer("getMapData");
        iframeListener.unregisterAnswerer("triggerActionMessage");
        iframeListener.unregisterAnswerer("removeActionMessage");
        iframeListener.unregisterAnswerer("openCoWebsite");
        iframeListener.unregisterAnswerer("getCoWebsites");
        iframeListener.unregisterAnswerer("setPlayerOutline");
        iframeListener.unregisterAnswerer("setVariable");
        iframeListener.unregisterAnswerer("openUIWebsite");
        iframeListener.unregisterAnswerer("getUIWebsites");
        iframeListener.unregisterAnswerer("getUIWebsiteById");
        iframeListener.unregisterAnswerer("closeUIWebsite");
        iframeListener.unregisterAnswerer("enablePlayersTracking");
        this.sharedVariablesManager?.close();
        this.playerVariablesManager?.close();
        this.embeddedWebsiteManager?.close();
        this.areaManager?.close();
        this.playersEventDispatcher.cleanup();
        this.playersMovementEventDispatcher.cleanup();

        //When we leave game, the camera is stop to be reopen after.
        // I think that we could keep camera status and the scene can manage camera setup
        //TODO find wy chrome don't manage correctly a multiple ask mediaDevices
        //mediaManager.hideMyCamera();

        for (const iframeEvents of this.iframeSubscriptionList) {
            iframeEvents.unsubscribe();
        }
        this.gameMapChangedSubscription?.unsubscribe();
        this.messageSubscription?.unsubscribe();
        gameSceneIsLoadedStore.set(false);
        this.cleanupDone = true;
    }

    private removeAllRemotePlayers(): void {
        this.MapPlayersByKey.forEach((player: RemotePlayer) => {
            player.destroy();

            if (player.companion) {
                player.companion.destroy();
            }
        });
        this.MapPlayersByKey.clear();
    }

    private tryMovePlayerWithMoveToParameter(): void {
        const moveToParam = urlManager.getHashParameter("moveTo");
        if (moveToParam) {
            try {
                let endPos;
                const posFromParam = StringUtils.parsePointFromParam(moveToParam);
                if (posFromParam) {
                    endPos = this.gameMapFrontWrapper.getTileIndexAt(posFromParam.x, posFromParam.y);
                } else {
                    const destinationObject = this.gameMapFrontWrapper.getObjectWithName(moveToParam);
                    if (destinationObject) {
                        endPos = this.gameMapFrontWrapper.getTileIndexAt(destinationObject.x, destinationObject.y);
                    } else {
                        endPos = this.gameMapFrontWrapper.getRandomPositionFromLayer(moveToParam);
                    }
                }

                this.moveTo(endPos);

                urlManager.clearHashParameter();
            } catch (err) {
                console.warn(`Cannot proceed with moveTo command:\n\t-> ${err}`);
            }
        }
    }

    private tryMovePlayerWithMoveToUserParameter(): void {
        const uuidParam = urlManager.getHashParameter("moveToUser");
        if (uuidParam) {
            this.connection?.emitAskPosition(uuidParam, this.roomUrl);
            urlManager.clearHashParameter();
        }
    }

    public moveTo(position: { x: number; y: number }) {
        this.pathfindingManager
            .findPath(this.gameMapFrontWrapper.getTileIndexAt(this.CurrentPlayer.x, this.CurrentPlayer.y), position)
            .then((path) => {
                if (path && path.length > 0) {
                    this.CurrentPlayer.setPathToFollow(path).catch((reason) => console.warn(reason));
                }
            })
            .catch((reason) => console.warn(reason));
    }

    private getExitUrl(layer: ITiledMapLayer): string | undefined {
        const property = PropertyUtils.findStringProperty(GameMapProperties.EXIT_URL, layer.properties);
        return property;
    }

    /**
     * @deprecated the map property exitSceneUrl is deprecated
     */
    private getExitSceneUrl(layer: ITiledMapLayer): string | undefined {
        const property = PropertyUtils.findStringProperty(GameMapProperties.EXIT_SCENE_URL, layer.properties);
        return property;
    }

    private getScriptUrls(map: ITiledMap): string[] {
        const script = PropertyUtils.findStringProperty(GameMapProperties.SCRIPT, map.properties);

        if (!script) {
            return [];
        }

        return script.split("\n").map((scriptSplit) => new URL(scriptSplit, this.mapUrlFile).toString());
    }

    private loadNextGameFromExitUrl(exitUrl: string): Promise<void> {
        return this.loadNextGame(Room.getRoomPathFromExitUrl(exitUrl, window.location.toString()));
    }

    //todo: push that into the gameManager
    private async loadNextGame(exitRoomPath: URL): Promise<void> {
        try {
            const room = await Room.createRoom(exitRoomPath);
            return gameManager.loadMap(room);
        } catch (e /*: unknown*/) {
            console.warn('Error while pre-loading exit room "' + exitRoomPath.toString() + '"', e);
        }
    }

    private handleCurrentPlayerHasMovedEvent(event: HasPlayerMovedInterface): void {
        //listen event to share position of user
        this.pushPlayerPosition(event);
        this.gameMapFrontWrapper.setPosition(event.x, event.y);
        this.activatablesManager.updateActivatableObjectsDistances([
            ...Array.from(this.MapPlayersByKey.values()),
            ...this.actionableItems.values(),
            ...this.gameMapFrontWrapper.getActivatableEntities(),
        ]);
        this.activatablesManager.deduceSelectedActivatableObjectByDistance();
    }

    private createCollisionWithPlayer() {
        //add collision layer
        for (const phaserLayer of this.gameMapFrontWrapper.phaserLayers) {
            this.physics.add.collider(
                this.CurrentPlayer,
                phaserLayer,
                (object1: GameObject, object2: GameObject) => {}
            );
            phaserLayer.setCollisionByProperty({ collides: true });
            if (DEBUG_MODE) {
                //debug code to see the collision hitbox of the object in the top layer
                phaserLayer.renderDebug(this.add.graphics(), {
                    tileColor: null, //non-colliding tiles
                    collidingTileColor: new Phaser.Display.Color(243, 134, 48, 200), // Colliding tiles,
                    faceColor: new Phaser.Display.Color(40, 39, 37, 255), // Colliding face edges
                });
            }
            //});
        }
    }

    // The promise that will resolve to the current player texture. This will be available only after connection is established.
    private currentPlayerTexturesResolve!: (value: string[]) => void;
    private currentPlayerTexturesReject!: (reason: unknown) => void;
    private currentPlayerTexturesPromise: CancelablePromise<string[]> = new CancelablePromise((resolve, reject) => {
        this.currentPlayerTexturesResolve = resolve;
        this.currentPlayerTexturesReject = reject;
    });

    private createCurrentPlayer() {
        //TODO create animation moving between exit and start
        try {
            this.CurrentPlayer = new Player(
                this,
                this.startPositionCalculator.startPosition.x,
                this.startPositionCalculator.startPosition.y,
                this.playerName,
                this.currentPlayerTexturesPromise,
                PositionMessage_Direction.DOWN,
                false,
                this.companion,
                this.companionLoadingManager?.lazyLoadByName(this.companion)
            );
            this.CurrentPlayer.on(Phaser.Input.Events.POINTER_OVER, (pointer: Phaser.Input.Pointer) => {
                this.CurrentPlayer.pointerOverOutline(0x365dff);
            });
            this.CurrentPlayer.on(Phaser.Input.Events.POINTER_OUT, (pointer: Phaser.Input.Pointer) => {
                this.CurrentPlayer.pointerOutOutline();
            });
            this.CurrentPlayer.on(requestEmoteEventName, (emoteKey: string) => {
                this.connection?.emitEmoteEvent(emoteKey);
            });
        } catch (err) {
            if (err instanceof TextureError) {
                gameManager.leaveGame(SelectCharacterSceneName, new SelectCharacterScene());
            }
            throw err;
        }

        //create collision
        this.createCollisionWithPlayer();
    }

    private pushPlayerPosition(event: HasPlayerMovedInterface) {
        if (this.lastMoveEventSent === event) {
            return;
        }

        // If the player is not moving, let's send the info right now.
        if (event.moving === false) {
            this.doPushPlayerPosition(event);
            return;
        }

        // If the player is moving, and if it changed direction, let's send an event
        if (event.direction !== this.lastMoveEventSent.direction) {
            this.doPushPlayerPosition(event);
            return;
        }

        // If more than 200ms happened since last event sent
        if (this.currentTick - this.lastSentTick >= POSITION_DELAY) {
            this.doPushPlayerPosition(event);
            return;
        }

        // Otherwise, do nothing.
    }

    private doPushPlayerPosition(event: HasPlayerMovedInterface): void {
        this.lastMoveEventSent = event;
        this.lastSentTick = this.currentTick;
        const camera = this.cameras.main;
        this.connection?.sharePosition(event.x, event.y, event.direction, event.moving, {
            left: camera.scrollX,
            top: camera.scrollY,
            right: camera.scrollX + camera.width,
            bottom: camera.scrollY + camera.height,
        });
        iframeListener.hasPlayerMoved(event);
    }

    /**
     * @param time
     * @param delta The delta time in ms since the last frame. This is a smoothed and capped value based on the FPS rate.
     */
    public update(time: number, delta: number): void {
        this.dirty = false;
        this.currentTick = time;

        this.CurrentPlayer.moveUser(delta, this.userInputManager.getEventListForGameTick());
        if (this.mapEditorModeManager?.isActive()) {
            this.mapEditorModeManager.update(time, delta);
        }

        for (const addedPlayer of this.remotePlayersRepository.getAddedPlayers()) {
            debugAddPlayer("Player will be added to the GameScene", addedPlayer.userId);
            this.doAddPlayer(addedPlayer);
            debugAddPlayer("Player has been added to the GameScene", addedPlayer.userId);
        }
        for (const movedPlayer of this.remotePlayersRepository.getMovedPlayers()) {
            this.doUpdatePlayerPosition(movedPlayer);
        }
        for (const updatedPlayer of this.remotePlayersRepository.getUpdatedPlayers()) {
            this.doUpdatePlayerDetails(updatedPlayer);
        }
        for (const removedPlayerId of this.remotePlayersRepository.getRemovedPlayers()) {
            debugRemovePlayer("Player will be removed from GameScene", removedPlayerId);
            this.doRemovePlayer(removedPlayerId);
            debugRemovePlayer("Player has been removed from GameScene", removedPlayerId);
        }

        if (
            !this.playersDebugLogAlreadyDisplayed &&
            this.remotePlayersRepository.getPlayers().size !== this.MapPlayersByKey.size
        ) {
            console.error(
                "Not the same count of players",
                this.remotePlayersRepository.getPlayers(),
                this.MapPlayersByKey,
                "Added players:",
                this.remotePlayersRepository.getAddedPlayers(),
                "Moved players:",
                this.remotePlayersRepository.getMovedPlayers(),
                "Updated players:",
                this.remotePlayersRepository.getUpdatedPlayers(),
                "Removed players:",
                this.remotePlayersRepository.getRemovedPlayers()
            );
            this.playersDebugLogAlreadyDisplayed = true;
        }

        this.remotePlayersRepository.reset();

        // Let's handle all events
        while (this.pendingEvents.length !== 0) {
            this.dirty = true;
            const event = this.pendingEvents.dequeue();
            switch (event.type) {
                /*case "AddPlayerEvent":
                    this.doAddPlayer(event.event);
                    break;
                case "RemovePlayerEvent":
                    this.doRemovePlayer(event.userId);
                    break;
                case "UserMovedEvent": {
                    this.doUpdatePlayerPosition(event.event);
                    const remotePlayer = this.MapPlayersByKey.get(event.event.userId);
                    if (remotePlayer) {
                        this.activatablesManager.updateDistanceForSingleActivatableObject(remotePlayer);
                        this.activatablesManager.deduceSelectedActivatableObjectByDistance();
                    }
                    break;
                }*/
                case "GroupCreatedUpdatedEvent":
                    this.doShareGroupPosition(event.event);
                    break;
                /*case "PlayerDetailsUpdated":
                    this.doUpdatePlayerDetails(event.details);
                    break;*/
                case "DeleteGroupEvent": {
                    this.doDeleteGroup(event.groupId);
                    if (this.currentPlayerGroupId === event.groupId) {
                        currentPlayerGroupLockStateStore.set(undefined);
                    }
                    break;
                }
                /*default: {
                    const _exhaustiveCheck: never = event;
                }*/
            }
        }
        // Let's move all users
        const updatedPlayersPositions = this.playersPositionInterpolator.getUpdatedPositions(time);
        updatedPlayersPositions.forEach((moveEvent: HasPlayerMovedInterface, userId: number) => {
            this.dirty = true;
            const player: RemotePlayer | undefined = this.MapPlayersByKey.get(userId);
            if (player === undefined) {
                throw new Error('Cannot find player with ID "' + userId + '"');
            }
            player.updatePosition(moveEvent);
        });
    }

    private doAddPlayer(addPlayerData: AddPlayerInterface): void {
        //check if exist player, if exist, move position
        // Can this really happen? yes..
        if (this.MapPlayersByKey.has(addPlayerData.userId)) {
            console.warn("Got instructed to add a player that already exists: ", addPlayerData.userId);
            console.error(
                "Players status",
                this.remotePlayersRepository.getPlayers(),
                this.MapPlayersByKey,
                "Added players:",
                this.remotePlayersRepository.getAddedPlayers(),
                "Moved players:",
                this.remotePlayersRepository.getMovedPlayers(),
                "Updated players:",
                this.remotePlayersRepository.getUpdatedPlayers(),
                "Removed players:",
                this.remotePlayersRepository.getRemovedPlayers()
            );
            return;
        }

        const texturesPromise = lazyLoadPlayerCharacterTextures(this.superLoad, addPlayerData.characterLayers);
        const player = new RemotePlayer(
            addPlayerData.userId,
            addPlayerData.userUuid,
            this,
            addPlayerData.position.x,
            addPlayerData.position.y,
            addPlayerData.name,
            texturesPromise,
            addPlayerData.position.direction,
            addPlayerData.position.moving,
            addPlayerData.visitCardUrl,
            addPlayerData.companion,
            this.companionLoadingManager?.lazyLoadByName(addPlayerData.companion)
        );
        if (addPlayerData.outlineColor !== undefined) {
            player.setApiOutlineColor(addPlayerData.outlineColor);
        }
        if (addPlayerData.availabilityStatus !== undefined) {
            player.setAvailabilityStatus(addPlayerData.availabilityStatus, true);
        }
        this.MapPlayersByKey.set(player.userId, player);
        player.updatePosition(addPlayerData.position);

        player.on(Phaser.Input.Events.POINTER_OVER, () => {
            this.activatablesManager.handlePointerOverActivatableObject(player);
            this.markDirty();
        });

        player.on(Phaser.Input.Events.POINTER_OUT, () => {
            this.activatablesManager.handlePointerOutActivatableObject();
            this.markDirty();
        });

        player.on(RemotePlayerEvent.Clicked, () => {
            const userFound = this.remotePlayersRepository.getPlayers().get(player.userId);

            if (!userFound) {
                console.error("Undefined clicked player!");
                return;
            }

            iframeListener.sendRemotePlayerClickedEvent(userFound);
        });
    }

    private tryChangeShowVoiceIndicatorState(show: boolean): void {
        this.CurrentPlayer.showTalkIcon(show);
        if (this.showVoiceIndicatorChangeMessageSent && !show) {
            this.connection?.emitPlayerShowVoiceIndicator(false);
            this.showVoiceIndicatorChangeMessageSent = false;
        } else if (!this.showVoiceIndicatorChangeMessageSent && show) {
            this.connection?.emitPlayerShowVoiceIndicator(true);
            this.showVoiceIndicatorChangeMessageSent = true;
        }
    }

    private subscribeToGameMapChanged(): void {
        this.gameMapChangedSubscription?.unsubscribe();
        this.gameMapChangedSubscription = this.gameMapFrontWrapper
            .getMapChangedObservable()
            .subscribe((collisionGrid) => {
                this.pathfindingManager.setCollisionGrid(collisionGrid);
                this.markDirty();
                const playerDestination = this.CurrentPlayer.getCurrentPathDestinationPoint();
                if (playerDestination) {
                    const startTileIndex = this.getGameMap().getTileIndexAt(this.CurrentPlayer.x, this.CurrentPlayer.y);
                    const endTileIndex = this.getGameMap().getTileIndexAt(playerDestination.x, playerDestination.y);
                    this.pathfindingManager
                        .findPath(startTileIndex, endTileIndex)
                        .then((path) => {
                            this.CurrentPlayer.setPathToFollow(path).catch((reason) => console.warn(reason));
                        })
                        .catch((reason) => console.warn(reason));
                }
            });
    }

    private subscribeToEntitiesManagerObservables(): void {
        this.gameMapFrontWrapper
            .getEntitiesManager()
            .getPointerOverEntityObservable()
            .subscribe((entity) => {
                if (get(mapEditorModeStore)) {
                    return;
                }
                this.activatablesManager.handlePointerOverActivatableObject(entity);
                this.markDirty();
            });
        this.gameMapFrontWrapper
            .getEntitiesManager()
            .getPointerOutEntityObservable()
            .subscribe((entity) => {
                if (get(mapEditorModeStore)) {
                    return;
                }
                this.activatablesManager.handlePointerOutActivatableObject();
                this.markDirty();
            });
    }

    private doRemovePlayer(userId: number) {
        const player = this.MapPlayersByKey.get(userId);
        if (player === undefined) {
            console.error("Cannot find user with id ", userId);
        } else {
            player.destroy();

            if (player.companion) {
                player.companion.destroy();
            }
        }
        this.MapPlayersByKey.delete(userId);
        // console.debug("User removed in MapPlayersByKey in GameScene", userId);
        this.playersPositionInterpolator.removePlayer(userId);
    }

    private updatePlayerPosition(message: MessageUserMovedInterface): void {
        this.playersMovementEventDispatcher.postMessage({
            type: "remotePlayerChanged",
            data: {
                playerId: message.userId,
                position: {
                    x: message.position.x,
                    y: message.position.y,
                    // TODO: make sure we can also have the "running" and "position" info
                },
            },
        });
    }

    private doUpdatePlayerPosition(message: MessageUserMovedInterface): void {
        const player: RemotePlayer | undefined = this.MapPlayersByKey.get(message.userId);
        if (player === undefined) {
            //throw new Error('Cannot find player with ID "' + message.userId +'"');
            console.error('Cannot update position of player with ID "' + message.userId + '": player not found');
            return;
        }

        // We do not update the player position directly (because it is sent only every 200ms).
        // Instead we use the PlayersPositionInterpolator that will do a smooth animation over the next 200ms.
        const playerMovement = new PlayerMovement(
            { x: player.x, y: player.y },
            this.currentTick,
            {
                ...message.position,
            },
            this.currentTick + POSITION_DELAY
        );
        this.playersPositionInterpolator.updatePlayerPosition(player.userId, playerMovement);
    }

    private shareGroupPosition(groupPositionMessage: GroupCreatedUpdatedMessageInterface) {
        this.pendingEvents.enqueue({
            type: "GroupCreatedUpdatedEvent",
            event: groupPositionMessage,
        });
    }

    private doShareGroupPosition(groupPositionMessage: GroupCreatedUpdatedMessageInterface) {
        //delete previous group
        this.doDeleteGroup(groupPositionMessage.groupId);

        // TODO: circle radius should not be hard stored
        //create new group
        const sprite = new Sprite(
            this,
            Math.round(groupPositionMessage.position.x),
            Math.round(groupPositionMessage.position.y),
            groupPositionMessage.groupSize === MAX_PER_GROUP || groupPositionMessage.locked
                ? "circleSprite-red"
                : "circleSprite-white"
        );
        sprite.setDisplayOrigin(48, 48).setDepth(DEPTH_BUBBLE_CHAT_SPRITE);
        this.add.existing(sprite);
        this.groups.set(groupPositionMessage.groupId, sprite);
        if (this.currentPlayerGroupId === groupPositionMessage.groupId) {
            currentPlayerGroupLockStateStore.set(groupPositionMessage.locked);
        }
        return sprite;
    }

    deleteGroup(groupId: number): void {
        this.pendingEvents.enqueue({
            type: "DeleteGroupEvent",
            groupId,
        });
    }

    doDeleteGroup(groupId: number): void {
        const group = this.groups.get(groupId);
        if (!group) {
            return;
        }
        group.destroy();
        this.groups.delete(groupId);
    }

    doUpdatePlayerDetails(update: PlayerDetailsUpdate): void {
        const character = this.MapPlayersByKey.get(update.player.userId);
        if (character === undefined) {
            console.log(
                "Could not set new details to character with ID ",
                update.player.userId,
                ". Did he/she left before te message was received?"
            );
            return;
        }

        if (update.updated.availabilityStatus) {
            character.setAvailabilityStatus(update.player.availabilityStatus);
        }
        if (update.updated.outlineColor) {
            if (update.player.outlineColor === undefined) {
                character.removeApiOutlineColor();
            } else {
                character.setApiOutlineColor(update.player.outlineColor);
            }
        }
        if (update.updated.showVoiceIndicator) {
            character.showTalkIcon(update.player.showVoiceIndicator);
        }
    }

    /**
     * Sends to the server an event emitted by one of the ActionableItems.
     */
    emitActionableEvent(itemId: number, eventName: string, state: unknown, parameters: unknown) {
        this.connection?.emitActionableEvent(itemId, eventName, state, parameters);
    }

    public onResize(): void {
        super.onResize();
        this.reposition(true);

        this.throttledSendViewportToServer();
    }

    public sendViewportToServer(margin = 300): void {
        const camera = this.cameras.main;
        this.connection?.setViewport({
            left: Math.max(0, camera.scrollX - margin),
            top: Math.max(0, camera.scrollY - margin),
            right: camera.scrollX + camera.width + margin,
            bottom: camera.scrollY + camera.height + margin,
        });
    }

    private getObjectLayerData(objectName: string): ITiledMapObject | undefined {
        for (const layer of this.mapFile.layers) {
            if (layer.type === "objectgroup" && layer.name === "floorLayer") {
                for (const object of layer.objects) {
                    if (object.name === objectName) {
                        return object;
                    }
                }
            }
        }
        return undefined;
    }

    public reposition(instant = false): void {
        // Recompute camera offset if needed
        this.time.delayedCall(0, () => {
            biggestAvailableAreaStore.recompute();
            if (this.cameraManager != undefined) {
                this.cameraManager.updateCameraOffset(get(biggestAvailableAreaStore), instant);
            }
        });
    }

    public initialiseJitsi(coWebsite: JitsiCoWebsite, roomName: string, jwt?: string, jitsiUrl?: string): void {
        const allProps = this.gameMapFrontWrapper.getCurrentProperties();
        const isJitsiConfig = z.string().optional().safeParse(allProps.get(GameMapProperties.JITSI_CONFIG));
        const isJitsiInterfaceConfig = z
            .string()
            .optional()
            .safeParse(allProps.get(GameMapProperties.JITSI_INTERFACE_CONFIG));
        const isJitsiUrl = z.string().optional().safeParse(allProps.get(GameMapProperties.JITSI_URL));

        const jitsiConfig = this.safeParseJSONstring(
            isJitsiConfig.success ? isJitsiConfig.data : undefined,
            GameMapProperties.JITSI_CONFIG
        );

        const jitsiInterfaceConfig = this.safeParseJSONstring(
            isJitsiInterfaceConfig.success ? isJitsiInterfaceConfig.data : undefined,
            GameMapProperties.JITSI_INTERFACE_CONFIG
        );
        if (!jitsiUrl) {
            jitsiUrl = isJitsiUrl.success ? isJitsiUrl.data : undefined;
        }

        coWebsite.setJitsiLoadPromise(() => {
            return jitsiFactory.start(roomName, this.playerName, jwt, jitsiConfig, jitsiInterfaceConfig, jitsiUrl);
        });

        coWebsiteManager.loadCoWebsite(coWebsite).catch((err) => {
            console.error(err);
        });

        analyticsClient.enteredJitsi(roomName, this.room.id);
    }

    //todo: put this into an 'orchestrator' scene (EntryScene?)
    private bannedUser() {
        errorScreenStore.setError(
            ErrorScreenMessage.fromPartial({
                type: "error",
                code: "USER_BANNED",
                title: "BANNED",
                subtitle: "You were banned from WorkAdventure",
                details: "If you want more information, you may contact us at: hello@workadventu.re",
            })
        );
        this.cleanupClosingScene();
        this.userInputManager.disableControls();
    }

    //todo: put this into an 'orchestrator' scene (EntryScene?)
    private showWorldFullError(message: string | null): void {
        this.cleanupClosingScene();
        this.scene.stop(ReconnectingSceneName);
        this.scene.remove(ReconnectingSceneName);
        this.userInputManager.disableControls();
        //FIX ME to use status code
        if (message == undefined) {
            this.scene.start(ErrorSceneName, {
                title: "Connection rejected",
                subTitle: "The world you are trying to join is full. Try again later.",
                message: "If you want more information, you may contact us at: hello@workadventu.re",
            });
        } else {
            this.scene.start(ErrorSceneName, {
                title: "Connection rejected",
                subTitle: "You cannot join the World. Try again later. \n\r \n\r Error: " + message + ".",
                message:
                    "If you want more information, you may contact administrator or contact us at: hello@workadventu.re",
            });
        }
    }

    private bindSceneEventHandlers(): void {
        this.events.once("shutdown", () => {
            if (!this.cleanupDone) {
                throw new Error("Scene destroyed without cleanup!");
            }
        });
    }

    zoomByFactor(zoomFactor: number) {
        if (this.cameraManager.isCameraLocked()) {
            return;
        }
        waScaleManager.handleZoomByFactor(zoomFactor);
        // biggestAvailableAreaStore.recompute();
    }

    public createSuccessorGameScene(autostart: boolean, reconnecting: boolean) {
        const gameSceneKey = "somekey" + Math.round(Math.random() * 10000);
        const game = new GameScene(this.room, gameSceneKey);
        this.scene.add(gameSceneKey, game, autostart, {
            initPosition: {
                x: this.CurrentPlayer.x,
                y: this.CurrentPlayer.y,
            },
            reconnecting: reconnecting,
        });

        //If new gameScene doesn't start automatically then we change the gameScene in gameManager so that it can start the new gameScene
        if (!autostart) {
            gameManager.gameSceneIsCreated(game);
        }

        this.scene.stop(this.scene.key);
        this.scene.remove(this.scene.key);
    }

    public getGameMap(): GameMap {
        return this.gameMapFrontWrapper.getGameMap();
    }

    public getGameMapFrontWrapper(): GameMapFrontWrapper {
        return this.gameMapFrontWrapper;
    }

    public getCameraManager(): CameraManager {
        return this.cameraManager;
    }

    public getRemotePlayersRepository(): RemotePlayersRepository {
        return this.remotePlayersRepository;
    }

    public getMapEditorModeManager(): MapEditorModeManager {
        return this.mapEditorModeManager;
    }

    public getEntitiesCollectionsManager(): EntitiesCollectionsManager {
        return this.entitiesCollectionsManager;
    }

    public getPathfindingManager(): PathfindingManager {
        return this.pathfindingManager;
    }

    public getActivatablesManager(): ActivatablesManager {
        return this.activatablesManager;
    }
}
