import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.asuka.planner",
  appName: "Asuka Planner",
  webDir: "out",
  server: {
    androidScheme: "https"
  },
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_icon_config_sample",
      iconColor: "#f472b6",
      sound: "beep.wav"
    },
    SplashScreen: {
      launchShowDuration: 0
    }
  }
};

export default config;
