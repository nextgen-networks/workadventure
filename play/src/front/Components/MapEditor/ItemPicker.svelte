<script lang="ts">
    import type { EntityPrefab } from "@workadventure/map-editor";
    import { onMount } from "svelte";
    import { LL } from "../../../i18n/i18n-svelte";
    import {
        mapEditorSelectedEntityPrefabStore,
        onMapEditorInputFocus,
        onMapEditorInputUnfocus,
    } from "../../Stores/MapEditorStore";
    import { gameManager } from "../../Phaser/Game/GameManager";

    const entitiesCollectionsManager = gameManager.getCurrentGameScene().getEntitiesCollectionsManager();

    let pickedItem: EntityPrefab | undefined = undefined;
    let pickedVariant: EntityPrefab | undefined = undefined;
    let currentColor: string;

    let rootItem: EntityPrefab[] = []; //A sample of each object
    let itemVariants: EntityPrefab[] = [];
    let currentVariants: EntityPrefab[] = [];
    let variantColors: string[] = [];

    let filter = "";

    let selectedTag = "";

    let tags = entitiesCollectionsManager.getTags();

    onMount(() => {
        entitiesCollectionsManager.setNameFilter(filter);
        updateVisiblePrefabs();
    });

    function onPickItemVariant(variant: EntityPrefab) {
        pickedVariant = variant;
        mapEditorSelectedEntityPrefabStore.set(pickedVariant);
    }

    function onPickItem(item: EntityPrefab) {
        pickedItem = item;
        if (!pickedItem) {
            return;
        }
        itemVariants = entitiesCollectionsManager
            .getEntitiesPrefabs()
            .filter((item: EntityPrefab) => item.name == pickedItem?.name);
        itemVariants = itemVariants.sort(
            (a, b) =>
                a.direction.localeCompare(b.direction) +
                a.color.localeCompare(b.color) * 10 +
                (a.color === pickedItem?.color ? -100 : 0) +
                (b.color === pickedItem?.color ? 100 : 0)
        );
        let variantColorSet = new Set<string>();
        itemVariants.forEach((item) => variantColorSet.add(item.color));
        variantColors = [...variantColorSet].sort();
        onColorChange(pickedItem.color);
    }

    function onColorChange(color: string) {
        currentColor = color;
        currentVariants = itemVariants.filter((item) => item.color === color);
        if (pickedVariant != undefined) {
            pickedVariant = currentVariants.find((item) => item.direction === pickedVariant?.direction);
        } else {
            pickedVariant = currentVariants.find((item) => item.direction === pickedItem?.direction);
        }
        if (pickedVariant === undefined) {
            pickedVariant = currentVariants[0];
        }
        mapEditorSelectedEntityPrefabStore.set(pickedVariant);
    }

    function onTagPick() {
        if (selectedTag !== "") {
            filter = selectedTag;
            selectedTag = "";
            onFilterChange();
        }
    }

    function onFilterChange() {
        entitiesCollectionsManager.setNameFilter(filter);
        updateVisiblePrefabs();
    }

    function updateVisiblePrefabs() {
        const prefabs = entitiesCollectionsManager.getEntitiesPrefabs();
        let tags = new Set<string>();
        let uniqId = new Set<string>();
        rootItem = [];
        for (let entityPrefab of prefabs) {
            entityPrefab.tags.forEach((v: string) => tags.add(v));
            if (!uniqId.has(entityPrefab.name)) {
                uniqId.add(entityPrefab.name);
                rootItem.push(entityPrefab);
            }
        }

        if (pickedItem && !rootItem.includes(pickedItem) && rootItem.length != 0) {
            //if the item is not available due to filtering, we change it
            onPickItem(rootItem[0]);
        }
    }
</script>

<div class="item-picker">
    <div class="item-filter">
        <input
            class="filter-input"
            type="search"
            bind:value={filter}
            on:input={onFilterChange}
            on:focus={onMapEditorInputFocus}
            on:blur={onMapEditorInputUnfocus}
            placeholder={$LL.mapEditor.entityEditor.itemPicker.searchPlaceholder()}
        />
        <select class="tag-selector" bind:value={selectedTag} on:change={() => onTagPick()}>
            {#each tags as tag}
                <option>{tag}</option>
            {/each}
        </select>
    </div>
    <div class="item-name">{pickedItem?.name ?? "no entity selected"}</div>
    <div class="item-picker-container">
        {#each rootItem as item (item.name)}
            <div
                class="pickable-item {item.name === pickedItem?.name ? 'active' : ''}"
                on:click={() => onPickItem(item)}
            >
                <img class="item-image" src={item.imagePath} alt={item.name} />
            </div>
        {/each}
    </div>
    <div class="separator">{$LL.mapEditor.entityEditor.itemPicker.selectVariationInstructions()}</div>
    {#if pickedItem !== null}
        <div class="item-variant-picker-container">
            {#each currentVariants as item}
                <div
                    class="pickable-item {item.imagePath === pickedVariant?.imagePath ? 'active' : ''}"
                    on:click={() => onPickItemVariant(item)}
                >
                    <img class="item-image" src={item.imagePath} alt={item.name} />
                </div>
            {/each}
        </div>
        <div class="color-container">
            {#each variantColors as color}
                <div class={currentColor === color ? "active" : ""}>
                    <button
                        class="color-selector"
                        style="background-color: {color};"
                        on:click={() => onColorChange(color)}
                    />
                </div>
            {/each}
        </div>
    {/if}
</div>

<style lang="scss">
    .item-picker {
        align-content: center;
        .item-filter {
            .filter-input {
                max-width: 90%;
            }
            .tag-selector {
                max-width: 10%;
                margin-bottom: 0;
                position: absolute;
                overflow-y: auto;
            }
        }
        .item-picker-container,
        .item-variant-picker-container {
            width: 19em;
            height: 16em;
            padding: 0.5em;
            display: flex;
            flex-wrap: wrap;
            overflow-y: auto;
            pointer-events: auto;
            .pickable-item {
                flex: 0 0 4em;
                height: 4em;
                display: flex;
                cursor: pointer;
                * {
                    cursor: pointer;
                }
                .item-image {
                    margin: auto;
                    max-width: 3.6em;
                    max-height: 3.6em;
                }
            }
            .pickable-item:hover {
                border-radius: 0.8em;
                border: 0.2rem solid white;
            }
            .pickable-item.active {
                border-radius: 0.8em;
                border: 0.2rem solid yellow;
            }
        }
        .item-variant-picker-container {
            overflow-y: hidden;
            height: 5em;
        }
        .color-container {
            display: flex;
            flex-wrap: wrap;
            div {
                .color-selector {
                    border-radius: 1em;
                    border: 0.1rem solid black;
                    max-width: 1em;
                }
            }
            .active {
                background-color: yellow;
                padding: 0.05em;
                border-radius: 0.5em;
            }
        }
        div {
            margin: auto;
            width: fit-content;
        }
    }
</style>
