const variant = process.env.APP_ENV || "development";

export default {
  expo: {
    name: "Tmux Mobile",
    slug: "tmux-mobile-mobile",
    version: "0.1.0",
    runtimeVersion: "1",
    orientation: "default",
    icon: "./logo.png",
    scheme: "tmuxmobile",
    userInterfaceStyle: "automatic",
    ios: {
      supportsTablet: true,
      bundleIdentifier: "ai.impo.tmuxmobile",
      config: {
        usesNonExemptEncryption: false,
      },
      infoPlist: {
        NSMicrophoneUsageDescription:
          "Allow Tmux Mobile to access your microphone for voice commands.",
      },
    },
    android: {
      package: "ai.impo.tmuxmobile",
      permissions: [
        "android.permission.RECORD_AUDIO",
        "android.permission.ACCESS_NETWORK_STATE",
        "android.permission.POST_NOTIFICATIONS",
      ],
      adaptiveIcon: {
        foregroundImage: "./logo.png",
        backgroundColor: "#f5f4ed",
      },
    },
    web: {
      bundler: "metro",
      output: "single",
      favicon: "./logo.png",
    },
    plugins: [
      [
        "expo-router",
        {
          root: "./sources/app",
        },
      ],
      "expo-secure-store",
      "expo-font",
      "expo-web-browser",
      "expo-system-ui",
      [
        "expo-splash-screen",
        {
          backgroundColor: "#f5f4ed",
          image: "./logo.png",
          imageWidth: 96,
          dark: {
            backgroundColor: "#141413",
            image: "./logo.png",
          },
        },
      ],
    ],
    extra: {
      appEnv: variant,
      tmuxMobileControllerUrl:
        process.env.TMUX_MOBILE_CONTROLLER_URL || "https://eng.impo.ai",
    },
    owner: "impo",
  },
};
