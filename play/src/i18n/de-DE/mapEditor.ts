import type { BaseTranslation } from "../i18n-types";

const mapEditor: BaseTranslation = {
    sideBar: {
        zoomIn: "Vergrößern",
        zoomOut: "Verkleinern",
        areaEditor: "Fläche bearbeiten",
        entityEditor: "Entität bearbeiten",
        tileEditor: "Kachel bearbeiten",
    },
    entityEditor: {
        itemPicker: {
            searchPlaceholder: "Nach namen oder Tags suchen",
            selectVariationInstructions: "Variante auswählen",
        },
        addButton: "Hinzufügen",
        editButton: "Bearbeiten",
        deleteButton: "Löschen",
        testInteractionButton: "Interaktion testen",
        buttonLabel: "Knopfbeschrifung",
        editInstructions: "Klicken Sie auf ein Objekt, um seine Eigenschaften zu ändern.",
        removeInstructions: "Klicken Sie auf ein Objekt um es zu löschen.",
        textProperties: {
            label: "Überschrift",
            placeholder: "Geben Sie hier Text ein, der bei der Interaktion mit dem Objekt angezeigt wird",
        },
        jitsiProperties: {
            label: "Jitsi-Raum",
            roomNameLabel: "Room Name",
            roomNamePlaceholder: "Room Name",
            defaultButtonLabel: "Jitsi-Raum öffnen",
            audioMutedLabel: "Standartmäßig stummgeschaltet",
            moreOptionsLabel: "Mehr Optionen",
            jitsiRoomConfig: {
                addConfig: "Option hinzufügen",
                startWithAudioMuted: "Mit deaktiviertem Mikrofon starten",
                startWithVideoMuted: "Mit deaktivierter Kamera starten",
                cancel: "Abbrechen",
                validate: "Validieren",
            },
        },
        audioProperties: {
            label: "Audiodatei abspielen",
            audioLinkLabel: "Audiolink",
            audioLinkPlaceholder: "https://xxx.yyy/smthing.mp3",
            defaultButtonLabel: "Musik abspielen",
        },
        linkProperties: {
            label: "Link öffnen",
            linkLabel: "Link URL",
            newTabLabel: "In neuen Tab öffnen",
            linkPlaceholder: "https://play.staging.workadventu.re/",
            defaultButtonLabel: "Link öffnen",
        },
    },
};

export default mapEditor;
