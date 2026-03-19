/*
 * LED Controller — behaviour engine
 *
 * Runs the configured LED animation in a background thread.
 * Supports: solid, blink, breathe, rainbow, and wifi-status modes.
 */

#ifndef LED_CTRL_H
#define LED_CTRL_H

#include "led_config.h"

/** Start the LED controller thread with the given config. */
void led_ctrl_start(const struct led_config *cfg);

/**
 * Update the config at runtime (thread-safe).
 * Takes effect on the next animation tick.
 */
void led_ctrl_update(const struct led_config *cfg);

#endif /* LED_CTRL_H */
