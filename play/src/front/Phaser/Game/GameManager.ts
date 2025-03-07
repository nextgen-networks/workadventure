import { get } from "svelte/store";
import { connectionManager } from "../../Connexion/ConnectionManager";
import { localUserStore } from "../../Connexion/LocalUserStore";
import type { Room } from "../../Connexion/Room";
import { helpCameraSettingsVisibleStore } from "../../Stores/HelpSettingsStore";
import { requestedCameraState, requestedMicrophoneState } from "../../Stores/MediaStore";
import { menuIconVisiblilityStore } from "../../Stores/MenuStore";
import { EnableCameraSceneName } from "../Login/EnableCameraScene";
import { LoginSceneName } from "../Login/LoginScene";
import { SelectCharacterSceneName } from "../Login/SelectCharacterScene";
import { EmptySceneName } from "../Login/EmptyScene";
import { gameSceneIsLoadedStore } from "../../Stores/GameSceneStore";
import { myCameraStore } from "../../Stores/MyMediaStore";
import { GameScene } from "./GameScene";

/**
 * This class should be responsible for any scene starting/stopping
 */
export class GameManager {
    private playerName: string | null;
    private characterLayers: string[] | null;
    private companion: string | null;
    private startRoom!: Room;
    private cameraSetup?: { video: unknown; audio: unknown };
    private currentGameSceneName: string | null = null;
    // Note: this scenePlugin is the scenePlugin of the EntryScene. We should always provide a key in methods called on this scenePlugin.
    private scenePlugin!: Phaser.Scenes.ScenePlugin;
    private visitCardUrl: string | null = null;

    constructor() {
        this.playerName = localUserStore.getName();
        this.characterLayers = localUserStore.getCharacterLayers();
        this.companion = localUserStore.getCompanion();
        this.cameraSetup = localUserStore.getCameraSetup();
    }

    public async init(scenePlugin: Phaser.Scenes.ScenePlugin): Promise<string> {
        this.scenePlugin = scenePlugin;
        const result = await connectionManager.initGameConnexion();
        if (result instanceof URL) {
            window.location.assign(result.toString());
            // window.location.assign is not immediate and Javascript keeps running after.
            // so we need to redirect to an empty Phaser scene, waiting for the redirection to take place
            return EmptySceneName;
        }
        this.startRoom = result;
        this.loadMap(this.startRoom);

        //If player name was not set show login scene with player name
        //If Room si not public and Auth was not set, show login scene to authenticate user (OpenID - SSO - Anonymous)
        if (!this.playerName || (this.startRoom.authenticationMandatory && !localUserStore.getAuthToken())) {
            return LoginSceneName;
        } else if (!this.characterLayers || !this.characterLayers.length) {
            // TODO: Remove this debug line
            console.info("Your Woka texture is invalid for this world, got to select Woka scene. Init game manager.");
            return SelectCharacterSceneName;
        } else if (this.cameraSetup == undefined) {
            return EnableCameraSceneName;
        } else {
            this.activeMenuSceneAndHelpCameraSettings();
            //TODO fix to return href with # saved in localstorage
            return this.startRoom.key;
        }
    }

    public setPlayerName(name: string): void {
        this.playerName = name;
        localUserStore.setName(name);
    }

    public setVisitCardurl(visitCardUrl: string): void {
        this.visitCardUrl = visitCardUrl;
    }

    public setCharacterLayers(layers: string[]): void {
        this.characterLayers = layers;
        localUserStore.setCharacterLayers(layers);
    }

    getPlayerName(): string | null {
        return this.playerName;
    }

    get myVisitCardUrl(): string | null {
        return this.visitCardUrl;
    }

    getCharacterLayers(): string[] {
        if (!this.characterLayers) {
            throw new Error("characterLayers are not set");
        }
        return this.characterLayers;
    }

    setCompanion(companion: string | null): void {
        this.companion = companion;
    }

    getCompanion(): string | null {
        return this.companion;
    }

    public loadMap(room: Room) {
        const roomID = room.key;

        const gameIndex = this.scenePlugin.getIndex(roomID);
        if (gameIndex === -1) {
            const game: Phaser.Scene = new GameScene(room);
            this.scenePlugin.add(roomID, game, false);
        }
    }

    public goToStartingMap(): void {
        console.log("starting " + (this.currentGameSceneName || this.startRoom.key));
        this.scenePlugin.start(this.currentGameSceneName || this.startRoom.key);
        this.activeMenuSceneAndHelpCameraSettings();
    }

    /**
     * @private
     * @return void
     */
    private activeMenuSceneAndHelpCameraSettings(): void {
        if (!get(myCameraStore)) {
            return;
        }

        if (
            !localUserStore.getHelpCameraSettingsShown() &&
            (!get(requestedMicrophoneState) || !get(requestedCameraState))
        ) {
            helpCameraSettingsVisibleStore.set(true);
            localUserStore.setHelpCameraSettingsShown();
        }
    }

    public gameSceneIsCreated(scene: GameScene) {
        this.currentGameSceneName = scene.scene.key;
        menuIconVisiblilityStore.set(true);
    }

    /**
     * Temporary leave a gameScene to go back to the loginScene for example.
     * This will close the socket connections and stop the gameScene, but won't remove it.
     */
    leaveGame(targetSceneName: string, sceneClass: Phaser.Scene): void {
        if (this.currentGameSceneName === null) throw new Error("No current scene id set!");
        gameSceneIsLoadedStore.set(false);

        const gameScene = this.scenePlugin.get(this.currentGameSceneName);

        if (!(gameScene instanceof GameScene)) {
            throw new Error("Not the Game Scene");
        }

        gameScene.cleanupClosingScene();
        gameScene.createSuccessorGameScene(false, false);
        menuIconVisiblilityStore.set(false);
        if (!this.scenePlugin.get(targetSceneName)) {
            this.scenePlugin.add(targetSceneName, sceneClass, false);
        }
        this.scenePlugin.run(targetSceneName);
    }

    /**
     * follow up to leaveGame()
     */
    tryResumingGame(fallbackSceneName: string) {
        if (this.currentGameSceneName) {
            this.scenePlugin.start(this.currentGameSceneName);
            menuIconVisiblilityStore.set(true);
        } else {
            this.scenePlugin.run(fallbackSceneName);
        }
    }

    public getCurrentGameScene(): GameScene {
        if (this.currentGameSceneName === null) throw new Error("No current scene id set!");
        const gameScene = this.scenePlugin.get(this.currentGameSceneName);
        if (!(gameScene instanceof GameScene)) {
            throw new Error("Not the Game Scene");
        }
        return gameScene;
    }

    public get currentStartedRoom() {
        return this.startRoom;
    }
}

export const gameManager = new GameManager();
