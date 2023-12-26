export enum Mouse {
    Primary = 1,
    Secondary = 2,
    Auxiliary = 4,
    Fourth = 8,
    Fifth = 16
}

export function isDown(button: Mouse, raw_buttons: number) {
    return (raw_buttons & button) != 0;
}