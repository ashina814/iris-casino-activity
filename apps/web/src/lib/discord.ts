interface AuthorizeResult {
  code: string;
}

interface AuthorizeCommand {
  authorize(args: {
    client_id: string;
    response_type: "code";
    state: string;
    prompt: "none";
    scope: string[];
  }): Promise<AuthorizeResult>;
}

interface ActivityConfig {
  discordClientId: string;
  mockAuth: boolean;
}

function isMobileClient() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export async function getDiscordAuthorizationCode(): Promise<string> {
  const config = await getActivityConfig();
  const clientId = config.discordClientId || import.meta.env.VITE_DISCORD_CLIENT_ID;
  const useMock = config.mockAuth || import.meta.env.VITE_IRIS_MOCK_AUTH === "true";

  if (useMock) {
    return "mock-discord-authorization-code";
  }

  if (!clientId) {
    throw new Error("Discord Activity client ID is not configured.");
  }

  const { Common, DiscordSDK } = await import("@discord/embedded-app-sdk");
  const sdk = new DiscordSDK(clientId);
  await sdk.ready();

  // Lux Noctis is desktop-first, but mobile must keep Discord's native orientation.
  // Layout requests are optional on older clients and must never block authentication.
  if (!isMobileClient()) {
    try {
      await sdk.commands.setOrientationLockState({
        lock_state: Common.OrientationLockStateTypeObject.LANDSCAPE,
        picture_in_picture_lock_state: Common.OrientationLockStateTypeObject.LANDSCAPE,
        grid_lock_state: Common.OrientationLockStateTypeObject.LANDSCAPE
      });
    } catch {
      // Continue with Discord's default Activity layout when this RPC is unavailable.
    }
  }

  const commands = sdk.commands as unknown as AuthorizeCommand;
  const result = await commands.authorize({
    client_id: clientId,
    response_type: "code",
    state: crypto.randomUUID(),
    prompt: "none",
    scope: ["identify"]
  });

  return result.code;
}

async function getActivityConfig(): Promise<ActivityConfig> {
  const response = await fetch("/api/config", { cache: "no-store" });
  if (!response.ok) throw new Error("Activity configuration is unavailable.");

  const payload: unknown = await response.json().catch(() => null);
  if (
    !payload ||
    typeof payload !== "object" ||
    typeof (payload as Record<string, unknown>).discordClientId !== "string" ||
    typeof (payload as Record<string, unknown>).mockAuth !== "boolean"
  ) {
    throw new Error("Activity configuration is invalid.");
  }

  return payload as ActivityConfig;
}
