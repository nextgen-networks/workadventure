<script lang="ts">
    import { fade, fly } from "svelte/transition";
    import { ArrowLeftIcon, RefreshCwIcon, SmileIcon, SendIcon } from "svelte-feather-icons";
    import { createEventDispatcher, onDestroy, onMount } from "svelte";
    import { Unsubscriber } from "svelte/store";
    import { EmojiButton } from "@joeattardi/emoji-button";
    import {
        chatMessagesStore,
        chatInputFocusStore,
        ChatMessageTypes,
        chatPeerConnectionInProgress,
        writingStatusMessageStore,
        _newChatMessageWritingStatusSubject,
        lastTimelineMessageRead,
    } from "../../Stores/ChatStore";
    import { LL, locale } from "../../i18n/i18n-svelte";
    import { activeThreadStore } from "../../Stores/ActiveThreadStore";
    import { mucRoomsStore } from "../../Stores/MucRoomsStore";
    import { HtmlUtils } from "../../Utils/HtmlUtils";
    import { defaultWoka } from "../../Xmpp/AbstractRoom";

    const dispatch = createEventDispatcher();
    const defaultMucRoom = mucRoomsStore.getDefaultRoom();

    export let settingsView = false;

    let newMessageText = "";
    let htmlMessageText = "";
    let input: HTMLElement;

    function reInitialize() {
        chatMessagesStore.reInitialize();
        settingsView = false;
    }

    function onFocus() {
        chatInputFocusStore.set(true);
    }
    function onBlur() {
        chatInputFocusStore.set(false);
    }
    function saveMessage() {
        if (!newMessageText) return;
        chatMessagesStore.addPersonalMessage(newMessageText);
        newMessageText = "";
        htmlMessageText = "";
        setTimeout(() => {
            input.innerHTML = "";
        }, 0);
        return false;
    }

    function backToThreadList() {
        activeThreadStore.reset();
        dispatch("unactiveThreadTimeLine");
    }

    function writing() {
        if (newMessageText != undefined && newMessageText !== "") {
            _newChatMessageWritingStatusSubject.next(ChatMessageTypes.userWriting);
        } else {
            _newChatMessageWritingStatusSubject.next(ChatMessageTypes.userStopWriting);
        }
        if (htmlMessageText === "<br>") {
            htmlMessageText = "";
        }
    }

    function handlerKeyDown(keyDownEvent: KeyboardEvent) {
        if (keyDownEvent.key === "Enter" && !keyDownEvent.shiftKey) {
            saveMessage();
            htmlMessageText = "";
            writing();
            return false;
        }
        return true;
    }

    let subscribers = new Array<Unsubscriber>();

    let emojiContainer: HTMLElement;
    let picker: EmojiButton;

    onMount(() => {
        subscribers.push(
            chatMessagesStore.subscribe(() => {
                setTimeout(() => {
                    lastTimelineMessageRead.set(new Date());
                }, 50);
            })
        );

        picker = new EmojiButton({
            styleProperties: {
                "--font": "Press Start 2P",
                "--background-color": "#23222c",
                "--text-color": "#ffffff",
                "--secondary-text-color": "#ffffff",
                "--category-button-color": "#ffffff",
                "--category-button-active-color": "#56eaff",
            },
            position: "bottom",
            emojisPerRow: 5,
            autoFocusSearch: false,
            style: "native",
            showPreview: false,
            i18n: {
                search: $LL.emoji.search(),
                categories: {
                    recents: $LL.emoji.categories.recents(),
                    smileys: $LL.emoji.categories.smileys(),
                    people: $LL.emoji.categories.people(),
                    animals: $LL.emoji.categories.animals(),
                    food: $LL.emoji.categories.food(),
                    activities: $LL.emoji.categories.activities(),
                    travel: $LL.emoji.categories.travel(),
                    objects: $LL.emoji.categories.objects(),
                    symbols: $LL.emoji.categories.symbols(),
                    flags: $LL.emoji.categories.flags(),
                    custom: $LL.emoji.categories.custom(),
                },
                notFound: $LL.emoji.notFound(),
            },
        });

        picker.on("emoji", ({ emoji }) => {
            newMessageText += emoji;
        });
        picker.on("hidden", () => {
            emojiOpened = false;
        });
    });

    function needHideHeader(authorName: string, date: Date, i: number) {
        let previousMsg = $chatMessagesStore[i - 1];
        if (!previousMsg) {
            return false;
        }
        const minutesBetween = (date.getTime() - previousMsg.date.getTime()) / 60000;
        return previousMsg.authorName === authorName && minutesBetween < 2;
    }

    onDestroy(() => {
        subscribers.forEach((subscriber) => subscriber());
    });

    let emojiOpened = false;
    function openEmoji() {
        picker.showPicker(emojiContainer);
        emojiOpened = true;
    }
</script>

<!-- thread -->
<div
    id="activeTimeline"
    class="tw-flex tw-flex-col tw-h-full tw-min-h-full tw-over tw-w-full"
    transition:fly={{ x: 500, duration: 400 }}
>
    <div class="wa-thread-head">
        <div class="title">
            <div class="tw-py-1 tw-w-14 tw-self-stretch tw-flex tw-justify-center tw-align-middle">
                <button class="exit tw-text-lighter-purple tw-m-0" on:click={backToThreadList}>
                    <ArrowLeftIcon />
                </button>
            </div>
            <div class="tw-text-center tw-pt-2 tw-pb-3">
                <div class="tw-flex tw-justify-center">
                    <b>{$LL.timeLine.title()}</b>
                    {#if $chatPeerConnectionInProgress}
                        <div class="tw-block tw-relative tw-ml-7 tw-mt-1">
                            <span
                                class="tw-w-4 tw-h-4 tw-bg-pop-green tw-block tw-rounded-full tw-absolute tw-right-0 tw-top-0 tw-animate-ping"
                            />
                            <span
                                class="tw-w-3 tw-h-3 tw-bg-pop-green tw-block tw-rounded-full tw-absolute tw-right-0.5 tw-top-0.5"
                            />
                        </div>
                    {/if}
                </div>
                <div class="tw-flex tw-flex-wrap tw-gap-x-1 tw-items-center tw-text-xs tw-text-lighter-purple">
                    {$LL.timeLine.description()}
                </div>
            </div>
            <div id="settings" class="tw-py-1 tw-w-14 tw-self-stretch tw-flex tw-justify-center tw-align-middle">
                <!--
            <button class="tw-text-lighter-purple tw-m-0">
                {#if $settingsViewStore}
                    <MessageCircleIcon />
                {:else}
                    <SettingsIcon />
                {/if}
            </button>
            -->
            </div>
        </div>
        <div class="tw-flex tw-flex-col tw-flex-auto tw-w-full">
            <div
                class="wa-message-bg tw-border tw-border-transparent tw-border-b-light-purple tw-border-solid tw-px-5 tw-pb-0.5"
            >
                <button class="wa-action" type="button" on:click|stopPropagation={reInitialize}
                    ><RefreshCwIcon size="13" class="tw-mr-2" /> {$LL.reinit()}
                </button>
            </div>
        </div>
    </div>

    <!-- MESSAGE LIST-->
    <div
        id="timeLine-messageList"
        class="tw-flex tw-flex-col tw-flex-auto tw-px-5 tw-pt-14 tw-pb-14 tw-justify-end tw-h-auto tw-min-h-screen"
    >
        {#each $chatMessagesStore as message, i}
            {#if message.type === ChatMessageTypes.text || message.type === ChatMessageTypes.me}
                <div
                    class={`${
                        needHideHeader(message.author?.name ?? message.authorName ?? "", message.date, i)
                            ? "tw-mt-0.5"
                            : "tw-mt-2"
                    }`}
                >
                    <div
                        class={`tw-flex ${
                            message.type === ChatMessageTypes.me ? "tw-justify-end" : "tw-justify-start"
                        }`}
                    >
                        <div
                            class={`${
                                message.type === ChatMessageTypes.me ? "tw-opacity-0" : "tw-mt-4"
                            } tw-relative wa-avatar-mini tw-mr-2`}
                            style={`background-color: ${message.author?.color ?? "#56eaff"}`}
                        >
                            <div class="wa-container">
                                <img
                                    class="tw-w-full"
                                    style="image-rendering: pixelated;"
                                    src={`${message.author?.woka ? message.author?.woka : defaultWoka}`}
                                    alt="Avatar"
                                    loading="lazy"
                                />
                            </div>
                        </div>
                        <div class="tw-w-3/4">
                            {#if !needHideHeader(message.author?.name ?? message.authorName ?? "", message.date, i)}
                                <div
                                    style={`border-bottom-color:${message.author?.color}`}
                                    class={`tw-flex tw-justify-between tw-mx-2 tw-border-0 tw-border-b tw-border-solid tw-text-light-purple-alt tw-text-xxs tw-pb-1 ${
                                        message.type === ChatMessageTypes.me ? "tw-flex-row-reverse" : ""
                                    }`}
                                >
                                    <span class="tw-text-lighter-purple">
                                        {#if message.type === ChatMessageTypes.me}
                                            {$LL.me()}
                                        {:else if message.author}
                                            {message.author?.name.match(/\[\d*]/)
                                                ? message.author?.name.substring(
                                                      0,
                                                      message.author?.name.search(/\[\d*]/)
                                                  )
                                                : message.author?.name}
                                            {#if message.author?.name.match(/\[\d*]/)}
                                                <span class="tw-font-light tw-text-xs tw-text-gray">
                                                    #{message.author?.name
                                                        .match(/\[\d*]/)
                                                        ?.join()
                                                        ?.replace("[", "")
                                                        ?.replace("]", "")}
                                                </span>
                                            {/if}
                                        {:else}
                                            {message.authorName}
                                        {/if}
                                    </span>
                                    <span
                                        >{message.date.toLocaleTimeString($locale, {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                            second: "2-digit",
                                        })}</span
                                    >
                                </div>
                            {/if}
                            {#if message.text}
                                <div class="wa-message-body">
                                    {#each message.text as text}
                                        <div
                                            class="tw-text-ellipsis tw-overflow-y-auto tw-whitespace-normal tw-break-words"
                                        >
                                            {#await HtmlUtils.urlify(text)}
                                                <p>...waiting</p>
                                            {:then html}
                                                {@html html}
                                            {/await}
                                        </div>
                                    {/each}
                                </div>
                            {/if}
                        </div>
                    </div>
                </div>
            {/if}

            {#if message.targets && message.targets.length > 0}
                {#if message.type === ChatMessageTypes.userIncoming}
                    {#each message.targets as target}
                        <div class="event tw-text-center tw-mt-2" style="white-space: nowrap;">
                            <span
                                class="tw-w-fit tag tw-bg-dark tw-mx-2 tw-px-3 tw-py-1 tw-border tw-border-solid tw-rounded-full tw-text-xs tw-border-lighter-purple"
                                ><b style={target.color ? `color: ${target.color};` : ""}
                                    >{target.name.match(/\[\d*]/)
                                        ? target.name.substring(0, target.name.search(/\[\d*]/))
                                        : target.name}
                                    {#if target.name.match(/\[\d*]/)}
                                        <span class="tw-font-light tw-text-xs tw-text-gray">
                                            #{target.name
                                                .match(/\[\d*]/)
                                                ?.join()
                                                ?.replace("[", "")
                                                ?.replace("]", "")}
                                        </span>
                                    {/if}</b
                                >{$LL.timeLine.incoming()}
                                <span class="tw-text-xss tw-text-lighter-purple">
                                    - {message.date.toLocaleTimeString($locale, {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                    })}
                                </span>
                            </span>
                        </div>
                    {/each}
                {/if}
                {#if message.type === ChatMessageTypes.userOutcoming}
                    {#each message.targets as target}
                        <div class="event tw-text-center tw-mt-2" style="white-space: nowrap;">
                            <span
                                class="tw-w-fit tag tw-bg-dark tw-mx-2 tw-px-3 tw-py-1 tw-border tw-border-solid tw-rounded-full tw-text-xs tw-border-lighter-purple"
                                ><b style={target.color ? `color: ${target.color};` : ""}
                                    >{target.name.match(/\[\d*]/)
                                        ? target.name.substring(0, target.name.search(/\[\d*]/))
                                        : target.name}
                                    {#if target.name.match(/\[\d*]/)}
                                        <span class="tw-font-light tw-text-xs tw-text-gray">
                                            #{target.name
                                                .match(/\[\d*]/)
                                                ?.join()
                                                ?.replace("[", "")
                                                ?.replace("]", "")}
                                        </span>
                                    {/if}</b
                                >{$LL.timeLine.outcoming()}
                                <span class="tw-text-xss tw-text-lighter-purple">
                                    - {message.date.toLocaleTimeString($locale, {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                    })}
                                </span>
                            </span>
                        </div>
                    {/each}
                {/if}
            {/if}
        {/each}

        {#if defaultMucRoom}
            {#each [...$writingStatusMessageStore] as userUuid}
                <div class={`tw-mt-2`}>
                    <div class={`tw-flex tw-justify-start`}>
                        <div
                            class={`tw-mt-4 tw-relative wa-avatar-mini tw-mr-2 tw-z-10`}
                            style={`background-color: ${defaultMucRoom?.getUserByJid(userUuid).color}`}
                            in:fade={{ duration: 100 }}
                            out:fade={{ delay: 200, duration: 100 }}
                        >
                            <div class="wa-container">
                                <img class="tw-w-full" src={defaultMucRoom.getUserByJid(userUuid).woka} alt="Avatar" />
                            </div>
                        </div>
                        <div
                            class={`tw-w-3/4`}
                            in:fly={{ x: -10, delay: 100, duration: 200 }}
                            out:fly={{ x: -10, duration: 200 }}
                        >
                            <div class="tw-w-fit">
                                <div
                                    style={`border-bottom-color:${defaultMucRoom.getUserByJid(userUuid).color}`}
                                    class={`tw-flex tw-justify-between tw-mx-2 tw-border-0 tw-border-b tw-border-solid tw-text-light-purple-alt tw-pb-1`}
                                >
                                    <span class="tw-text-lighter-purple tw-text-xxs">
                                        {defaultMucRoom.getUserByJid(userUuid).name.match(/\[\d*]/)
                                            ? defaultMucRoom
                                                  .getUserByJid(userUuid)
                                                  .name.substring(
                                                      0,
                                                      defaultMucRoom.getUserByJid(userUuid).name.search(/\[\d*]/)
                                                  )
                                            : defaultMucRoom.getUserByJid(userUuid).name}
                                        {#if defaultMucRoom.getUserByJid(userUuid).name.match(/\[\d*]/)}
                                            <span class="tw-font-light tw-text-xs tw-text-gray">
                                                #{defaultMucRoom
                                                    .getUserByJid(userUuid)
                                                    .name.match(/\[\d*]/)
                                                    ?.join()
                                                    ?.replace("[", "")
                                                    ?.replace("]", "")}
                                            </span>
                                        {/if}</span
                                    >
                                </div>
                                <div class="tw-rounded-lg tw-bg-dark tw-text-xs tw-p-3">
                                    <!-- loading animation -->
                                    <div class="loading-group">
                                        <span class="loading-dot" />
                                        <span class="loading-dot" />
                                        <span class="loading-dot" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            {/each}
        {/if}
    </div>

    <!--MESSAGE FORM-->
    <div class="wa-message-form">
        <div class="emote-menu-container">
            <div class="emote-menu" id="emote-picker" bind:this={emojiContainer} />
        </div>

        <form on:submit|preventDefault={saveMessage}>
            <div class="tw-w-full tw-px-2 tw-pb-2">
                <div
                    bind:this={input}
                    contenteditable="true"
                    bind:textContent={newMessageText}
                    bind:innerHTML={htmlMessageText}
                    data-placeholder={$LL.enterText()}
                    on:keydown={handlerKeyDown}
                    on:input={writing}
                    on:focus={onFocus}
                    on:blur={onBlur}
                />
                <div class="actions tw-absolute tw-right-6">
                    <div class="tw-flex tw-items-center tw-space-x-1">
                        <button
                            class={`tw-bg-transparent tw-p-0 tw-m-0 tw-inline-flex tw-justify-center tw-items-center ${
                                emojiOpened ? "tw-text-light-blue" : ""
                            }`}
                            on:click|preventDefault|stopPropagation={openEmoji}
                        >
                            <SmileIcon size="17" />
                        </button>
                        <button
                            id="send"
                            type="submit"
                            class="can-send tw-bg-transparent tw-p-0 tw-m-0 tw-inline-flex tw-justify-center tw-items-center tw-text-light-blue"
                            on:click|stopPropagation={saveMessage}
                        >
                            <SendIcon size="17" />
                        </button>
                    </div>
                </div>
            </div>
            <!--
                <div class="tw-w-full tw-p-2">
                    <div class="tw-flex tw-items-center tw-relative">
                        <textarea
                            type="text"
                            bind:value={newMessageText}
                            placeholder={$LL.form.placeholder()}
                            on:keydown={handlerKeyDown}
                            on:input={writing}
                            on:focus={onFocus}
                            on:blur={onBlur}
                            rows="1"
                        />
                        <button
                            class={`tw-bg-transparent tw-h-8 tw-w-8 tw-p-0 tw-inline-flex tw-justify-center tw-items-center tw-right-0 ${
                                emojiOpened ? "tw-text-light-blue" : ""
                            }`}
                            on:click|preventDefault|stopPropagation={openEmoji}
                        >
                            <SmileIcon size="17" />
                        </button>
                        <button
                            type="submit"
                            class="tw-bg-transparent tw-h-8 tw-w-8 tw-p-0 tw-inline-flex tw-justify-center tw-items-center tw-right-0 tw-text-light-blue"
                            on:click|stopPropagation={saveMessage}
                        >
                            <SendIcon size="17" />
                        </button>
                    </div>
                </div>
                -->
        </form>
    </div>
</div>

<style lang="scss">
    .settingsHeader {
        padding-top: 58px;
    }
    .messageList {
        display: flex;
        justify-content: flex-end;
        overflow-y: scroll;
        min-height: calc(100vh - 40px);
        padding: 60px 0;
    }
    form .actions {
        top: 10px;
    }
    form [contenteditable="true"] {
        padding-right: 4rem;
    }
</style>
