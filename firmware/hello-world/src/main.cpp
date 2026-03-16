/*
 * UNAL Flash Tool — Hello World Test Firmware
 *
 * This firmware is designed to verify that the web flash platform
 * works correctly. It blinks the built-in LED and sends messages
 * over the serial port so you can test both:
 *   1. Flashing via the Flash Wizard
 *   2. Serial monitoring via the Terminal page
 *
 * Board: ESP32 DevKit (any variant)
 * LED:   GPIO 2 (built-in on most ESP32 dev boards)
 * Baud:  115200
 */

#include <Arduino.h>
#include <WiFi.h>

const int LED_PIN = LED_BUILTIN; // GPIO 2 on most ESP32 boards
unsigned long counter = 0;

void printDeviceInfo() {
  Serial.println("========================================");
  Serial.println("  UNAL Flash Tool — Hello World v1.0");
  Serial.println("========================================");
  Serial.printf("  Chip Model:    %s\n", ESP.getChipModel());
  Serial.printf("  Chip Revision: %d\n", ESP.getChipRevision());
  Serial.printf("  CPU Freq:      %d MHz\n", ESP.getCpuFreqMHz());
  Serial.printf("  Flash Size:    %d KB\n", ESP.getFlashChipSize() / 1024);
  Serial.printf("  Free Heap:     %d bytes\n", ESP.getFreeHeap());
  Serial.printf("  SDK Version:   %s\n", ESP.getSdkVersion());
  Serial.printf("  MAC Address:   %s\n", WiFi.macAddress().c_str());
  Serial.println("========================================");
  Serial.println();
  Serial.println("Flash successful! Serial monitor working.");
  Serial.println("LED should be blinking on GPIO 2.");
  Serial.println();
}

void setup() {
  Serial.begin(115200);
  delay(1000); // Wait for serial monitor to connect

  pinMode(LED_PIN, OUTPUT);
  printDeviceInfo();
}

void loop() {
  // Blink LED
  digitalWrite(LED_PIN, HIGH);
  delay(500);
  digitalWrite(LED_PIN, LOW);
  delay(500);

  // Print heartbeat to serial
  counter++;
  Serial.printf("[%08lu] Hello from UNAL! LED blink #%lu | Free heap: %d bytes\n",
                millis(), counter, ESP.getFreeHeap());
}
