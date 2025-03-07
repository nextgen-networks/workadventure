import type { PredefinedPropertyData, EntityPrefab, EntityDataProperties } from "@workadventure/map-editor";
import { writable, get } from "svelte/store";
import type { AreaPreview } from "../Phaser/Components/MapEditor/AreaPreview";
import { EditorToolName } from "../Phaser/Game/MapEditor/MapEditorModeManager";
import { Entity } from "../Phaser/ECS/Entity";
import { mapEditorActivated } from "./MenuStore";

function createMapEditorModeStore() {
    const { set, subscribe } = writable(false);

    return {
        subscribe,
        switchMode: (value: boolean) => {
            set(get(mapEditorActivated) && value);
        },
    };
}

function createMapEditorSelectedEntityStore() {
    const { subscribe, update } = writable<Entity | undefined>(undefined);

    return {
        subscribe,
        set: (value: Entity | undefined) => {
            update((oldValue) => {
                oldValue?.removeEditColor();
                return value;
            });
        },
    };
}

export enum MapEntityEditorMode {
    AddMode = "AddMode",
    EditMode = "EditMode",
}

export function onMapEditorInputFocus() {
    mapEditorInputStore.set(true);
}

export function onMapEditorInputUnfocus() {
    mapEditorInputStore.set(false);
}

export const mapEditorModeStore = createMapEditorModeStore();

export const mapEditorSelectedEntityStore = createMapEditorSelectedEntityStore();

export const mapEditorSelectedEntityDraggedStore = writable<boolean>(false);

export const mapEditorInputStore = writable(false);

export const mapEditorSelectedAreaPreviewStore = writable<AreaPreview | undefined>(undefined);

export const mapEditorSelectedPropertyStore = writable<PredefinedPropertyData | undefined>(undefined);

export const mapEditorSelectedToolStore = writable<EditorToolName | undefined>(undefined);

export const mapEditorSelectedEntityPrefabStore = writable<EntityPrefab | undefined>(undefined);

export const mapEditorCopiedEntityDataPropertiesStore = writable<EntityDataProperties | undefined>(undefined);

export const mapEntityEditorModeStore = writable<MapEntityEditorMode>(MapEntityEditorMode.AddMode);
