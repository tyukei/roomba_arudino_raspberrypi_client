#include <SoftwareSerial.h>
SoftwareSerial device(10, 11);

void setup() {
  Serial.begin(9600);
  device.begin(115200);

  // デバッグ: 起動確認
  Serial.println("Arduino started!");
  Serial.println("Waiting for commands...");
  Serial.println("Commands: 0=forward, 1=right, 2=left, 3=back, other=stop");

  // Roombaを確実に起動モードにする
  delay(100);
  device.write(128); // Start
  delay(100);
  device.write(132); // FULL mode
  delay(100);
  Serial.println("Roomba initialized!");
}

void loop() {

  // デバッグ: シリアル受信確認
  if (Serial.available() > 0) {
    int cmd = Serial.read();

    // デバッグ: 受信したコマンドを表示
    Serial.print("Received command: ");
    Serial.println(cmd);

    Serial.write(cmd);
    switch (cmd) {
    case 48: // '0'
      Serial.println("-> Moving forward");
      motor(64, 64);
      break;
    case 49: // '1'
      Serial.println("-> Turning right");
      motor(64, -64);
      break;
    case 50: // '2'
      Serial.println("-> Turning left");
      motor(-64, 64);
      break;
    case 51: // '3'
      Serial.println("-> Moving back");
      motor(-64, -64);
      break;
    default:
      Serial.println("-> Stopping");
      motor(0, 0);
      break;
    }

    // 1秒間動作してから停止
    delay(1000);
    motor(0, 0);
    Serial.println("Stopped");
  }
  delay(100);
}

void motor(int l, int r) {
  // デバッグ: モーター値を表示
  Serial.print("Motor values - Left: ");
  Serial.print(l);
  Serial.print(", Right: ");
  Serial.println(r);

  for (int i = 0; i < 10; i++) {
    byte buffer[] = {byte(128), // Start
                     byte(132), // FULL
                     byte(146), // Drive PWM
                     byte(r >> 8), byte(r), byte(l >> 8), byte(l)};
    device.write(buffer, 7);
  }
}
