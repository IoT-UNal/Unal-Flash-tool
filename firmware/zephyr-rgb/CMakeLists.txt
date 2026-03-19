cmake_minimum_required(VERSION 3.20.0)
find_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})

project(unal_rgb_wifi)

target_sources(app PRIVATE
  src/main.c
  src/wifi_config.c
  src/wifi_mgr.c
  src/led_config.c
  src/rgb_led.c
  src/led_ctrl.c
)
